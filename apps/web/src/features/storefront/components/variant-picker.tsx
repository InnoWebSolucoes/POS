import * as React from 'react';

import { Label } from '@/components/ui';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

import { resolveVariantInStock, type StockOverrides } from '../live-stock';
import type { StorefrontVariantDto } from '../types';

/**
 * Size / colour picker.
 *
 * The API sends each variant's options as a plain map ({ Tamanho: "M" }), so
 * the groups are derived rather than configured. A value nobody has any stock
 * of is shown struck through instead of vanishing - a shopper looking for
 * exactly that size deserves to know it exists and is gone.
 */

export interface OptionGroup {
  key: string;
  values: string[];
}

export function buildOptionGroups(variants: StorefrontVariantDto[]): OptionGroup[] {
  const map = new Map<string, string[]>();
  for (const variant of variants) {
    for (const [key, value] of Object.entries(variant.options)) {
      const values = map.get(key) ?? [];
      if (!values.includes(value)) values.push(value);
      map.set(key, values);
    }
  }
  return [...map.entries()].map(([key, values]) => ({ key, values }));
}

export function matchVariant(
  variants: StorefrontVariantDto[],
  selected: Record<string, string>,
): StorefrontVariantDto | null {
  const keys = Object.keys(selected);
  if (keys.length === 0) return null;

  return (
    variants.find((variant) => {
      const entries = Object.entries(variant.options);
      if (entries.length !== keys.length) return false;
      return entries.every(([key, value]) => selected[key] === value);
    }) ?? null
  );
}

interface VariantPickerProps {
  productId: string;
  variants: StorefrontVariantDto[];
  selected: Record<string, string>;
  onSelect: (selected: Record<string, string>) => void;
  /** Used for variants that carry no option map, only a SKU. */
  selectedId: string | null;
  onSelectId: (id: string) => void;
  overrides: StockOverrides;
}

export function VariantPicker({
  productId,
  variants,
  selected,
  onSelect,
  selectedId,
  onSelectId,
  overrides,
}: VariantPickerProps) {
  const groups = React.useMemo(() => buildOptionGroups(variants), [variants]);

  const valueHasStock = (key: string, value: string) =>
    variants.some(
      (variant) =>
        variant.options[key] === value && resolveVariantInStock(productId, variant, overrides),
    );

  if (groups.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Opcao</Label>
        <div className="flex flex-wrap gap-2">
          {variants.map((variant) => {
            const inStock = resolveVariantInStock(productId, variant, overrides);
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => onSelectId(variant.id)}
                aria-pressed={selectedId === variant.id}
                className={cn(
                  'flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors',
                  selectedId === variant.id
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-foreground',
                  !inStock && 'text-muted-foreground line-through',
                )}
              >
                {variant.sku}
                <span className="tabular text-xs opacity-80">{money(variant.priceMinor)}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <Label>{group.key}</Label>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => {
              const active = selected[group.key] === value;
              const available = valueHasStock(group.key, value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onSelect({ ...selected, [group.key]: value })}
                  aria-pressed={active}
                  className={cn(
                    'min-h-12 min-w-12 rounded-xl border px-4 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-card text-foreground',
                    !available && 'text-muted-foreground line-through',
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default VariantPicker;
