import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { PrismaService } from 'src/prisma/prisma.service';
import { MediaDto } from 'src/modules/trips/dto/trip-response.dto';
import { StorageDriver } from './storage/storage.driver';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]);

/** How many uploads a batch cleanup removes at once. */
const CLEANUP_CONCURRENCY = 5;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageDriver,
  ) {}

  async uploadMany(userId: string, files: Express.Multer.File[]): Promise<MediaDto[]> {
    if (!files?.length) throw new BadRequestException('No files were uploaded');

    const maxBytes = (this.config.get<number>('media.maxFileSizeMb') ?? 10) * 1024 * 1024;

    // Validate everything before writing anything, so a bad file at the end of
    // the batch does not leave the first few orphaned in storage.
    for (const file of files) {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        throw new BadRequestException(
          `${file.originalname}: ${file.mimetype} is not supported. Allowed: ${[...ALLOWED_MIME].join(', ')}`,
        );
      }
      if (file.size > maxBytes) {
        throw new BadRequestException(
          `${file.originalname} is larger than the ${maxBytes / 1024 / 1024}MB limit`,
        );
      }
    }

    return Promise.all(files.map((file) => this.persist(userId, file)));
  }

  async remove(mediaId: string, userId: string): Promise<{ message: string }> {
    const media = await this.prisma.media.findFirst({ where: { id: mediaId, userId } });
    if (!media) throw new NotFoundException('Media not found');

    await this.prisma.media.delete({ where: { id: mediaId } });

    // Storage is cleaned up after the row is gone: a leaked object is cheap,
    // a row pointing at a deleted object renders as a broken image.
    if (media.storageKey) await this.storage.delete(media.storageKey);

    return { message: 'Media deleted' };
  }

  /**
   * Deletes a media item once nothing points at it any more.
   *
   * Avatars and covers are stored on the user as a plain URL rather than a
   * foreign key, so nothing cascades when the field is cleared or replaced and
   * the object would sit in the bucket forever. Called after the user row has
   * already been updated, so the reference check sees the new state.
   *
   * Returns false without touching anything when the item is still in use —
   * the same upload can legitimately be a trip photo or a post image too.
   */
  async deleteIfUnreferenced(userId: string, url: string | null | undefined): Promise<boolean> {
    if (!url) return false;

    const media = await this.prisma.media.findFirst({
      where: { url, userId },
      select: {
        id: true,
        storageKey: true,
        _count: { select: { tripPhotos: true, postMedia: true, tripCovers: true } },
      },
    });
    if (!media) return false;

    const { tripPhotos, postMedia, tripCovers } = media._count;
    if (tripPhotos > 0 || postMedia > 0 || tripCovers > 0) return false;

    // No foreign key backs profileImage/coverImage, so this one is a value
    // check rather than a relation count — including other people's profiles.
    const stillOnAProfile = await this.prisma.user.count({
      where: { OR: [{ profileImage: url }, { coverImage: url }] },
    });
    if (stillOnAProfile > 0) return false;

    await this.prisma.media.delete({ where: { id: media.id } });
    if (media.storageKey) await this.storage.delete(media.storageKey);

    return true;
  }

  /**
   * deleteIfUnreferenced for a set of media ids, e.g. every image of a trip
   * that was just deleted. Each item gets the same in-use check, so an image
   * that is also an avatar or another trip's photo survives.
   *
   * Never throws: by the time this runs the owning rows are already gone, and
   * a storage hiccup should not turn a completed delete into an error. A
   * failed item is logged and the rest still run. Returns how many went.
   */
  async deleteManyIfUnreferenced(userId: string, mediaIds: string[]): Promise<number> {
    const ids = [...new Set(mediaIds)];
    if (!ids.length) return 0;

    const rows = await this.prisma.media.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, url: true },
    });

    let removed = 0;
    for (let i = 0; i < rows.length; i += CLEANUP_CONCURRENCY) {
      const batch = rows.slice(i, i + CLEANUP_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((row) => this.deleteIfUnreferenced(userId, row.url)),
      );
      results.forEach((result, j) => {
        if (result.status === 'fulfilled') {
          if (result.value) removed += 1;
        } else {
          const reason = result.reason;
          this.logger.warn(
            `Could not remove media ${batch[j].id}: ${reason instanceof Error ? reason.message : reason}`,
          );
        }
      });
    }
    return removed;
  }

  async listMine(userId: string, limit = 50): Promise<MediaDto[]> {
    return this.prisma.media.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: MEDIA_SELECT,
    });
  }

  private async persist(userId: string, file: Express.Multer.File): Promise<MediaDto> {
    // A random key per upload means keys are unguessable and never collide, so
    // objects can be cached immutably.
    const key = `${userId}/${randomUUID()}${extname(file.originalname).toLowerCase() || '.jpg'}`;

    const url = await this.storage.put({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    return this.prisma.media.create({
      data: {
        userId,
        type: MediaType.IMAGE,
        // The resolved URL is stored rather than signed per request: photo URLs
        // appear in every feed card, and signing each one on read would add a
        // crypto op per image per request and make them uncacheable. See the
        // storage section of the README for the privacy trade-off this implies.
        url,
        storageKey: key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
      select: MEDIA_SELECT,
    });
  }
}

const MEDIA_SELECT = {
  id: true,
  url: true,
  thumbnailUrl: true,
  blurhash: true,
  width: true,
  height: true,
} as const;
