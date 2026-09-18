import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { Role } from '@pos/shared';
import { env } from './env.js';
import { ApiError } from './http.js';

const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(pin, hash);
}

export interface TokenPayload {
  sub: string;
  role: Role;
  entityId: string | null;
  locationId: string | null;
  type: 'access' | 'refresh';
}

export function signAccessToken(payload: Omit<TokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.jwtSecret, {
    expiresIn: env.jwtAccessTtl,
  } as SignOptions);
}

export function signRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, env.jwtSecret, {
    expiresIn: env.jwtRefreshTtl,
  } as SignOptions);
}

export function verifyToken(token: string, expected: 'access' | 'refresh' = 'access'): TokenPayload {
  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;
  } catch (error) {
    const expired = error instanceof jwt.TokenExpiredError;
    throw ApiError.unauthorized(expired ? 'Sessao expirada.' : 'Sessao invalida.');
  }
  if (decoded.type !== expected) {
    throw ApiError.unauthorized('Tipo de token incorrecto.');
  }
  return decoded;
}

/** Refresh tokens are stored hashed so a database leak cannot resume sessions. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Parses "30d" / "8h" / "45m" into milliseconds. */
export function ttlToMs(ttl: string): number {
  const match = /^(\d+)\s*([smhdw])$/i.exec(ttl.trim());
  if (!match) return 8 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const factors: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return value * (factors[unit] ?? 3_600_000);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
