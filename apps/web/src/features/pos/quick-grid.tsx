import { useTranslation } from 'react-i18next';
import { PackageSearch, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { CategoryDto, Paginated, ProductDto } from '@pos/shared';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProductTile, TileGrid } from '@/components/ui/tile';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { money } from '@/lib/format';

const ALL = 'todas';

interface LoadFailureProps {
  message: string;
  onRetry: () => void;
}

function LoadFailure({ message, onRetry }: LoadFailureProps) {
  return (
    <EmptyState
      icon={RefreshCw}
      title="Nao foi possivel carregar"
      description={message}
      action={{ label: 'Tentar novamente', onClick: onRetry, icon: RefreshCw }}
    />
  );
}

function TileSkeleton() {
  return (
    <TileGrid columns={3}>
      {Array.from({ length: 9 }).map((_, index) => (
        <Skeleton key={index} className="aspect-square min-h-[7rem] rounded-xl" />
      ))}
    </TileGrid>
  );
}

export interface QuickGridProps {
  /** Non-empty switches the panel from the tile grid to search results. */
  search: string;
  categoryId: string | null;
  onCategoryChange: (categoryId: string | null) => void;
  onPick: (product: ProductDto) => void;
}

/**
 * How a cashier rings up loose fruit: category tabs across the top, big tappable
 * product tiles underneath. Typing in the search box takes the same grid over.
 */
export function QuickGrid({ search, categoryId, onCategoryChange, onPick }: QuickGridProps) {
  const { t } = useTranslation();
  const searching = search.trim().length > 0;

  const categories = useQuery({
    queryKey: qk.categories({ quickGrid: true }),
    queryFn: () => api.get<{ data: CategoryDto[] }>('/api/categories/quick-grid'),
    staleTime: 5 * 60_000,
  });

  const productParams = searching
    ? { search: search.trim(), active: true, pageSize: 40, sort: 'name' as const }
    : {
        quickGrid: true,
        active: true,
        pageSize: 60,
        sort: 'name' as const,
        ...(categoryId ? { categoryId } : {}),
      };

  const products = useQuery({
    queryKey: qk.products(productParams),
    queryFn: () => api.get<Paginated<ProductDto>>('/api/products', productParams),
    staleTime: 30_000,
  });

  const colorFor = (product: ProductDto): string | undefined =>
    product.tileColor ?? product.category?.color ?? undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!searching && (
        <div className="shrink-0 px-4">
          {categories.isPending ? (
            <div className="flex gap-4 border-b border-border py-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-24" />
              ))}
            </div>
          ) : (
            <Tabs
              value={categoryId ?? ALL}
              onValueChange={(value) => onCategoryChange(value === ALL ? null : value)}
            >
              <TabsList variant="underline">
                <TabsTrigger value={ALL}>{t('common.all', 'Todos')}</TabsTrigger>
                {(categories.data?.data ?? []).map((category) => (
                  <TabsTrigger key={category.id} value={category.id}>
                    {category.namePt}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {products.isPending ? (
          <TileSkeleton />
        ) : products.isError ? (
          <LoadFailure
            message={products.error instanceof Error ? products.error.message : 'Erro desconhecido.'}
            onRetry={() => void products.refetch()}
          />
        ) : (products.data?.data.length ?? 0) === 0 ? (
          <EmptyState
            icon={PackageSearch}
            size="sm"
            title={
              searching
                ? t('common.noResults', 'Sem resultados')
                : t('pos.quickGridEmpty', 'Nada no acesso rapido')
            }
            description={
              searching
                ? 'Nenhum produto corresponde a essa procura.'
                : 'Marque produtos como "acesso rapido" no catalogo para os ver aqui.'
            }
          />
        ) : (
          <TileGrid columns={3}>
            {(products.data?.data ?? []).map((product) => (
              <ProductTile
                key={product.id}
                name={product.namePt}
                price={money(product.salePriceMinor)}
                imageUrl={product.imageUrl}
                color={colorFor(product)}
                disabled={!product.available}
                onClick={() => onPick(product)}
              />
            ))}
          </TileGrid>
        )}
      </div>

      {!searching && categories.isError && (
        <div className="shrink-0 px-4 pb-3">
          <Button variant="outline" block leftIcon={<RefreshCw />} onClick={() => void categories.refetch()}>
            {t('common.retry', 'Tentar novamente')}
          </Button>
        </div>
      )}
    </div>
  );
}

export default QuickGrid;
