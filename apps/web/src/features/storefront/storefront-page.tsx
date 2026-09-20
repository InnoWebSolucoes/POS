import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { PackageSearch, SlidersHorizontal } from 'lucide-react';

import {
  Badge,
  Button,
  EmptyState,
  Separator,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  toast,
} from '@/components/ui';

import { loadCategories, loadProducts, storefrontKeys } from './api';
import {
  CatalogueFilters,
  EMPTY_FILTERS,
  SortSelect,
  activeFilterCount,
  type FilterValue,
} from './components/catalogue-filters';
import { CategoryScroller, CategorySidebar } from './components/category-nav';
import { ProductCard, ProductCardSkeleton } from './components/product-card';
import { ShopClosed, ShopError, ShopLayout } from './components/shop-layout';
import { errorMessage, useCart, useShop } from './hooks';
import { resolveProductInStock, useLiveStock, useStockOverrides } from './live-stock';
import type { CatalogueParams, StorefrontProductDto } from './types';

const PAGE_SIZE = 24;

/**
 * The shop front at /loja/:entitySlug.
 *
 * Public, mobile-first and live: the same inventory:updated that tells the
 * kitchen and the back office about a sale also reaches this page, so a box
 * sold at the counter goes grey here before the shopper can tap it.
 */
export default function StorefrontPage() {
  const { entitySlug = '' } = useParams<{ entitySlug: string }>();

  const shopQuery = useShop(entitySlug);
  const shop = shopQuery.data ?? null;

  const live = useLiveStock(shop?.id, entitySlug);
  const overrides = useStockOverrides();
  const cart = useCart(entitySlug, Boolean(shop));

  const [searchText, setSearchText] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<FilterValue>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [addingId, setAddingId] = React.useState<string | null>(null);

  const params: CatalogueParams = {
    search: search || undefined,
    categoryId: categoryId ?? undefined,
    minPrice: filters.minPrice ?? undefined,
    maxPrice: filters.maxPrice ?? undefined,
    inStock: filters.inStock || undefined,
    sort: filters.sort,
  };

  const categoriesQuery = useQuery({
    queryKey: storefrontKeys.categories(entitySlug),
    queryFn: () => loadCategories(entitySlug),
    enabled: Boolean(shop),
    staleTime: 5 * 60_000,
  });

  const productsQuery = useInfiniteQuery({
    queryKey: storefrontKeys.products(entitySlug, params),
    queryFn: ({ pageParam }) => loadProducts(entitySlug, { ...params, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: Boolean(shop),
  });

  const products = React.useMemo(
    () => productsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [productsQuery.data],
  );
  const total = productsQuery.data?.pages[0]?.total ?? 0;

  /* Infinite scroll, with a button underneath for anyone who never scrolls. */
  const sentinel = React.useRef<HTMLDivElement | null>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = productsQuery;

  React.useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, products.length]);

  const handleAdd = async (product: StorefrontProductDto) => {
    setAddingId(product.id);
    try {
      await cart.add({ productId: product.id, quantity: 1 });
      toast.success('Adicionado ao carrinho', product.namePt);
    } catch (error) {
      toast.error('Nao foi possivel adicionar', errorMessage(error, 'Tente novamente.'));
    } finally {
      setAddingId(null);
    }
  };

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setCategoryId(null);
    setSearchText('');
    setSearch('');
  };

  const filterCount = activeFilterCount(filters);

  /*
   * The catalogue query is disabled until the shop resolves, and a disabled
   * react-query reports isLoading === false with no data - which rendered
   * "Sem resultados" over an empty grid on every first visit. isPending stays
   * true while the query is idle, so the skeletons hold the screen instead.
   */
  const catalogueLoading = productsQuery.isPending;

  if (shopQuery.isError) {
    return (
      <ShopLayout slug={entitySlug} shop={null}>
        <ShopClosed slug={entitySlug} />
      </ShopLayout>
    );
  }

  return (
    <ShopLayout
      slug={entitySlug}
      shop={shop}
      loading={shopQuery.isLoading}
      cartCount={cart.itemCount}
      search={searchText}
      onSearchChange={setSearchText}
      onSearchCommit={setSearch}
      live={live}
    >
      <div className="lg:flex lg:gap-8">
        <aside className="hidden w-56 shrink-0 space-y-5 lg:block">
          <CategorySidebar
            categories={categoriesQuery.data ?? []}
            activeId={categoryId}
            onSelect={setCategoryId}
          />
          <Separator />
          <CatalogueFilters value={filters} onChange={setFilters} />
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          {(categoriesQuery.data?.length ?? 0) > 0 && (
            <div className="lg:hidden">
              <CategoryScroller
                categories={categoriesQuery.data ?? []}
                activeId={categoryId}
                onSelect={setCategoryId}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <p className="tabular text-sm text-muted-foreground">
              {catalogueLoading ? 'A carregar...' : `${total} produtos`}
            </p>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                className="lg:hidden"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal />
                Filtros
                {filterCount > 0 && (
                  <Badge variant="default" size="sm" className="tabular">
                    {filterCount}
                  </Badge>
                )}
              </Button>
              <SortSelect
                value={filters.sort}
                onChange={(sort) => setFilters({ ...filters, sort })}
                className="hidden w-48 lg:flex"
              />
            </div>
          </div>

          {productsQuery.isError ? (
            <ShopError
              message={errorMessage(productsQuery.error)}
              onRetry={() => void productsQuery.refetch()}
            />
          ) : catalogueLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Sem resultados"
              description="Nao encontramos produtos com estes filtros."
              action={{ label: 'Limpar filtros', onClick: clearAll }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    slug={entitySlug}
                    inStock={resolveProductInStock(product, overrides)}
                    adding={addingId === product.id}
                    onAdd={handleAdd}
                  />
                ))}
              </div>

              <div ref={sentinel} aria-hidden="true" className="h-px" />

              <div className="flex justify-center pt-2">
                {isFetchingNextPage ? (
                  <Spinner className="size-6" />
                ) : hasNextPage ? (
                  <Button variant="outline" size="lg" onClick={() => void fetchNextPage()}>
                    Ver mais produtos
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Chegou ao fim do catalogo.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" size="lg">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <CatalogueFilters value={filters} onChange={setFilters} showSort />
          </SheetBody>
          <SheetFooter>
            <Button block size="lg" onClick={() => setFiltersOpen(false)}>
              {catalogueLoading ? 'Ver produtos' : `Ver ${total} produtos`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ShopLayout>
  );
}
