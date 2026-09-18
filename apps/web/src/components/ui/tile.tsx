import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn, colorForLabel, contrastText } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Grid                                                                        */
/* -------------------------------------------------------------------------- */

export interface TileGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Columns at the widest breakpoint; it steps down on narrower tablets. */
  columns?: 3 | 4 | 5 | 6;
}

const COLUMNS: Record<number, string> = {
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6',
};

export function TileGrid({ columns = 4, className, ...props }: TileGridProps) {
  return <div className={cn('grid gap-3', COLUMNS[columns], className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* CategoryTile                                                                */
/* -------------------------------------------------------------------------- */

export interface CategoryTileProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  name: string;
  /** Item count shown under the name. */
  count?: number;
  /** Overrides the "7 artigos" subtitle entirely. */
  subtitle?: string;
  /** Hex from the category record; falls back to a stable colour for the name. */
  color?: string;
  icon?: LucideIcon;
  selected?: boolean;
  size?: 'sm' | 'default' | 'lg';
}

const TILE_SIZES = {
  sm: 'aspect-square min-h-[5.5rem] p-2.5',
  default: 'aspect-square min-h-[7rem]',
  lg: 'aspect-[5/4] min-h-[8.5rem] p-4',
} as const;

/** The big solid-colour tile from the register's left-hand grid. */
export const CategoryTile = React.forwardRef<HTMLButtonElement, CategoryTileProps>(
  function CategoryTile(
    { name, count, subtitle, color, icon: Icon, selected = false, size = 'default', className, ...props },
    ref,
  ) {
    const background = color || colorForLabel(name);
    const foreground = contrastText(background);
    const caption = subtitle ?? (count === undefined ? undefined : `${count} ${count === 1 ? 'artigo' : 'artigos'}`);

    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={selected}
        className={cn(
          'tile touch-target items-start justify-start shadow-sm',
          'outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
          selected && 'ring-2 ring-ring ring-offset-2',
          TILE_SIZES[size],
          className,
        )}
        style={{ backgroundColor: background, color: foreground }}
        {...props}
      >
        <span className="flex w-full items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="tile-label block break-words text-base font-bold">{name}</span>
            {caption && <span className="mt-0.5 block text-xs font-medium opacity-75">{caption}</span>}
          </span>
          {Icon && <Icon className="size-5 shrink-0 opacity-80" aria-hidden="true" />}
        </span>
      </button>
    );
  },
);

/* -------------------------------------------------------------------------- */
/* ProductTile                                                                 */
/* -------------------------------------------------------------------------- */

export interface ProductTileProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  name: string;
  /** Already formatted by money() - the tile never does arithmetic. */
  price?: string;
  imageUrl?: string | null;
  /** Accent for the plain tile, usually the category colour. */
  color?: string;
  badge?: React.ReactNode;
  /** Renders the "Esgotado" overlay and blocks the tap. */
  disabled?: boolean;
  soldOutLabel?: string;
  selected?: boolean;
  size?: 'sm' | 'default' | 'lg';
}

/** Two looks: a photo tile with a scrim, or the plain muted tile. */
export const ProductTile = React.forwardRef<HTMLButtonElement, ProductTileProps>(
  function ProductTile(
    {
      name,
      price,
      imageUrl,
      color,
      badge,
      disabled = false,
      soldOutLabel = 'Esgotado',
      selected = false,
      size = 'default',
      className,
      ...props
    },
    ref,
  ) {
    const photo = Boolean(imageUrl);

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        className={cn(
          'tile touch-target border border-border/60 shadow-sm',
          'outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
          photo ? 'justify-end bg-muted' : 'justify-between bg-muted text-foreground',
          selected && 'ring-2 ring-ring ring-offset-2',
          disabled && 'cursor-not-allowed',
          TILE_SIZES[size],
          className,
        )}
        {...props}
      >
        {photo && (
          <>
            <img
              src={imageUrl ?? undefined}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
            {/* A photo looks the same in both themes, so the scrim is true black. */}
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
            />
          </>
        )}

        {!photo && color && (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1"
            style={{ backgroundColor: color }}
          />
        )}

        {badge && <span className="absolute right-2 top-2 z-10">{badge}</span>}

        <span className={cn('relative z-10 flex w-full flex-col items-start', photo && 'text-white')}>
          <span className={cn('tile-label line-clamp-2 break-words', photo && 'drop-shadow')}>{name}</span>
          {price && (
            <span
              className={cn(
                'tabular mt-0.5 text-sm font-semibold',
                photo ? 'text-white/90' : 'text-muted-foreground',
              )}
            >
              {price}
            </span>
          )}
        </span>

        {disabled && (
          <span className="absolute inset-0 z-20 flex items-center justify-center bg-background/70">
            <span className="rounded-full bg-destructive px-3 py-1 text-xs font-semibold uppercase tracking-wide text-destructive-foreground">
              {soldOutLabel}
            </span>
          </span>
        )}
      </button>
    );
  },
);

export default ProductTile;
