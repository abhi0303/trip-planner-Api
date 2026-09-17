import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

/**
 * Fail fast on boot rather than 500-ing on the first login attempt because a
 * secret was missing.
 */
class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string;

  @IsOptional()
  @IsInt()
  PORT?: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET: string;

  @IsOptional()
  @IsIn(['neon', 'local'])
  MEDIA_DRIVER?: string;
}

/**
 * MEDIA_DRIVER=neon needs four more variables. Checked separately so the
 * message can name every missing one at once instead of one per restart.
 */
function validateStorage(config: Record<string, unknown>): void {
  if (config.MEDIA_DRIVER !== 'neon') return;

  const required = [
    'NEON_STORAGE_ENDPOINT',
    'NEON_STORAGE_BUCKET',
    'NEON_STORAGE_ACCESS_KEY_ID',
    'NEON_STORAGE_SECRET_ACCESS_KEY',
  ];
  const missing = required.filter((key) => !config[key]);

  if (missing.length) {
    throw new Error(
      `MEDIA_DRIVER=neon requires: ${missing.join(', ')}.\n` +
        'Create a bucket with `neon buckets create <name> --access-level public_read` and\n' +
        'credentials with `neon credentials create --scope storage:read --scope storage:write`.',
    );
  }
}

export function validateEnv(config: Record<string, unknown>) {
  const parsed = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }

  validateStorage(config);
  return config;
}
