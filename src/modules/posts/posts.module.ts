import { Module } from '@nestjs/common';
import { TripsModule } from 'src/modules/trips/trips.module';
import { FeedController } from './feed.controller';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [TripsModule],
  controllers: [PostsController, FeedController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
