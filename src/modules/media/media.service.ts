import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { PrismaService } from 'src/prisma/prisma.service';
import { MediaDto } from 'src/modules/trips/dto/trip-response.dto';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]);

/**
 * Local-disk media driver.
 *
 * Files are written under ./uploads and served statically from /uploads, which
 * is enough for development and a single Render instance. Render's disk is
 * ephemeral on the free tier, so production should switch MEDIA_DRIVER to S3/R2
 * — only `persist()` and `remove()` need a new implementation; everything
 * downstream works off the Media row.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async uploadMany(userId: string, files: Express.Multer.File[]): Promise<MediaDto[]> {
    if (!files?.length) throw new BadRequestException('No files were uploaded');

    const maxBytes = (this.config.get<number>('media.maxFileSizeMb') ?? 10) * 1024 * 1024;

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
    const media = await this.prisma.media.findFirst({
      where: { id: mediaId, userId },
    });
    if (!media) throw new NotFoundException('Media not found');

    // Detach from any trip/post first so the rows disappear together.
    await this.prisma.media.delete({ where: { id: mediaId } });

    if (media.storageKey) {
      await unlink(join(process.cwd(), 'uploads', media.storageKey)).catch(() => undefined);
    }
    return { message: 'Media deleted' };
  }

  async listMine(userId: string, limit = 50): Promise<MediaDto[]> {
    return this.prisma.media.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, url: true, thumbnailUrl: true, blurhash: true, width: true, height: true },
    });
  }

  private async persist(userId: string, file: Express.Multer.File): Promise<MediaDto> {
    const key = `${userId}/${randomUUID()}${extname(file.originalname) || '.jpg'}`;
    const target = join(process.cwd(), 'uploads', key);

    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, file.buffer);

    const media = await this.prisma.media.create({
      data: {
        userId,
        type: MediaType.IMAGE,
        url: `${this.config.get<string>('media.baseUrl')}/uploads/${key}`,
        storageKey: key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
      select: { id: true, url: true, thumbnailUrl: true, blurhash: true, width: true, height: true },
    });

    return media;
  }
}
