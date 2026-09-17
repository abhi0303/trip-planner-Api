import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { LocalStorageDriver } from './storage/local-storage.driver';
import { NeonStorageDriver } from './storage/neon-storage.driver';
import { StorageDriver } from './storage/storage.driver';

@Module({
  imports: [
    // Buffered in memory so the driver decides where bytes land.
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: StorageDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageDriver => {
        const driver = config.get<string>('media.driver');

        if (driver === 'neon') return new NeonStorageDriver(config);

        if (config.get<string>('nodeEnv') === 'production') {
          // Loud, because the failure mode is silent: uploads appear to work
          // and then vanish with the container on the next deploy.
          new Logger('MediaModule').warn(
            `MEDIA_DRIVER is "${driver}" in production. Uploads will be lost on every deploy — set MEDIA_DRIVER=neon.`,
          );
        }
        return new LocalStorageDriver(config);
      },
    },
  ],
  exports: [MediaService, StorageDriver],
})
export class MediaModule {}
