import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function str(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function int(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

const nodeEnv = str('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

// A weak secret in production is a real vulnerability, not a warning.
const jwtSecret = str('JWT_SECRET', isProduction ? undefined : 'dev-only-insecure-secret');
if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production.');
}

export const env = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',

  port: int('API_PORT', 4000),
  host: str('API_HOST', '0.0.0.0'),

  databaseUrl: str('DATABASE_URL', 'file:./dev.db'),
  databaseProvider: str('DATABASE_PROVIDER', 'sqlite'),

  jwtSecret,
  jwtAccessTtl: str('JWT_ACCESS_TTL', '8h'),
  jwtRefreshTtl: str('JWT_REFRESH_TTL', '30d'),

  corsOrigin: str('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  storageDriver: str('STORAGE_DRIVER', 'local') as 'local' | 's3',
  uploadDir: path.resolve(here, '../..', str('UPLOAD_DIR', '../../uploads')),
  publicUploadBase: str('PUBLIC_UPLOAD_BASE', '/uploads'),

  s3: {
    endpoint: process.env.S3_ENDPOINT || '',
    region: str('S3_REGION', 'us-east-1'),
    bucket: process.env.S3_BUCKET || '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },

  superAdmin: {
    email: str('SUPERADMIN_EMAIL', 'admin@pos.local'),
    password: str('SUPERADMIN_PASSWORD', 'admin123'),
  },

  defaultLocale: str('DEFAULT_LOCALE', 'pt-PT'),
  defaultCurrency: str('DEFAULT_CURRENCY', 'AOA'),

  trustProxy: bool('TRUST_PROXY', isProduction),
  rateLimitEnabled: bool('RATE_LIMIT_ENABLED', true),
} as const;

export type Env = typeof env;
