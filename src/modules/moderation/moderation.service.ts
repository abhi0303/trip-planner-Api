import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReportStatus, ReportTargetType, UserStatus } from '@prisma/client';
import { buildPage, decodeCursor } from 'src/common/utils';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  BlockUserDto,
  CreateReportDto,
  ReportQueryDto,
  ResolveReportDto,
} from './dto/moderation.dto';

/** Reporting, blocking and the admin queue (spec §34). */
@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async report(reporterId: string, dto: CreateReportDto) {
    await this.assertTargetExists(dto.targetType, dto.targetId);

    if (dto.targetType === ReportTargetType.USER && dto.targetId === reporterId) {
      throw new BadRequestException('You cannot report yourself');
    }

    const existing = await this.prisma.report.findUnique({
      where: {
        reporterId_targetType_targetId: {
          reporterId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
      },
      select: { id: true },
    });
    // Re-reporting is a no-op rather than an error: the user's intent is
    // already recorded and telling them so is friendlier than a 409.
    if (existing) return { message: 'You have already reported this. Our team is reviewing it.' };

    await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        details: dto.details,
      },
    });

    return { message: 'Report submitted. Thank you.' };
  }

  /**
   * Blocking is one-directional in storage but two-directional in effect:
   * VisibilityService hides content in both directions. Any existing follow
   * relationship is severed.
   */
  async block(blockerId: string, blockedId: string, dto: BlockUserDto) {
    if (blockerId === blockedId) throw new BadRequestException('You cannot block yourself');

    const target = await this.prisma.user.findFirst({
      where: { id: blockedId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    const created = await this.prisma.block.createMany({
      data: [{ blockerId, blockedId, reason: dto.reason }],
      skipDuplicates: true,
    });

    if (created.count > 0) {
      const removed = await this.prisma.follow.findMany({
        where: {
          OR: [
            { followerId: blockerId, followingId: blockedId },
            { followerId: blockedId, followingId: blockerId },
          ],
        },
      });

      await this.prisma.$transaction([
        this.prisma.follow.deleteMany({
          where: {
            OR: [
              { followerId: blockerId, followingId: blockedId },
              { followerId: blockedId, followingId: blockerId },
            ],
          },
        }),
        // Fix both users' counters for whichever follows actually existed.
        ...removed.flatMap((f) => [
          this.prisma.user.update({
            where: { id: f.followerId },
            data: { followingCount: { decrement: 1 } },
          }),
          this.prisma.user.update({
            where: { id: f.followingId },
            data: { followerCount: { decrement: 1 } },
          }),
        ]),
      ]);
    }

    return { blocked: true };
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
    return { blocked: false };
  }

  async listBlocked(blockerId: string) {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        reason: true,
        blocked: { select: { id: true, username: true, name: true, profileImage: true } },
      },
    });
    return blocks.map((b) => ({ ...b.blocked, blockedAt: b.createdAt, reason: b.reason }));
  }

  // --- Admin ---------------------------------------------------------------

  async listReports(query: ReportQueryDto) {
    const cursor = decodeCursor(query.cursor);

    const rows = await this.prisma.report.findMany({
      where: {
        status: query.status ?? ReportStatus.PENDING,
        ...(cursor ? { createdAt: { lt: new Date(cursor.v) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      include: {
        reporter: { select: { id: true, username: true, name: true } },
      },
    });

    return buildPage(rows, query.limit, (r) => r.createdAt);
  }

  async resolveReport(reportId: string, adminId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        resolutionNote: dto.resolutionNote,
        resolvedById: adminId,
        resolvedAt: new Date(),
      },
    });
  }

  async setUserStatus(userId: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { status } }),
      // Suspension must take effect now, not when the access token expires.
      ...(status === UserStatus.SUSPENDED
        ? [
            this.prisma.refreshToken.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]
        : []),
    ]);

    return { message: `User is now ${status}` };
  }

  /** Admin content takedown: soft delete so it can be restored. */
  async removeContent(targetType: ReportTargetType, targetId: string) {
    switch (targetType) {
      case ReportTargetType.POST:
        await this.prisma.post.update({
          where: { id: targetId },
          data: { deletedAt: new Date() },
        });
        break;
      case ReportTargetType.TRIP:
        await this.prisma.trip.update({
          where: { id: targetId },
          data: { deletedAt: new Date() },
        });
        break;
      case ReportTargetType.COMMENT:
        await this.prisma.comment.update({
          where: { id: targetId },
          data: { deletedAt: new Date() },
        });
        break;
      default:
        throw new BadRequestException(`${targetType} content cannot be removed this way`);
    }
    return { message: 'Content removed' };
  }

  private async assertTargetExists(type: ReportTargetType, id: string): Promise<void> {
    const exists = await (async () => {
      switch (type) {
        case ReportTargetType.USER:
          return this.prisma.user.findUnique({ where: { id }, select: { id: true } });
        case ReportTargetType.TRIP:
          return this.prisma.trip.findUnique({ where: { id }, select: { id: true } });
        case ReportTargetType.POST:
          return this.prisma.post.findUnique({ where: { id }, select: { id: true } });
        case ReportTargetType.COMMENT:
          return this.prisma.comment.findUnique({ where: { id }, select: { id: true } });
        case ReportTargetType.PLACE:
          return this.prisma.place.findUnique({ where: { id }, select: { id: true } });
      }
    })();

    if (!exists) throw new NotFoundException(`${type.toLowerCase()} not found`);
  }
}
