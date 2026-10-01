/**
 * Promotes a user to ADMIN or MODERATOR, creating the account if it does not
 * exist yet.
 *
 *   npm run admin:grant -- someone@example.com
 *   npm run admin:grant -- someone@example.com MODERATOR
 *   npm run admin:grant -- someone@example.com USER      # demote
 *
 *   # create the account at the same time
 *   ADMIN_PASSWORD='…' ADMIN_NAME='Jane Doe' npm run admin:grant -- new@example.com
 *
 * Deliberately a script rather than an endpoint. An API that grants admin is an
 * attack surface whose only job is a one-time setup step, so the first admin
 * has to come from someone with database access. After that, admins promote
 * each other through PATCH /admin/users/:id/role.
 *
 * The password is read from the environment rather than an argument, so it does
 * not sit in shell history.
 */
import { AuthProvider, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/** Matches the cost used by AuthService, so a created account behaves identically. */
const BCRYPT_ROUNDS = 12;

/** Mirrors RegisterDto: 8-72 chars with at least one letter and one number. */
function validatePassword(password: string): string | null {
  if (password.length < 8 || password.length > 72) {
    return 'Password must be between 8 and 72 characters';
  }
  if (!/(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
}

/** Derives a free username from the email, as Google sign-in does. */
async function freeUsername(prisma: PrismaClient, email: string): Promise<string> {
  const base =
    (email.split('@')[0] ?? 'admin')
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, '')
      .slice(0, 24) || 'admin';

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt}`;
    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}${Date.now().toString(36)}`;
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const [identifier, roleArg = 'ADMIN'] = process.argv.slice(2);

  if (!identifier) {
    console.error('Usage: npm run admin:grant -- <email|username> [ADMIN|MODERATOR|USER]');
    process.exit(1);
  }

  const role = roleArg.toUpperCase() as UserRole;
  if (!Object.values(UserRole).includes(role)) {
    console.error(`"${roleArg}" is not a role. Use one of: ${Object.values(UserRole).join(', ')}`);
    process.exit(1);
  }

  const needle = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: needle }, { username: needle }] },
    select: { id: true, email: true, username: true, name: true, role: true },
  });

  if (!user) {
    const password = process.env.ADMIN_PASSWORD;

    if (!identifier.includes('@') || !password) {
      console.error(`No user matches "${identifier}".`);
      console.error(
        'To create the account instead, pass an email address and set ADMIN_PASSWORD:\n' +
          "  ADMIN_PASSWORD='…' ADMIN_NAME='Jane Doe' npm run admin:grant -- " +
          `${identifier}`,
      );
      process.exit(1);
    }

    const problem = validatePassword(password);
    if (problem) {
      console.error(problem);
      process.exit(1);
    }

    const created = await prisma.user.create({
      data: {
        email: needle,
        username: await freeUsername(prisma, needle),
        name: process.env.ADMIN_NAME?.trim() || needle.split('@')[0],
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        provider: AuthProvider.EMAIL,
        // Created by hand from the database side; there is nobody to email a
        // confirmation to and no flow that would consume it.
        emailVerified: true,
        role,
      },
      select: { id: true, email: true, username: true, name: true, role: true },
    });

    await prisma.adminAction.create({
      data: {
        actorId: created.id,
        action: 'USER_CREATED',
        targetType: 'USER',
        targetId: created.id,
        reason: 'created from the command line',
        metadata: { role, via: 'scripts/grant-admin.ts' },
      },
    });

    console.log(`Created ${created.name} (${created.username}) as ${created.role}.`);
    console.log(`Sign in with ${created.email} and the password you set.`);
    return;
  }

  if (user.role === role) {
    console.log(`${user.username} is already ${role}. Nothing to do.`);
    return;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { role } }),
    prisma.adminAction.create({
      data: {
        actorId: user.id,
        action: 'USER_ROLE_CHANGED',
        targetType: 'USER',
        targetId: user.id,
        reason: 'granted from the command line',
        metadata: { from: user.role, to: role, via: 'scripts/grant-admin.ts' },
      },
    }),
  ]);

  console.log(`${user.name} (${user.username}) is now ${role}, was ${user.role}.`);
  // The role is read from the database on every request, not taken from the
  // token, so this applies to their very next call without signing out.
  console.log('Takes effect immediately — no need to sign out and back in.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
