import { describe, expect, it } from 'vitest';
import {
  allocate,
  applyBps,
  computeLine,
  computeSale,
  formatMoney,
  margin,
  parseLocaleNumber,
  splitEvenly,
  suggestTenders,
  toMajor,
  toMinor,
  weightedAverageCost,
} from '@pos/shared';

/**
 * These cover the arithmetic the whole system rests on. A rounding bug here
 * shows up as a till that is a few centimos out at the end of every day.
 */

describe('minor units', () => {
  it('converts major to minor and back without drift', () => {
    expect(toMinor(1234.56)).toBe(123456);
    expect(toMinor('1234,56')).toBe(123456);
    expect(toMinor('1.234,56')).toBe(123456);
    expect(toMinor('1,234.56')).toBe(123456);
    expect(toMajor(123456)).toBeCloseTo(1234.56, 2);
  });

  it('rounds half-up, including negatives', () => {
    expect(toMinor(0.005)).toBe(1);
    expect(toMinor(-0.005)).toBe(-1);
  });

  it('survives the classic float trap', () => {
    // 0.1 + 0.2 in float space is 0.30000000000000004
    expect(toMinor(0.1) + toMinor(0.2)).toBe(toMinor(0.3));
  });

  it('parses both pt-PT and en number formats', () => {
    expect(parseLocaleNumber('1.500,75')).toBeCloseTo(1500.75);
    expect(parseLocaleNumber('1,500.75')).toBeCloseTo(1500.75);
    expect(parseLocaleNumber('  980 ')).toBeCloseTo(980);
    expect(parseLocaleNumber('')).toBe(0);
  });
});

describe('basis points', () => {
  it('applies a rate as an integer operation', () => {
    expect(applyBps(100_000, 1400)).toBe(14_000);
    expect(applyBps(999, 1400)).toBe(140); // 139.86 -> 140
  });
});

describe('computeLine', () => {
  it('splits a tax-inclusive price into net and tax', () => {
    // 1140 centimos inclusive of 14% == 1000 net + 140 tax
    const line = computeLine({
      unitPriceMinor: 1140,
      quantity: 1,
      taxRateBps: 1400,
      pricingMode: 'inclusive',
    });
    expect(line.netMinor).toBe(1000);
    expect(line.taxMinor).toBe(140);
    expect(line.grossMinor).toBe(1140);
  });

  it('adds tax on top of a tax-exclusive price', () => {
    const line = computeLine({
      unitPriceMinor: 1000,
      quantity: 1,
      taxRateBps: 1400,
      pricingMode: 'exclusive',
    });
    expect(line.netMinor).toBe(1000);
    expect(line.taxMinor).toBe(140);
    expect(line.grossMinor).toBe(1140);
  });

  it('prices a weighted line from a fractional quantity', () => {
    // 1.350 kg at 250000 centimos/kg
    const line = computeLine({
      unitPriceMinor: 250_000,
      quantity: 1.35,
      taxRateBps: 0,
      pricingMode: 'inclusive',
    });
    expect(line.subtotalMinor).toBe(337_500);
    expect(line.grossMinor).toBe(337_500);
  });

  it('never discounts below zero', () => {
    const line = computeLine({
      unitPriceMinor: 1000,
      quantity: 1,
      taxRateBps: 0,
      pricingMode: 'inclusive',
      discount: { type: 'fixed', value: 5000 },
    });
    expect(line.discountMinor).toBe(1000);
    expect(line.grossMinor).toBe(0);
  });

  it('applies a percentage discount in basis points', () => {
    const line = computeLine({
      unitPriceMinor: 10_000,
      quantity: 2,
      taxRateBps: 0,
      pricingMode: 'inclusive',
      discount: { type: 'percentage', value: 1000 }, // 10%
    });
    expect(line.discountMinor).toBe(2000);
    expect(line.grossMinor).toBe(18_000);
  });
});

describe('computeSale', () => {
  const lines = [
    { unitPriceMinor: 1140, quantity: 2, taxRateBps: 1400, pricingMode: 'inclusive' as const },
    { unitPriceMinor: 500, quantity: 1, taxRateBps: 0, pricingMode: 'inclusive' as const },
  ];

  it('totals the lines and groups tax by rate', () => {
    const sale = computeSale(lines);
    expect(sale.subtotalMinor).toBe(2780);
    expect(sale.totalMinor).toBe(2780);
    expect(sale.taxBreakdown).toHaveLength(2);
    expect(sale.taxBreakdown.find((b) => b.rateBps === 1400)?.taxMinor).toBe(280);
    expect(sale.taxBreakdown.find((b) => b.rateBps === 0)?.taxMinor).toBe(0);
  });

  it('keeps net + tax equal to the total after an order discount', () => {
    const sale = computeSale(lines, { type: 'percentage', value: 1000 });
    expect(sale.netMinor + sale.taxMinor).toBe(sale.totalMinor);
    expect(sale.orderDiscountMinor).toBe(278);
  });

  it('spreads an order discount without losing a centimo', () => {
    // 3 lines and a discount that does not divide evenly.
    const odd = [
      { unitPriceMinor: 333, quantity: 1, taxRateBps: 0, pricingMode: 'inclusive' as const },
      { unitPriceMinor: 333, quantity: 1, taxRateBps: 0, pricingMode: 'inclusive' as const },
      { unitPriceMinor: 334, quantity: 1, taxRateBps: 0, pricingMode: 'inclusive' as const },
    ];
    const sale = computeSale(odd, { type: 'fixed', value: 100 });
    expect(sale.totalMinor).toBe(900);
  });
});

describe('allocate', () => {
  it('always sums back to the total', () => {
    expect(allocate(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(allocate(1000, [3, 5, 2]).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(allocate(7, [1, 1])).toEqual([4, 3]);
  });

  it('hands the remainder to the largest fractions first', () => {
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it('handles zero weights and zero totals', () => {
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(100, [0, 0])).toEqual([0, 0]);
  });
});

describe('splitEvenly', () => {
  it('splits a bill so the parts add up exactly', () => {
    const parts = splitEvenly(10_001, 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_001);
    expect(parts).toEqual([3334, 3334, 3333]);
  });
});

describe('margin', () => {
  it('computes profit and margin in basis points', () => {
    expect(margin(10_000, 6000)).toEqual({ profitMinor: 4000, marginBps: 4000 });
  });

  it('does not divide by zero on a zero-revenue day', () => {
    expect(margin(0, 500)).toEqual({ profitMinor: -500, marginBps: 0 });
  });
});

describe('weightedAverageCost', () => {
  it('blends the existing cost with the incoming one', () => {
    // 10 units at 100 + 10 units at 200 => 150
    expect(weightedAverageCost(10, 100, 10, 200)).toBe(150);
  });

  it('takes the incoming cost when there is no stock on hand', () => {
    expect(weightedAverageCost(0, 0, 5, 250)).toBe(250);
    expect(weightedAverageCost(-3, 100, 3, 250)).toBe(250);
  });
});

describe('formatMoney', () => {
  it('formats AOA with the symbol after the number', () => {
    const output = formatMoney(123_456, { currency: 'AOA', locale: 'pt-PT' });
    expect(output).toContain('Kz');
    // pt-PT uses a comma for decimals.
    expect(output).toContain('1234,56');
  });

  it('groups thousands the pt-PT way', () => {
    // CLDR gives pt-PT minimumGroupingDigits 2, so grouping starts at 10000 -
    // 1234,56 is correct without a separator, 123 456,78 gets one.
    const output = formatMoney(12_345_678, { currency: 'AOA', locale: 'pt-PT', bare: true });
    expect(output).toMatch(/^123.456,78$/);
  });

  it('can render bare numbers for aligned columns', () => {
    expect(formatMoney(100, { bare: true })).toBe('1,00');
  });

  it('keeps the minus sign in front', () => {
    expect(formatMoney(-100, { bare: true })).toBe('-1,00');
  });
});

describe('suggestTenders', () => {
  it('offers the exact amount first, then sensible round-ups', () => {
    const tenders = suggestTenders(123_400, 'AOA'); // 1234.00 Kz
    expect(tenders[0]).toBe(123_400);
    expect(tenders.every((t) => t >= 123_400)).toBe(true);
    expect(new Set(tenders).size).toBe(tenders.length);
  });
});
