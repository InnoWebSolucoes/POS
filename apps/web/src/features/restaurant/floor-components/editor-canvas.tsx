import { useCallback, useRef } from 'react';
import { RotateCw } from 'lucide-react';

import { cn } from '@/lib/utils';

import { TableFigure } from './table-figure';
import { GRID, clamp, clampToArea, snap, statusColor, useCanvasScale } from './floor-utils';
import { LIMITS, type EditorTable } from './editor-model';

type Gesture =
  | { kind: 'move'; id: string; startX: number; startY: number; originX: number; originY: number }
  | {
      kind: 'resize';
      id: string;
      startX: number;
      startY: number;
      originW: number;
      originH: number;
      rotation: number;
    }
  | { kind: 'rotate'; id: string; centerX: number; centerY: number; startAngle: number; originRotation: number };

export interface EditorCanvasProps {
  area: { id: string; name: string; width: number; height: number };
  tables: EditorTable[];
  selectedId: string | null;
  collisions: Set<string>;
  onSelect: (id: string | null) => void;
  /** Live geometry change while a gesture is running. */
  onPatch: (id: string, patch: Partial<EditorTable>) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  /** Arrow-key nudge: a discrete step, so it lands on the undo stack. */
  onNudge: (id: string, dx: number, dy: number) => void;
  onRequestDelete: () => void;
}

const HANDLE = 'inline-flex size-8 items-center justify-center rounded-full border-2 border-card shadow-md touch-none';

/**
 * The drag-and-drop plan. Every gesture is pointer-based and captured by the
 * canvas itself, so a finger, a stylus and a mouse behave identically.
 */
export function EditorCanvas({
  area,
  tables,
  selectedId,
  collisions,
  onSelect,
  onPatch,
  onGestureStart,
  onGestureEnd,
  onNudge,
  onRequestDelete,
}: EditorCanvasProps) {
  const { ref: containerRef, scale, ready } = useCanvasScale(area, 24);
  const planRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const beginGesture = useCallback(
    (event: React.PointerEvent, next: Gesture) => {
      gesture.current = next;
      onSelect(next.id);
      onGestureStart();
      planRef.current?.setPointerCapture(event.pointerId);
      frameRef.current?.focus();
    },
    [onGestureStart, onSelect],
  );

  const endGesture = useCallback(
    (event: React.PointerEvent) => {
      if (!gesture.current) return;
      gesture.current = null;
      if (planRef.current?.hasPointerCapture(event.pointerId)) {
        planRef.current.releasePointerCapture(event.pointerId);
      }
      onGestureEnd();
    },
    [onGestureEnd],
  );

  const handleMove = useCallback(
    (event: React.PointerEvent) => {
      const active = gesture.current;
      if (!active || scale <= 0) return;
      const free = event.altKey;

      if (active.kind === 'move') {
        const table = tables.find((entry) => entry.id === active.id);
        if (!table) return;
        const dx = (event.clientX - active.startX) / scale;
        const dy = (event.clientY - active.startY) / scale;
        const next = clampToArea(
          {
            x: snap(active.originX + dx, !free),
            y: snap(active.originY + dy, !free),
            width: table.width,
            height: table.height,
            rotation: table.rotation,
          },
          area,
        );
        onPatch(active.id, next);
        return;
      }

      if (active.kind === 'resize') {
        const table = tables.find((entry) => entry.id === active.id);
        if (!table) return;
        // Project the pointer delta onto the table's own axes so a rotated
        // table still grows along its length.
        const rad = (active.rotation * Math.PI) / 180;
        const dx = (event.clientX - active.startX) / scale;
        const dy = (event.clientY - active.startY) / scale;
        const localDx = dx * Math.cos(rad) + dy * Math.sin(rad);
        const localDy = -dx * Math.sin(rad) + dy * Math.cos(rad);
        const maxW = Math.max(LIMITS.minSize, Math.min(LIMITS.maxSize, area.width - table.x));
        const maxH = Math.max(LIMITS.minSize, Math.min(LIMITS.maxSize, area.height - table.y));
        onPatch(active.id, {
          width: clamp(snap(active.originW + localDx, !free), LIMITS.minSize, maxW),
          height: clamp(snap(active.originH + localDy, !free), LIMITS.minSize, maxH),
        });
        return;
      }

      const angle = (Math.atan2(event.clientY - active.centerY, event.clientX - active.centerX) * 180) / Math.PI;
      const delta = angle - active.startAngle;
      const raw = active.originRotation + delta;
      const stepped = free ? Math.round(raw) : Math.round(raw / 15) * 15;
      onPatch(active.id, { rotation: ((stepped % 360) + 360) % 360 });
    },
    [area, onPatch, scale, tables],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!selectedId) return;
      const step = event.shiftKey ? GRID : 1;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          onNudge(selectedId, -step, 0);
          break;
        case 'ArrowRight':
          event.preventDefault();
          onNudge(selectedId, step, 0);
          break;
        case 'ArrowUp':
          event.preventDefault();
          onNudge(selectedId, 0, -step);
          break;
        case 'ArrowDown':
          event.preventDefault();
          onNudge(selectedId, 0, step);
          break;
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          onRequestDelete();
          break;
        case 'Escape':
          onSelect(null);
          break;
        default:
          break;
      }
    },
    [onNudge, onRequestDelete, onSelect, selectedId],
  );

  const fineGrid = GRID * scale;
  const coarseGrid = GRID * 10 * scale;

  return (
    <div
      ref={frameRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex min-h-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
        {ready && (
          <div
            ref={planRef}
            className="relative touch-none rounded-2xl border-2 border-border bg-card shadow-inner"
            style={{
              width: area.width * scale,
              height: area.height * scale,
              backgroundImage: [
                'linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px)',
                'linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)',
                'linear-gradient(to right, hsl(var(--muted-foreground) / 0.35) 1px, transparent 1px)',
                'linear-gradient(to bottom, hsl(var(--muted-foreground) / 0.35) 1px, transparent 1px)',
              ].join(','),
              backgroundSize: [
                `${fineGrid}px ${fineGrid}px`,
                `${fineGrid}px ${fineGrid}px`,
                `${coarseGrid}px ${coarseGrid}px`,
                `${coarseGrid}px ${coarseGrid}px`,
              ].join(','),
            }}
            onPointerDown={(event) => {
              if (event.target === planRef.current) {
                onSelect(null);
                frameRef.current?.focus();
              }
            }}
            onPointerMove={handleMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
          >
            {tables.map((table) => {
              const selected = table.id === selectedId;
              return (
                <TableFigure
                  key={table.id}
                  x={table.x}
                  y={table.y}
                  width={table.width}
                  height={table.height}
                  rotation={table.rotation}
                  shape={table.shape}
                  seats={table.seats}
                  scale={scale}
                  color={statusColor(table.status)}
                  selected={selected}
                  colliding={collisions.has(table.id)}
                  className={cn('cursor-grab active:cursor-grabbing', selected && 'z-10')}
                  role="button"
                  aria-label={`Mesa ${table.name}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    beginGesture(event, {
                      kind: 'move',
                      id: table.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      originX: table.x,
                      originY: table.y,
                    });
                  }}
                  overlay={
                    selected ? (
                      <>
                        <button
                          type="button"
                          aria-label={`Rodar mesa ${table.name}`}
                          className={cn(HANDLE, 'absolute -top-10 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground')}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            const rect = planRef.current?.getBoundingClientRect();
                            if (!rect) return;
                            const centerX = rect.left + (table.x + table.width / 2) * scale;
                            const centerY = rect.top + (table.y + table.height / 2) * scale;
                            const startAngle =
                              (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI;
                            beginGesture(event, {
                              kind: 'rotate',
                              id: table.id,
                              centerX,
                              centerY,
                              startAngle,
                              originRotation: table.rotation,
                            });
                          }}
                        >
                          <RotateCw className="size-4" />
                        </button>
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -top-6 left-1/2 h-6 w-px -translate-x-1/2 bg-primary"
                        />
                        <button
                          type="button"
                          aria-label={`Redimensionar mesa ${table.name}`}
                          className={cn(HANDLE, 'absolute -bottom-4 -right-4 cursor-nwse-resize bg-primary text-primary-foreground')}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            beginGesture(event, {
                              kind: 'resize',
                              id: table.id,
                              startX: event.clientX,
                              startY: event.clientY,
                              originW: table.width,
                              originH: table.height,
                              rotation: table.rotation,
                            });
                          }}
                        >
                          <span aria-hidden className="size-3 rounded-sm border-2 border-current" />
                        </button>
                      </>
                    ) : null
                  }
                >
                  <span className="w-full truncate px-1 text-sm font-bold">{table.name}</span>
                  {table.width * scale >= 70 && table.height * scale >= 56 && (
                    <span className="tabular text-[11px] opacity-90">
                      {Math.round(table.width)} x {Math.round(table.height)}
                    </span>
                  )}
                </TableFigure>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default EditorCanvas;
