import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, PackageSearch, Pencil, Plus, X } from 'lucide-react';
import { margin as computeMargin } from '@pos/shared';

import { useAuth } from '@/lib/auth-store';
import { money, number, percent, quantity } from '@/lib/format';
import { qk } from '@/lib/query';
import { cn } from '@/lib/utils';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Pagination,
  toast,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import { catalogApi, type ProductFull, type ProductListParams } from './catalog-api';
import { useCategoriesQuery, useSuppliersQuery, useTaxRatesQuery } from './catalog-hooks';
import { isLowStock, PRODUCT_TYPE_LABELS, unitShort } from './catalog-labels';
import {
  buildProductCsv,
  downloadCsv,
  exportFilename,
  fetchAllProducts,
} from './catalog-export';
import { CatalogPage, NoAccess, QueryError } from './components/catalog-page';
import { BulkEditSheet } from './components/bulk-edit-sheet';
import { EMPTY_FILTERS, ProductFilters, type ProductFiltersValue } from './components/product-filters';
import { ProductThumb } from './components/product-thumb';

const PAGE_SIZE = 25;

/** DataTable sort keys that the API can actually sort on. */
const SERVER_SORTS = new Set(['name', 'price', 'stock', 'created']);

export default function ProductsPage() {
  const navigate = useNavigate();
  const can = useAuth((state) => state.can);
  const canRead = can('product:read');
  const canWrite = can('product:write');
  const canSeeCost = can('product:cost');
  const canSeeSuppliers = can('supplier:read');

  // /produtos?categoria=<id> is how the category screen hands over a filter.
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = React.useState<ProductFiltersValue>(() => ({
    ...EMPTY_FILTERS,
    categoryId: searchParams.get('categoria'),
  }));
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE);
  const [sort, setSort] = React.useState<DataTableSort | null>({ key: 'name', direction: 'asc' });
  const [selected, setSelected] = React.useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  // Any filter change restarts at page one; staying on page 7 of 2 is a bug.
  React.useEffect(() => {
    setPage(1);
  }, [filters]);

  const params: ProductListParams = React.useMemo(
    () => ({
      page,
      pageSize,
      search: filters.search || undefined,
      categoryId: filters.categoryId ?? undefined,
      type: filters.type ?? undefined,
      supplierId: filters.supplierId ?? undefined,
      active: filters.active ?? undefined,
      lowStock: filters.lowStock || undefined,
      sort: sort && SERVER_SORTS.has(sort.key) ? (sort.key as ProductListParams['sort']) : undefined,
      order: sort?.direction,
    }),
    [page, pageSize, filters, sort],
  );

  const productsQuery = useQuery({
    queryKey: qk.products(params),
    queryFn: () => catalogApi.listProducts(params),
    enabled: canRead,
    placeholderData: keepPreviousData,
  });

  const categoriesQuery = useCategoriesQuery(true);
  const suppliersQuery = useSuppliersQuery();
  const taxRatesQuery = useTaxRatesQuery();

  const rows = productsQuery.data?.data ?? [];
  const total = productsQuery.data?.total ?? 0;

  const pageIds = rows.map((row) => row.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const someOnPageSelected = pageIds.some((id) => selected.includes(id));

  const toggleRow = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const togglePage = () =>
    setSelected((current) =>
      allOnPageSelected
        ? current.filter((id) => !pageIds.includes(id))
        : [...new Set([...current, ...pageIds])],
    );

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await fetchAllProducts(params);
      if (all.length === 0) {
        toast.warning('Nada para exportar', 'Nenhum produto corresponde aos filtros actuais.');
        return;
      }
      downloadCsv(exportFilename(), buildProductCsv(all, canSeeCost));
      toast.success('Exportacao concluida', `${all.length} produtos exportados.`);
    } catch {
      toast.error('Falhou a exportacao', 'Nao foi possivel ler o catalogo completo.');
    } finally {
      setExporting(false);
    }
  };

  const columns: Array<DataTableColumn<ProductFull>> = React.useMemo(() => {
    const list: Array<DataTableColumn<ProductFull>> = [];

    if (canWrite) {
      list.push({
        key: 'select',
        width: 56,
        header: (
          <span
            className="flex items-center"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <Checkbox
              checked={allOnPageSelected ? true : someOnPageSelected ? 'indeterminate' : false}
              onCheckedChange={togglePage}
              aria-label="Seleccionar todos nesta pagina"
            />
          </span>
        ),
        cell: (row) => (
          <span
            className="flex items-center"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <Checkbox
              checked={selected.includes(row.id)}
              onCheckedChange={() => toggleRow(row.id)}
              aria-label={`Seleccionar ${row.namePt}`}
            />
          </span>
        ),
      });
    }

    list.push(
      {
        key: 'name',
        header: 'Produto',
        sortable: true,
        cell: (row) => (
          <div className="flex items-center gap-3">
            <ProductThumb url={row.imageUrl} name={row.namePt} tileColor={row.tileColor} />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{row.namePt}</p>
              <p className="truncate text-xs text-muted-foreground">
                {PRODUCT_TYPE_LABELS[row.type]} - {unitShort(row.unit)}
              </p>
            </div>
          </div>
        ),
      },
      {
        key: 'sku',
        header: 'SKU',
        width: 140,
        cell: (row) => <span className="tabular text-sm">{row.sku}</span>,
      },
      {
        key: 'barcode',
        header: 'Codigo de barras',
        width: 160,
        cell: (row) =>
          row.barcode ? (
            <span className="tabular text-sm">{row.barcode}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        key: 'category',
        header: 'Categoria',
        width: 170,
        cell: (row) =>
          row.category ? (
            <span className="truncate">{row.category.namePt}</span>
          ) : (
            <span className="text-muted-foreground">Sem categoria</span>
          ),
      },
      {
        key: 'price',
        header: 'Preco',
        numeric: true,
        sortable: true,
        width: 130,
        cell: (row) => <span className="tabular">{money(row.salePriceMinor)}</span>,
      },
    );

    // The API strips cost for roles without product:cost - never assume it is there.
    if (canSeeCost) {
      list.push(
        {
          key: 'cost',
          header: 'Custo',
          numeric: true,
          width: 120,
          cell: (row) =>
            row.costPriceMinor === undefined ? (
              <span className="text-muted-foreground">-</span>
            ) : (
              <span className="tabular">{money(row.costPriceMinor)}</span>
            ),
        },
        {
          key: 'margin',
          header: 'Margem',
          numeric: true,
          width: 110,
          cell: (row) => {
            if (row.costPriceMinor === undefined) return <span className="text-muted-foreground">-</span>;
            const { marginBps } = computeMargin(row.salePriceMinor, row.costPriceMinor);
            return (
              <span
                className={cn(
                  'tabular font-medium',
                  marginBps < 0 ? 'text-destructive' : marginBps < 1000 ? 'text-warning' : 'text-success',
                )}
              >
                {percent(marginBps)}
              </span>
            );
          },
        },
      );
    }

    list.push(
      {
        key: 'stock',
        header: 'Stock',
        numeric: true,
        sortable: true,
        width: 140,
        cell: (row) => {
          if (!row.trackStock) return <span className="text-xs text-muted-foreground">Sem stock</span>;
          return (
            <span className="inline-flex items-center justify-end gap-2">
              <span className="tabular">{quantity(row.stockQuantity, row.unit)}</span>
              {isLowStock(row) && (
                <Badge variant="warning" size="sm" dot>
                  Baixo
                </Badge>
              )}
            </span>
          );
        },
      },
      {
        key: 'active',
        header: 'Estado',
        width: 110,
        cell: (row) =>
          row.active ? (
            <Badge variant="success" size="sm">
              Activo
            </Badge>
          ) : (
            <Badge variant="muted" size="sm">
              Inactivo
            </Badge>
          ),
      },
    );

    return list;
  }, [canWrite, canSeeCost, selected, allOnPageSelected, someOnPageSelected, pageIds.join(',')]);

  if (!canRead) return <NoAccess what="o catalogo de produtos" />;

  return (
    <CatalogPage
      title="Produtos"
      description={
        productsQuery.isSuccess
          ? `${number(total)} ${total === 1 ? 'produto' : 'produtos'} no catalogo`
          : 'Catalogo de produtos'
      }
      actions={
        <>
          <Button
            variant="outline"
            leftIcon={<Download />}
            onClick={handleExport}
            loading={exporting}
            loadingLabel="A exportar..."
          >
            Exportar
          </Button>
          {canWrite && (
            <Button leftIcon={<Plus />} onClick={() => navigate('/produtos/novo')}>
              Novo produto
            </Button>
          )}
        </>
      }
      toolbar={
        <ProductFilters
          value={filters}
          onChange={setFilters}
          categories={categoriesQuery.data ?? []}
          suppliers={suppliersQuery.data ?? []}
          canSeeSuppliers={canSeeSuppliers}
        />
      }
    >
      {selected.length > 0 && canWrite && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            {selected.length} {selected.length === 1 ? 'produto seleccionado' : 'produtos seleccionados'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" leftIcon={<X />} onClick={() => setSelected([])}>
              Limpar seleccao
            </Button>
            <Button leftIcon={<Pencil />} onClick={() => setBulkOpen(true)}>
              Editar em lote
            </Button>
          </div>
        </div>
      )}

      {productsQuery.isError ? (
        <QueryError
          error={productsQuery.error}
          onRetry={() => void productsQuery.refetch()}
          title="Nao foi possivel carregar os produtos"
        />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              loading={productsQuery.isLoading}
              skeletonRows={8}
              manualSorting
              sort={sort}
              onSortChange={setSort}
              stickyHeader
              onRowClick={(row) => navigate(`/produtos/${row.id}`)}
              isRowSelected={(row) => selected.includes(row.id)}
              emptyIcon={PackageSearch}
              emptyTitle="Sem resultados"
              emptyDescription="Nenhum produto corresponde aos filtros actuais."
              emptyAction={
                canWrite
                  ? { label: 'Criar produto', onClick: () => navigate('/produtos/novo') }
                  : undefined
              }
            />
          </div>

          {total > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </>
      )}

      <BulkEditSheet
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        productIds={selected}
        categories={categoriesQuery.data ?? []}
        suppliers={suppliersQuery.data ?? []}
        taxRates={taxRatesQuery.data?.rates ?? []}
        canSeeSuppliers={canSeeSuppliers}
        onDone={() => setSelected([])}
      />
    </CatalogPage>
  );
}
