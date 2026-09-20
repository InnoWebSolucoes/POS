import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Coins, Layers, PackagePlus, PackageX, Tags } from 'lucide-react';

import {
  Badge,
  Button,
  DataTable,
  Pagination,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type DataTableColumn,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { amount, money, number as formatNumber, quantity as formatQuantity } from '@/lib/format';
import { useLevelCount, useStockLevels, useValuation, type LevelsFilters } from './api';
import {
  CategorySelect,
  ClearFiltersButton,
  ErrorState,
  FilterBar,
  InventoryShell,
  LocationSelect,
  StockStatusBadge,
} from './components/inventory-shell';
import { DeadStockReport, ExpiringReport, LowStockReport } from './components/stock-reports';
import type { StockLevelDto, StockLevelVariantDto } from './types';

type StockFilter = 'todos' | 'baixo' | 'esgotado';

/** One table row: either a product, or one of its variants under it. */
interface LevelRow {
  key: string;
  level: StockLevelDto;
  variant: StockLevelVariantDto | null;
}

function flatten(levels: StockLevelDto[]): LevelRow[] {
  const rows: LevelRow[] = [];
  for (const level of levels) {
    rows.push({ key: level.productId, level, variant: null });
    for (const variant of level.variants) {
      rows.push({ key: `${level.productId}:${variant.variantId}`, level, variant });
    }
  }
  return rows;
}

const rowQuantity = (row: LevelRow) => (row.variant ? row.variant.quantity : row.level.quantity);
const rowMinimum = (row: LevelRow) => (row.variant ? row.variant.minStockLevel : row.level.minStockLevel);
const rowCost = (row: LevelRow) => (row.variant ? row.variant.avgCostMinor : row.level.avgCostMinor);
const rowValue = (row: LevelRow) => (row.variant ? row.variant.stockValueMinor : row.level.stockValueMinor);
const rowLocations = (row: LevelRow) => (row.variant ? row.variant.locations : row.level.locations);

export default function InventoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const can = useAuth((s) => s.can);
  const showCost = can('product:cost');
  const showValuation = can('report:financial');

  const [search, setSearch] = React.useState('');
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const [categoryId, setCategoryId] = React.useState<string | undefined>(undefined);
  const [stockFilter, setStockFilter] = React.useState<StockFilter>('todos');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  const filters: LevelsFilters = {
    page,
    pageSize,
    locationId,
    categoryId,
    search: search.trim() || undefined,
    lowStock: stockFilter === 'baixo' ? true : undefined,
    outOfStock: stockFilter === 'esgotado' ? true : undefined,
  };

  const levels = useStockLevels(filters);
  const valuation = useValuation(locationId, showValuation);
  const lowCount = useLevelCount('lowStock', locationId, categoryId);
  const outCount = useLevelCount('outOfStock', locationId, categoryId);

  const rows = React.useMemo(() => flatten(levels.data?.data ?? []), [levels.data]);
  const dirty = Boolean(search || locationId || categoryId || stockFilter !== 'todos');

  const resetFilters = () => {
    setSearch('');
    setLocationId(undefined);
    setCategoryId(undefined);
    setStockFilter('todos');
    setPage(1);
  };

  const columns: Array<DataTableColumn<LevelRow>> = [
    {
      key: 'product',
      header: 'Produto',
      width: '24rem',
      cell: (row) => (
        <div className={row.variant ? 'pl-5' : undefined}>
          <span className="block truncate font-medium text-foreground">
            {row.variant ? Object.values(row.variant.options).join(' / ') || row.variant.sku : row.level.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {row.variant ? row.variant.sku : row.level.sku}
            {!row.variant && row.level.barcode ? ` - ${row.level.barcode}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      cell: (row) => row.level.categoryName ?? <span className="text-muted-foreground">Sem categoria</span>,
    },
    {
      key: 'locations',
      header: 'Por localizacao',
      width: '18rem',
      cell: (row) => {
        const locations = rowLocations(row).filter((entry) => entry.quantity !== 0);
        if (locations.length === 0) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {locations.map((entry) => (
              <Badge key={entry.locationId} variant="muted" size="sm">
                {entry.locationName}: <span className="tabular ml-1">{formatNumber(entry.quantity, entry.quantity % 1 === 0 ? 0 : 3)}</span>
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: 'quantity',
      header: 'Total',
      numeric: true,
      sortable: true,
      sortValue: rowQuantity,
      cell: (row) => <span className="tabular font-semibold">{formatQuantity(rowQuantity(row), row.level.unit)}</span>,
    },
    {
      key: 'minimum',
      header: 'Minimo',
      numeric: true,
      cell: (row) => <span className="tabular text-muted-foreground">{formatNumber(rowMinimum(row), rowMinimum(row) % 1 === 0 ? 0 : 3)}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (row) => <StockStatusBadge quantity={rowQuantity(row)} minStockLevel={rowMinimum(row)} />,
    },
  ];

  if (showCost) {
    columns.push(
      {
        key: 'unitCost',
        header: 'Custo unit.',
        numeric: true,
        cell: (row) => {
          const cost = rowCost(row);
          return cost === undefined ? <span className="text-muted-foreground">-</span> : <span className="tabular">{amount(cost)}</span>;
        },
      },
      {
        key: 'stockValue',
        header: 'Valor',
        numeric: true,
        sortable: true,
        sortValue: (row) => rowValue(row) ?? 0,
        cell: (row) => {
          const value = rowValue(row);
          return value === undefined ? (
            <span className="text-muted-foreground">-</span>
          ) : (
            <span className="tabular font-semibold">{amount(value)}</span>
          );
        },
      },
    );
  }

  return (
    <InventoryShell
      title={t('inventory.title', 'Gestao de Stock')}
      description="Niveis por localizacao, valor em stock e os alertas que precisam de accao."
      actions={
        <>
          {can('inventory:receive') && (
            <Button leftIcon={<PackagePlus className="size-5" />} onClick={() => navigate('/stock/entrada')}>
              {t('inventory.receiveStock', 'Entrada de Stock')}
            </Button>
          )}
          {can('inventory:adjust') && (
            <Button variant="outline" onClick={() => navigate('/stock/ajuste')}>
              Ajustar
            </Button>
          )}
        </>
      }
    >
      {/* Stock valuation for a supermarket runs to eight figures. Four across
          at xl leaves 176px of text per tile, which StatCard has to ellipsise;
          hold two columns until 2xl, where four still fit whole. */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {showValuation ? (
          <>
            <StatCard
              label="Valor em stock (custo)"
              value={money(valuation.data?.totalCostMinor ?? 0)}
              icon={Coins}
              tone="primary"
              loading={valuation.isLoading}
              deltaHint={valuation.data ? `${formatNumber(valuation.data.productCount)} artigos` : undefined}
            />
            <StatCard
              label="Valor a retalho"
              value={money(valuation.data?.totalRetailMinor ?? 0)}
              icon={Tags}
              loading={valuation.isLoading}
              deltaHint={valuation.data ? `Lucro potencial ${money(valuation.data.potentialProfitMinor)}` : undefined}
            />
          </>
        ) : (
          <StatCard
            label="Artigos com controlo de stock"
            value={formatNumber(levels.data?.total ?? 0)}
            icon={Layers}
            loading={levels.isLoading}
          />
        )}
        <StatCard
          label="Linhas com stock baixo"
          value={formatNumber(lowCount.data ?? 0)}
          icon={AlertTriangle}
          tone="warning"
          loading={lowCount.isLoading}
          onClick={() => {
            setStockFilter('baixo');
            setPage(1);
          }}
        />
        <StatCard
          label="Linhas esgotadas"
          value={formatNumber(outCount.data ?? 0)}
          icon={PackageX}
          tone="destructive"
          loading={outCount.isLoading}
          onClick={() => {
            setStockFilter('esgotado');
            setPage(1);
          }}
        />
      </section>

      <Tabs defaultValue="niveis" className="flex flex-col gap-4">
        <TabsList variant="underline">
          <TabsTrigger value="niveis">{t('inventory.levels', 'Niveis')}</TabsTrigger>
          <TabsTrigger value="baixo">{t('inventory.lowStock', 'Stock Baixo')}</TabsTrigger>
          <TabsTrigger value="parado">{t('inventory.deadStock', 'Stock Parado')}</TabsTrigger>
          <TabsTrigger value="expirar">{t('inventory.expiring', 'A Expirar')}</TabsTrigger>
        </TabsList>

        <TabsContent value="niveis" className="flex flex-col gap-4">
          <FilterBar>
            <SearchInput
              value={search}
              onValueChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Procurar por nome, SKU ou codigo de barras..."
              className="min-w-[16rem] flex-1"
            />
            <LocationSelect
              value={locationId}
              onChange={(value) => {
                setLocationId(value);
                setPage(1);
              }}
            />
            <CategorySelect
              value={categoryId}
              onChange={(value) => {
                setCategoryId(value);
                setPage(1);
              }}
            />
            <Select
              value={stockFilter}
              onValueChange={(value) => {
                setStockFilter(value as StockFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="min-w-[11rem]" aria-label="Estado do stock">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os estados</SelectItem>
                <SelectItem value="baixo">Apenas stock baixo</SelectItem>
                <SelectItem value="esgotado">Apenas esgotados</SelectItem>
              </SelectContent>
            </Select>
            <ClearFiltersButton show={dirty} onClick={resetFilters} />
          </FilterBar>

          {levels.isError ? (
            <ErrorState error={levels.error} onRetry={() => void levels.refetch()} />
          ) : (
            <div className="rounded-xl border border-border bg-card">
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(row) => row.key}
                loading={levels.isLoading}
                stickyHeader
                emptyTitle="Sem resultados"
                emptyDescription={
                  dirty
                    ? 'Nenhum artigo corresponde aos filtros aplicados.'
                    : 'Ainda nao existem produtos com controlo de stock.'
                }
                emptyIcon={Layers}
              />
              <div className="border-t border-border p-3">
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={levels.data?.total ?? 0}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="baixo">
          <LowStockReport locationId={locationId} categoryId={categoryId} />
        </TabsContent>
        <TabsContent value="parado">
          <DeadStockReport categoryId={categoryId} />
        </TabsContent>
        <TabsContent value="expirar">
          <ExpiringReport locationId={locationId} />
        </TabsContent>
      </Tabs>
    </InventoryShell>
  );
}
