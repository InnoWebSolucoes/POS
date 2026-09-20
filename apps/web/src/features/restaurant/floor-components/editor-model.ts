import { useCallback, useRef, useState } from 'react';
import type { RestaurantTableDto, TableShape, TableStatus } from '@pos/shared';

import { GRID, clamp, rectsOverlap, snap } from './floor-utils';

/* -------------------------------------------------------------------------- */
/* The editable table                                                          */
/* -------------------------------------------------------------------------- */

export interface EditorTable {
  id: string;
  areaId: string;
  name: string;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  seats: number;
  status: TableStatus;
  activeOrderId: string | null;
}

/** Limits mirrored from the API schema, so the editor never sends a 422. */
export const LIMITS = {
  minSize: 10,
  maxSize: 4000,
  minSeats: 0,
  maxSeats: 60,
  maxCoord: 10_000,
} as const;

export function toEditorTable(table: RestaurantTableDto): EditorTable {
  return {
    id: table.id,
    areaId: table.areaId,
    name: table.name,
    shape: table.shape,
    x: table.x,
    y: table.y,
    width: table.width,
    height: table.height,
    rotation: table.rotation,
    seats: table.seats,
    status: table.status,
    activeOrderId: table.activeOrderId,
  };
}

const round = (value: number): number => Math.round(value * 10) / 10;

export function normalizeTable(table: EditorTable): EditorTable {
  return {
    ...table,
    name: table.name.trim(),
    x: round(clamp(table.x, -LIMITS.maxCoord, LIMITS.maxCoord)),
    y: round(clamp(table.y, -LIMITS.maxCoord, LIMITS.maxCoord)),
    width: round(clamp(table.width, LIMITS.minSize, LIMITS.maxSize)),
    height: round(clamp(table.height, LIMITS.minSize, LIMITS.maxSize)),
    rotation: round(clamp(table.rotation, -360, 360)),
    seats: Math.round(clamp(table.seats, LIMITS.minSeats, LIMITS.maxSeats)),
  };
}

/** What changed against the last saved snapshot - the layout call's payload. */
export interface LayoutRow {
  id: string;
  areaId: string;
  name: string;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  seats: number;
}

function sameGeometry(a: EditorTable, b: EditorTable): boolean {
  return (
    a.areaId === b.areaId &&
    a.name === b.name &&
    a.shape === b.shape &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.rotation === b.rotation &&
    a.seats === b.seats
  );
}

export function changedRows(tables: EditorTable[], baseline: Map<string, EditorTable>): LayoutRow[] {
  const rows: LayoutRow[] = [];
  for (const table of tables) {
    const original = baseline.get(table.id);
    if (original && sameGeometry(original, table)) continue;
    const safe = normalizeTable(table);
    rows.push({
      id: safe.id,
      areaId: safe.areaId,
      name: safe.name,
      shape: safe.shape,
      x: safe.x,
      y: safe.y,
      width: safe.width,
      height: safe.height,
      rotation: safe.rotation,
      seats: safe.seats,
    });
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/* New tables                                                                  */
/* -------------------------------------------------------------------------- */

export const SHAPE_DEFAULTS: Record<TableShape, { width: number; height: number; seats: number }> = {
  square: { width: 80, height: 80, seats: 4 },
  circle: { width: 90, height: 90, seats: 4 },
  rectangle: { width: 140, height: 80, seats: 6 },
};

/** "Mesa 12" - the next free number across the whole entity. */
export function nextTableName(tables: Array<{ name: string }>): string {
  let highest = 0;
  for (const table of tables) {
    const match = /(\d+)\s*$/.exec(table.name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  const used = new Set(tables.map((table) => table.name.toLowerCase()));
  let candidate = highest + 1;
  while (used.has(`mesa ${candidate}`)) candidate += 1;
  return `Mesa ${candidate}`;
}

/** Finds a free spot near the middle of the area for a table being added. */
export function placeNewTable(
  size: { width: number; height: number },
  tables: EditorTable[],
  area: { width: number; height: number },
): { x: number; y: number } {
  const startX = snap(Math.max((area.width - size.width) / 2, 0), true);
  const startY = snap(Math.max((area.height - size.height) / 2, 0), true);

  for (let step = 0; step < 60; step += 1) {
    const offset = step * (GRID * 2);
    const x = clamp(startX + offset, 0, Math.max(area.width - size.width, 0));
    const y = clamp(startY + offset, 0, Math.max(area.height - size.height, 0));
    const candidate = { x, y, width: size.width, height: size.height, rotation: 0 };
    const clash = tables.some((table) => rectsOverlap(candidate, table));
    if (!clash) return { x, y };
  }

  return { x: startX, y: startY };
}

/* -------------------------------------------------------------------------- */
/* Undo / redo                                                                 */
/* -------------------------------------------------------------------------- */

const HISTORY_LIMIT = 60;

export interface HistoryApi<T> {
  state: T;
  /** Live change during a drag - does not touch the undo stack. */
  set: (updater: (current: T) => T) => void;
  /** A discrete change: pushes the current value onto the undo stack first. */
  commit: (updater: (current: T) => T) => void;
  /** Remember the value before a gesture starts. */
  begin: () => void;
  /** Close the gesture: the remembered value becomes an undo step. */
  end: () => void;
  /**
   * Applies a change the server has already committed to the whole timeline -
   * past, present and future alike. A create or a delete is not undoable, so it
   * must not be possible to step back to a moment before it happened.
   */
  rebase: (updater: (value: T) => T) => void;
  undo: () => void;
  redo: () => void;
  reset: (value: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: T): HistoryApi<T> {
  const [stack, setStack] = useState<{ past: T[]; present: T; future: T[] }>({
    past: [],
    present: initial,
    future: [],
  });
  const pending = useRef<T | null>(null);

  const set = useCallback((updater: (current: T) => T) => {
    setStack((current) => ({ ...current, present: updater(current.present) }));
  }, []);

  const commit = useCallback((updater: (current: T) => T) => {
    setStack((current) => {
      const next = updater(current.present);
      if (next === current.present) return current;
      return {
        past: [...current.past, current.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
      };
    });
  }, []);

  const rebase = useCallback((updater: (value: T) => T) => {
    setStack((current) => ({
      past: current.past.map(updater),
      present: updater(current.present),
      future: current.future.map(updater),
    }));
  }, []);

  const begin = useCallback(() => {
    setStack((current) => {
      pending.current = current.present;
      return current;
    });
  }, []);

  const end = useCallback(() => {
    const snapshot = pending.current;
    pending.current = null;
    if (snapshot === null) return;
    setStack((current) => {
      if (current.present === snapshot) return current;
      return {
        past: [...current.past, snapshot].slice(-HISTORY_LIMIT),
        present: current.present,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setStack((current) => {
      const previous = current.past[current.past.length - 1];
      if (previous === undefined) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, HISTORY_LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setStack((current) => {
      const next = current.future[0];
      if (next === undefined) return current;
      return {
        past: [...current.past, current.present].slice(-HISTORY_LIMIT),
        present: next,
        future: current.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((value: T) => {
    pending.current = null;
    setStack({ past: [], present: value, future: [] });
  }, []);

  return {
    state: stack.present,
    set,
    commit,
    begin,
    end,
    rebase,
    undo,
    redo,
    reset,
    canUndo: stack.past.length > 0,
    canRedo: stack.future.length > 0,
  };
}
