import type { Request } from 'express';
import type { Entity } from '@prisma/client';
import { ApiError } from '../../lib/http.js';
import { requireAuthContext, requireEntity } from '../../lib/middleware.js';
import { prisma, type Tx } from '../../lib/prisma.js';

/* -------------------------------------------------------------------------- */
/* Slugs                                                                       */
/* -------------------------------------------------------------------------- */

/** "Padaria São João" -> "padaria-sao-joao". ASCII, url-safe, never empty. */
export function slugify(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');

  return base || 'entidade';
}

/**
 * Finds a free slug, appending -2, -3, ... on collision. Runs inside the
 * creation transaction so two concurrent creates cannot agree on the same one
 * (and the unique index is the final backstop either way).
 */
export async function uniqueSlug(client: Tx, name: string): Promise<string> {
  const base = slugify(name);

  const taken = await client.entity.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const used = new Set(taken.map((row) => row.slug));

  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  throw ApiError.conflict('Nao foi possivel gerar um endereco unico para esta entidade.');
}

/* -------------------------------------------------------------------------- */
/* Access                                                                      */
/* -------------------------------------------------------------------------- */

export function isSuperAdmin(req: Request): boolean {
  return req.auth?.role === 'super_admin';
}

/**
 * A super admin reaches every tenant; everybody else only ever touches the one
 * `requireEntity(req)` resolved for them.
 */
export function assertEntityAccess(req: Request, entityId: string): void {
  requireAuthContext(req);
  if (isSuperAdmin(req)) return;
  if (requireEntity(req) !== entityId) {
    throw ApiError.forbidden('Nao tem acesso a esta entidade.');
  }
}

export async function loadEntity(entityId: string, client: Tx = prisma): Promise<Entity> {
  const entity = await client.entity.findFirst({ where: { id: entityId, deletedAt: null } });
  if (!entity) throw ApiError.notFound('Entidade nao encontrada.');
  return entity;
}

/** Loads a location and checks the caller is allowed inside its tenant. */
export async function loadLocationForRequest(req: Request, locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) throw ApiError.notFound('Localizacao nao encontrada.');

  assertEntityAccess(req, location.entityId);

  const entity = await prisma.entity.findFirst({
    where: { id: location.entityId, deletedAt: null },
    select: { id: true },
  });
  if (!entity) throw ApiError.notFound('Entidade nao encontrada.');

  return location;
}

/* -------------------------------------------------------------------------- */
/* Locations                                                                   */
/* -------------------------------------------------------------------------- */

/** Clears isDefault everywhere in the tenant except `keepId`. */
export async function clearOtherDefaults(
  client: Tx,
  entityId: string,
  keepId: string | null,
): Promise<void> {
  await client.location.updateMany({
    where: {
      entityId,
      isDefault: true,
      ...(keepId ? { NOT: { id: keepId } } : {}),
    },
    data: { isDefault: false },
  });
}

export async function countActiveLocations(
  client: Tx,
  entityId: string,
  excludeId?: string,
): Promise<number> {
  return client.location.count({
    where: { entityId, active: true, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
  });
}

/** True when the location still holds a non-zero balance anywhere. */
export async function locationHoldsStock(client: Tx, locationId: string): Promise<boolean> {
  const row = await client.inventoryLevel.findFirst({
    where: { locationId, quantity: { not: 0 } },
    select: { id: true },
  });
  return Boolean(row);
}

/** After deactivating the default location, promote another active one. */
export async function promoteAnotherDefault(
  client: Tx,
  entityId: string,
  excludeId: string,
): Promise<void> {
  const replacement = await client.location.findFirst({
    where: { entityId, active: true, NOT: { id: excludeId } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!replacement) return;
  await client.location.update({ where: { id: replacement.id }, data: { isDefault: true } });
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                       */
/* -------------------------------------------------------------------------- */

export interface EntityStats {
  entityId: string;
  productCount: number;
  userCount: number;
  locationCount: number;
  todayRevenueMinor: number;
  todaySaleCount: number;
  openOrderCount: number;
}

/** Orders that still need someone's attention on the floor. */
const LIVE_ORDER_STATUSES = ['open', 'sent', 'ready', 'served'];

function dayBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function entityStats(entityId: string): Promise<EntityStats> {
  const { start, end } = dayBounds();

  const [productCount, userCount, locationCount, sales, openOrderCount] = await Promise.all([
    prisma.product.count({ where: { entityId, deletedAt: null } }),
    prisma.user.count({ where: { entityId, deletedAt: null } }),
    prisma.location.count({ where: { entityId, active: true } }),
    prisma.sale.aggregate({
      where: { entityId, status: 'completed', createdAt: { gte: start, lt: end } },
      _sum: { totalMinor: true },
      _count: { _all: true },
    }),
    prisma.order.count({ where: { entityId, status: { in: LIVE_ORDER_STATUSES } } }),
  ]);

  return {
    entityId,
    productCount,
    userCount,
    locationCount,
    todayRevenueMinor: Number(sales._sum.totalMinor ?? 0),
    todaySaleCount: sales._count._all,
    openOrderCount,
  };
}
