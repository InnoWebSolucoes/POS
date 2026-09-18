import type { Request } from 'express';
import type { Role } from '@pos/shared';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  ttlToMs,
  randomToken,
} from '../../lib/auth.js';
import { env } from '../../lib/env.js';
import { ApiError } from '../../lib/http.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import {
  AUTH_USER_SELECT,
  ENTITY_SELECT,
  toRole,
  type AuthUserRow,
  type EntityRow,
} from './mappers.js';

/* -------------------------------------------------------------------------- */
/* Selects                                                                     */
/* -------------------------------------------------------------------------- */

export const SESSION_SELECT = {
  ...AUTH_USER_SELECT,
  active: true,
  entity: { select: ENTITY_SELECT },
} as const;

export const CREDENTIAL_SELECT = {
  ...SESSION_SELECT,
  passwordHash: true,
} as const;

/** PIN login already knows the entity, so the relation is not joined again. */
export const PIN_SELECT = {
  ...AUTH_USER_SELECT,
  active: true,
} as const;

export interface SessionRow extends AuthUserRow {
  active: boolean;
  entity: EntityRow | null;
}

/* -------------------------------------------------------------------------- */
/* Cheap in-memory throttle                                                     */
/* -------------------------------------------------------------------------- */

/**
 * app.ts rate-limits /api/auth/login only. PIN login is an equally
 * unauthenticated write surface with a four-digit secret, so it gets its own
 * in-process counter. Single-node best effort: it is a speed bump, not a
 * distributed limiter.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const ATTEMPT_LIMIT = 10;

function sweep(now: number): void {
  if (attempts.size < 5_000) return;
  for (const [key, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(key);
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/** Throws 429 once a key has burned through its attempts. */
export function guardAttempts(key: string): void {
  const now = Date.now();
  sweep(now);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > ATTEMPT_LIMIT) {
    throw ApiError.tooManyRequests('Demasiadas tentativas. Aguarde alguns minutos.');
  }
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

export interface TokenPair {
  token: string;
  refreshToken: string;
}

interface SessionSubject {
  id: string;
  role: string;
  entityId: string | null;
  locationId: string | null;
}

interface SessionClaims {
  sub: string;
  role: Role;
  entityId: string | null;
  locationId: string | null;
  /** Makes every refresh token unique, even for two logins in the same second. */
  nonce?: string;
}

/**
 * Mints an access/refresh pair and persists the refresh token HASHED, so a
 * database leak cannot resume anybody's session.
 */
export async function issueSession(
  client: Tx,
  user: SessionSubject,
  userAgent?: string | null,
): Promise<TokenPair> {
  const claims: SessionClaims = {
    sub: user.id,
    role: toRole(user.role),
    entityId: user.entityId,
    locationId: user.locationId,
  };

  const refreshClaims: SessionClaims = { ...claims, nonce: randomToken(8) };

  const token = signAccessToken(claims);
  const refreshToken = signRefreshToken(refreshClaims);

  await client.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + ttlToMs(env.jwtRefreshTtl)),
      userAgent: userAgent ? userAgent.slice(0, 250) : null,
    },
  });

  return { token, refreshToken };
}

/** Revokes a presented refresh token. Returns the owning user id, if any. */
export async function revokeRefreshToken(
  raw: string,
  client: Tx = prisma,
): Promise<string | null> {
  const row = await client.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: { id: true, userId: true, revokedAt: true },
  });
  if (!row) return null;
  if (!row.revokedAt) {
    await client.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
  }
  return row.userId;
}

/** Ends every other live session, e.g. after a password change. */
export async function revokeAllRefreshTokens(userId: string, client: Tx = prisma): Promise<void> {
  await client.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/* -------------------------------------------------------------------------- */
/* Lookups                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Emails are normalised to lower case on the way in. Legacy rows written with
 * mixed case are still reachable through the second, equally indexed lookup -
 * SQLite has no case-insensitive filter to lean on.
 */
export async function findUserByEmail(
  normalised: string,
  original: string,
): Promise<(SessionRow & { passwordHash: string }) | null> {
  const found = await prisma.user.findFirst({
    where: { email: normalised, deletedAt: null },
    select: CREDENTIAL_SELECT,
  });
  if (found || original === normalised) return found;

  return prisma.user.findFirst({
    where: { email: original, deletedAt: null },
    select: CREDENTIAL_SELECT,
  });
}

export async function loadSession(userId: string): Promise<SessionRow> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: SESSION_SELECT,
  });
  if (!user) throw ApiError.unauthorized('Utilizador inactivo ou inexistente.');
  if (!user.active) throw ApiError.unauthorized('Utilizador inactivo ou inexistente.');
  return user;
}

export async function findEntityById(entityId: string): Promise<EntityRow | null> {
  return prisma.entity.findFirst({
    where: { id: entityId, deletedAt: null },
    select: ENTITY_SELECT,
  });
}

export async function findEntityBySlug(slug: string): Promise<EntityRow | null> {
  return prisma.entity.findFirst({
    where: { slug, deletedAt: null },
    select: ENTITY_SELECT,
  });
}

/**
 * The entity shown to the caller: their own tenant, or - for a super admin
 * operating through X-Entity-Id - whichever tenant they are currently inside.
 */
export async function resolveEntity(
  user: SessionRow,
  headerEntityId?: string,
): Promise<EntityRow | null> {
  if (user.entity) return user.entity;
  if (user.entityId) return findEntityById(user.entityId);
  if (headerEntityId) return findEntityById(headerEntityId);
  return null;
}
