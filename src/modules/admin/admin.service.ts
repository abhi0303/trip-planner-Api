import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TripStatus, UserStatus } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

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

  async deletePlace(actorId: string, placeId: string) {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, name: true },
    });
    if (!place) throw new NotFoundException('Place not found');

    const references = await this.countReferences(placeId);
    const total = Object.values(references).reduce((sum, n) => sum + n, 0);

    // Refusing beats cascading: deleting a referenced place would strip the
    // destination off somebody's trip without telling them.
    if (total > 0) {
      throw new ConflictException({
        code: 'PLACE_IN_USE',
        message: `"${place.name}" is still used ${total} time${total === 1 ? '' : 's'}. Merge it into another place instead of deleting it.`,
        details: { references },
      });
    }

    await this.prisma.$transaction([
      this.prisma.place.delete({ where: { id: placeId } }),
      this.record(actorId, 'PLACE_DELETED', 'PLACE', placeId, undefined, { name: place.name }),
    ]);

    return { message: `"${place.name}" deleted` };
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
