import { hashPassword } from './auth.js';
import { env } from './env.js';
import { prisma } from './prisma.js';

/**
 * First-run bootstrap.
 *
 * Without this, a fresh database is a locked room: every route that could
 * create a user requires an authenticated user, and the only way in would be to
 * run the demo seed - which is not something you want to do on a real
 * installation. So on boot, if there is no account at all, we create the super
 * admin from the environment.
 *
 * It is deliberately narrow: it fires only when the users table is completely
 * empty, so it can never resurrect an account someone deliberately deleted.
 */
export async function ensureSuperAdmin(): Promise<void> {
  const existing = await prisma.user.count();
  if (existing > 0) return;

  const email = env.superAdmin.email.trim().toLowerCase();
  const password = env.superAdmin.password;

  if (env.isProduction && password === 'admin123') {
    throw new Error(
      'Refusing to create the first super admin with the default password. ' +
        'Set SUPERADMIN_PASSWORD to something private before starting in production.',
    );
  }

  await prisma.user.create({
    data: {
      name: 'Super Administrador',
      email,
      passwordHash: await hashPassword(password),
      role: 'super_admin',
      locale: env.defaultLocale,
      entityId: null,
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      '  No users found - created the first super admin:',
      `    email    ${email}`,
      `    password ${env.isProduction ? '(from SUPERADMIN_PASSWORD)' : password}`,
      '  Sign in and create your first business entity.',
      '',
    ].join('\n'),
  );
}
