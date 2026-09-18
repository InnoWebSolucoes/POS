#!/usr/bin/env node
/**
 * One-command local setup.
 *
 *   npm run setup
 *
 * Copies .env if missing, builds the shared package, points Prisma at SQLite,
 * pushes the schema and seeds demo data. Deliberately does NOT need Docker or a
 * PostgreSQL server - the whole thing runs off a file.
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, cwd = ROOT) {
  console.log(`\n> ${command}`);
  execSync(command, { cwd, stdio: 'inherit', shell: true });
}

function step(label) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 60 - label.length))}`);
}

try {
  step('Environment');
  for (const target of ['.env', 'apps/api/.env']) {
    const path = resolve(ROOT, target);
    if (existsSync(path)) {
      console.log(`${target} already exists - leaving it alone.`);
    } else {
      copyFileSync(resolve(ROOT, '.env.example'), path);
      console.log(`Created ${target} from .env.example`);
    }
  }

  step('Shared package');
  run('npm run build --workspace @pos/shared');

  step('Database (SQLite)');
  run('node scripts/set-db-provider.mjs sqlite');
  run('npx prisma db push --skip-generate', resolve(ROOT, 'apps/api'));
  run('npx prisma generate', resolve(ROOT, 'apps/api'));

  step('Demo data');
  try {
    run('npx tsx prisma/seed.ts', resolve(ROOT, 'apps/api'));
  } catch {
    console.warn('\nSeeding failed - the app will still start, just with an empty database.');
  }

  console.log(`
${'='.repeat(64)}
  Setup complete.

  Start everything:      npm run dev
    API   http://localhost:4000
    Web   http://localhost:5173

  Sign in with the accounts printed by the seed above
  (default super admin: admin@pos.local / admin123).

  To switch to PostgreSQL later:
    node scripts/set-db-provider.mjs postgresql
    set DATABASE_URL in .env, then: npm run db:push
${'='.repeat(64)}
`);
} catch (error) {
  console.error('\nSetup failed:', error.message);
  process.exit(1);
}
