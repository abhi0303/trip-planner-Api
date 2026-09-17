import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PutObjectInput, StorageDriver } from './storage.driver';

/**
 * Writes to ./uploads and serves from /uploads. For offline development only —
 * Render's filesystem is ephemeral, so anything written here is lost on the
 * next deploy. Production uses the Neon driver.
 */
@Injectable()
export class LocalStorageDriver extends StorageDriver {
  readonly name = 'local';

  private readonly root = join(process.cwd(), 'uploads');

  constructor(private readonly config: ConfigService) {
    super();
  }

  async put({ key, body }: PutObjectInput): Promise<string> {
    const target = join(this.root, key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
    return this.urlFor(key);
  }

  async delete(key: string): Promise<void> {
    await unlink(join(this.root, key)).catch(() => undefined);
  }

  urlFor(key: string): string {
    const base = (this.config.get<string>('media.baseUrl') ?? '').replace(/\/+$/, '');
    return `${base}/uploads/${key}`;
  }
}
