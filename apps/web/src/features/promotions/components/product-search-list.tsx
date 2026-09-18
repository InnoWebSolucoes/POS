import * as React from 'react';
import { Check, PackageSearch, Plus } from 'lucide-react';
import type { ProductDto } from '@pos/shared';

import { EmptyState, SearchInput, Skeleton } from '@/components/ui';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useProductSearch } from '../api';
import { QueryError } from './query-error';

export interface ProductSearchListProps {
  onPick: (product: ProductDto) => void;
  /** Ticks the row and flips the affordance to "already in". */
  isPicked?: (productId: string) => boolean;
  enabled?: boolean;
  placeholder?: string;
  listClassName?: string;
}

/**
 * One search box over the catalogue, shared by the scope multi-select and the
 * test basket. Sale price only - a cashier must never be shown cost.
 */
export function ProductSearchList({
  onPick,
  isPicked,
  enabled = true,
  placeholder = 'Procurar por nome, SKU ou codigo de barras...',
  listClassName,
}: ProductSearchListProps) {
  const [search, setSearch] = React.useState('');
  const query = useProductSearch(search, enabled);
  const products = query.data ?? [];

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <SearchInput
        placeholder={placeholder}
        defaultValue=""
        onSearch={setSearch}
        aria-label="Procurar produtos"
      />

      <div className={cn('min-h-0 overflow-y-auto rounded-xl border border-border', listClassName)}>
        {query.isLoading && (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!query.isLoading && query.isError && (
          <QueryError compact error={query.error} onRetry={() => void query.refetch()} />
        )}

        {!query.isLoading && !query.isError && products.length === 0 && (
          <EmptyState
            size="sm"
            icon={PackageSearch}
            title="Sem resultados"
            description={
              search ? 'Nenhum produto corresponde a pesquisa.' : 'Escreva para procurar no catalogo.'
            }
          />
        )}

        {!query.isLoading && !query.isError && products.length > 0 && (
          <ul className="divide-y divide-border">
            {products.map((product) => {
              const picked = isPicked?.(product.id) ?? false;
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => onPick(product)}
                    className={cn(
                      'flex min-h-touch w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors',
                      'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      picked ? 'bg-primary/10' : 'hover:bg-muted',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {product.namePt}
                      </span>
                      <span className="tabular block truncate text-xs text-muted-foreground">
                        {product.sku}
                        {product.category ? ` - ${product.category.namePt}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-sm text-foreground">{money(product.salePriceMinor)}</span>
                      {picked ? (
                        <Check className="size-5 text-primary" aria-hidden="true" />
                      ) : (
                        <Plus className="size-5 text-muted-foreground" aria-hidden="true" />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ProductSearchList;
