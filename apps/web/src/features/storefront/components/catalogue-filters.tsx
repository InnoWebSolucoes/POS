import {
  Button,
  Label,
  MoneyInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SwitchField,
} from '@/components/ui';

import type { CatalogueParams } from '../types';

/**
 * Catalogue filters. Prices are minor units end to end: MoneyInput emits
 * centimos and the API compares them against the displayed, tax-inclusive
 * price, so what the shopper types is what they are filtering on.
 */

export type SortOption = NonNullable<CatalogueParams['sort']>;

export const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Novidades',
  price: 'Preco: mais baixo',
  name: 'Nome (A-Z)',
};

export interface FilterValue {
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean;
  sort: SortOption;
}

export const EMPTY_FILTERS: FilterValue = {
  minPrice: null,
  maxPrice: null,
  inStock: false,
  sort: 'newest',
};

export function activeFilterCount(value: FilterValue): number {
  let count = 0;
  if (value.minPrice !== null) count += 1;
  if (value.maxPrice !== null) count += 1;
  if (value.inStock) count += 1;
  return count;
}

export function SortSelect({
  value,
  onChange,
  className,
}: {
  value: SortOption;
  onChange: (value: SortOption) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as SortOption)}>
      <SelectTrigger className={className} aria-label="Ordenar">
        <SelectValue placeholder="Ordenar" />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
          <SelectItem key={option} value={option}>
            {SORT_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface CatalogueFiltersProps {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  /** Shown inside the mobile sheet, hidden in the desktop column. */
  showSort?: boolean;
}

export function CatalogueFilters({ value, onChange, showSort = false }: CatalogueFiltersProps) {
  const patch = (next: Partial<FilterValue>) => onChange({ ...value, ...next });
  const dirty = activeFilterCount(value) > 0 || value.sort !== 'newest';

  return (
    <div className="space-y-5">
      {showSort && (
        <div className="space-y-2">
          <Label>Ordenar por</Label>
          <SortSelect value={value.sort} onChange={(sort) => patch({ sort })} className="w-full" />
        </div>
      )}

      <div className="space-y-2">
        <Label>Preco</Label>
        <div className="flex items-center gap-2">
          <MoneyInput
            value={value.minPrice}
            onChange={(minor) => patch({ minPrice: minor > 0 ? minor : null })}
            placeholder="Minimo"
            aria-label="Preco minimo"
          />
          <span aria-hidden="true" className="text-muted-foreground">
            -
          </span>
          <MoneyInput
            value={value.maxPrice}
            onChange={(minor) => patch({ maxPrice: minor > 0 ? minor : null })}
            placeholder="Maximo"
            aria-label="Preco maximo"
          />
        </div>
      </div>

      <SwitchField
        label="So disponiveis"
        description="Esconde o que esta esgotado"
        checked={value.inStock}
        onCheckedChange={(checked) => patch({ inStock: checked })}
      />

      {dirty && (
        <Button variant="ghost" block onClick={() => onChange(EMPTY_FILTERS)}>
          Limpar filtros
        </Button>
      )}
    </div>
  );
}

export default CatalogueFilters;
