import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * Single source of truth for the OpenAPI document, shared by the running app
 * (/docs) and by `npm run swagger:generate`, which writes swagger.json for FE.
 */
export function buildOpenApiDocument(app: INestApplication, apiPrefix: string): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('TripSphere API')
    .setDescription(
      [
        'Travel experience social platform — structured, searchable travel data.',
        '',
        '### Response shape',
        'Success: `{ success: true, data, timestamp }`.',
        'Paginated: `{ success: true, data: [...], meta: { nextCursor, hasMore, limit, total? }, timestamp }`.',
        'Error: `{ success: false, statusCode, error: { code, message, details? }, path, timestamp }`.',
        '',
        '### Pagination',
        'Feeds and lists are cursor based: pass `meta.nextCursor` back as `?cursor=`.',
        'Search uses `?page=` and `?limit=` and returns `meta.total`.',
        '',
        '### Auth',
        'Send `Authorization: Bearer <accessToken>`. Access tokens last 15 minutes;',
        'refresh with POST /auth/refresh. Refresh tokens are single-use and rotate.',
        '',
        '### Visibility',
        'PUBLIC, FOLLOWERS, FRIENDS (mutual follow) and PRIVATE. A trip carries a',
        'separate `expenseVisibility`, so spending can be hidden on a public trip —',
        'when hidden, every money field comes back `null` rather than being omitted.',
        '',
        '### Dates and money',
        'Dates are `YYYY-MM-DD`, timestamps are ISO-8601 UTC. Money is a number in',
        'the trip `currency` (ISO-4217); there are no minor units.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'bearer',
    )
    .addServer(`/${apiPrefix}`, 'Current server')
    .addTag('Auth', 'Registration, login, tokens')
    .addTag('Users', 'Profiles and the social graph')
    .addTag('Trips', 'The central object: create, publish, discover')
    .addTag('Trip content', 'Places, expenses, stays, photos, ratings, reality checks')
    .addTag('Itinerary', 'Day-by-day plan')
    .addTag('Places', 'Canonical places and aggregate travel data')
    .addTag('Posts', 'Social posts shared from trips')
    .addTag('Feed', 'Home feed')
    .addTag('Saved', 'Collections and saved trips')
    .addTag('Search', 'Cross-entity search')
    .addTag('Media', 'Image uploads')
    .addTag('Moderation', 'Reports, blocks, admin actions')
    .addTag('Health', 'Service status')
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      // Stable, readable operationIds so FE codegen produces nice method names.
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

export function setupSwagger(app: INestApplication, apiPrefix: string, path: string): void {
  const document = buildOpenApiDocument(app, apiPrefix);

  SwaggerModule.setup(path, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'TripSphere API',
  });
}
