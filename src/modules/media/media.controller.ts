import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiErrorResponses,
  AuthenticatedUser,
  CurrentUser,
} from 'src/common/decorators';
import { MessageDto } from 'src/common/dto/message.dto';
import { MediaDto } from 'src/modules/trips/dto/trip-response.dto';
import { MediaService } from './media.service';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 20))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload up to 20 images',
    description:
      'Two-step flow: upload here, then attach the returned media ids to a trip (POST /trips/:id/photos) or a post. Field name is `files`.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['files'],
    },
  })
  @ApiEnvelope(MediaDto, { status: 201, isArray: true })
  @ApiErrorResponses(400, 401, 413)
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.media.uploadMany(user.id, files);
  }

  @Get('me')
  @ApiOperation({ summary: 'Your recent uploads' })
  @ApiEnvelope(MediaDto, { isArray: true })
  @ApiErrorResponses(401)
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.media.listMine(user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an upload' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 404)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.media.remove(id, user.id);
  }
}
