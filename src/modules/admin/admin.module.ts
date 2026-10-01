import { Module } from '@nestjs/common';
import { MediaModule } from 'src/modules/media/media.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  // MediaModule supplies the StorageDriver, so deleting a user also removes
  // the files they uploaded rather than orphaning them in the bucket.
  imports: [MediaModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
