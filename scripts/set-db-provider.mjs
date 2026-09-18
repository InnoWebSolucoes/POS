#!/usr/bin/env node
/**
 * Swaps the Prisma datasource provider in place.
 *
 * The schema is deliberately written to be portable, so switching between local
 * SQLite development and PostgreSQL production is a one-token change:
 *
 *   node scripts/set-db-provider.mjs sqlite
 *   node scripts/set-db-provider.mjs postgresql
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(HERE, '../apps/api/prisma/schema.prisma');

const ALLOWED = new Set(['sqlite', 'postgresql']);
const target = (process.argv[2] || '').toLowerCase();

if (!ALLOWED.has(target)) {
  console.error(`Usage: set-db-provider.mjs <${[...ALLOWED].join('|')}>`);
  process.exit(1);
}

const original = readFileSync(SCHEMA, 'utf8');
const updated = original.replace(
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"(sqlite|postgresql|mysql)"/s,
  `$1"${target}"`,
);

if (updated === original) {
  console.log(`Provider already set to "${target}" (or the datasource block was not found).`);
} else {
  writeFileSync(SCHEMA, updated);
  console.log(`Prisma datasource provider -> "${target}"`);
}

console.log(
  target === 'sqlite'
    ? 'Remember: DATABASE_URL="file:./dev.db"'
    : 'Remember: DATABASE_URL="postgresql://pos:pos@localhost:5432/pos?schema=public"',
);
