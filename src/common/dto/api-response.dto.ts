import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Every successful response is wrapped in this envelope by TransformInterceptor.
 * FE can therefore unwrap uniformly: `const { data } = await api.get(...)`.
 */
export class ApiEnvelopeDto<T = unknown> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ description: 'Payload of the request' })
  data: T;

  @ApiProperty({ example: '2026-08-14T10:12:00.000Z' })
  timestamp: string;
}

export class PaginationMetaDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Opaque cursor for the next page. null when there is no next page.',
    example: 'eyJpZCI6IjNmYS4uLiIsInYiOiIyMDI2LTA4LTE0In0=',
  })
  nextCursor: string | null;

  @ApiProperty({ example: true })
  hasMore: boolean;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiPropertyOptional({
    description: 'Total matching rows. Only returned by endpoints where counting is cheap.',
    example: 137,
  })
  total?: number;
}

export class PaginatedEnvelopeDto<T = unknown> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;

  @ApiProperty({ example: '2026-08-14T10:12:00.000Z' })
  timestamp: string;
}

export class ApiErrorBodyDto {
  @ApiProperty({ example: 'VALIDATION_ERROR', description: 'Stable machine-readable code' })
  code: string;

  @ApiProperty({ example: 'endDate must not be before startDate' })
  message: string;

  @ApiPropertyOptional({
    description: 'Field-level details for validation errors',
    example: { endDate: ['endDate must not be before startDate'] },
  })
  details?: Record<string, string[]> | unknown;
}

export class ApiErrorDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ type: ApiErrorBodyDto })
  error: ApiErrorBodyDto;

  @ApiProperty({ example: '/api/v1/trips' })
  path: string;

  @ApiProperty({ example: '2026-08-14T10:12:00.000Z' })
  timestamp: string;
}
