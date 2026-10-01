/**
 * Promotes a user to ADMIN or MODERATOR.
 *
 *   npm run admin:grant -- someone@example.com
 *   npm run admin:grant -- someone@example.com MODERATOR
 *   npm run admin:grant -- someone@example.com USER      # demote
 *
 * Deliberately a script rather than an endpoint. An API that grants admin is an
 * attack surface whose only job is a one-time setup step, so the first admin
 * has to come from someone with database access. After that, admins promote
 * each other through PATCH /admin/users/:id/role.
 */
import { PrismaClient, UserRole } from '@prisma/client';

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
    console.error(`No user matches "${identifier}".`);
    process.exit(1);
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
