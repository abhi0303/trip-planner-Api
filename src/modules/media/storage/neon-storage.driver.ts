import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectInput, StorageDriver } from './storage.driver';

/**
 * Neon Object Storage — S3-compatible storage that lives in the same Neon
 * project as the database and branches with it.
 *
 * Two details are not optional against a non-AWS S3 implementation:
 *   forcePathStyle             — Neon addresses buckets by path, not subdomain
 *   requestChecksumCalculation — the AWS SDK v3 otherwise adds CRC32 headers
 *                                that S3-compatible stores reject
 *
 * Buckets are expected to already exist (created in the Neon console or with
 * `neon buckets create`). Access levels are set there too; the S3 API returns
 * 501 for ACL/policy mutations, so this driver never tries.
 */
@Injectable()
export class NeonStorageDriver extends StorageDriver implements OnModuleInit {
  readonly name = 'neon';

  private readonly logger = new Logger(NeonStorageDriver.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  /** public_read buckets serve objects directly; private ones need signing. */
  private readonly isPublicBucket: boolean;

  constructor(private readonly config: ConfigService) {
    super();

    this.bucket = this.config.get<string>('media.neon.bucket') as string;
    this.endpoint = stripTrailingSlash(
      this.config.get<string>('media.neon.endpoint') as string,
    );
    this.isPublicBucket = this.config.get<string>('media.neon.accessLevel') !== 'private';

    this.client = new S3Client({
      region: this.config.get<string>('media.neon.region'),
      endpoint: this.endpoint,
      credentials: {
        accessKeyId: this.config.get<string>('media.neon.accessKeyId') as string,
        secretAccessKey: this.config.get<string>('media.neon.secretAccessKey') as string,
      },
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }

  /**
   * Fails loudly at boot rather than on a user's first upload if the bucket
   * name or credentials are wrong.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(
        `Neon Object Storage ready (bucket "${this.bucket}", ${this.isPublicBucket ? 'public_read' : 'private'})`,
      );
    } catch (error) {
      // The guidance goes in the thrown error, not the logger: Nest buffers
      // logs until the app finishes starting, so a message logged here would
      // be discarded and the operator would only see the SDK's "NotFound".
      const reason = error instanceof Error ? error.name : String(error);
      throw new Error(
        `Neon Object Storage unreachable: ${reason}\n` +
          `  bucket:   ${this.bucket}\n` +
          `  endpoint: ${this.endpoint}\n` +
          'Check that the bucket exists (`neon buckets list`) and that\n' +
          'NEON_STORAGE_ACCESS_KEY_ID / NEON_STORAGE_SECRET_ACCESS_KEY are a\n' +
          'storage-scoped credential pair for this branch.',
        { cause: error },
      );
    }
  }

  async put({ key, body, contentType }: PutObjectInput): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Photos are immutable once uploaded — a new upload gets a new key.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return this.urlFor(key);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** `https://<branch>.storage.<cell>.<region>.aws.neon.tech/<bucket>/<key>` */
  urlFor(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  /**
   * For a private bucket. Not used on the hot read path — see the note in
   * MediaService about why photo URLs are stored rather than signed per
   * request — but needed for private downloads and admin tooling.
   */
  async signedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}

function stripTrailingSlash(value: string): string {
  return value?.replace(/\/+$/, '') ?? '';
}
