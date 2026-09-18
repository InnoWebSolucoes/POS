/**
 * Promotion evaluation.
 *
 * Deliberately free of Express types so the sales module can import
 * `evaluatePromotion` / `evaluatePromotionCode` when it commits a sale.
 *
 * Every amount here is an INTEGER in minor units. Percentages are basis points.
 * The only maths allowed is the integer helpers from @pos/shared/money.
 */

import { allocate, applyBps, roundHalfUp, splitEvenly, type PromotionType } from '@pos/shared';
import { prisma, type Tx } from '../../lib/prisma.js';
import { round3 } from '../../lib/inventory.js';

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** A promotion flattened out of Prisma (BigInt -> Number, JSON -> string[]). */
export interface PromotionRecord {
  id: string;
  entityId: string;
  code: string;
  namePt: string;
  nameEn: string | null;
  type: PromotionType;
  /** bps for percent_off, minor units for fixed_off, unused for buy_x_get_y. */
  value: number;
  categoryId: string | null;
  productIds: string[];
  buyQuantity: number | null;
  getQuantity: number | null;
  minSpendMinor: number;
  usageLimit: number | null;
  usageCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
}

export interface PromotionBasketLine {
  productId: string;
  /** May be fractional (1.350 kg). Whole units only count for buy_x_get_y. */
  quantity: number;
  unitPriceMinor: number;
  categoryId?: string | null;
}

export interface PromotionBasket {
  lines: PromotionBasketLine[];
  /** The register's own basket subtotal; recomputed from the lines when absent. */
  subtotalMinor?: number;
}

export interface AffectedLine {
  productId: string;
  discountMinor: number;
}

/** What the POS shows on the banner / badge once a code sticks. */
export interface PromotionSummary {
  id: string;
  code: string;
  namePt: string;
  nameEn: string | null;
  type: PromotionType;
  value: number;
  minSpendMinor: number;
  buyQuantity: number | null;
  getQuantity: number | null;
}

export interface PromotionEvaluation {
  valid: boolean;
  reason?: string;
  promotion?: PromotionSummary;
  discountMinor: number;
  affectedLines: AffectedLine[];
}

/** User-facing refusals, European Portuguese, ASCII only. */
export const PROMOTION_REASONS = {
  NOT_FOUND: 'Codigo promocional nao encontrado.',
  INACTIVE: 'Promocao inactiva.',
  NOT_STARTED: 'A promocao ainda nao comecou.',
  EXPIRED: 'A promocao ja terminou.',
  USAGE_LIMIT: 'Limite de utilizacoes da promocao atingido.',
  MIN_SPEND: 'Compra minima nao atingida.',
  NO_ELIGIBLE_LINES: 'Nenhum artigo do cesto e elegivel para esta promocao.',
  NOT_ENOUGH_QUANTITY: 'Quantidade insuficiente para activar a promocao.',
  MISCONFIGURED: 'Promocao mal configurada.',
  EMPTY_BASKET: 'O cesto esta vazio.',
  NO_DISCOUNT: 'Esta promocao nao gera desconto neste cesto.',
} as const;

/* -------------------------------------------------------------------------- */
/* Mapping                                                                     */
/* -------------------------------------------------------------------------- */

/** Prisma stores the product scope as a JSON string array; never trust it blindly. */
export function parseProductIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
  } catch {
    return [];
  }
}

export function serialiseProductIds(ids: readonly string[] | null | undefined): string {
  return JSON.stringify([...new Set(ids ?? [])]);
}

/** The Prisma row fields this module reads. */
export interface PromotionRow {
  id: string;
  entityId: string;
  code: string;
  namePt: string;
  nameEn: string | null;
  type: string;
  value: number;
  categoryId: string | null;
  productIds: string;
  buyQuantity: number | null;
  getQuantity: number | null;
  minSpendMinor: bigint;
  usageLimit: number | null;
  usageCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
}

export function toPromotionRecord(row: PromotionRow): PromotionRecord {
  return {
    id: row.id,
    entityId: row.entityId,
    code: row.code,
    namePt: row.namePt,
    nameEn: row.nameEn,
    type: row.type as PromotionType,
    value: Number(row.value),
    categoryId: row.categoryId,
    productIds: parseProductIds(row.productIds),
    buyQuantity: row.buyQuantity,
    getQuantity: row.getQuantity,
    minSpendMinor: Number(row.minSpendMinor),
    usageLimit: row.usageLimit,
    usageCount: row.usageCount,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    active: row.active,
  };
}

export function toSummary(promotion: PromotionRecord): PromotionSummary {
  return {
    id: promotion.id,
    code: promotion.code,
    namePt: promotion.namePt,
    nameEn: promotion.nameEn,
    type: promotion.type,
    value: promotion.value,
    minSpendMinor: promotion.minSpendMinor,
    buyQuantity: promotion.buyQuantity,
    getQuantity: promotion.getQuantity,
  };
}

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                 */
/* -------------------------------------------------------------------------- */

/** True when the promotion is live right now (window + usage, ignoring the basket). */
export function isRunning(promotion: PromotionRecord, now: Date = new Date()): boolean {
  if (!promotion.active) return false;
  if (promotion.startsAt && promotion.startsAt.getTime() > now.getTime()) return false;
  if (promotion.endsAt && promotion.endsAt.getTime() < now.getTime()) return false;
  if (promotion.usageLimit !== null && promotion.usageCount >= promotion.usageLimit) return false;
  return true;
}

/** Whole-basket promotion: no category and no explicit product list. */
function isWholeBasket(promotion: PromotionRecord): boolean {
  return !promotion.categoryId && promotion.productIds.length === 0;
}

function lineMatches(promotion: PromotionRecord, line: PromotionBasketLine): boolean {
  if (isWholeBasket(promotion)) return true;
  if (promotion.productIds.length > 0 && promotion.productIds.includes(line.productId)) return true;
  if (promotion.categoryId && line.categoryId && line.categoryId === promotion.categoryId) return true;
  return false;
}

/** unitPrice * quantity, rounded into integer minor units immediately. */
function lineSubtotal(line: PromotionBasketLine): number {
  return Math.max(0, roundHalfUp(line.unitPriceMinor * line.quantity));
}

interface ProductGroup {
  productId: string;
  subtotalMinor: number;
  /** Whole sellable units, per line, cheapest-first ordering applied later. */
  units: Array<{ unitPriceMinor: number; wholeUnits: number }>;
  wholeUnits: number;
}

function groupByProduct(lines: PromotionBasketLine[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const line of lines) {
    const group = groups.get(line.productId) ?? {
      productId: line.productId,
      subtotalMinor: 0,
      units: [],
      wholeUnits: 0,
    };
    const wholeUnits = Math.max(0, Math.floor(round3(line.quantity)));
    group.subtotalMinor += lineSubtotal(line);
    group.wholeUnits += wholeUnits;
    if (wholeUnits > 0) {
      group.units.push({ unitPriceMinor: Math.max(0, Math.round(line.unitPriceMinor)), wholeUnits });
    }
    groups.set(line.productId, group);
  }
  return [...groups.values()];
}

/**
 * Spreads an integer total across groups by value, falling back to an even split
 * when every weight is zero. The parts always sum back to exactly `total`.
 */
function spread(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum > 0) return allocate(total, weights);
  return splitEvenly(total, weights.length);
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                  */
/* -------------------------------------------------------------------------- */

const INVALID = (reason: string): PromotionEvaluation => ({
  valid: false,
  reason,
  discountMinor: 0,
  affectedLines: [],
});

/**
 * Pure evaluation: given a promotion (or null when the code did not resolve) and
 * a basket, decide whether it applies and exactly how many minor units come off.
 */
export function evaluatePromotion(
  promotion: PromotionRecord | null | undefined,
  basket: PromotionBasket,
  now: Date = new Date(),
): PromotionEvaluation {
  if (!promotion) return INVALID(PROMOTION_REASONS.NOT_FOUND);
  if (!promotion.active) return INVALID(PROMOTION_REASONS.INACTIVE);

  if (promotion.startsAt && promotion.startsAt.getTime() > now.getTime()) {
    return INVALID(PROMOTION_REASONS.NOT_STARTED);
  }
  if (promotion.endsAt && promotion.endsAt.getTime() < now.getTime()) {
    return INVALID(PROMOTION_REASONS.EXPIRED);
  }
  if (promotion.usageLimit !== null && promotion.usageCount >= promotion.usageLimit) {
    return INVALID(PROMOTION_REASONS.USAGE_LIMIT);
  }

  const lines = basket.lines ?? [];
  if (lines.length === 0) return INVALID(PROMOTION_REASONS.EMPTY_BASKET);

  const computedSubtotal = lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
  const declared = basket.subtotalMinor;
  const basketSubtotal =
    typeof declared === 'number' && Number.isFinite(declared) && declared > 0
      ? Math.round(declared)
      : computedSubtotal;

  if (promotion.minSpendMinor > 0 && basketSubtotal < promotion.minSpendMinor) {
    return INVALID(PROMOTION_REASONS.MIN_SPEND);
  }

  const matching = lines.filter((line) => lineMatches(promotion, line));
  if (matching.length === 0) return INVALID(PROMOTION_REASONS.NO_ELIGIBLE_LINES);

  const groups = groupByProduct(matching);
  const summary = toSummary(promotion);

  if (promotion.type === 'buy_x_get_y') {
    return evaluateBuyXGetY(promotion, groups, summary);
  }

  // percent_off / fixed_off both work off the scoped subtotal: the whole basket
  // when unscoped, otherwise only the matching lines.
  const matchedSubtotal = groups.reduce((sum, group) => sum + group.subtotalMinor, 0);
  // A declared subtotal below the raw line total means the register already took
  // line discounts off; above it means the caller is out of step, so never let
  // the discount exceed what the lines are actually worth.
  const scopedSubtotal = isWholeBasket(promotion)
    ? Math.min(basketSubtotal, computedSubtotal)
    : matchedSubtotal;

  if (scopedSubtotal <= 0) return INVALID(PROMOTION_REASONS.NO_ELIGIBLE_LINES);

  let discountMinor: number;
  if (promotion.type === 'percent_off') {
    discountMinor = applyBps(scopedSubtotal, promotion.value);
  } else {
    discountMinor = promotion.value;
  }
  discountMinor = Math.max(0, Math.min(discountMinor, scopedSubtotal));

  if (discountMinor <= 0) return INVALID(PROMOTION_REASONS.NO_DISCOUNT);

  const parts = spread(
    discountMinor,
    groups.map((group) => group.subtotalMinor),
  );

  return {
    valid: true,
    promotion: summary,
    discountMinor,
    affectedLines: groups
      .map((group, index) => ({ productId: group.productId, discountMinor: parts[index] ?? 0 }))
      .filter((line) => line.discountMinor > 0),
  };
}

/**
 * Buy X get Y. Per matching product:
 *   free units = floor(wholeUnits / (buy + get)) * get
 * and the free units are the CHEAPEST qualifying ones, so a mixed-price basket
 * never gives away the expensive stock.
 */
function evaluateBuyXGetY(
  promotion: PromotionRecord,
  groups: ProductGroup[],
  summary: PromotionSummary,
): PromotionEvaluation {
  const buy = promotion.buyQuantity ?? 0;
  const get = promotion.getQuantity ?? 0;
  if (buy < 1 || get < 1) return INVALID(PROMOTION_REASONS.MISCONFIGURED);

  const groupSize = buy + get;
  const affectedLines: AffectedLine[] = [];
  let discountMinor = 0;

  for (const group of groups) {
    let free = Math.floor(group.wholeUnits / groupSize) * get;
    if (free <= 0) continue;

    let groupDiscount = 0;
    const cheapestFirst = [...group.units].sort((a, b) => a.unitPriceMinor - b.unitPriceMinor);
    for (const bucket of cheapestFirst) {
      if (free <= 0) break;
      const take = Math.min(free, bucket.wholeUnits);
      groupDiscount += take * bucket.unitPriceMinor;
      free -= take;
    }

    // Can never exceed what the customer is paying for this product.
    groupDiscount = Math.max(0, Math.min(groupDiscount, group.subtotalMinor));
    if (groupDiscount <= 0) continue;

    discountMinor += groupDiscount;
    affectedLines.push({ productId: group.productId, discountMinor: groupDiscount });
  }

  if (discountMinor <= 0) return INVALID(PROMOTION_REASONS.NOT_ENOUGH_QUANTITY);

  return { valid: true, promotion: summary, discountMinor, affectedLines };
}

/* -------------------------------------------------------------------------- */
/* Database-backed helpers (for this router and for the sales module)          */
/* -------------------------------------------------------------------------- */

export async function findPromotionByCode(
  entityId: string,
  code: string,
  client: Tx = prisma,
): Promise<PromotionRecord | null> {
  const normalised = normaliseCode(code);
  if (!normalised) return null;
  const row = await client.promotion.findFirst({ where: { entityId, code: normalised } });
  return row ? toPromotionRecord(row) : null;
}

/** Loads by code and evaluates in one go. Never throws on a bad code. */
export async function evaluatePromotionCode(
  entityId: string,
  code: string,
  basket: PromotionBasket,
  client: Tx = prisma,
): Promise<PromotionEvaluation> {
  const promotion = await findPromotionByCode(entityId, code, client);
  return evaluatePromotion(promotion, basket);
}

/**
 * Bumps usageCount once a sale carrying the code actually commits. The sales
 * module should call this inside its own transaction. Never throws: a counter
 * is not worth losing a completed sale over.
 */
export async function recordPromotionUsage(
  entityId: string,
  code: string,
  client: Tx = prisma,
): Promise<void> {
  const normalised = normaliseCode(code);
  if (!normalised) return;
  try {
    await client.promotion.updateMany({
      where: { entityId, code: normalised },
      data: { usageCount: { increment: 1 } },
    });
  } catch {
    /* counter drift is acceptable; a failed sale is not */
  }
}

export function normaliseCode(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase();
}
