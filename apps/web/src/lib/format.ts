import {
  currencyConfig,
  formatBps,
  formatMoney as sharedFormatMoney,
  toMajor,
  UNIT_LABELS,
  type Locale,
  type Unit,
} from '@pos/shared';

/**
 * Presentation helpers. Every one of these takes minor units (centimos) and
 * never does arithmetic - the maths already happened in @pos/shared.
 */

let activeCurrency = 'AOA';
let activeLocale: Locale = 'pt-PT';

/** Called once when the entity loads, so screens can just call money(). */
export function configureFormatting(currency: string, locale: Locale): void {
  activeCurrency = currency || 'AOA';
  activeLocale = locale || 'pt-PT';
}

export function money(minor: number | null | undefined, options: { bare?: boolean; signed?: boolean } = {}): string {
  return sharedFormatMoney(minor ?? 0, {
    currency: activeCurrency,
    locale: activeLocale,
    ...options,
  });
}

/** Number only, for right-aligned monospace columns on the check panel. */
export function amount(minor: number | null | undefined): string {
  return sharedFormatMoney(minor ?? 0, { currency: activeCurrency, locale: activeLocale, bare: true });
}

export function currencySymbol(): string {
  return currencyConfig(activeCurrency).symbol;
}

export function currencyDecimals(): number {
  return currencyConfig(activeCurrency).decimals;
}

export function minorToMajor(minor: number): number {
  return toMajor(minor, activeCurrency);
}

export function percent(bps: number | null | undefined): string {
  return formatBps(bps ?? 0, activeLocale);
}

/** 1.35 -> "1,350 kg" ; 3 -> "3 un" */
export function quantity(value: number, unit: Unit = 'each'): string {
  const fractional = !Number.isInteger(value);
  const formatted = new Intl.NumberFormat(activeLocale, {
    minimumFractionDigits: fractional ? 3 : 0,
    maximumFractionDigits: 3,
  }).format(value);
  return `${formatted} ${UNIT_LABELS[unit]?.short ?? ''}`.trim();
}

export function number(value: number, decimals = 0): string {
  return new Intl.NumberFormat(activeLocale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(activeLocale, { dateStyle: 'short' }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(activeLocale, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(activeLocale, { timeStyle: 'short' }).format(date);
}

export function formatLongDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(activeLocale, { dateStyle: 'full' }).format(date);
}

/** "há 5 min" / "5 min ago" - used by the KDS ticket age and activity feeds. */
export function relativeTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(activeLocale, { numeric: 'auto' });
  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.34524, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];

  let duration = seconds;
  for (const [amountPerUnit, unit] of divisions) {
    if (Math.abs(duration) < amountPerUnit) return formatter.format(Math.round(duration), unit);
    duration /= amountPerUnit;
  }
  return formatter.format(Math.round(duration), 'year');
}

/** "12:34" elapsed - the KDS shows a stopwatch, not a relative phrase. */
export function elapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** +244 923 456 789 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('244') && digits.length === 12) {
    return `+244 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  if (digits.length === 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return phone;
}
