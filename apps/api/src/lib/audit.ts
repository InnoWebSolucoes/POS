import type { Request } from 'express';
import { prisma, type Tx } from './prisma.js';

/**
 * The audit trail is append-only: nothing in the codebase updates or deletes an
 * AuditLog row, and the module exposes no way to do so.
 */
export interface AuditInput {
  entityId?: string | null;
  userId?: string | null;
  userName?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: unknown;
  ipAddress?: string | null;
}

function clientIp(req?: Request): string | null {
  if (!req) return null;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]!.trim();
  return req.socket?.remoteAddress ?? null;
}

/** Strips anything that must never be written to a log. */
function sanitize(details: unknown): string | null {
  if (details === undefined || details === null) return null;
  const REDACTED = ['password', 'passwordHash', 'pin', 'pinHash', 'token', 'refreshToken', 'cardNumber'];
  const seen = new WeakSet<object>();

  const walk = (value: unknown): unknown => {
    if (typeof value === 'bigint') return Number(value);
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value as object)) return '[circular]';
    seen.add(value as object);
    if (Array.isArray(value)) return value.map(walk);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED.includes(k) ? '[redacted]' : walk(v);
    }
    return out;
  };

  try {
    return JSON.stringify(walk(details));
  } catch {
    return null;
  }
}

export async function audit(input: AuditInput, client: Tx = prisma): Promise<void> {
  try {
    await client.auditLog.create({
      data: {
        entityId: input.entityId ?? null,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        details: sanitize(input.details),
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    // An audit failure must never take down the operation it was recording.
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write entry:', error);
  }
}

/** Convenience wrapper that pulls the actor straight off the request. */
export async function auditRequest(
  req: Request,
  input: Omit<AuditInput, 'entityId' | 'userId' | 'userName' | 'ipAddress'> &
    Partial<Pick<AuditInput, 'entityId'>>,
  client: Tx = prisma,
): Promise<void> {
  await audit(
    {
      entityId: input.entityId ?? req.entityId ?? req.auth?.entityId ?? null,
      userId: req.auth?.userId ?? null,
      userName: req.auth?.name ?? null,
      ipAddress: clientIp(req),
      ...input,
    },
    client,
  );
}

export const AUDIT_ACTIONS = {
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DEACTIVATE: 'user.deactivate',
  ENTITY_CREATE: 'entity.create',
  ENTITY_UPDATE: 'entity.update',
  PRODUCT_CREATE: 'product.create',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_DELETE: 'product.delete',
  PRICE_CHANGE: 'product.price_change',
  STOCK_RECEIPT: 'stock.receipt',
  STOCK_ADJUST: 'stock.adjust',
  STOCK_TRANSFER: 'stock.transfer',
  STOCKTAKE_APPROVE: 'stock.stocktake_approve',
  SALE_CREATE: 'sale.create',
  SALE_VOID: 'sale.void',
  SALE_REFUND: 'sale.refund',
  SALE_HOLD: 'sale.hold',
  DISCOUNT_APPLY: 'sale.discount',
  SETTINGS_UPDATE: 'settings.update',
  ORDER_SEND: 'order.send',
  ORDER_CLOSE: 'order.close',
  ONLINE_ORDER_UPDATE: 'online_order.update',
} as const;
