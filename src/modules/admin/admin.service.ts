import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TripStatus, UserStatus } from '@prisma/client';
import { StorageDriver } from 'src/modules/media/storage/storage.driver';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  AdminPlaceQueryDto,
  AdminTripQueryDto,
  AdminUserQueryDto,
  ChangeRoleDto,
  MergePlaceDto,
  SetUserStatusDto,
  UpdatePlaceDto,
} from './dto/admin.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
  ) {}

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  async stats() {
    const since = (days: number) => new Date(Date.now() - days * 86_400_000);

    const [
      users,
      activeUsers,
      suspendedUsers,
      newUsers7d,
      newUsers30d,
      trips,
      publishedTrips,
      draftTrips,
      posts,
      places,
      placesMissingCoordinates,
      placesUnverified,
      pendingReports,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
      this.prisma.user.count({ where: { createdAt: { gte: since(7) } } }),
      this.prisma.user.count({ where: { createdAt: { gte: since(30) } } }),
      this.prisma.trip.count({ where: { deletedAt: null } }),
      this.prisma.trip.count({ where: { deletedAt: null, status: TripStatus.PUBLISHED } }),
      this.prisma.trip.count({ where: { deletedAt: null, status: TripStatus.DRAFT } }),
      this.prisma.post.count({ where: { deletedAt: null } }),
      this.prisma.place.count(),
      this.prisma.place.count({ where: { OR: [{ latitude: null }, { longitude: null }] } }),
      this.prisma.place.count({ where: { isVerified: false } }),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      users: {
        total: users,
        active: activeUsers,
        suspended: suspendedUsers,
        newLast7Days: newUsers7d,
        newLast30Days: newUsers30d,
      },
      trips: { total: trips, published: publishedTrips, draft: draftTrips },
      posts: { total: posts },
      places: {
        total: places,
        missingCoordinates: placesMissingCoordinates,
        unverified: placesUnverified,
      },
      moderation: { pendingReports },
    };
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  async listUsers(query: AdminUserQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { username: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: ADMIN_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, hasMore: query.skip + items.length < total, nextCursor: null };
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...ADMIN_USER_SELECT,
        bio: true,
        homeCountry: true,
        homeCity: true,
        provider: true,
        emailVerified: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async changeRole(actorId: string, userId: string, dto: ChangeRoleDto) {
    // An admin demoting themselves is how every admin gets locked out.
    if (actorId === userId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === dto.role) {
      return { message: `${user.username} is already ${dto.role}`, role: user.role };
    }

    // No session revocation here on purpose. JwtStrategy re-reads the user on
    // every request, so the new role applies to the very next call — signing
    // them out would be churn, not security.
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { role: dto.role } }),
      this.record(actorId, 'USER_ROLE_CHANGED', 'USER', userId, dto.reason, {
        from: user.role,
        to: dto.role,
      }),
    ]);

    return { message: `${user.username} is now ${dto.role}`, role: dto.role };
  }

  async setUserStatus(actorId: string, userId: string, dto: SetUserStatusDto) {
    if (actorId === userId) {
      throw new ForbiddenException('You cannot change your own account status');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { status: dto.status } }),
      // Suspension already bites immediately (JwtStrategy rejects a suspended
      // account), but a suspended user should not be able to mint fresh tokens
      // either, so their refresh tokens go too.
      ...(dto.status === UserStatus.SUSPENDED
        ? [
            this.prisma.refreshToken.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]
        : []),
      this.record(actorId, 'USER_STATUS_CHANGED', 'USER', userId, dto.reason, {
        from: user.status,
        to: dto.status,
      }),
    ]);

    return { message: `${user.username} is now ${dto.status}` };
  }

  /**
   * Removes a user and everything they made.
   *
   * The database cascades their trips, posts, photos, comments, likes, saves,
   * collections and follows. Two things it cannot do on its own, and both are
   * handled here:
   *
   *   - their uploaded files would stay in object storage forever
   *   - counters denormalised onto *other* rows would be left too high — every
   *     post they liked, every trip they saved, everyone who followed them
   *
   * Counters are recomputed from the surviving rows rather than decremented,
   * so second-order effects (replies to their comments cascading away too)
   * come out right instead of drifting.
   */
  async deleteUser(actorId: string, userId: string) {
    if (actorId === userId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        tripCount: true,
        postCount: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Everything whose counters will need recomputing once the user is gone.
    const [following, followers, likes, comments, saves, media, ownTrips, ownPosts] =
      await Promise.all([
        this.prisma.follow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
        }),
        this.prisma.follow.findMany({
          where: { followingId: userId },
          select: { followerId: true },
        }),
        this.prisma.like.findMany({ where: { userId }, select: { postId: true } }),
        this.prisma.comment.findMany({ where: { userId }, select: { postId: true } }),
        this.prisma.save.findMany({ where: { userId }, select: { postId: true, tripId: true } }),
        this.prisma.media.findMany({ where: { userId }, select: { storageKey: true } }),
        this.prisma.trip.count({ where: { userId } }),
        this.prisma.post.count({ where: { userId } }),
      ]);

    // Their own posts and trips are about to disappear, so exclude them from
    // the recount — there would be nothing left to count.
    const ownPostIds = new Set(
      (await this.prisma.post.findMany({ where: { userId }, select: { id: true } })).map(
        (p) => p.id,
      ),
    );
    const ownTripIds = new Set(
      (await this.prisma.trip.findMany({ where: { userId }, select: { id: true } })).map(
        (t) => t.id,
      ),
    );

    const affectedUserIds = [
      ...new Set([...following.map((f) => f.followingId), ...followers.map((f) => f.followerId)]),
    ];
    const affectedPostIds = [
      ...new Set([
        ...likes.map((l) => l.postId),
        ...comments.map((c) => c.postId),
        ...saves.map((s) => s.postId).filter((id): id is string => !!id),
      ]),
    ].filter((id) => !ownPostIds.has(id));
    const affectedTripIds = [
      ...new Set(saves.map((s) => s.tripId).filter((id): id is string => !!id)),
    ].filter((id) => !ownTripIds.has(id));

    await this.prisma.$transaction(async (tx) => {
      await tx.adminAction.create({
        data: {
          actorId,
          action: 'USER_DELETED',
          targetType: 'USER',
          targetId: userId,
          // The row itself is about to vanish, so the audit keeps a snapshot —
          // otherwise the trail says an id was deleted and nothing more.
          metadata: {
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
            tripsDeleted: ownTrips,
            postsDeleted: ownPosts,
            filesDeleted: media.length,
          },
        },
      });

      // Cascades take the trips, posts, photos, comments, likes, saves,
      // collections, follows, blocks, reports and sessions with it.
      await tx.user.delete({ where: { id: userId } });

      if (affectedUserIds.length) {
        await tx.$executeRaw`
          UPDATE "users" u SET
            "followerCount"  = (SELECT count(*) FROM "follows" f WHERE f."followingId" = u.id),
            "followingCount" = (SELECT count(*) FROM "follows" f WHERE f."followerId"  = u.id)
          WHERE u.id = ANY(${affectedUserIds}::uuid[])`;
      }

      if (affectedPostIds.length) {
        await tx.$executeRaw`
          UPDATE "posts" p SET
            "likeCount"    = (SELECT count(*) FROM "likes" l WHERE l."postId" = p.id),
            "commentCount" = (SELECT count(*) FROM "comments" c WHERE c."postId" = p.id AND c."deletedAt" IS NULL),
            "saveCount"    = (SELECT count(*) FROM "saves" s WHERE s."postId" = p.id)
          WHERE p.id = ANY(${affectedPostIds}::uuid[])`;
      }

      if (affectedTripIds.length) {
        await tx.$executeRaw`
          UPDATE "trips" t SET
            "saveCount" = (SELECT count(*) FROM "saves" s WHERE s."tripId" = t.id)
          WHERE t.id = ANY(${affectedTripIds}::uuid[])`;
      }
    });

    // After the rows are gone: a leaked file costs storage, a failed delete
    // would leave the account half-removed.
    let filesRemoved = 0;
    for (const item of media) {
      if (!item.storageKey) continue;
      try {
        await this.storage.delete(item.storageKey);
        filesRemoved += 1;
      } catch (error) {
        this.logger.warn(
          `Could not remove ${item.storageKey} for deleted user ${userId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    return {
      message: `${user.username} and everything they created has been deleted`,
      deleted: {
        trips: ownTrips,
        posts: ownPosts,
        files: filesRemoved,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Trips
  // -------------------------------------------------------------------------

  /** Every trip, drafts and private ones included — no public endpoint does this. */
  async listTrips(query: AdminTripQueryDto) {
    const where: Prisma.TripWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { destination: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.trip.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          destination: true,
          country: true,
          state: true,
          status: true,
          visibility: true,
          expenseVisibility: true,
          startDate: true,
          endDate: true,
          placeCount: true,
          photoCount: true,
          viewCount: true,
          createdAt: true,
          publishedAt: true,
          user: { select: { id: true, username: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.trip.count({ where }),
    ]);

    return { items, total, hasMore: query.skip + items.length < total, nextCursor: null };
  }

  // -------------------------------------------------------------------------
  // Places
  // -------------------------------------------------------------------------

  async listPlaces(query: AdminPlaceQueryDto) {
    const where: Prisma.PlaceWhereInput = {
      ...(query.missingCoordinates ? { OR: [{ latitude: null }, { longitude: null }] } : {}),
      ...(query.unverified ? { isVerified: false } : {}),
      ...(query.orphaned
        ? {
            tripDestinations: { none: {} },
            tripPlaces: { none: {} },
            stays: { none: {} },
            photos: { none: {} },
            ratings: { none: {} },
            realityChecks: { none: {} },
            activities: { none: {} },
            posts: { none: {} },
            trips: { none: {} },
            children: { none: {} },
          }
        : {}),
      ...(query.q
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { state: { contains: query.q, mode: 'insensitive' } },
                  { region: { contains: query.q, mode: 'insensitive' } },
                  { city: { contains: query.q, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.place.findMany({
        where,
        select: {
          id: true,
          slug: true,
          name: true,
          category: true,
          countryCode: true,
          country: true,
          state: true,
          region: true,
          city: true,
          latitude: true,
          longitude: true,
          isDestination: true,
          isVerified: true,
          experienceCount: true,
          createdAt: true,
          _count: {
            select: {
              tripDestinations: true,
              tripPlaces: true,
              stays: true,
              photos: true,
              ratings: true,
              realityChecks: true,
              activities: true,
              posts: true,
              trips: true,
              children: true,
            },
          },
        },
        orderBy: [{ experienceCount: 'desc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.place.count({ where }),
    ]);

    const items = rows.map(({ _count, ...place }) => ({
      ...place,
      referenceCount: Object.values(_count).reduce((sum, n) => sum + n, 0),
      references: _count,
    }));

    return { items, total, hasMore: query.skip + rows.length < total, nextCursor: null };
  }

  async updatePlace(actorId: string, placeId: string, dto: UpdatePlaceDto) {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, name: true },
    });
    if (!place) throw new NotFoundException('Place not found');

    const updated = await this.prisma.place.update({ where: { id: placeId }, data: dto });
    await this.record(actorId, 'PLACE_UPDATED', 'PLACE', placeId, undefined, {
      changed: Object.keys(dto),
    });

    return updated;
  }

  async deletePlace(actorId: string, placeId: string, force = false) {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, name: true },
    });
    if (!place) throw new NotFoundException('Place not found');

    const references = await this.countReferences(placeId);
    const total = Object.values(references).reduce((sum, n) => sum + n, 0);

    // Refusing by default beats cascading: a place is not the trip's property,
    // so deleting it must not quietly strip the destination off somebody's
    // trip. Merging keeps the trip pointing at something real.
    if (total > 0 && !force) {
      throw new ConflictException({
        code: 'PLACE_IN_USE',
        message: `"${place.name}" is still used ${total} time${total === 1 ? '' : 's'}. Merge it into another place, or repeat with ?force=true to detach it everywhere.`,
        details: { references },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (total > 0) {
        // Detach rather than cascade. The links to this place go; the trips,
        // posts and stays that referenced it stay exactly where they are.
        await tx.tripDestination.deleteMany({ where: { placeId } });
        await tx.tripPlace.deleteMany({ where: { placeId } });
        await tx.tripStay.updateMany({ where: { placeId }, data: { placeId: null } });
        await tx.tripPhoto.updateMany({ where: { placeId }, data: { placeId: null } });
        await tx.tripRating.deleteMany({ where: { placeId } });
        await tx.realityCheck.updateMany({ where: { placeId }, data: { placeId: null } });
        await tx.tripActivity.updateMany({ where: { placeId }, data: { placeId: null } });
        await tx.post.updateMany({ where: { placeId }, data: { placeId: null } });
        await tx.trip.updateMany({
          where: { destinationId: placeId },
          data: { destinationId: null },
        });
        await tx.place.updateMany({ where: { parentId: placeId }, data: { parentId: null } });
      }

      await tx.place.delete({ where: { id: placeId } });

      await tx.adminAction.create({
        data: {
          actorId,
          action: force && total > 0 ? 'PLACE_FORCE_DELETED' : 'PLACE_DELETED',
          targetType: 'PLACE',
          targetId: placeId,
          metadata: { name: place.name, detachedReferences: references },
        },
      });
    });

    // placeCount on a trip counts visited places, so detaching changes it.
    await this.prisma.$executeRaw`
      UPDATE "trips" t SET "placeCount" =
        (SELECT count(*) FROM "trip_places" tp WHERE tp."tripId" = t.id)
      WHERE t."deletedAt" IS NULL`;

    return {
      message: `"${place.name}" deleted`,
      detachedReferences: total > 0 ? references : {},
    };
  }

  /**
   * Repoints everything at `targetId` and deletes the source.
   *
   * This is how a row like "palelem, cola beach and butter fly beach" gets
   * retired without breaking the trips that reference it. Links that would
   * collide — a trip that already visits both places — collapse into one
   * rather than failing the whole merge.
   */
  async mergePlace(actorId: string, sourceId: string, dto: MergePlaceDto) {
    if (sourceId === dto.targetId) {
      throw new BadRequestException('A place cannot be merged into itself');
    }

    const [source, target] = await Promise.all([
      this.prisma.place.findUnique({ where: { id: sourceId }, select: { id: true, name: true } }),
      this.prisma.place.findUnique({
        where: { id: dto.targetId },
        select: { id: true, name: true },
      }),
    ]);
    if (!source) throw new NotFoundException('Place to merge was not found');
    if (!target) throw new NotFoundException('Place to merge into was not found');

    const before = await this.countReferences(sourceId);

    await this.prisma.$transaction(async (tx) => {
      // Composite-unique tables first: drop the rows that would collide, then
      // move the rest.
      await tx.$executeRaw`
        DELETE FROM "trip_destinations" s
        WHERE s."placeId" = ${sourceId}::uuid
          AND EXISTS (SELECT 1 FROM "trip_destinations" t
                      WHERE t."tripId" = s."tripId" AND t."placeId" = ${dto.targetId}::uuid)`;
      await tx.$executeRaw`
        DELETE FROM "trip_places" s
        WHERE s."placeId" = ${sourceId}::uuid
          AND EXISTS (SELECT 1 FROM "trip_places" t
                      WHERE t."tripId" = s."tripId" AND t."placeId" = ${dto.targetId}::uuid)`;

      await tx.tripDestination.updateMany({
        where: { placeId: sourceId },
        data: { placeId: dto.targetId },
      });
      await tx.tripPlace.updateMany({
        where: { placeId: sourceId },
        data: { placeId: dto.targetId },
      });
      await tx.tripStay.updateMany({
        where: { placeId: sourceId },
        data: { placeId: dto.targetId },
      });
      await tx.tripPhoto.updateMany({
        where: { placeId: sourceId },
        data: { placeId: dto.targetId },
      });
      await tx.tripRating.updateMany({
        where: { placeId: sourceId },
        data: { placeId: dto.targetId },
      });
      await tx.realityCheck.updateMany({
        where: { placeId: sourceId },
        data: { placeId: dto.targetId },
      });
      await tx.tripActivity.updateMany({
        where: { placeId: sourceId },
        data: { placeId: dto.targetId },
      });
      await tx.post.updateMany({
        where: { placeId: sourceId },
        data: { placeId: dto.targetId },
      });
      await tx.trip.updateMany({
        where: { destinationId: sourceId },
        data: { destinationId: dto.targetId },
      });
      await tx.place.updateMany({
        where: { parentId: sourceId },
        data: { parentId: dto.targetId },
      });

      await tx.place.delete({ where: { id: sourceId } });

      await tx.adminAction.create({
        data: {
          actorId,
          action: 'PLACE_MERGED',
          targetType: 'PLACE',
          targetId: sourceId,
          reason: dto.reason,
          metadata: {
            source: { id: sourceId, name: source.name },
            target: { id: dto.targetId, name: target.name },
            movedReferences: before,
          },
        },
      });
    });

    return {
      message: `"${source.name}" merged into "${target.name}"`,
      movedReferences: before,
    };
  }

  // -------------------------------------------------------------------------
  // Audit trail
  // -------------------------------------------------------------------------

  async listActions(query: { page: number; limit: number; skip: number }) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminAction.findMany({
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: { actor: { select: { id: true, username: true, name: true } } },
      }),
      this.prisma.adminAction.count(),
    ]);

    return { items, total, hasMore: query.skip + items.length < total, nextCursor: null };
  }

  private async countReferences(placeId: string): Promise<Record<string, number>> {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: {
        _count: {
          select: {
            tripDestinations: true,
            tripPlaces: true,
            stays: true,
            photos: true,
            ratings: true,
            realityChecks: true,
            activities: true,
            posts: true,
            trips: true,
            children: true,
          },
        },
      },
    });
    if (!place) throw new NotFoundException('Place not found');

    return Object.fromEntries(
      Object.entries(place._count).filter(([, count]) => count > 0),
    ) as Record<string, number>;
  }

  /** Builds the audit row as a transaction operation. */
  private record(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    reason?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.adminAction.create({
      data: { actorId, action, targetType, targetId, reason, metadata },
    });
  }
}

const ADMIN_USER_SELECT = {
  id: true,
  username: true,
  name: true,
  email: true,
  profileImage: true,
  role: true,
  status: true,
  followerCount: true,
  followingCount: true,
  tripCount: true,
  postCount: true,
  lastLoginAt: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;
