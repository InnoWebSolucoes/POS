#!/bin/sh
set -e

echo "[entrypoint] waiting for the database..."
npx prisma db push --skip-generate --accept-data-loss=false 2>/dev/null || npx prisma db push --skip-generate

if [ "${SEED_ON_START}" = "true" ]; then
  echo "[entrypoint] seeding demo data..."
  npx tsx prisma/seed.ts || echo "[entrypoint] seed skipped/failed - continuing"
fi

echo "[entrypoint] starting API"
exec "$@"
