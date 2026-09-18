import type { BarcodeFormat } from './constants.js';

/**
 * Barcode utilities.
 *
 * The interesting case is the "embedded value" barcode printed by in-store
 * scales: an EAN-13 whose GS1 restricted-distribution prefix (20-29) means the
 * digits are a local item code plus either a WEIGHT or a PRICE. Supermarkets
 * configure these differently, so the layout is a rule the entity owns.
 */

export function digitsOnly(input: string): string {
  return String(input).replace(/\D/g, '');
}

export function normalizeBarcode(input: string): string {
  return String(input).trim().replace(/\s+/g, '');
}

/** GS1 mod-10 check digit for EAN-13 / EAN-8 / UPC-A. */
export function gs1CheckDigit(body: string): number {
  const d = digitsOnly(body);
  let sum = 0;
  // Weights alternate 3,1,3,1... counting from the RIGHT of the body.
  for (let i = 0; i < d.length; i++) {
    const digit = Number(d[d.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  const d = digitsOnly(code);
  if (d.length !== 13) return false;
  return gs1CheckDigit(d.slice(0, 12)) === Number(d[12]);
}

export function isValidEan8(code: string): boolean {
  const d = digitsOnly(code);
  if (d.length !== 8) return false;
  return gs1CheckDigit(d.slice(0, 7)) === Number(d[7]);
}

export function isValidUpcA(code: string): boolean {
  const d = digitsOnly(code);
  if (d.length !== 12) return false;
  return gs1CheckDigit(d.slice(0, 11)) === Number(d[11]);
}

/** Completes a 12-digit body into a valid EAN-13. */
export function makeEan13(body12: string): string {
  const d = digitsOnly(body12).padStart(12, '0').slice(0, 12);
  return d + String(gs1CheckDigit(d));
}

/** UPC-A is an EAN-13 with a leading zero. */
export function upcAToEan13(code: string): string {
  const d = digitsOnly(code);
  return d.length === 12 ? '0' + d : d;
}

export function detectFormat(code: string): BarcodeFormat {
  const raw = normalizeBarcode(code);
  const d = digitsOnly(raw);
  if (d.length === raw.length) {
    if (d.length === 13 && isValidEan13(d)) return 'EAN13';
    if (d.length === 12 && isValidUpcA(d)) return 'UPCA';
    if (d.length === 8 && isValidEan8(d)) return 'EAN8';
  }
  if (/^[0-9A-Z\-.$/+% ]+$/.test(raw)) return 'CODE39';
  return 'CODE128';
}

/* -------------------------------------------------------------------------- */
/* Embedded weight / price barcodes                                            */
/* -------------------------------------------------------------------------- */

export type EmbeddedValueKind =
  /** 5 digits = grams, e.g. 01350 -> 1.350 kg */
  | 'weight_grams'
  /** 5 digits = weight x 1000, same as grams but stated for clarity */
  | 'weight_milli'
  /** digits are the price already in minor units (centimos) */
  | 'price_minor'
  /** digits are the price in major units with 2 implied decimals */
  | 'price_major_2dp';

export interface EmbeddedBarcodeRule {
  id: string;
  label: string;
  /** Leading digits that activate this rule, e.g. ["2"] or ["21","22"]. */
  prefixes: string[];
  /** Zero-based slice of the 13-digit code holding the in-store item code. */
  itemCodeStart: number;
  itemCodeLength: number;
  /** Zero-based slice holding the embedded value. */
  valueStart: number;
  valueLength: number;
  valueKind: EmbeddedValueKind;
  /** Some scales insert their own check digit immediately before the value. */
  enabled?: boolean;
}

/**
 * Sensible defaults for Portuguese / Angolan retail scales.
 *
 *   Weight: 2X IIIII WWWWW C  -> prefix 21/22, 5-digit item, grams
 *   Price:  2X IIIII PPPPP C  -> prefix 20/23, 5-digit item, price in centimos
 *
 * The two-digit prefixes are deliberately disjoint. A single-digit "2" price
 * rule would swallow every 21/22 weight code, since both are valid EAN-13 and
 * the longest prefix only wins when the prefixes differ - a scale printing
 * item 123456 would produce a code starting "21" and be read as a weight.
 * Same geometry, different prefixes, no ambiguity.
 */
export const DEFAULT_EMBEDDED_RULES: EmbeddedBarcodeRule[] = [
  {
    id: 'weight-21',
    label: 'Peso (prefixo 21/22)',
    prefixes: ['21', '22'],
    itemCodeStart: 2,
    itemCodeLength: 5,
    valueStart: 7,
    valueLength: 5,
    valueKind: 'weight_grams',
    enabled: true,
  },
  {
    id: 'price-20',
    label: 'Preco (prefixo 20/23)',
    prefixes: ['20', '23'],
    itemCodeStart: 2,
    itemCodeLength: 5,
    valueStart: 7,
    valueLength: 5,
    valueKind: 'price_minor',
    enabled: true,
  },
];

export interface PlainScan {
  kind: 'plain';
  code: string;
  format: BarcodeFormat;
}

export interface EmbeddedScan {
  kind: 'embedded';
  code: string;
  format: BarcodeFormat;
  rule: string;
  /** The in-store item code (leading zeros stripped, plus the padded form). */
  itemCode: string;
  itemCodePadded: string;
  /** Present when the rule carries a weight. */
  quantity?: number;
  /** Present when the rule carries a price, in minor units. */
  priceMinor?: number;
}

export type ScanResult = PlainScan | EmbeddedScan;

/**
 * Interprets a scanned string. Returns an `embedded` result only when the code
 * is a structurally valid EAN-13 matching an enabled rule; everything else is
 * returned as a plain lookup key.
 */
export function parseScan(
  input: string,
  rules: EmbeddedBarcodeRule[] = DEFAULT_EMBEDDED_RULES,
): ScanResult {
  const raw = normalizeBarcode(input);
  const code = digitsOnly(raw).length === 13 ? digitsOnly(raw) : upcAToEan13(raw);
  const format = detectFormat(code);

  if (code.length !== 13 || !/^\d{13}$/.test(code) || !isValidEan13(code)) {
    return { kind: 'plain', code: raw, format };
  }

  // Longest prefix first so "21" beats "2".
  const candidates = rules
    .filter((r) => r.enabled !== false)
    .flatMap((r) => r.prefixes.map((p) => ({ rule: r, prefix: p })))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  for (const { rule, prefix } of candidates) {
    if (!code.startsWith(prefix)) continue;

    const itemCodePadded = code.slice(rule.itemCodeStart, rule.itemCodeStart + rule.itemCodeLength);
    const valueDigits = code.slice(rule.valueStart, rule.valueStart + rule.valueLength);
    if (itemCodePadded.length !== rule.itemCodeLength || valueDigits.length !== rule.valueLength) {
      continue;
    }

    const value = Number(valueDigits);
    const result: EmbeddedScan = {
      kind: 'embedded',
      code,
      format,
      rule: rule.id,
      itemCode: String(Number(itemCodePadded)),
      itemCodePadded,
    };

    switch (rule.valueKind) {
      case 'weight_grams':
      case 'weight_milli':
        result.quantity = value / 1000;
        break;
      case 'price_minor':
        result.priceMinor = value;
        break;
      case 'price_major_2dp':
        result.priceMinor = value;
        break;
    }
    return result;
  }

  return { kind: 'plain', code, format };
}

/**
 * Builds a scale-style barcode for a weighted product - used by the seed data
 * and by the "print shelf label" helper so the demo is scannable end to end.
 */
export function buildEmbeddedBarcode(
  itemCode: string | number,
  opts: { weightKg?: number; priceMinor?: number },
  rules: EmbeddedBarcodeRule[] = DEFAULT_EMBEDDED_RULES,
): string | null {
  const wantsWeight = opts.weightKg !== undefined;
  const rule = rules.find((r) =>
    wantsWeight
      ? r.valueKind === 'weight_grams' || r.valueKind === 'weight_milli'
      : r.valueKind === 'price_minor' || r.valueKind === 'price_major_2dp',
  );
  if (!rule) return null;

  const prefix = rule.prefixes[0]!;
  const item = String(itemCode).padStart(rule.itemCodeLength, '0').slice(-rule.itemCodeLength);
  const rawValue = wantsWeight ? Math.round((opts.weightKg ?? 0) * 1000) : Math.round(opts.priceMinor ?? 0);
  const value = String(rawValue).padStart(rule.valueLength, '0').slice(-rule.valueLength);

  let body = prefix + item;
  // Pad out whatever sits between the item code and the value slot.
  while (body.length < rule.valueStart) body += '0';
  body = body.slice(0, rule.valueStart) + value;
  body = body.padEnd(12, '0').slice(0, 12);

  return makeEan13(body);
}

/** Generates a stable internal EAN-13 for products with no manufacturer code. */
export function generateInternalBarcode(seq: number): string {
  // Prefix 29 is reserved for in-store use and is not claimed by our scale rules.
  const body = '29' + String(seq).padStart(10, '0').slice(-10);
  return makeEan13(body);
}

/* -------------------------------------------------------------------------- */
/* Hardware scanner detection (HID keyboard-wedge)                             */
/* -------------------------------------------------------------------------- */

export interface ScannerDetectOptions {
  /** Max milliseconds between keystrokes to still count as one burst. */
  maxKeyIntervalMs?: number;
  /** Minimum characters before a burst is treated as a scan. */
  minLength?: number;
}

export const SCANNER_DEFAULTS: Required<ScannerDetectOptions> = {
  maxKeyIntervalMs: 35,
  minLength: 4,
};

/**
 * Decides whether a captured keystroke burst came from a barcode scanner rather
 * than a human. Scanners emit characters far faster than anyone can type.
 */
export function looksLikeScan(
  buffer: string,
  intervalsMs: number[],
  options: ScannerDetectOptions = {},
): boolean {
  const { maxKeyIntervalMs, minLength } = { ...SCANNER_DEFAULTS, ...options };
  if (buffer.length < minLength) return false;
  if (intervalsMs.length === 0) return false;
  const slowest = Math.max(...intervalsMs);
  return slowest <= maxKeyIntervalMs;
}
