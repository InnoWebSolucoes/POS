import * as React from 'react';
import { FilterX } from 'lucide-react';
import { PRODUCT_TYPES, type CategoryDto, type ProductType } from '@pos/shared';

import {
  Button,
  Label,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SwitchField,
} from '@/components/ui';
import { PRODUCT_TYPE_LABELS } from '../catalog-labels';
import { CategoryTreeSelect } from './category-tree-select';
import type { SupplierOption } from '../catalog-api';

export const ANY = '__any__';

export interface ProductFiltersValue {
  search: string;
  categoryId: string | null;
  type: ProductType | null;
  supplierId: string | null;
  /** null = both, true = only active, false = only inactive. */
  active: boolean | null;
  lowStock: boolean;
}

export const EMPTY_FILTERS: ProductFiltersValue = {
  search: '',
  categoryId: null,
  type: null,
  supplierId: null,
  active: true,
  lowStock: false,
};

export interface ProductFiltersProps {
  value: ProductFiltersValue;
  onChange: (next: ProductFiltersValue) => void;
  categories: CategoryDto[];
  suppliers: SupplierOption[];
  canSeeSuppliers: boolean;
}

/**
 * The filter bar. Everything is a 48px control on its own row on a phone and a
 * wrapping strip on a tablet, so nothing needs a hover to be discovered.
 */
export function ProductFilters({
  value,
  onChange,
  categories,
  suppliers,
  canSeeSuppliers,
}: ProductFiltersProps) {
  const patch = (part: Partial<ProductFiltersValue>) => onChange({ ...value, ...part });

  const dirty =
    value.search !== '' ||
    value.categoryId !== null ||
    value.type !== null ||
    value.supplierId !== null ||
    value.active !== true ||
    value.lowStock;

  const activeValue = value.active === null ? ANY : value.active ? 'true' : 'false';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Label htmlFor="produtos-pesquisa" className="sr-only">
            Pesquisar produtos
          </Label>
          <SearchInput
            id="produtos-pesquisa"
            value={value.search}
            onValueChange={(next) => patch({ search: next })}
            onSearch={(next) => patch({ search: next })}
            placeholder="Nome, SKU ou codigo de barras"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-categoria" size="sm">
            Categoria
          </Label>
          <CategoryTreeSelect
            id="filtro-categoria"
            tree={categories}
            value={value.categoryId}
            onChange={(categoryId) => patch({ categoryId })}
            noneLabel="Todas as categorias"
            placeholder="Todas as categorias"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-tipo" size="sm">
            Tipo
          </Label>
          <Select
            value={value.type ?? ANY}
            onValueChange={(next) => patch({ type: next === ANY ? null : (next as ProductType) })}
          >
            <SelectTrigger id="filtro-tipo">
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todos os tipos</SelectItem>
              {PRODUCT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {PRODUCT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-estado" size="sm">
            Estado
          </Label>
          <Select
            value={activeValue}
            onValueChange={(next) =>
              patch({ active: next === ANY ? null : next === 'true' })
            }
          >
            <SelectTrigger id="filtro-estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Apenas activos</SelectItem>
              <SelectItem value="false">Apenas inactivos</SelectItem>
              <SelectItem value={ANY}>Activos e inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canSeeSuppliers && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-fornecedor" size="sm">
              Fornecedor
            </Label>
            <Select
              value={value.supplierId ?? ANY}
              onValueChange={(next) => patch({ supplierId: next === ANY ? null : next })}
            >
              <SelectTrigger id="filtro-fornecedor">
                <SelectValue placeholder="Todos os fornecedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Todos os fornecedores</SelectItem>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SwitchField
          className="w-auto"
          label="Apenas stock baixo"
          checked={value.lowStock}
          onCheckedChange={(checked) => patch({ lowStock: checked })}
        />
        {dirty && (
          <Button
            variant="ghost"
            leftIcon={<FilterX />}
            onClick={() => onChange({ ...EMPTY_FILTERS })}
          >
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}

export default ProductFilters;
