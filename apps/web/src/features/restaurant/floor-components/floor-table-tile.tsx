import { useEffect, useRef } from 'react';
import { MoreHorizontal, Users } from 'lucide-react';
import type { RestaurantTableDto, TableStatus } from '@pos/shared';

import { elapsed, money } from '@/lib/format';
import { cn } from '@/lib/utils';

import { TableFigure } from './table-figure';
import { openSeconds, statusColor } from './floor-utils';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 12;

export interface FloorTableTileProps {
  table: RestaurantTableDto;
  scale: number;
  now: number;
  statusLabel: string;
  /** A plain tap: open the check, or ask for the guest count. */
  onActivate: (table: RestaurantTableDto) => void;
  /** Long press or the "..." button. */
  onActions: (table: RestaurantTableDto) => void;
}

/** One table on the live floor: status fill, name, seats and the open check. */
export function FloorTableTile({
  table,
  scale,
  now,
  statusLabel,
  onActivate,
  onActions,
}: FloorTableTileProps) {
  const press = useRef<{ x: number; y: number; moved: boolean; fired: boolean } | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const cancelTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const pxWidth = table.width * scale;
  const pxHeight = table.height * scale;
  const minSide = Math.min(pxWidth, pxHeight);

  const showSeats = minSide >= 46 && pxHeight >= 52;
  const showDetail = pxHeight >= 78 && pxWidth >= 88;
  const showMenuButton = pxWidth >= 56 && pxHeight >= 48;

  const status: TableStatus = table.status;
  const seconds = openSeconds(table.openedAt, now);
  const hasCheck = table.activeOrderId !== null || (table.orderTotalMinor ?? 0) > 0;

  const nameSize = minSide >= 90 ? 'text-base' : minSide >= 60 ? 'text-sm' : 'text-xs';

  return (
    <TableFigure
      x={table.x}
      y={table.y}
      width={table.width}
      height={table.height}
      rotation={table.rotation}
      shape={table.shape}
      seats={table.seats}
      scale={scale}
      color={statusColor(status)}
      className="cursor-pointer active:brightness-95"
      role="button"
      tabIndex={0}
      aria-label={`Mesa ${table.name}, ${statusLabel}, ${table.seats} lugares`}
      onContextMenu={(event) => {
        event.preventDefault();
        onActions(table);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate(table);
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        press.current = { x: event.clientX, y: event.clientY, moved: false, fired: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        cancelTimer();
        timer.current = window.setTimeout(() => {
          if (press.current && !press.current.moved) {
            press.current.fired = true;
            onActions(table);
          }
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(event) => {
        const state = press.current;
        if (!state) return;
        if (
          Math.abs(event.clientX - state.x) > MOVE_TOLERANCE_PX ||
          Math.abs(event.clientY - state.y) > MOVE_TOLERANCE_PX
        ) {
          state.moved = true;
          cancelTimer();
        }
      }}
      onPointerUp={(event) => {
        const state = press.current;
        press.current = null;
        cancelTimer();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (state && !state.moved && !state.fired) onActivate(table);
      }}
      onPointerCancel={() => {
        press.current = null;
        cancelTimer();
      }}
      overlay={
        showMenuButton ? (
          <button
            type="button"
            aria-label={`Accoes da mesa ${table.name}`}
            className={cn(
              'absolute -right-3 -top-3 inline-flex size-11 items-center justify-center rounded-full',
              'border border-border bg-card text-foreground shadow-md active:scale-95',
            )}
            style={{ transform: `rotate(${-table.rotation}deg)` }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onActions(table);
            }}
          >
            <MoreHorizontal className="size-5" />
          </button>
        ) : null
      }
    >
      <span className={cn('w-full truncate px-1 font-bold', nameSize)}>{table.name}</span>

      {showSeats && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium opacity-90">
          <Users className="size-3" aria-hidden />
          <span className="tabular">{table.seats}</span>
          {table.guestCount ? <span className="tabular">/ {table.guestCount}</span> : null}
        </span>
      )}

      {showDetail && hasCheck && (
        <span className="tabular text-sm font-bold">{money(table.orderTotalMinor ?? 0)}</span>
      )}

      {showDetail && seconds !== null && (
        <span className="tabular text-[11px] font-semibold opacity-90">{elapsed(seconds)}</span>
      )}

      {showDetail && table.serverName && (
        <span className="w-full truncate px-1 text-[11px] opacity-90">{table.serverName}</span>
      )}

      {showDetail && table.mergedIntoId && (
        <span className="text-[10px] font-semibold uppercase opacity-90">Unida</span>
      )}
    </TableFigure>
  );
}

export default FloorTableTile;
