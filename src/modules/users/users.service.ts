import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TripStatus, UserStatus } from '@prisma/client';
import { VisibilityService } from 'src/common/services/visibility.service';
import { CursorPaginationDto } from 'src/common/dto/pagination.dto';
import { Page, buildPage, decodeCursor } from 'src/common/utils';
import { toSlug } from 'src/common/utils/slug.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { TravelMapEntryDto, UserProfileDto, UserSummaryDto } from './dto/user-response.dto';

const SUMMARY_SELECT = {
  id: true,
  username: true,
  name: true,
  profileImage: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
  ) {}

  /** Accepts either a uuid or a @username, so FE can route on either. */
  async resolveId(idOrUsername: string): Promise<string> {
    if (UUID_RE.test(idOrUsername)) return idOrUsername;

    const user = await this.prisma.user.findUnique({
      where: { username: idOrUsername.replace(/^@/, '').toLowerCase() },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user.id;
  }

  async getProfile(idOrUsername: string, viewerId?: string): Promise<UserProfileDto> {
    const userId = await this.resolveId(idOrUsername);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const isSelf = viewerId === user.id;

    if (!isSelf && user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('User not found');
    }

    const [relation, isBlocked, stats] = await Promise.all([
      viewerId && !isSelf ? this.visibility.relationship(viewerId, user.id) : null,
      viewerId && !isSelf
        ? this.prisma.block
            .findUnique({
              where: { blockerId_blockedId: { blockerId: viewerId, blockedId: user.id } },
              select: { blockerId: true },
            })
            .then(Boolean)
        : null,
      this.computeStats(user.id, viewerId),
    ]);

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      profileImage: user.profileImage,
      bio: user.bio,
      coverImage: user.coverImage,
      homeCountry: user.homeCountry,
      homeCity: user.homeCity,
      websiteUrl: user.websiteUrl,
      currency: user.currency,
      role: user.role,
      // Email and account status are private to the owner.
      ...(isSelf ? { email: user.email, status: user.status } : {}),
      stats,
      isSelf,
      isFollowing: relation ? relation.viewerFollowsOwner : viewerId ? false : null,
      isFollowedBy: relation ? relation.ownerFollowsViewer : viewerId ? false : null,
      isBlocked,
      createdAt: user.createdAt,
    };
  }

  /**
   * Profile counters (spec §4). Trips/places/countries are scoped to what the
   * viewer may actually see, so a private trip never leaks through a count.
   */
  async computeStats(userId: string, viewerId?: string) {
    const tripFilter: Prisma.TripWhereInput = {
      userId,
      deletedAt: null,
      status: TripStatus.PUBLISHED,
      AND: [this.visibility.visibilityFilter(viewerId)],
    };

    const [user, tripCount, visibleTrips] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { followerCount: true, followingCount: true, postCount: true },
      }),
      this.prisma.trip.count({ where: tripFilter }),
      this.prisma.trip.findMany({
        where: tripFilter,
        select: { countryCode: true, places: { select: { placeId: true } } },
      }),
    ]);

    const places = new Set<string>();
    const countries = new Set<string>();
    for (const trip of visibleTrips) {
      countries.add(trip.countryCode);
      for (const p of trip.places) places.add(p.placeId);
    }

    return {
      trips: tripCount,
      placesVisited: places.size,
      countries: countries.size,
      followers: user.followerCount,
      following: user.followingCount,
      posts: user.postCount,
    };
  }

  async update(userId: string, dto: UpdateUserDto): Promise<UserProfileDto> {
    if (dto.username) {
      const taken = await this.prisma.user.findFirst({
        where: { username: dto.username, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) throw new BadRequestException('Username is already taken');
    }

    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { profileImage: true, coverImage: true },
    });

    await Promise.all([
      this.assertOwnMedia(userId, 'profileImage', dto.profileImage, current.profileImage),
      this.assertOwnMedia(userId, 'coverImage', dto.coverImage, current.coverImage),
    ]);

    await this.prisma.user.update({ where: { id: userId }, data: dto });
    return this.getProfile(userId, userId);
  }

  /**
   * Avatar and cover must point at media the user uploaded here.
   *
   * A free-text URL would let anyone host their avatar on a server they
   * control and read the IP of everyone who loads their profile, which is a
   * tracking pixel with extra steps. Unchanged values pass untouched so a
   * client that PATCHes a whole profile form is not punished for it — that
   * also preserves avatars set from a Google account at sign-in.
   */
  private async assertOwnMedia(
    userId: string,
    field: 'profileImage' | 'coverImage',
    value: string | null | undefined,
    currentValue: string | null,
  ): Promise<void> {
    if (value === undefined || value === null) return;
    if (value === currentValue) return;

    const media = await this.prisma.media.findFirst({
      where: { url: value, userId },
      select: { id: true },
    });

    if (!media) {
      throw new BadRequestException(
        `${field} must be the url of an image you uploaded. Upload it with POST /media/upload and send back the url from that response.`,
      );
    }
  }

  async deactivate(userId: string): Promise<{ message: string }> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.DEACTIVATED, deletedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: 'Account deactivated' };
  }

  // -------------------------------------------------------------------------
  // Social graph
  // -------------------------------------------------------------------------

  async follow(followerId: string, targetIdOrUsername: string): Promise<{ following: boolean }> {
    const followingId = await this.resolveId(targetIdOrUsername);

    if (followerId === followingId) {
      throw new BadRequestException('You cannot follow yourself');
    }
    if (await this.visibility.isBlockedEitherWay(followerId, followingId)) {
      throw new ForbiddenException('This action is not available');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: followingId, deletedAt: null, status: UserStatus.ACTIVE },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    // createMany+skipDuplicates keeps a double-tap idempotent without a
    // pre-read, and the counters only move when a row was actually inserted.
    const created = await this.prisma.follow.createMany({
      data: [{ followerId, followingId }],
      skipDuplicates: true,
    });

    if (created.count > 0) {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: followerId },
          data: { followingCount: { increment: 1 } },
        }),
        this.prisma.user.update({
          where: { id: followingId },
          data: { followerCount: { increment: 1 } },
        }),
      ]);
    }

    return { following: true };
  }

  async unfollow(followerId: string, targetIdOrUsername: string): Promise<{ following: boolean }> {
    const followingId = await this.resolveId(targetIdOrUsername);

    const deleted = await this.prisma.follow.deleteMany({ where: { followerId, followingId } });

    if (deleted.count > 0) {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: followerId },
          data: { followingCount: { decrement: 1 } },
        }),
        this.prisma.user.update({
          where: { id: followingId },
          data: { followerCount: { decrement: 1 } },
        }),
      ]);
    }

    return { following: false };
  }

  async listFollowers(
    idOrUsername: string,
    query: CursorPaginationDto,
    viewerId?: string,
  ): Promise<Page<UserSummaryDto>> {
    const userId = await this.resolveId(idOrUsername);
    const cursor = decodeCursor(query.cursor);

    const rows = await this.prisma.follow.findMany({
      where: {
        followingId: userId,
        ...(cursor ? { createdAt: { lt: new Date(cursor.v) } } : {}),
        follower: { deletedAt: null, status: UserStatus.ACTIVE },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      select: { createdAt: true, follower: { select: SUMMARY_SELECT } },
    });

    return this.pageOfUsers(
      rows.map((r) => ({ ...r.follower, _sort: r.createdAt })),
      query.limit,
      viewerId,
    );
  }

  async listFollowing(
    idOrUsername: string,
    query: CursorPaginationDto,
    viewerId?: string,
  ): Promise<Page<UserSummaryDto>> {
    const userId = await this.resolveId(idOrUsername);
    const cursor = decodeCursor(query.cursor);

    const rows = await this.prisma.follow.findMany({
      where: {
        followerId: userId,
        ...(cursor ? { createdAt: { lt: new Date(cursor.v) } } : {}),
        following: { deletedAt: null, status: UserStatus.ACTIVE },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      select: { createdAt: true, following: { select: SUMMARY_SELECT } },
    });

    return this.pageOfUsers(
      rows.map((r) => ({ ...r.following, _sort: r.createdAt })),
      query.limit,
      viewerId,
    );
  }

  /**
   * Travel map (spec §32): one pin per country/state the user has published.
   */
  async travelMap(idOrUsername: string, viewerId?: string): Promise<TravelMapEntryDto[]> {
    const userId = await this.resolveId(idOrUsername);

    const trips = await this.prisma.trip.findMany({
      where: {
        userId,
        deletedAt: null,
        status: TripStatus.PUBLISHED,
        AND: [this.visibility.visibilityFilter(viewerId)],
      },
      select: {
        countryCode: true,
        country: true,
        state: true,
        startDate: true,
        places: { select: { placeId: true } },
      },
    });

    const map = new Map<string, TravelMapEntryDto & { _places: Set<string> }>();

    for (const trip of trips) {
      const key = `${trip.countryCode}::${trip.state ?? ''}`;
      const entry = map.get(key) ?? {
        countryCode: trip.countryCode,
        country: trip.country,
        state: trip.state,
        tripCount: 0,
        placeCount: 0,
        lastVisitedAt: null,
        _places: new Set<string>(),
      };

      entry.tripCount += 1;
      for (const p of trip.places) entry._places.add(p.placeId);
      if (!entry.lastVisitedAt || trip.startDate > entry.lastVisitedAt) {
        entry.lastVisitedAt = trip.startDate;
      }
      map.set(key, entry);
    }

    return [...map.values()]
      .map(({ _places, ...entry }) => ({ ...entry, placeCount: _places.size }))
      .sort((a, b) => b.tripCount - a.tripCount);
  }

  /** Suggests `sreyanse`, `sreyanse1`, ... until one is free. */
  async generateUniqueUsername(seed: string): Promise<string> {
    const base = toSlug(seed).replace(/-/g, '').slice(0, 24) || 'traveler';

    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = attempt === 0 ? base : `${base}${attempt}`;
      const exists = await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    return `${base}${Date.now().toString(36)}`;
  }

  /** Annotates a batch of users with the viewer's follow state in one query. */
  private async pageOfUsers(
    rows: (UserSummaryDto & { _sort: Date })[],
    limit: number,
    viewerId?: string,
  ): Promise<Page<UserSummaryDto>> {
    const page = buildPage(rows, limit, (r) => r._sort);
    const items = page.items.map(({ _sort, ...u }) => u);

    if (!viewerId || items.length === 0) {
      return { ...page, items: items.map((u) => ({ ...u, isFollowing: viewerId ? false : null })) };
    }

    const followed = await this.prisma.follow.findMany({
      where: { followerId: viewerId, followingId: { in: items.map((u) => u.id) } },
      select: { followingId: true },
    });
    const followedSet = new Set(followed.map((f) => f.followingId));

    return { ...page, items: items.map((u) => ({ ...u, isFollowing: followedSet.has(u.id) })) };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
