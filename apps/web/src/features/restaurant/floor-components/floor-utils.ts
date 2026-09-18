import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TABLE_STATUS_COLORS,
  type FloorAreaDto,
  type RestaurantTableDto,
  type TableShape,
  type TableStatus,
} from '@pos/shared';

import { ApiRequestError } from '@/lib/api';

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

/** The fallback sits next to the key so a missing translation still reads pt-PT. */
const STATUS_TEXT: Record<TableStatus, { key: string; pt: string }> = {
  available: { key: 'restaurant.available', pt: 'Livre' },
  occupied: { key: 'restaurant.occupied', pt: 'Ocupada' },
  attention: { key: 'restaurant.attention', pt: 'Atencao' },
  reserved: { key: 'restaurant.reserved', pt: 'Reservada' },
  dirty: { key: 'restaurant.dirty', pt: 'Por limpar' },
};

export function useStatusLabels(): Record<TableStatus, string> {
  const { t } = useTranslation();
  return useMemo(() => {
    const entries = Object.entries(STATUS_TEXT) as Array<[TableStatus, { key: string; pt: string }]>;
    const out = {} as Record<TableStatus, string>;
    for (const [status, text] of entries) out[status] = t(text.key, text.pt);
    return out;
  }, [t]);
}

export const SHAPE_LABELS: Record<TableShape, string> = {
  square: 'Quadrada',
  circle: 'Redonda',
  rectangle: 'Rectangular',
};

export function statusColor(status: TableStatus): string {
  return TABLE_STATUS_COLORS[status];
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export function errorMessage(error: unknown, fallback = 'Ocorreu um erro.'): string {
  if (error instanceof ApiRequestError) {
    return error.isOffline ? 'Sem ligacao ao servidor. Tente novamente.' : error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Axis-aligned footprint of a rotated table, in logical units. */
export function boundingBox(rect: Rect): Box {
  const rad = (rect.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const width = rect.width * cos + rect.height * sin;
  const height = rect.width * sin + rect.height * cos;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return {
    left: cx - width / 2,
    top: cy - height / 2,
    right: cx + width / 2,
    bottom: cy + height / 2,
  };
}

/** Tables that merely abut are fine; a real overlap needs more than half a unit. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  const boxA = boundingBox(a);
  const boxB = boundingBox(b);
  const tolerance = 0.5;
  return (
    boxA.left < boxB.right - tolerance &&
    boxB.left < boxA.right - tolerance &&
    boxA.top < boxB.bottom - tolerance &&
    boxB.top < boxA.bottom - tolerance
  );
}

export function collidingIds<T extends Rect & { id: string }>(tables: T[]): Set<string> {
  const hits = new Set<string>();
  for (let i = 0; i < tables.length; i += 1) {
    for (let j = i + 1; j < tables.length; j += 1) {
      const a = tables[i]!;
      const b = tables[j]!;
      if (rectsOverlap(a, b)) {
        hits.add(a.id);
        hits.add(b.id);
      }
    }
  }
  return hits;
}

export const GRID = 10;

/** Alt bypasses the grid, and then a tenth of a unit is precise enough. */
export function snap(value: number, enabled: boolean, grid = GRID): number {
  if (!enabled) return Math.round(value * 10) / 10;
  return Math.round(value / grid) * grid;
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Keeps the rotated footprint of a table inside the area bounds. */
export function clampToArea(rect: Rect, area: { width: number; height: number }): { x: number; y: number } {
  const box = boundingBox(rect);
  const spillLeft = rect.x - box.left;
  const spillTop = rect.y - box.top;
  const footprintW = box.right - box.left;
  const footprintH = box.bottom - box.top;
  const maxX = Math.max(area.width - footprintW + spillLeft, spillLeft);
  const maxY = Math.max(area.height - footprintH + spillTop, spillTop);
  return {
    x: clamp(rect.x, spillLeft, maxX),
    y: clamp(rect.y, spillTop, maxY),
  };
}

/* -------------------------------------------------------------------------- */
/* Seats                                                                       */
/* -------------------------------------------------------------------------- */

export interface SeatDot {
  xPct: number;
  yPct: number;
}

const MAX_DOTS = 24;

/**
 * Seat positions as percentages of the table box, so the caller places them
 * with left/top and lets each dot straddle the border.
 */
export function seatPositions(seats: number, shape: TableShape, width: number, height: number): SeatDot[] {
  const count = Math.min(Math.max(Math.floor(seats), 0), MAX_DOTS);
  if (count === 0) return [];

  if (shape === 'circle') {
    return Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      return { xPct: 50 + Math.cos(angle) * 50, yPct: 50 + Math.sin(angle) * 50 };
    });
  }

  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const perimeter = 2 * (w + h);

  return Array.from({ length: count }, (_, index) => {
    let distance = ((index + 0.5) / count) * perimeter;
    if (distance < w) return { xPct: (distance / w) * 100, yPct: 0 };
    distance -= w;
    if (distance < h) return { xPct: 100, yPct: (distance / h) * 100 };
    distance -= h;
    if (distance < w) return { xPct: 100 - (distance / w) * 100, yPct: 100 };
    distance -= w;
    return { xPct: 0, yPct: 100 - (distance / h) * 100 };
  });
}

/* -------------------------------------------------------------------------- */
/* Canvas measurement                                                          */
/* -------------------------------------------------------------------------- */

export interface CanvasScale {
  ref: React.RefObject<HTMLDivElement>;
  /** Logical unit -> CSS pixel. Zero until the container has been measured. */
  scale: number;
  ready: boolean;
}

/**
 * Measures the container and derives one scale factor, so the plan keeps its
 * aspect ratio on any tablet and re-fits when the device is rotated.
 */
export function useCanvasScale(
  area: { width: number; height: number } | null | undefined,
  padding = 16,
): CanvasScale {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = (width: number, height: number) => {
      setSize((current) =>
        Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
          ? current
          : { width, height },
      );
    };

    measure(element.clientWidth, element.clientHeight);

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) measure(rect.width, rect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const width = area?.width ?? 0;
  const height = area?.height ?? 0;

  const scale = useMemo(() => {
    if (!width || !height || size.width <= 0 || size.height <= 0) return 0;
    const usableW = Math.max(size.width - padding * 2, 80);
    const usableH = Math.max(size.height - padding * 2, 80);
    return Math.min(usableW / width, usableH / height);
  }, [width, height, size.width, size.height, padding]);

  return { ref, scale, ready: scale > 0 };
}

/* -------------------------------------------------------------------------- */
/* Live clock                                                                  */
/* -------------------------------------------------------------------------- */

/** Re-renders on a timer so an open table keeps counting through the shift. */
export function useNowTick(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function openSeconds(openedAt: string | null | undefined, now: number): number | null {
  if (!openedAt) return null;
  const started = new Date(openedAt).getTime();
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.round((now - started) / 1000));
}

/* -------------------------------------------------------------------------- */
/* Area helpers                                                                */
/* -------------------------------------------------------------------------- */

export interface AreaTotals {
  free: number;
  occupied: number;
  total: number;
  openTotalMinor: number;
}

export function areaTotals(tables: RestaurantTableDto[]): AreaTotals {
  let free = 0;
  let occupied = 0;
  let openTotalMinor = 0;

  for (const table of tables) {
    if (table.status === 'available') free += 1;
    if (table.status === 'occupied' || table.status === 'attention') occupied += 1;
    openTotalMinor += table.orderTotalMinor ?? 0;
  }

  return { free, occupied, total: tables.length, openTotalMinor };
}

export function findArea(areas: FloorAreaDto[], areaId: string | null): FloorAreaDto | null {
  if (!areas.length) return null;
  return areas.find((area) => area.id === areaId) ?? areas[0]!;
}

/* -------------------------------------------------------------------------- */
/* Viewport                                                                    */
/* -------------------------------------------------------------------------- */

/** Matches a media query, so a tablet in portrait can move a panel out of the way. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', listener);
    return () => list.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
