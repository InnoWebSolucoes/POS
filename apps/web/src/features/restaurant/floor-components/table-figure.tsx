import React from 'react';
import type { TableShape } from '@pos/shared';

import { cn, contrastText } from '@/lib/utils';
import { seatPositions } from './floor-utils';

export interface TableFigureProps extends React.HTMLAttributes<HTMLDivElement> {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  shape: TableShape;
  seats: number;
  /** Logical unit -> CSS pixel. */
  scale: number;
  /** Status fill, straight from TABLE_STATUS_COLORS. */
  color: string;
  selected?: boolean;
  colliding?: boolean;
  /** Extra chrome (handles, menu button) drawn unrotated on top of the table. */
  overlay?: React.ReactNode;
}

function normalizeAngle(angle: number): number {
  const wrapped = ((angle % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/**
 * One table drawn on the plan: its shape, its status fill and a ring of seat
 * dots around the perimeter so the block reads as a table at a glance.
 *
 * Everything is laid out in CSS pixels computed from the scale factor rather
 * than by transform-scaling the canvas, so labels stay crisp and tap targets
 * keep their real size on a tablet.
 */
export const TableFigure = React.forwardRef<HTMLDivElement, TableFigureProps>(function TableFigure(
  {
    x,
    y,
    width,
    height,
    rotation,
    shape,
    seats,
    scale,
    color,
    selected = false,
    colliding = false,
    overlay,
    className,
    style,
    children,
    ...props
  },
  ref,
) {
  const pxWidth = Math.max(width * scale, 12);
  const pxHeight = Math.max(height * scale, 12);
  const dots = seatPositions(seats, shape, width, height);
  const dotSize = Math.max(5, Math.min(11, Math.round(Math.min(pxWidth, pxHeight) * 0.13)));
  const showDots = Math.min(pxWidth, pxHeight) >= 34;
  const flipped = Math.abs(normalizeAngle(rotation)) > 90;

  return (
    <div
      ref={ref}
      className={cn(
        'absolute touch-none select-none outline-none',
        'transition-[box-shadow,filter] duration-100',
        className,
      )}
      style={{
        left: x * scale,
        top: y * scale,
        width: pxWidth,
        height: pxHeight,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        ...style,
      }}
      {...props}
    >
      {showDots &&
        dots.map((dot, index) => (
          <span
            key={index}
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              left: `${dot.xPct}%`,
              top: `${dot.yPct}%`,
              width: dotSize,
              height: dotSize,
              marginLeft: -dotSize / 2,
              marginTop: -dotSize / 2,
              backgroundColor: color,
              boxShadow: '0 0 0 1.5px hsl(var(--background))',
            }}
          />
        ))}

      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center overflow-hidden border-2 p-1 text-center',
          shape === 'circle' ? 'rounded-full' : 'rounded-lg',
          colliding && 'ring-4 ring-destructive ring-offset-1 ring-offset-background',
          selected && !colliding && 'ring-4 ring-ring ring-offset-1 ring-offset-background',
        )}
        style={{
          backgroundColor: color,
          borderColor: 'hsl(var(--background))',
          color: contrastText(color),
        }}
      >
        <div
          className="flex w-full flex-col items-center justify-center gap-0.5 leading-tight"
          style={flipped ? { transform: 'rotate(180deg)' } : undefined}
        >
          {children}
        </div>
      </div>

      {overlay}
    </div>
  );
});

export default TableFigure;
