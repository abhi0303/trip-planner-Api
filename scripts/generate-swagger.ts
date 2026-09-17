/**
 * Writes swagger.json without starting a server.
 *
 * Run `npm run swagger:generate` after changing any controller or DTO and
 * commit the result — FE consumes the committed file directly (mock servers,
 * client codegen, Postman import) and its diff is the API change log.
 */
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/swagger';

async function generate(): Promise<void> {
  // The env validator demands real secrets; placeholders keep the generator
  // runnable in CI without a database or a configured environment.
  process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/db?schema=public';
  process.env.DIRECT_URL ||= process.env.DATABASE_URL;
  process.env.JWT_ACCESS_SECRET ||= 'swagger-generation-placeholder-secret-value';
  process.env.JWT_REFRESH_SECRET ||= 'swagger-generation-placeholder-secret-value';

  // Forced, not defaulted: the storage driver does not affect a single route or
  // schema, and the Neon driver verifies its bucket at boot. Without this,
  // `npm run swagger:check` in CI would need live object storage to document
  // routes that have nothing to do with it.
  process.env.MEDIA_DRIVER = 'local';

  const app = await NestFactory.create(AppModule, { logger: false });
  const apiPrefix = process.env.API_PREFIX ?? 'api/v1';

  const document = buildOpenApiDocument(app, apiPrefix);
  const target = join(process.cwd(), 'swagger.json');

  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();

  const paths = Object.keys(document.paths ?? {}).length;
  const operations = Object.values(document.paths ?? {}).reduce(
    (sum, item) => sum + Object.keys(item as object).length,
    0,
  );
  const schemas = Object.keys(document.components?.schemas ?? {}).length;

  console.log(`swagger.json written: ${paths} paths, ${operations} operations, ${schemas} schemas`);
  process.exit(0);
}

generate().catch((error) => {
  console.error('Failed to generate swagger.json');
  console.error(error);
  process.exit(1);
});
