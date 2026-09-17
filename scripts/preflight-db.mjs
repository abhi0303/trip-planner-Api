#!/usr/bin/env node
/**
 * Runs immediately before `prisma migrate deploy` in the build.
 *
 * It exists because of one specific, expensive failure: pointing DIRECT_URL at
 * Neon's pooled endpoint. Prisma migrations are not wrapped in a transaction,
 * and DDL through PgBouncer in transaction mode can fail partway — which leaves
 * some objects created, the migration recorded as unfinished, and every later
 * deploy failing with P3018 / 42710 "type already exists". The database has to
 * be repaired by hand at that point, so it is worth catching here.
 */

const RED = '[31m';
const YELLOW = '[33m';
const GREEN = '[32m';
const DIM = '[2m';
const OFF = '[0m';

const problems = [];
const warnings = [];

const databaseUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL;

function parse(name, raw) {
  if (!raw) {
    problems.push(`${name} is not set.`);
    return null;
  }
  try {
    const url = new URL(raw);
    return {
      host: url.hostname,
      database: url.pathname.replace(/^\//, '') || '(none)',
      pooled: url.hostname.includes('-pooler'),
      neon: url.hostname.endsWith('.neon.tech'),
      sslmode: url.searchParams.get('sslmode'),
    };
  } catch {
    problems.push(`${name} is not a valid connection URL.`);
    return null;
  }
}

const app = parse('DATABASE_URL', databaseUrl);
const migrate = parse('DIRECT_URL', directUrl);

// The one that wedges a database.
if (migrate?.pooled) {
  problems.push(
    `DIRECT_URL points at Neon's POOLED endpoint (${migrate.host}).\n` +
      '     Prisma Migrate needs a direct session, which PgBouncer cannot give it.\n' +
      '     Use the same string with the hostname NOT containing "-pooler":\n\n' +
      `       ${migrate.host.replace('-pooler', '')}\n\n` +
      '     In the Neon console that is Connect > "Connection pooling" toggle OFF\n' +
      '     (it is on by default, which is why you only ever see the pooled string).',
  );
}

// Same database, or someone pasted a string from another project.
if (app && migrate && app.database !== migrate.database) {
  problems.push(
    `DATABASE_URL and DIRECT_URL name different databases ` +
      `("${app.database}" vs "${migrate.database}"). They must be two endpoints ` +
      'for the same database.',
  );
}

if (app && migrate && app.neon !== migrate.neon) {
  warnings.push(
    'DATABASE_URL and DIRECT_URL are on different providers. Intentional only ' +
      'if you are mixing local and hosted databases.',
  );
}

// Advisory: the app should pool, and Neon requires TLS.
if (app?.neon && !app.pooled) {
  warnings.push(
    `DATABASE_URL is not the pooled endpoint (${app.host}). The app will work, ` +
      "but add '-pooler' to survive connection spikes on a small instance.",
  );
}
for (const [name, parsed] of [
  ['DATABASE_URL', app],
  ['DIRECT_URL', migrate],
]) {
  if (parsed?.neon && parsed.sslmode !== 'require') {
    warnings.push(`${name} is missing ?sslmode=require, which Neon expects.`);
  }
}

for (const warning of warnings) {
  console.log(`${YELLOW}warn${OFF}  ${warning}`);
}

if (problems.length) {
  console.error(`\n${RED}Database configuration is not safe to migrate:${OFF}\n`);
  for (const problem of problems) console.error(`  ${RED}✗${OFF} ${problem}\n`);
  console.error(
    `${DIM}Refusing to run migrations. Fix the variables above and redeploy.${OFF}\n` +
      `${DIM}If a previous deploy already failed mid-migration, see the recovery\n` +
      `runbook in README.md ("A deploy failed mid-migration").${OFF}\n`,
  );
  process.exit(1);
}

console.log(
  `${GREEN}ok${OFF}    migrations → ${migrate.host}  ${DIM}(app → ${app.host})${OFF}`,
);
