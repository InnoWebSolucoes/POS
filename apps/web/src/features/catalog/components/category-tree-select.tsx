import * as React from 'react';
import type { CategoryDto } from '@pos/shared';

import { colorForLabel } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { branchIds, flattenCategories } from '../catalog-hooks';

/** Radix Select forbids an empty value, so "no category" carries a sentinel. */
export const NO_CATEGORY = '__none__';

export interface CategoryTreeSelectProps {
  /** Nested categories (GET /api/categories?tree=true). */
  tree: CategoryDto[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  /** Label for the "no category" option; omit it to make the field required. */
  noneLabel?: string;
  placeholder?: string;
  /** Hides this node and its whole branch - a category cannot be its own parent. */
  excludeBranchOf?: string | null;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
}

/**
 * A category picker that shows the hierarchy through indentation rather than a
 * popover tree - a finger on a tablet does far better with one flat list.
 */
export function CategoryTreeSelect({
  tree,
  value,
  onChange,
  noneLabel = 'Sem categoria',
  placeholder = 'Escolher categoria',
  excludeBranchOf = null,
  disabled = false,
  id,
  'aria-invalid': invalid,
}: CategoryTreeSelectProps) {
  const hidden = React.useMemo(() => {
    if (!excludeBranchOf) return new Set<string>();
    const node = flattenCategories(tree).find((row) => row.category.id === excludeBranchOf);
    return new Set(node ? branchIds(node.category) : []);
  }, [tree, excludeBranchOf]);

  const rows = React.useMemo(
    () => flattenCategories(tree).filter((row) => !hidden.has(row.category.id)),
    [tree, hidden],
  );

  return (
    <Select
      value={value ?? NO_CATEGORY}
      onValueChange={(next) => onChange(next === NO_CATEGORY ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-invalid={invalid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CATEGORY}>{noneLabel}</SelectItem>
        {rows.map(({ category, depth }) => (
          <SelectItem key={category.id} value={category.id}>
            <span className="flex items-center gap-2" style={{ paddingLeft: `${depth * 0.875}rem` }}>
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color ?? colorForLabel(category.namePt) }}
              />
              <span className="truncate">{category.namePt}</span>
              {!category.active && <span className="text-xs text-muted-foreground">(inactiva)</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default CategoryTreeSelect;
