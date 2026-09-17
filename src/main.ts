import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('apiPrefix') ?? 'api/v1';
  const port = config.get<number>('port') ?? 3000;
  const corsOrigins = config.get<string[]>('corsOrigins') ?? ['*'];

  app.setGlobalPrefix(apiPrefix, {
    // Health and uploads sit outside the versioned prefix so monitors and
    // <img> tags do not have to know the API version.
    // `{*path}` is the path-to-regexp v8 spelling Express 5 / Nest 11 require;
    // the old `uploads/(.*)` still works but logs a deprecation warning.
    exclude: ['health', 'uploads/{*path}'],
  });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());

  app.enableCors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  if (config.get<boolean>('swagger.enabled')) {
    setupSwagger(app, apiPrefix, config.get<string>('swagger.path') ?? 'docs');
  }

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`TripSphere API listening on :${port}`);
  logger.log(`REST      http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger   http://localhost:${port}/${config.get<string>('swagger.path')}`);
  logger.log(`Health    http://localhost:${port}/health`);
}

void bootstrap();
