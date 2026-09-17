import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TripStatus, Visibility } from '@prisma/client';
import { VisibilityService } from 'src/common/services/visibility.service';
import { buildPage, decodeCursor } from 'src/common/utils';
import { PLACE_SUMMARY_SELECT } from 'src/modules/places/place-aggregates.service';
import { TRIP_CARD_SELECT, TripsService } from 'src/modules/trips/trips.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CommentDto, PostDto, ToggleResultDto } from './dto/post-response.dto';
import {
  CreateCommentDto,
  CreatePostDto,
  FeedQueryDto,
  PostQueryDto,
  SavePostDto,
  UpdatePostDto,
} from './dto/post.dto';

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly trips: TripsService,
  ) {}

  // -------------------------------------------------------------------------
  // Posts
  // -------------------------------------------------------------------------

  async create(userId: string, dto: CreatePostDto): Promise<PostDto> {
    if (!dto.tripId && !dto.caption && !dto.mediaIds?.length) {
      throw new BadRequestException('A post needs a caption, a photo or a trip');
    }

    let mediaIds = dto.mediaIds ?? [];

    if (dto.tripId) {
      const trip = await this.prisma.trip.findFirst({
        where: { id: dto.tripId, deletedAt: null },
        select: { id: true, userId: true, status: true, coverMediaId: true },
      });
      if (!trip) throw new NotFoundException('Trip not found');
      if (trip.userId !== userId) {
        throw new ForbiddenException('You can only post about your own trips');
      }
      if (trip.status !== TripStatus.PUBLISHED) {
        throw new BadRequestException('Publish the trip before sharing it as a post');
      }
      // Fall back to the trip cover so a post always has something to show.
      if (!mediaIds.length && trip.coverMediaId) mediaIds = [trip.coverMediaId];
    }

    if (mediaIds.length) await this.assertOwnsMedia(userId, mediaIds);

    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          userId,
          tripId: dto.tripId,
          placeId: dto.placeId,
          caption: dto.caption,
          visibility: dto.visibility ?? Visibility.PUBLIC,
          media: {
            create: mediaIds.map((mediaId, sequence) => ({ mediaId, sequence })),
          },
        },
        select: { id: true },
      });

      await tx.user.update({ where: { id: userId }, data: { postCount: { increment: 1 } } });
      return created;
    });

    return this.findOne(post.id, userId);
  }

  async findOne(postId: string, viewerId?: string): Promise<PostDto> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      include: POST_INCLUDE,
    });
    if (!post) throw new NotFoundException('Post not found');

    if (!(await this.visibility.canView(viewerId, { id: post.userId }, post.visibility))) {
      throw new NotFoundException('Post not found');
    }
    if (viewerId && viewerId !== post.userId) {
      if (await this.visibility.isBlockedEitherWay(viewerId, post.userId)) {
        throw new NotFoundException('Post not found');
      }
    }

    const [cards] = await Promise.all([this.toPosts([post], viewerId)]);
    return cards[0];
  }

  async update(postId: string, userId: string, dto: UpdatePostDto): Promise<PostDto> {
    await this.assertOwner(postId, userId);
    await this.prisma.post.update({ where: { id: postId }, data: dto });
    return this.findOne(postId, userId);
  }

  async remove(postId: string, userId: string): Promise<{ message: string }> {
    await this.assertOwner(postId, userId);

    await this.prisma.$transaction([
      this.prisma.post.update({ where: { id: postId }, data: { deletedAt: new Date() } }),
      this.prisma.user.update({ where: { id: userId }, data: { postCount: { decrement: 1 } } }),
    ]);

    return { message: 'Post deleted' };
  }

  async list(query: PostQueryDto, viewerId?: string) {
    const cursor = decodeCursor(query.cursor);

    const rows = await this.prisma.post.findMany({
      where: {
        deletedAt: null,
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.placeId ? { placeId: query.placeId } : {}),
        ...(query.tripId ? { tripId: query.tripId } : {}),
        ...(cursor ? { createdAt: { lt: new Date(cursor.v) } } : {}),
        AND: [this.visibility.postVisibilityFilter(viewerId), this.postBlockFilter(viewerId)],
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      include: POST_INCLUDE,
    });

    const page = buildPage(rows, query.limit, (r) => r.createdAt);
    return { ...page, items: await this.toPosts(page.items, viewerId) };
  }

  /**
   * Feed (spec §42). Deliberately simple for MVP:
   *   following / friends — reverse chronological from that set
   *   for-you            — recent public posts, lightly boosted by engagement
   */
  async feed(query: FeedQueryDto, viewerId?: string) {
    const cursor = decodeCursor(query.cursor);
    const type = query.type ?? 'for-you';

    if ((type === 'following' || type === 'friends') && !viewerId) {
      throw new ForbiddenException('Sign in to see this feed');
    }

    let authorFilter: Prisma.PostWhereInput = {};

    if (type === 'following' && viewerId) {
      authorFilter = { user: { followers: { some: { followerId: viewerId } } } };
    } else if (type === 'friends' && viewerId) {
      authorFilter = {
        user: {
          AND: [
            { followers: { some: { followerId: viewerId } } },
            { following: { some: { followingId: viewerId } } },
          ],
        },
      };
    }

    const rows = await this.prisma.post.findMany({
      where: {
        deletedAt: null,
        ...authorFilter,
        ...(cursor ? { createdAt: { lt: new Date(cursor.v) } } : {}),
        AND: [this.visibility.postVisibilityFilter(viewerId), this.postBlockFilter(viewerId)],
      },
      orderBy:
        type === 'for-you'
          ? [{ createdAt: 'desc' }, { likeCount: 'desc' }]
          : [{ createdAt: 'desc' }],
      take: query.limit + 1,
      include: POST_INCLUDE,
    });

    const page = buildPage(rows, query.limit, (r) => r.createdAt);
    return { ...page, items: await this.toPosts(page.items, viewerId) };
  }

  // -------------------------------------------------------------------------
  // Engagement
  // -------------------------------------------------------------------------

  async like(postId: string, userId: string): Promise<ToggleResultDto> {
    await this.assertVisible(postId, userId);

    const created = await this.prisma.like.createMany({
      data: [{ postId, userId }],
      skipDuplicates: true,
    });

    const post = created.count
      ? await this.prisma.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        })
      : await this.prisma.post.findUniqueOrThrow({
          where: { id: postId },
          select: { likeCount: true },
        });

    return { active: true, count: post.likeCount };
  }

  async unlike(postId: string, userId: string): Promise<ToggleResultDto> {
    const deleted = await this.prisma.like.deleteMany({ where: { postId, userId } });

    const post = deleted.count
      ? await this.prisma.post.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        })
      : await this.prisma.post.findUniqueOrThrow({
          where: { id: postId },
          select: { likeCount: true },
        });

    return { active: false, count: post.likeCount };
  }

  async save(postId: string, userId: string, dto: SavePostDto): Promise<ToggleResultDto> {
    const post = await this.assertVisible(postId, userId);

    if (dto.collectionId) await this.assertOwnsCollection(dto.collectionId, userId);

    const existing = await this.prisma.save.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { id: true },
    });

    if (existing) {
      // Already saved — treat the call as "move into this collection".
      await this.prisma.save.update({
        where: { id: existing.id },
        data: { collectionId: dto.collectionId, note: dto.note },
      });
      return { active: true, count: post.saveCount };
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.save.create({
        data: { userId, postId, collectionId: dto.collectionId, note: dto.note },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { saveCount: { increment: 1 } },
        select: { saveCount: true },
      }),
      ...(dto.collectionId
        ? [
            this.prisma.collection.update({
              where: { id: dto.collectionId },
              data: { itemCount: { increment: 1 } },
            }),
          ]
        : []),
    ]);

    return { active: true, count: updated.saveCount };
  }

  async unsave(postId: string, userId: string): Promise<ToggleResultDto> {
    const existing = await this.prisma.save.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { id: true, collectionId: true },
    });

    if (!existing) {
      const post = await this.prisma.post.findUniqueOrThrow({
        where: { id: postId },
        select: { saveCount: true },
      });
      return { active: false, count: post.saveCount };
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.save.delete({ where: { id: existing.id } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { saveCount: { decrement: 1 } },
        select: { saveCount: true },
      }),
      ...(existing.collectionId
        ? [
            this.prisma.collection.update({
              where: { id: existing.collectionId },
              data: { itemCount: { decrement: 1 } },
            }),
          ]
        : []),
    ]);

    return { active: false, count: updated.saveCount };
  }

  /** Share is a counter only — the link itself is built by the client. */
  async share(postId: string): Promise<{ shareCount: number }> {
    const post = await this.prisma.post.update({
      where: { id: postId },
      data: { shareCount: { increment: 1 } },
      select: { shareCount: true },
    });
    return post;
  }

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  async addComment(postId: string, userId: string, dto: CreateCommentDto): Promise<CommentDto> {
    await this.assertVisible(postId, userId);

    if (dto.parentId) {
      const parent = await this.prisma.comment.findFirst({
        where: { id: dto.parentId, postId, deletedAt: null },
        select: { id: true, parentId: true },
      });
      if (!parent) throw new NotFoundException('Parent comment not found');
      // One level of threading only: a reply to a reply attaches to its root.
      if (parent.parentId) dto.parentId = parent.parentId;
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { postId, userId, parentId: dto.parentId, body: dto.body },
        include: { user: { select: USER_SUMMARY_SELECT } },
      });

      await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
      if (dto.parentId) {
        await tx.comment.update({
          where: { id: dto.parentId },
          data: { replyCount: { increment: 1 } },
        });
      }
      return created;
    });

    return {
      id: comment.id,
      user: { ...comment.user, isFollowing: null },
      body: comment.body,
      parentId: comment.parentId,
      replyCount: comment.replyCount,
      isOwner: true,
      createdAt: comment.createdAt,
    };
  }

  async listComments(postId: string, query: PostQueryDto, viewerId?: string) {
    await this.assertVisible(postId, viewerId);
    const cursor = decodeCursor(query.cursor);

    const rows = await this.prisma.comment.findMany({
      where: {
        postId,
        parentId: null, // top-level only; replies are fetched per thread
        deletedAt: null,
        ...(cursor ? { createdAt: { lt: new Date(cursor.v) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      include: { user: { select: USER_SUMMARY_SELECT } },
    });

    const page = buildPage(rows, query.limit, (r) => r.createdAt);

    return {
      ...page,
      items: page.items.map((c) => ({
        id: c.id,
        user: { ...c.user, isFollowing: null },
        body: c.body,
        parentId: c.parentId,
        replyCount: c.replyCount,
        isOwner: c.userId === viewerId,
        createdAt: c.createdAt,
      })),
    };
  }

  async listReplies(commentId: string, query: PostQueryDto, viewerId?: string) {
    const cursor = decodeCursor(query.cursor);

    const rows = await this.prisma.comment.findMany({
      where: {
        parentId: commentId,
        deletedAt: null,
        ...(cursor ? { createdAt: { gt: new Date(cursor.v) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: query.limit + 1,
      include: { user: { select: USER_SUMMARY_SELECT } },
    });

    const page = buildPage(rows, query.limit, (r) => r.createdAt);

    return {
      ...page,
      items: page.items.map((c) => ({
        id: c.id,
        user: { ...c.user, isFollowing: null },
        body: c.body,
        parentId: c.parentId,
        replyCount: c.replyCount,
        isOwner: c.userId === viewerId,
        createdAt: c.createdAt,
      })),
    };
  }

  /** The comment author or the post author may delete a comment. */
  async removeComment(commentId: string, userId: string): Promise<{ message: string }> {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, deletedAt: null },
      include: { post: { select: { userId: true } } },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    if (comment.userId !== userId && comment.post.userId !== userId) {
      throw new ForbiddenException('You cannot delete this comment');
    }

    await this.prisma.$transaction([
      this.prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } }),
      this.prisma.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      }),
      ...(comment.parentId
        ? [
            this.prisma.comment.update({
              where: { id: comment.parentId },
              data: { replyCount: { decrement: 1 } },
            }),
          ]
        : []),
    ]);

    return { message: 'Comment deleted' };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Attaches viewer-specific flags to a page of posts in two queries. */
  private async toPosts(rows: any[], viewerId?: string): Promise<PostDto[]> {
    if (!rows.length) return [];

    const postIds = rows.map((r) => r.id);

    const [liked, saved, tripCards] = await Promise.all([
      viewerId
        ? this.prisma.like.findMany({
            where: { userId: viewerId, postId: { in: postIds } },
            select: { postId: true },
          })
        : Promise.resolve([]),
      viewerId
        ? this.prisma.save.findMany({
            where: { userId: viewerId, postId: { in: postIds } },
            select: { postId: true },
          })
        : Promise.resolve([]),
      this.trips.toCards(
        rows.filter((r) => r.trip).map((r) => r.trip),
        viewerId,
      ),
    ]);

    const likedSet = new Set(liked.map((l) => l.postId));
    const savedSet = new Set(saved.map((s) => s.postId));
    const tripById = new Map(tripCards.map((t) => [t.id, t]));

    return rows.map((post) => ({
      id: post.id,
      user: { ...post.user, isFollowing: null },
      caption: post.caption,
      media: post.media.map((m: any) => m.media),
      trip: post.trip ? (tripById.get(post.trip.id) ?? null) : null,
      place: post.place ?? null,
      visibility: post.visibility,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      saveCount: post.saveCount,
      shareCount: post.shareCount,
      isLiked: viewerId ? likedSet.has(post.id) : null,
      isSaved: viewerId ? savedSet.has(post.id) : null,
      isOwner: post.userId === viewerId,
      createdAt: post.createdAt,
    }));
  }

  private async assertOwner(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException('You can only edit your own posts');
    return post;
  }

  /** Guards engagement actions against posts the caller cannot see. */
  private async assertVisible(postId: string, viewerId?: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true, userId: true, visibility: true, saveCount: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    if (!(await this.visibility.canView(viewerId, { id: post.userId }, post.visibility))) {
      throw new NotFoundException('Post not found');
    }
    if (viewerId && viewerId !== post.userId) {
      if (await this.visibility.isBlockedEitherWay(viewerId, post.userId)) {
        throw new NotFoundException('Post not found');
      }
    }
    return post;
  }

  private async assertOwnsMedia(userId: string, mediaIds: string[]): Promise<void> {
    const owned = await this.prisma.media.findMany({
      where: { id: { in: mediaIds }, userId },
      select: { id: true },
    });
    if (owned.length !== new Set(mediaIds).size) {
      throw new BadRequestException('One or more media ids are not yours or do not exist');
    }
  }

  private async assertOwnsCollection(collectionId: string, userId: string): Promise<void> {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, userId },
      select: { id: true },
    });
    if (!collection) throw new NotFoundException('Collection not found');
  }

  private postBlockFilter(viewerId?: string): Prisma.PostWhereInput {
    if (!viewerId) return {};
    return {
      user: {
        blocksMade: { none: { blockedId: viewerId } },
        blocksReceived: { none: { blockerId: viewerId } },
      },
    };
  }
}

const USER_SUMMARY_SELECT = {
  id: true,
  username: true,
  name: true,
  profileImage: true,
} satisfies Prisma.UserSelect;

const POST_INCLUDE = {
  user: { select: USER_SUMMARY_SELECT },
  media: {
    orderBy: { sequence: 'asc' },
    include: {
      media: {
        select: { id: true, url: true, thumbnailUrl: true, blurhash: true, width: true, height: true },
      },
    },
  },
  trip: { select: TRIP_CARD_SELECT },
  place: { select: PLACE_SUMMARY_SELECT },
} satisfies Prisma.PostInclude;
