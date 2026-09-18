import type { PromotionType } from '@pos/shared';
import { isRunning, parseProductIds, toPromotionRecord, type PromotionRow } from './service.js';

/**
 * Wire shape for a promotion. @pos/shared/types.ts carries no PromotionDto yet,
 * so this is the module's own contract - it mirrors the house style: BigInt ->
 * Number, dates -> ISO strings, JSON columns -> real arrays.
 */
export interface PromotionDto {
  id: string;
  code: string;
  namePt: string;
  nameEn: string | null;
  type: PromotionType;
  /** Basis points for percent_off, minor units for fixed_off. */
  value: number;
  categoryId: string | null;
  categoryName: string | null;
  productIds: string[];
  buyQuantity: number | null;
  getQuantity: number | null;
  minSpendMinor: number;
  usageLimit: number | null;
  usageCount: number;
  usageRemaining: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  /** Active, inside its window and under its usage limit, right now. */
  running: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PromotionRowWithRelations = PromotionRow & {
  createdAt: Date;
  updatedAt: Date;
  category?: { id: string; namePt: string } | null;
};

export function toPromotionDto(row: PromotionRowWithRelations, now: Date = new Date()): PromotionDto {
  const usageLimit = row.usageLimit;
  return {
    id: row.id,
    code: row.code,
    namePt: row.namePt,
    nameEn: row.nameEn,
    type: row.type as PromotionType,
    value: Number(row.value),
    categoryId: row.categoryId,
    categoryName: row.category?.namePt ?? null,
    productIds: parseProductIds(row.productIds),
    buyQuantity: row.buyQuantity,
    getQuantity: row.getQuantity,
    minSpendMinor: Number(row.minSpendMinor),
    usageLimit,
    usageCount: row.usageCount,
    usageRemaining: usageLimit === null ? null : Math.max(0, usageLimit - row.usageCount),
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    active: row.active,
    running: isRunning(toPromotionRecord(row), now),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
