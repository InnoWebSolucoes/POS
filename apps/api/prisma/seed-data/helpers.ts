import { randomUUID } from 'node:crypto';
import {
  allocate,
  computeLine,
  computeLineDiscount,
  computeSale,
  type LineDiscount,
  type LineInput,
  type LineTotals,
} from '@pos/shared';

export const id = (): string => randomUUID();

/** Kwanza -> centimos. Every price in this seed is written in whole Kwanza. */
export function kz(amount: number): number {
  return Math.round(amount * 100);
}

/** Money always lands in the database as BigInt minor units. */
export function money(minor: number): bigint {
  return BigInt(Math.round(minor));
}

/** Quantities are Float and may be fractional - three decimals is the limit. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function daysAgo(days: number, now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

export function atTime(day: Date, hour: number, minute: number, second = 0): Date {
  const d = new Date(day);
  d.setHours(hour, minute, second, 0);
  return d;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** `FR2026/000123`, the exact shape lib/sequence.ts mints at runtime. */
export function documentNumber(prefix: string, year: number, value: number, padding = 6): string {
  return `${prefix}${year}/${String(value).padStart(padding, '0')}`;
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "Coca-Cola Lata" -> "CC" ; used for the placeholder tile images. */
export function initials(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[\s/-]+/)
    .filter((w) => /[A-Za-z0-9]/.test(w));
  if (words.length === 0) return '??';
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase();
  return ((words[0] as string)[0] + (words[1] as string)[0]).toUpperCase();
}

/* -------------------------------------------------------------------------- */
/* Sale maths                                                                  */
/* -------------------------------------------------------------------------- */

export interface SeedSaleTotals {
  /** Per line, after the order-level discount has been spread across them. */
  lines: LineTotals[];
  subtotalMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxBreakdown: Array<{ rateBps: number; netMinor: number; taxMinor: number }>;
}

/**
 * computeSale() returns the header but not the per-line figures that fall out of
 * spreading an order discount. SaleLine rows have to add up to the header, so
 * this mirrors the same largest-remainder allocation and then asserts the two
 * agree - if they ever drift, the seed fails loudly rather than shipping a demo
 * whose receipts do not balance.
 */
export function computeSeedSale(
  lines: LineInput[],
  orderDiscount?: LineDiscount | null,
): SeedSaleTotals {
  const first = lines.map(computeLine);
  const afterLineDiscount = first.reduce((sum, l) => sum + (l.subtotalMinor - l.discountMinor), 0);
  const orderDiscountMinor = computeLineDiscount(afterLineDiscount, orderDiscount ?? null);
  const spread = allocate(
    orderDiscountMinor,
    first.map((l) => l.subtotalMinor - l.discountMinor),
  );

  const finals = lines.map((line, i) =>
    computeLine({
      ...line,
      discount: { type: 'fixed', value: (first[i] as LineTotals).discountMinor + (spread[i] ?? 0) },
    }),
  );

  const byRate = new Map<number, { netMinor: number; taxMinor: number }>();
  finals.forEach((line, i) => {
    const rate = (lines[i] as LineInput).taxRateBps;
    const bucket = byRate.get(rate) ?? { netMinor: 0, taxMinor: 0 };
    bucket.netMinor += line.netMinor;
    bucket.taxMinor += line.taxMinor;
    byRate.set(rate, bucket);
  });

  const totals: SeedSaleTotals = {
    lines: finals,
    subtotalMinor: finals.reduce((s, l) => s + l.subtotalMinor, 0),
    discountMinor: finals.reduce((s, l) => s + l.discountMinor, 0),
    netMinor: finals.reduce((s, l) => s + l.netMinor, 0),
    taxMinor: finals.reduce((s, l) => s + l.taxMinor, 0),
    totalMinor: finals.reduce((s, l) => s + l.grossMinor, 0),
    taxBreakdown: [...byRate.entries()]
      .map(([rateBps, v]) => ({ rateBps, ...v }))
      .sort((a, b) => a.rateBps - b.rateBps),
  };

  const reference = computeSale(lines, orderDiscount ?? null);
  if (
    reference.totalMinor !== totals.totalMinor ||
    reference.taxMinor !== totals.taxMinor ||
    reference.netMinor !== totals.netMinor
  ) {
    throw new Error(
      `Totais da venda inconsistentes: computeSale=${reference.totalMinor} linhas=${totals.totalMinor}`,
    );
  }
  return totals;
}
