import { IsOptional, IsString } from 'class-validator';
import { OffsetPaginationDto } from 'src/common/dto/pagination.dto';

/**
 * Query for the paged search endpoints. `q` has to be declared here: the
 * global ValidationPipe forbids unknown properties, so binding `@Query()` to
 * OffsetPaginationDto alone rejects every request that carries a search term.
 *
 * Not decorated for Swagger — each endpoint documents `q` with its own example.
 */
export class SearchQueryDto extends OffsetPaginationDto {
  @IsOptional()
  @IsString()
  q?: string;
}
