import { Injectable } from '@nestjs/common';
import { Prisma, Visibility } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Central place for "who can see what" (spec §33).
 *
 * FRIENDS means a mutual follow. Rather than resolving relationships per row,
 * visibility is pushed into SQL as an OR-filter so lists stay one query.
 */
@Injectable()
export class VisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Prisma `where` fragment restricting rows to what `viewerId` may see.
   * Pass it as one branch of an AND alongside the caller's own filters.
   */
  visibilityFilter(viewerId?: string): Prisma.TripWhereInput {
    if (!viewerId) return { visibility: Visibility.PUBLIC };

    return {
      OR: [
        { visibility: Visibility.PUBLIC },
        { userId: viewerId }, // your own trips, at any visibility
        {
          visibility: Visibility.FOLLOWERS,
          user: { followers: { some: { followerId: viewerId } } },
        },
        {
          visibility: Visibility.FRIENDS,
          user: {
            AND: [
              { followers: { some: { followerId: viewerId } } },
              { following: { some: { followingId: viewerId } } },
            ],
          },
        },
      ],
    };
  }

  /** Same rule expressed for posts. */
  postVisibilityFilter(viewerId?: string): Prisma.PostWhereInput {
    if (!viewerId) return { visibility: Visibility.PUBLIC };

    return {
      OR: [
        { visibility: Visibility.PUBLIC },
        { userId: viewerId },
        {
          visibility: Visibility.FOLLOWERS,
          user: { followers: { some: { followerId: viewerId } } },
        },
        {
          visibility: Visibility.FRIENDS,
          user: {
            AND: [
              { followers: { some: { followerId: viewerId } } },
              { following: { some: { followingId: viewerId } } },
            ],
          },
        },
      ],
    };
  }

  /** Rows involving anyone the viewer blocked, or who blocked the viewer. */
  blockFilter(viewerId?: string): Prisma.TripWhereInput {
    if (!viewerId) return {};
    return {
      user: {
        blocksMade: { none: { blockedId: viewerId } },
        blocksReceived: { none: { blockerId: viewerId } },
      },
    };
  }

  /**
   * Single-row check, used after loading a trip/post by id.
   */
  async canView(
    viewerId: string | undefined,
    owner: { id: string },
    visibility: Visibility,
  ): Promise<boolean> {
    if (visibility === Visibility.PUBLIC) return true;
    if (!viewerId) return false;
    if (viewerId === owner.id) return true;
    if (visibility === Visibility.PRIVATE) return false;

    const relation = await this.relationship(viewerId, owner.id);
    if (visibility === Visibility.FOLLOWERS) return relation.viewerFollowsOwner;
    if (visibility === Visibility.FRIENDS) return relation.isMutual;
    return false;
  }

  async relationship(
    viewerId: string,
    otherId: string,
  ): Promise<{ viewerFollowsOwner: boolean; ownerFollowsViewer: boolean; isMutual: boolean }> {
    const [a, b] = await this.prisma.$transaction([
      this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: otherId } },
        select: { followerId: true },
      }),
      this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: otherId, followingId: viewerId } },
        select: { followerId: true },
      }),
    ]);

    return {
      viewerFollowsOwner: !!a,
      ownerFollowsViewer: !!b,
      isMutual: !!a && !!b,
    };
  }

  /** True when either side has blocked the other. */
  async isBlockedEitherWay(viewerId: string, otherId: string): Promise<boolean> {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: otherId },
          { blockerId: otherId, blockedId: viewerId },
        ],
      },
      select: { blockerId: true },
    });
    return !!block;
  }

  /**
   * Expenses have their own visibility so a public trip can hide its numbers.
   */
  async canViewExpenses(
    viewerId: string | undefined,
    owner: { id: string },
    expenseVisibility: Visibility,
  ): Promise<boolean> {
    return this.canView(viewerId, owner, expenseVisibility);
  }
}
