import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorDto, PaginationMetaDto } from '../dto/api-response.dto';

/**
 * Documents the success envelope in Swagger with the real payload schema
 * inlined, so the generated openapi.json is directly usable by FE codegen.
 */
export const ApiEnvelope = <TModel extends Type<unknown>>(
  model: TModel,
  options: { description?: string; status?: number; isArray?: boolean } = {},
) =>
  applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description,
      schema: {
        type: 'object',
        required: ['success', 'data', 'timestamp'],
        properties: {
          success: { type: 'boolean', example: true },
          data: options.isArray
            ? { type: 'array', items: { $ref: getSchemaPath(model) } }
            : { $ref: getSchemaPath(model) },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    }),
  );

export const ApiPaginatedEnvelope = <TModel extends Type<unknown>>(
  model: TModel,
  options: { description?: string } = {},
) =>
  applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    ApiOkResponse({
      description: options.description,
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta', 'timestamp'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    }),
  );

/** Attaches the shared error shape to the common failure statuses. */
export const ApiErrorResponses = (...statuses: number[]) =>
  applyDecorators(
    ApiExtraModels(ApiErrorDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status] ?? 'Error',
        schema: { $ref: getSchemaPath(ApiErrorDto) },
      }),
    ),
  );

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Validation failed or the request was malformed',
  401: 'Missing or expired access token',
  403: 'Authenticated but not allowed to perform this action',
  404: 'Resource does not exist or is not visible to you',
  409: 'Conflicts with existing data',
  429: 'Rate limit exceeded',
};
