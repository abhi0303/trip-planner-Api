import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Public, RawResponse } from 'src/common/decorators';
import { StorageDriver } from 'src/modules/media/storage/storage.driver';
import { PrismaService } from 'src/prisma/prisma.service';

@ApiTags('Health')
@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
  ) {}

  @Get('health')
  @RawResponse()
  @ApiOperation({
    summary: 'Liveness and database check',
    description: 'Returned unwrapped so uptime monitors can match on it directly.',
  })
  async health() {
    const startedAt = Date.now();
    let database = 'up';

    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      storage: this.storage.name,
      latencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }
}
