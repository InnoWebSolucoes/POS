import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Waits for the user to stop typing before firing - used by every search box. */
export function debounce<T extends (...args: never[]) => void>(fn: T, ms = 250): T & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...(args as never[])), ms);
  }) as T & { cancel(): void };
  wrapped.cancel = () => timer && clearTimeout(timer);
  return wrapped;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stable client-side key for cart lines that do not exist server-side yet. */
export function uid(prefix = 'k'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function initials(name: string, max = 2): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Deterministic colour for a label, so a category without an explicit colour
 * still gets a stable tile rather than a different one on every render.
 */
const TILE_PALETTE = [
  '#EF5B5B',
  '#F2814B',
  '#A8213C',
  '#16A34A',
  '#E0364A',
  '#2F80ED',
  '#D6499B',
  '#0E9F9F',
  '#7C4DFF',
  '#5B6B7C',
];

export function colorForLabel(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash << 5) - hash + label.charCodeAt(i);
    hash |= 0;
  }
  return TILE_PALETTE[Math.abs(hash) % TILE_PALETTE.length]!;
}

/** Picks black or white text so a coloured tile stays readable. */
export function contrastText(hex: string): '#000000' | '#FFFFFF' {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Rec. 709 relative luminance.
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
}

/** "#006AFF" -> "215 100% 50%" for the CSS custom properties. */
export function hexToHsl(hex: string): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function groupBy<T, K extends string | number>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}
