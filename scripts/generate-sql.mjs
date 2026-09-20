#!/usr/bin/env node
/**
 * Regenerates the SQL in docs/sql/ and the initial migration from schema.prisma.
 *
 * The schema is the source of truth; these files are derived. Run this after any
 * schema change so the committed DDL never drifts from the models.
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = join(ROOT, 'apps/api/prisma/schema.prisma');
const OUT = join(ROOT, 'docs/sql');
const MIGRATION = join(ROOT, 'apps/api/prisma/migrations/20260920000000_init');

mkdirSync(OUT, { recursive: true });
mkdirSync(MIGRATION, { recursive: true });

const source = readFileSync(SCHEMA, 'utf8');

function withProvider(provider) {
  const swapped = source.replace(
    /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"(sqlite|postgresql|mysql)"/s,
    `$1"${provider}"`,
  );
  const path = join(tmpdir(), `pos-schema-${provider}.prisma`);
  writeFileSync(path, swapped);
  return path;
}

function emit(provider, outFile) {
  const schemaPath = withProvider(provider);
  const sql = execSync(
    `npx prisma migrate diff --from-empty --to-schema-datamodel "${schemaPath}" --script`,
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  writeFileSync(outFile, sql);
  const tables = (sql.match(/CREATE TABLE/g) ?? []).length;
  console.log(`${provider.padEnd(11)} -> ${outFile}  (${tables} tables)`);
  return sql;
}

emit('postgresql', join(OUT, 'schema.postgres.sql'));
emit('sqlite', join(OUT, 'schema.sqlite.sql'));
copyFileSync(join(OUT, 'schema.postgres.sql'), join(MIGRATION, 'migration.sql'));
console.log(`migration    -> ${join(MIGRATION, 'migration.sql')}`);
