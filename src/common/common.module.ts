import { Global, Module } from '@nestjs/common';
import { VisibilityService } from './services/visibility.service';

@Global()
@Module({
  providers: [VisibilityService],
  exports: [VisibilityService],
})
export class CommonModule {}
