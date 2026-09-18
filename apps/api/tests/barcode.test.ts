import { describe, expect, it } from 'vitest';
import {
  buildEmbeddedBarcode,
  DEFAULT_EMBEDDED_RULES,
  detectFormat,
  generateInternalBarcode,
  gs1CheckDigit,
  isValidEan13,
  looksLikeScan,
  makeEan13,
  parseScan,
  upcAToEan13,
} from '@pos/shared';

describe('EAN-13 check digits', () => {
  it('matches known-good real barcodes', () => {
    // A few well-known EAN-13 codes.
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('5901234123457')).toBe(true);
  });

  it('rejects a transposed digit', () => {
    expect(isValidEan13('4006381333913')).toBe(false);
  });

  it('completes a 12-digit body', () => {
    expect(makeEan13('400638133393')).toBe('4006381333931');
    expect(gs1CheckDigit('590123412345')).toBe(7);
  });

  it('promotes UPC-A to EAN-13 by prefixing a zero', () => {
    expect(upcAToEan13('036000291452')).toBe('0036000291452');
  });

  it('generates valid internal codes', () => {
    for (let i = 1; i < 50; i++) {
      const code = generateInternalBarcode(i);
      expect(code).toHaveLength(13);
      expect(isValidEan13(code)).toBe(true);
      // Prefix 29 must not collide with the scale rules (20, 21, 22, 23).
      expect(code.startsWith('29')).toBe(true);
    }
  });
});

describe('detectFormat', () => {
  it('identifies the common retail formats', () => {
    expect(detectFormat('4006381333931')).toBe('EAN13');
    expect(detectFormat('036000291452')).toBe('UPCA');
    expect(detectFormat('ABC-123/XYZ')).toBe('CODE39');
  });
});

describe('parseScan - plain codes', () => {
  it('passes an ordinary product barcode straight through', () => {
    const result = parseScan('4006381333931');
    expect(result.kind).toBe('plain');
    expect(result.code).toBe('4006381333931');
  });

  it('does not choke on a non-numeric code', () => {
    const result = parseScan('SKU-ABC-001');
    expect(result.kind).toBe('plain');
    expect(result.code).toBe('SKU-ABC-001');
  });
});

describe('parseScan - scale barcodes', () => {
  it('reads an embedded weight from a prefix-21 code', () => {
    // item 12345, 1.350 kg
    const code = buildEmbeddedBarcode(12_345, { weightKg: 1.35 });
    expect(code).not.toBeNull();
    expect(isValidEan13(code!)).toBe(true);

    const result = parseScan(code!);
    expect(result.kind).toBe('embedded');
    if (result.kind !== 'embedded') return;
    expect(result.itemCode).toBe('12345');
    expect(result.quantity).toBeCloseTo(1.35, 3);
    expect(result.priceMinor).toBeUndefined();
  });

  it('reads an embedded price from a prefix-20 code', () => {
    const code = buildEmbeddedBarcode(12_345, { priceMinor: 87_650 });
    expect(code).not.toBeNull();

    const result = parseScan(code!);
    expect(result.kind).toBe('embedded');
    if (result.kind !== 'embedded') return;
    expect(result.itemCode).toBe('12345');
    expect(result.priceMinor).toBe(87_650);
    expect(result.quantity).toBeUndefined();
  });

  it('keeps the weight and price rules disjoint', () => {
    // The same item number encoded both ways must resolve to different rules,
    // never to whichever one happened to be checked first.
    const weightCode = buildEmbeddedBarcode(12_345, { weightKg: 0.5 })!;
    const priceCode = buildEmbeddedBarcode(12_345, { priceMinor: 50_000 })!;

    const weight = parseScan(weightCode);
    const price = parseScan(priceCode);
    if (weight.kind !== 'embedded' || price.kind !== 'embedded') {
      throw new Error('expected two embedded scans');
    }
    expect(weight.rule).toBe('weight-21');
    expect(price.rule).toBe('price-20');
    expect(weight.quantity).toBeCloseTo(0.5, 3);
    expect(price.priceMinor).toBe(50_000);
    expect(weightCode).not.toBe(priceCode);
  });

  it('treats an invalid check digit as a plain code, not a weight', () => {
    const code = buildEmbeddedBarcode(12_345, { weightKg: 1.35 })!;
    const corrupted = code.slice(0, 12) + (Number(code[12]) === 9 ? '0' : '9');
    expect(parseScan(corrupted).kind).toBe('plain');
  });

  it('ignores rules that have been disabled in settings', () => {
    const code = buildEmbeddedBarcode(12_345, { weightKg: 1.35 })!;
    const disabled = DEFAULT_EMBEDDED_RULES.map((rule) => ({ ...rule, enabled: false }));
    expect(parseScan(code, disabled).kind).toBe('plain');
  });
});

describe('looksLikeScan', () => {
  it('accepts a fast machine-gun burst', () => {
    const intervals = new Array(12).fill(12);
    expect(looksLikeScan('400638133393', intervals)).toBe(true);
  });

  it('rejects human typing', () => {
    const intervals = [90, 120, 70, 200, 110, 95];
    expect(looksLikeScan('4006381', intervals)).toBe(false);
  });

  it('rejects a burst that is too short to be a barcode', () => {
    expect(looksLikeScan('12', [10])).toBe(false);
  });

  it('rejects a burst with one slow keystroke in the middle', () => {
    expect(looksLikeScan('4006381333931', [10, 10, 10, 400, 10, 10])).toBe(false);
  });
});
