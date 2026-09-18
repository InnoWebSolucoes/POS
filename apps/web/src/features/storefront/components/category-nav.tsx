import * as React from 'react';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

import type { StorefrontCategoryDto } from '../types';

/**
 * Category navigation: a column on a desktop, a thumb-swipeable row of pills on
 * a phone. Both render the same flattened tree, so a shopper who switches
 * device sees the same aisles in the same order.
 */

export interface FlatCategory {
  id: string;
  name: string;
  depth: number;
  productCount: number;
  color: string | null;
}

export function flattenCategories(
  categories: StorefrontCategoryDto[],
  depth = 0,
): FlatCategory[] {
  const out: FlatCategory[] = [];
  for (const category of categories) {
    out.push({
      id: category.id,
      name: category.namePt,
      depth,
      productCount: category.productCount,
      color: category.color,
    });
    if (category.children.length > 0) out.push(...flattenCategories(category.children, depth + 1));
  }
  return out;
}

interface CategoryNavProps {
  categories: StorefrontCategoryDto[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}

export function CategorySidebar({ categories, activeId, onSelect, className }: CategoryNavProps) {
  const flat = React.useMemo(() => flattenCategories(categories), [categories]);

  return (
    <nav className={cn('space-y-1', className)} aria-label="Categorias">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeId === null}
        className={cn(
          'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm font-medium transition-colors',
          activeId === null ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
        )}
      >
        Todos os produtos
      </button>

      {flat.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(category.id)}
          aria-pressed={activeId === category.id}
          className={cn(
            'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm transition-colors',
            activeId === category.id
              ? 'bg-primary font-semibold text-primary-foreground'
              : 'text-foreground hover:bg-muted',
          )}
          style={category.depth > 0 ? { paddingLeft: `${0.75 + category.depth * 0.75}rem` } : undefined}
        >
          <span className="truncate">{category.name}</span>
          <span className="tabular text-xs opacity-70">{category.productCount}</span>
        </button>
      ))}
    </nav>
  );
}

export function CategoryScroller({ categories, activeId, onSelect, className }: CategoryNavProps) {
  const flat = React.useMemo(() => flattenCategories(categories), [categories]);

  return (
    <div
      className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]', className)}
      role="group"
      aria-label="Categorias"
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeId === null}
        className={cn(
          'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
          activeId === null
            ? 'border-transparent bg-primary text-primary-foreground'
            : 'border-border bg-card text-foreground',
        )}
      >
        Todos
      </button>

      {flat.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(category.id)}
          aria-pressed={activeId === category.id}
          className={cn(
            'flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
            activeId === category.id
              ? 'border-transparent bg-primary text-primary-foreground'
              : 'border-border bg-card text-foreground',
          )}
        >
          <span className="max-w-[10rem] truncate">{category.name}</span>
          <Badge
            variant={activeId === category.id ? 'secondary' : 'muted'}
            size="sm"
            className="tabular"
          >
            {category.productCount}
          </Badge>
        </button>
      ))}
    </div>
  );
}
