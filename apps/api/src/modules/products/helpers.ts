import { FRACTIONAL_UNITS, type ProductType, type Unit } from '@pos/shared';
import { ApiError } from '../../lib/http.js';

/**
 * Small pure helpers for the catalogue module. Nothing here touches the
 * database so it can be reasoned about (and unit tested) on its own.
 */

/** Safely reads a JSON string column that should hold an array of strings. */
export function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => String(value).trim()).filter((value) => value.length > 0);
  } catch {
    return [];
  }
}

/** Safely reads a JSON string column holding { "Tamanho": "M", "Cor": "Preto" }. */
export function parseOptions(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      out[key] = String(value);
    }
    return out;
  } catch {
    return {};
  }
}

/** BigInt or number column -> plain number. Money never leaves as BigInt. */
export function minorToNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/** number -> BigInt for a *Minor column. Always integral. */
export function toMinorColumn(value: number): bigint {
  return BigInt(Math.round(value));
}

export function isFractionalUnit(unit: string): boolean {
  return (FRACTIONAL_UNITS as readonly string[]).includes(unit);
}

/** "Branco / Preto" -> "BRANCOPRETO" (accents folded, non-alphanumerics dropped). */
export function skuSegment(value: string): string {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

/**
 * SQLite has no case-insensitive `contains`, so instead of one clever query we
 * probe the handful of casings a human actually types.
 */
export function searchTerms(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  const title = lower.replace(/(^|\s)(\S)/g, (_match, lead: string, first: string) => lead + first.toUpperCase());
  return uniqueStrings([trimmed, lower, upper, title]);
}

export interface VariantAxis {
  name: string;
  values: string[];
}

/** Cartesian product of the axes, preserving axis order in every combination. */
export function cartesian(axes: VariantAxis[]): Record<string, string>[] {
  let combos: Record<string, string>[] = [{}];
  for (const axis of axes) {
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const value of axis.values) {
        next.push({ ...combo, [axis.name]: value });
      }
    }
    combos = next;
  }
  return combos;
}

/** Order-independent fingerprint, so "S/Branco" and "Branco/S" are one combo. */
export function optionsKey(options: Record<string, string>): string {
  return Object.keys(options)
    .sort()
    .map((key) => `${key.trim().toLowerCase()}=${String(options[key] ?? '').trim().toLowerCase()}`)
    .join('|');
}

/**
 * Cross-field rules every write has to satisfy. Called with the MERGED values
 * (existing row + patch) so PATCH cannot sneak an invalid combination in.
 */
export function assertProductRules(input: {
  type: ProductType;
  unit: Unit;
  componentCount: number;
}): void {
  if (input.type === 'weighted' && !isFractionalUnit(input.unit)) {
    throw ApiError.unprocessable(
      'Um produto pesado tem de usar uma unidade fraccionada (kg, g, litro, ml ou metro).',
      { unit: ['Unidade invalida para um produto pesado.'] },
    );
  }
  if (input.type === 'composite' && input.componentCount < 1) {
    throw ApiError.unprocessable('Um produto composto tem de ter pelo menos um componente na receita.', {
      components: ['A receita nao pode estar vazia.'],
    });
  }
}

/** Services never hold stock, whatever the client asked for. */
export function resolveTrackStock(type: ProductType, requested: boolean | undefined, fallback: boolean): boolean {
  if (type === 'service') return false;
  return requested ?? fallback;
}
