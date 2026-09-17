export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  },

  media: {
    /** 'neon' (Neon Object Storage) or 'local' (./uploads, dev only). */
    driver: process.env.MEDIA_DRIVER ?? 'local',
    baseUrl: process.env.MEDIA_BASE_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`,
    maxFileSizeMb: parseInt(process.env.MEDIA_MAX_FILE_SIZE_MB ?? '10', 10),
    neon: {
      endpoint: process.env.NEON_STORAGE_ENDPOINT ?? '',
      region: process.env.NEON_STORAGE_REGION ?? 'us-east-2',
      bucket: process.env.NEON_STORAGE_BUCKET ?? '',
      accessKeyId: process.env.NEON_STORAGE_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.NEON_STORAGE_SECRET_ACCESS_KEY ?? '',
      /** 'public_read' serves objects directly; 'private' needs presigned URLs. */
      accessLevel: process.env.NEON_STORAGE_ACCESS_LEVEL ?? 'public_read',
    },
  },

  swagger: {
    enabled: (process.env.SWAGGER_ENABLED ?? 'true') === 'true',
    path: process.env.SWAGGER_PATH ?? 'docs',
  },

  /// Averages are hidden below this many experiences so two reviews cannot
  /// masquerade as a trend (spec §24).
  minSampleSize: parseInt(process.env.MIN_SAMPLE_SIZE ?? '3', 10),
});
