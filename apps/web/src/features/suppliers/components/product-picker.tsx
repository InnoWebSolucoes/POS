import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PackageSearch, Plus } from 'lucide-react';

import { EmptyState, SearchInput, Skeleton } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { money, quantity } from '@/lib/format';
import { qk } from '@/lib/query';

import { searchProducts } from '../api';
import type { ProductPick } from '../types';
import { QueryError } from './page-shell';

interface ProductPickerProps {
  /** Narrows the catalogue to what this supplier already provides. */
  supplierId?: string;
  onPick: (product: ProductPick) => void;
  pickedIds: string[];
}

/** The last cost we know for a product; 0 when the role cannot see costs. */
export function lastCostMinor(product: ProductPick): number {
  return product.avgCostMinor ?? product.costPriceMinor ?? 0;
}

export function ProductPicker({ supplierId, onPick, pickedIds }: ProductPickerProps) {
  const can = useAuth((state) => state.can);
  const canSeeCost = can('product:cost');
  const [term, setTerm] = React.useState('');

  const query = useQuery({
    queryKey: qk.products({ picker: term, supplierId }),
    queryFn: () => searchProducts(term, supplierId),
    enabled: term.trim().length > 0,
  });

  const rows = query.data?.data ?? [];

  return (
    <div className="space-y-3">
      <SearchInput onSearch={setTerm} placeholder="Pesquisar produto por nome, SKU ou codigo..." />

      {term.trim().length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          Escreva para procurar produtos a adicionar a encomenda.
        </p>
      ) : query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState size="sm" icon={PackageSearch} title="Produto nao encontrado" />
      ) : (
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {rows.map((product) => {
            const already = pickedIds.includes(product.id);
            return (
              <li key={product.id}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => onPick(product)}
                  className="flex min-h-touch w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {product.namePt}
                    </span>
                    <span className="tabular block truncate text-xs text-muted-foreground">
                      {product.sku} - {quantity(product.stockQuantity, product.unit)} em stock
                      {canSeeCost ? ` - ${money(lastCostMinor(product))}` : ''}
                    </span>
                  </span>
                  {already ? (
                    <span className="text-xs text-muted-foreground">Ja adicionado</span>
                  ) : (
                    <Plus className="size-5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
