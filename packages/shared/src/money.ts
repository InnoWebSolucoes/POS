/**
 * Money handling.
 *
 * RULE: every monetary amount in this system is an INTEGER in the smallest
 * currency unit (centimos for AOA/EUR, cents for USD). Never a float. The
 * database stores BigInt, the API serialises to Number (safe to 9e15 minor
 * units) and the UI formats at the very last moment.
 *
 * Tax rates and percentage discounts are integers in BASIS POINTS
 * (1 bps = 0.01%), so IVA 14% is 1400 bps. This keeps every intermediate
 * calculation in integer space.
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
  decimals: number;
  /** Where the symbol sits relative to the number. */
  symbolPosition: 'prefix' | 'suffix';
  name: { pt: string; en: string };
}

export const CURRENCIES: Record<string, CurrencyConfig> = {
  AOA: {
    code: 'AOA',
    symbol: 'Kz',
    decimals: 2,
    symbolPosition: 'suffix',
    name: { pt: 'Kwanza Angolano', en: 'Angolan Kwanza' },
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    decimals: 2,
    symbolPosition: 'suffix',
    name: { pt: 'Euro', en: 'Euro' },
  },
  USD: {
    code: 'USD',
    symbol: '$',
    decimals: 2,
    symbolPosition: 'prefix',
    name: { pt: 'Dolar Americano', en: 'US Dollar' },
  },
  BRL: {
    code: 'BRL',
    symbol: 'R$',
    decimals: 2,
    symbolPosition: 'prefix',
    name: { pt: 'Real Brasileiro', en: 'Brazilian Real' },
  },
  MZN: {
    code: 'MZN',
    symbol: 'MT',
    decimals: 2,
    symbolPosition: 'suffix',
    name: { pt: 'Metical Mocambicano', en: 'Mozambican Metical' },
  },
  CVE: {
    code: 'CVE',
    symbol: '$',
    decimals: 2,
    symbolPosition: 'suffix',
    name: { pt: 'Escudo Cabo-verdiano', en: 'Cape Verdean Escudo' },
  },
  STN: {
    code: 'STN',
    symbol: 'Db',
    decimals: 2,
    symbolPosition: 'suffix',
    name: { pt: 'Dobra', en: 'Dobra' },
  },
};

export const DEFAULT_CURRENCY = 'AOA';

export function currencyConfig(code: string | undefined | null): CurrencyConfig {
  if (!code) return CURRENCIES[DEFAULT_CURRENCY]!;
  return CURRENCIES[code.toUpperCase()] ?? CURRENCIES[DEFAULT_CURRENCY]!;
}

/** Banker-safe half-up rounding for positive and negative values alike. */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** "1234.56" or 1234.56 -> 123456 minor units. */
export function toMinor(major: number | string, currency = DEFAULT_CURRENCY): number {
  const { decimals } = currencyConfig(currency);
  const n = typeof major === 'string' ? parseLocaleNumber(major) : major;
  if (!Number.isFinite(n)) return 0;
  return roundHalfUp(n * 10 ** decimals);
}

/** 123456 minor units -> 1234.56 */
export function toMajor(minor: number | bigint, currency = DEFAULT_CURRENCY): number {
  const { decimals } = currencyConfig(currency);
  return Number(minor) / 10 ** decimals;
}

/** Accepts both "1.234,56" (pt-PT) and "1,234.56" (en). */
export function parseLocaleNumber(input: string): number {
  const raw = String(input).trim().replace(/\s| /g, '');
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalised: string;
  if (lastComma > lastDot) {
    // comma is the decimal separator
    normalised = raw.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalised = raw.replace(/,/g, '');
  } else {
    normalised = raw.replace(/[.,]/g, '');
  }
  const n = Number(normalised.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export interface FormatMoneyOptions {
  currency?: string;
  locale?: string;
  /** Omit the currency symbol (useful for right-aligned numeric columns). */
  bare?: boolean;
  /** Always show a leading +/-. */
  signed?: boolean;
}

/** Formats minor units for display, e.g. 123456 -> "1 234,56 Kz". */
export function formatMoney(minor: number | bigint | null | undefined, options: FormatMoneyOptions = {}): string {
  const { currency = DEFAULT_CURRENCY, locale = 'pt-PT', bare = false, signed = false } = options;
  const cfg = currencyConfig(currency);
  const value = toMajor(minor ?? 0, cfg.code);
  const abs = Math.abs(value);

  let body: string;
  try {
    body = new Intl.NumberFormat(locale, {
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals,
    }).format(abs);
  } catch {
    body = abs.toFixed(cfg.decimals);
  }

  const sign = value < 0 ? '-' : signed && value > 0 ? '+' : '';
  if (bare) return sign + body;
  return cfg.symbolPosition === 'prefix'
    ? `${sign}${cfg.symbol} ${body}`
    : `${sign}${body} ${cfg.symbol}`;
}

/** 1400 -> "14%" ; 1450 -> "14,5%" */
export function formatBps(bps: number, locale = 'pt-PT'): string {
  const pct = bps / 100;
  const s = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(pct);
  return `${s}%`;
}

export function pctToBps(pct: number): number {
  return roundHalfUp(pct * 100);
}

export function bpsToPct(bps: number): number {
  return bps / 100;
}

/** Applies a basis-point rate to an integer amount, rounding half-up. */
export function applyBps(amountMinor: number, bps: number): number {
  return roundHalfUp((amountMinor * bps) / 10_000);
}

/* -------------------------------------------------------------------------- */
/* Line-level maths                                                            */
/* -------------------------------------------------------------------------- */

export interface LineDiscount {
  type: 'percentage' | 'fixed';
  /** basis points when type is percentage, minor units when type is fixed */
  value: number;
}

export interface LineInput {
  /** Unit price in minor units (meaning depends on pricingMode). */
  unitPriceMinor: number;
  /** Discrete count, or weight/volume for fractional units (e.g. 1.35 kg). */
  quantity: number;
  /** Tax rate in basis points, e.g. 1400 for IVA 14%. */
  taxRateBps: number;
  pricingMode: 'inclusive' | 'exclusive';
  discount?: LineDiscount | null;
}

export interface LineTotals {
  /** unitPrice * quantity, before any discount. */
  subtotalMinor: number;
  discountMinor: number;
  /** Amount excluding tax, after discount. */
  netMinor: number;
  taxMinor: number;
  /** Amount the customer actually pays for this line. */
  grossMinor: number;
}

export function computeLineDiscount(subtotalMinor: number, discount?: LineDiscount | null): number {
  if (!discount || !discount.value) return 0;
  const raw = discount.type === 'percentage' ? applyBps(subtotalMinor, discount.value) : discount.value;
  return Math.max(0, Math.min(raw, subtotalMinor));
}

export function computeLine(input: LineInput): LineTotals {
  const { unitPriceMinor, quantity, taxRateBps, pricingMode, discount } = input;

  // Quantity may be fractional (1.35 kg); the product of an integer price and a
  // fractional quantity is rounded to the nearest minor unit immediately so that
  // everything downstream stays in integer space.
  const subtotalMinor = roundHalfUp(unitPriceMinor * quantity);
  const discountMinor = computeLineDiscount(subtotalMinor, discount);
  const afterDiscount = subtotalMinor - discountMinor;

  let netMinor: number;
  let taxMinor: number;
  let grossMinor: number;

  if (pricingMode === 'inclusive') {
    grossMinor = afterDiscount;
    netMinor = roundHalfUp((afterDiscount * 10_000) / (10_000 + taxRateBps));
    taxMinor = grossMinor - netMinor;
  } else {
    netMinor = afterDiscount;
    taxMinor = applyBps(netMinor, taxRateBps);
    grossMinor = netMinor + taxMinor;
  }

  return { subtotalMinor, discountMinor, netMinor, taxMinor, grossMinor };
}

export interface SaleTotals {
  subtotalMinor: number;
  lineDiscountMinor: number;
  orderDiscountMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxBreakdown: Array<{ rateBps: number; netMinor: number; taxMinor: number }>;
}

/**
 * Rolls lines up into a sale total. An order-level discount is spread across the
 * lines proportionally (largest-remainder) so the tax breakdown stays exact.
 */
export function computeSale(
  lines: LineInput[],
  orderDiscount?: LineDiscount | null,
): SaleTotals {
  const computed = lines.map(computeLine);
  const subtotalMinor = computed.reduce((s, l) => s + l.subtotalMinor, 0);
  const lineDiscountMinor = computed.reduce((s, l) => s + l.discountMinor, 0);
  const afterLineDiscount = computed.reduce((s, l) => s + (l.subtotalMinor - l.discountMinor), 0);

  const orderDiscountMinor = computeLineDiscount(afterLineDiscount, orderDiscount);

  // Spread the order discount across lines in proportion to their value.
  const weights = computed.map((l) => l.subtotalMinor - l.discountMinor);
  const spread = allocate(orderDiscountMinor, weights);

  const byRate = new Map<number, { netMinor: number; taxMinor: number }>();
  let netMinor = 0;
  let taxMinor = 0;
  let totalMinor = 0;

  computed.forEach((line, i) => {
    const source = lines[i]!;
    const extraDiscount = spread[i] ?? 0;
    const recomputed = computeLine({
      ...source,
      discount: {
        type: 'fixed',
        value: line.discountMinor + extraDiscount,
      },
    });
    netMinor += recomputed.netMinor;
    taxMinor += recomputed.taxMinor;
    totalMinor += recomputed.grossMinor;

    const bucket = byRate.get(source.taxRateBps) ?? { netMinor: 0, taxMinor: 0 };
    bucket.netMinor += recomputed.netMinor;
    bucket.taxMinor += recomputed.taxMinor;
    byRate.set(source.taxRateBps, bucket);
  });

  return {
    subtotalMinor,
    lineDiscountMinor,
    orderDiscountMinor,
    discountMinor: lineDiscountMinor + orderDiscountMinor,
    netMinor,
    taxMinor,
    totalMinor,
    taxBreakdown: [...byRate.entries()]
      .map(([rateBps, v]) => ({ rateBps, ...v }))
      .sort((a, b) => a.rateBps - b.rateBps),
  };
}

/**
 * Splits `total` into `weights.length` integer parts proportional to weights,
 * with the remainder handed out largest-remainder-first. The parts always sum
 * back to exactly `total` - no lost or invented centimos.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || !total) return weights.map(() => 0);

  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = total - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  let k = 0;
  while (remainder > 0 && order.length) {
    result[order[k % order.length]!.i]! += 1;
    remainder -= 1;
    k += 1;
  }
  return result;
}

/** Splits a bill evenly between n people, remainder going to the first payers. */
export function splitEvenly(totalMinor: number, people: number): number[] {
  if (people <= 0) return [];
  return allocate(totalMinor, new Array(people).fill(1));
}

/** Gross profit and margin, guarding against divide-by-zero. */
export function margin(revenueMinor: number, cogsMinor: number): { profitMinor: number; marginBps: number } {
  const profitMinor = revenueMinor - cogsMinor;
  const marginBps = revenueMinor === 0 ? 0 : roundHalfUp((profitMinor / revenueMinor) * 10_000);
  return { profitMinor, marginBps };
}

/**
 * New weighted-average cost after receiving stock.
 * Returns the unit cost in minor units.
 */
export function weightedAverageCost(
  currentQty: number,
  currentUnitCostMinor: number,
  incomingQty: number,
  incomingUnitCostMinor: number,
): number {
  const totalQty = currentQty + incomingQty;
  if (totalQty <= 0) return incomingUnitCostMinor;
  const totalValue = currentQty * currentUnitCostMinor + incomingQty * incomingUnitCostMinor;
  return roundHalfUp(totalValue / totalQty);
}

/** Cash denominations in circulation in Angola, for quick-tender buttons. */
export const CASH_DENOMINATIONS: Record<string, number[]> = {
  AOA: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
  EUR: [5, 10, 20, 50, 100, 200],
  USD: [1, 5, 10, 20, 50, 100],
};

/** Suggests tender buttons: exact amount, then sensible round-ups. */
export function suggestTenders(totalMinor: number, currency = DEFAULT_CURRENCY): number[] {
  const cfg = currencyConfig(currency);
  const notes = (CASH_DENOMINATIONS[cfg.code] ?? CASH_DENOMINATIONS.AOA!).map(
    (n) => n * 10 ** cfg.decimals,
  );
  const out = new Set<number>([totalMinor]);

  for (const note of notes) {
    if (note >= totalMinor) out.add(note);
    const rounded = Math.ceil(totalMinor / note) * note;
    if (rounded !== totalMinor) out.add(rounded);
  }
  return [...out].sort((a, b) => a - b).slice(0, 6);
}
