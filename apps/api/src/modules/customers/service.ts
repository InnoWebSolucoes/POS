import type { Prisma } from '@prisma/client';
import { makeEan13, type EntitySettings, type LoyaltyTxType, type VipTier } from '@pos/shared';

import { ApiError } from '../../lib/http.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { nextSequence } from '../../lib/sequence.js';
import { DEFAULT_SETTINGS, getSetting } from '../../lib/settings.js';

export type VipThresholds = EntitySettings['vipThresholds'];

/**
 * Sale statuses that count as money actually taken. A partially refunded sale
 * still happened; a fully refunded or voided one did not.
 */
export const REVENUE_SALE_STATUSES = ['completed', 'partially_refunded'] as const;

/** What a CRM screen calls "a purchase" - everything the customer ever bought. */
export const HISTORY_SALE_STATUSES = ['completed', 'partially_refunded', 'refunded'] as const;

/* -------------------------------------------------------------------------- */
/* VIP tiers                                                                   */
/* -------------------------------------------------------------------------- */

/** Fills in any threshold the entity never configured. */
export function normaliseThresholds(
  input: Partial<VipThresholds> | null | undefined,
): VipThresholds {
  const fallback = DEFAULT_SETTINGS.vipThresholds;
  const pick = (value: unknown, defaultValue: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.round(value)
      : defaultValue;

  return {
    bronze: pick(input?.bronze, fallback.bronze),
    silver: pick(input?.silver, fallback.silver),
    gold: pick(input?.gold, fallback.gold),
  };
}

/**
 * THE tier rule. The sales module must call this rather than re-implement it,
 * so a tier is identical whether it was recomputed at checkout or here.
 * Checked highest-first so a badly ordered threshold set still degrades sanely.
 */
export function tierForSpend(
  lifetimeSpendMinor: number | bigint,
  thresholds: Partial<VipThresholds> | null | undefined,
): VipTier {
  const limits = normaliseThresholds(thresholds);
  const spend = Number(lifetimeSpendMinor) || 0;
  if (spend >= limits.gold) return 'gold';
  if (spend >= limits.silver) return 'silver';
  if (spend >= limits.bronze) return 'bronze';
  return 'none';
}

/** tierForSpend with the entity's configured thresholds loaded for you. */
export async function resolveTier(
  entityId: string,
  lifetimeSpendMinor: number | bigint,
  client: Tx = prisma,
): Promise<VipTier> {
  const thresholds = await getSetting(entityId, 'vipThresholds', client);
  return tierForSpend(lifetimeSpendMinor, thresholds);
}

/**
 * Recomputes and persists the tier from the stored lifetime spend. Call this
 * whenever lifetimeSpendMinor changes. Writes only when the tier actually moved.
 */
export async function syncCustomerTier(
  entityId: string,
  customerId: string,
  client: Tx = prisma,
): Promise<VipTier> {
  const customer = await client.customer.findFirst({
    where: { id: customerId, entityId },
    select: { lifetimeSpendMinor: true, tier: true },
  });
  if (!customer) return 'none';

  const tier = await resolveTier(entityId, customer.lifetimeSpendMinor, client);
  if (tier !== customer.tier) {
    await client.customer.update({ where: { id: customerId }, data: { tier } });
  }
  return tier;
}

/**
 * Books a completed sale against a customer: lifetime spend, order count, last
 * purchase date and the resulting tier, all in one place. Exposed for the sales
 * module so checkout and the CRM never drift apart. Run it inside the sale's
 * own transaction.
 */
export async function recordPurchase(params: {
  entityId: string;
  customerId: string;
  totalMinor: number;
  occurredAt?: Date;
  client?: Tx;
}): Promise<{ lifetimeSpendMinor: number; orderCount: number; tier: VipTier }> {
  const client = params.client ?? prisma;
  const customer = await client.customer.findFirst({
    where: { id: params.customerId, entityId: params.entityId, deletedAt: null },
    select: { id: true, lifetimeSpendMinor: true, orderCount: true, tier: true },
  });
  if (!customer) throw ApiError.notFound('Cliente nao encontrado.');

  const lifetimeSpendMinor = Number(customer.lifetimeSpendMinor) + Math.round(params.totalMinor);
  const orderCount = customer.orderCount + 1;
  const tier = await resolveTier(params.entityId, lifetimeSpendMinor, client);

  await client.customer.update({
    where: { id: customer.id },
    data: {
      lifetimeSpendMinor: BigInt(Math.round(lifetimeSpendMinor)),
      orderCount,
      lastPurchaseAt: params.occurredAt ?? new Date(),
      tier,
    },
  });

  return { lifetimeSpendMinor, orderCount, tier };
}

/* -------------------------------------------------------------------------- */
/* Loyalty points                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Appends to the loyalty ledger and moves the balance atomically. The balance
 * is a running total the ledger must always be able to explain, so both rows
 * are written from the same read.
 */
export async function postLoyaltyTransaction(params: {
  entityId: string;
  customerId: string;
  type: LoyaltyTxType;
  /** Signed: positive credits the customer, negative debits them. */
  points: number;
  note?: string | null;
  saleId?: string | null;
  client: Tx;
}): Promise<{ balanceAfter: number; transactionId: string }> {
  const { client } = params;
  const customer = await client.customer.findFirst({
    where: { id: params.customerId, entityId: params.entityId, deletedAt: null },
    select: { id: true, points: true },
  });
  if (!customer) throw ApiError.notFound('Cliente nao encontrado.');

  const delta = Math.round(params.points);
  const balanceAfter = customer.points + delta;
  if (balanceAfter < 0) {
    throw ApiError.unprocessable(
      'Pontos insuficientes. Saldo disponivel: ' + String(customer.points) + ' pontos.',
    );
  }

  await client.customer.update({
    where: { id: customer.id },
    data: { points: balanceAfter },
  });

  const transaction = await client.loyaltyTransaction.create({
    data: {
      customerId: customer.id,
      type: params.type,
      points: delta,
      balanceAfter,
      saleId: params.saleId ?? null,
      note: params.note ?? null,
    },
    select: { id: true },
  });

  return { balanceAfter, transactionId: transaction.id };
}

/** Converts points into a discount, in minor units, at the configured rate. */
export function pointsToMinor(points: number, pointValueMinor: number): number {
  return Math.round(Math.max(0, Math.round(points)) * Math.max(0, pointValueMinor));
}

/* -------------------------------------------------------------------------- */
/* Store credit                                                                */
/* -------------------------------------------------------------------------- */

export async function moveStoreCredit(params: {
  entityId: string;
  customerId: string;
  /** Signed minor units. */
  amountMinor: number;
  client: Tx;
}): Promise<{ balanceMinor: number; previousMinor: number }> {
  const { client } = params;
  const customer = await client.customer.findFirst({
    where: { id: params.customerId, entityId: params.entityId, deletedAt: null },
    select: { id: true, storeCreditMinor: true },
  });
  if (!customer) throw ApiError.notFound('Cliente nao encontrado.');

  const previousMinor = Number(customer.storeCreditMinor);
  const balanceMinor = previousMinor + Math.round(params.amountMinor);
  if (balanceMinor < 0) {
    throw ApiError.unprocessable(
      'Credito de loja insuficiente. Saldo disponivel: ' + String(previousMinor) + ' centimos.',
    );
  }

  await client.customer.update({
    where: { id: customer.id },
    data: { storeCreditMinor: BigInt(Math.round(balanceMinor)) },
  });

  return { balanceMinor, previousMinor };
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

type ContactField = 'phone' | 'email' | 'loyaltyCardNumber';

/**
 * Phone and email are not unique in the schema (the storefront and the register
 * both create customers), so the check lives here and is scoped to the tenant.
 */
export async function assertContactAvailable(
  entityId: string,
  contact: { phone?: string | null; email?: string | null; loyaltyCardNumber?: string | null },
  excludeCustomerId?: string | null,
  client: Tx = prisma,
): Promise<void> {
  const checks: Array<{ field: ContactField; match: Prisma.CustomerWhereInput; message: string }> =
    [];

  if (contact.phone) {
    checks.push({
      field: 'phone',
      match: { phone: contact.phone },
      message: 'Ja existe um cliente com este telefone.',
    });
  }
  if (contact.email) {
    checks.push({
      field: 'email',
      match: { email: contact.email },
      message: 'Ja existe um cliente com este email.',
    });
  }
  if (contact.loyaltyCardNumber) {
    checks.push({
      field: 'loyaltyCardNumber',
      match: { loyaltyCardNumber: contact.loyaltyCardNumber },
      message: 'Ja existe um cliente com este cartao de fidelidade.',
    });
  }

  for (const check of checks) {
    const clash = await client.customer.findFirst({
      where: {
        entityId,
        deletedAt: null,
        ...check.match,
        ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new ApiError(409, 'duplicate', check.message + ' (' + clash.name + ')', {
        [check.field]: [check.message],
      });
    }
  }
}

/**
 * Loyalty cards get printed as barcodes, so the number is a valid EAN-13 built
 * on prefix 98 - outside the scale rules (2x) and the internal product range
 * (29), so a scanned card can never be mistaken for a product.
 */
export async function generateLoyaltyCardNumber(
  entityId: string,
  client: Tx = prisma,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const seq = await nextSequence(entityId, 'loyalty_card', { client });
    const card = makeEan13('98' + String(seq).padStart(10, '0').slice(-10));
    const clash = await client.customer.findFirst({
      where: { entityId, loyaltyCardNumber: card },
      select: { id: true },
    });
    if (!clash) return card;
  }
  throw ApiError.conflict('Nao foi possivel gerar um numero de cartao unico. Tente novamente.');
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/** A bare "2026-09-18" means the whole day, not midnight. */
export function parseWindow(
  from: string | undefined,
  to: string | undefined,
  defaultDays = 30,
): { from: Date; to: Date } {
  const end = to ? new Date(to) : new Date();
  if (to && !to.includes('T')) end.setHours(23, 59, 59, 999);

  const start = from ? new Date(from) : new Date(end.getTime() - defaultDays * 86_400_000);
  if (from && !from.includes('T')) start.setHours(0, 0, 0, 0);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw ApiError.badRequest('Intervalo de datas invalido.');
  }
  if (start > end) throw ApiError.badRequest('A data inicial e posterior a data final.');

  return { from: start, to: end };
}

export const CUSTOMER_AUDIT_ACTIONS = {
  CREATE: 'customer.create',
  UPDATE: 'customer.update',
  DELETE: 'customer.delete',
  LOYALTY_ADJUST: 'customer.loyalty_adjust',
  STORE_CREDIT: 'customer.store_credit',
} as const;

export const TIER_LABELS: Record<VipTier, string> = {
  none: 'Sem nivel',
  bronze: 'Bronze',
  silver: 'Prata',
  gold: 'Ouro',
};
