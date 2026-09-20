import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Badge, DataTable, StatCard, type DataTableColumn } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { formatDate, money, number as formatNumber, percent, quantity as formatQuantity } from '@/lib/format';

import {
  ChartFrame,
  INK,
  MoneyCell,
  NoPermission,
  ReportState,
  moneyTick,
  seriesColor,
  seriesTooltip,
  shareLabel,
} from '../chart-kit';
import { ExportButtons } from '../export-buttons';
import {
  useExpiringStock,
  useInventoryValuation,
  useReportDeadStock,
  type DeadStockRow,
  type ExpiringRow,
  type ReportFilterState,
  type ValuationRow,
} from '../report-api';

/**
 * Stock as money: what the shelves are worth, what has stopped moving, and
 * what is about to go out of date. Valuation and dead stock are cost data, so
 * the API requires `report:financial` for both - without it the panels say so
 * rather than rendering an empty chart.
 */
export function StockTab({ filters }: { filters: ReportFilterState }) {
  const can = useAuth((state) => state.can);
  const showFinancial = can('report:financial');
  const canReadInventory = can('inventory:read');

  const valuation = useInventoryValuation(filters, showFinancial);
  const deadStock = useReportDeadStock(filters, 90, showFinancial);
  const expiring = useExpiringStock(30, canReadInventory);

  const valuationRows = valuation.data?.rows ?? [];
  const chartRows = React.useMemo(() => valuationRows.slice(0, 10), [valuationRows]);
  const totals = valuation.data?.total;

  if (!showFinancial && !canReadInventory) {
    return <NoPermission />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ExportButtons report="inventory" filters={filters} disabled={!showFinancial} />
      </div>

      {showFinancial ? (
        <>
          {/* Same reason as the stock screen: a whole-catalogue valuation is an
              eight-figure Kwanza value, and a quarter of the row at xl is
              176px - too narrow for it. */}
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <StatCard
              label="Valor a custo"
              value={money(totals?.costValueMinor ?? 0)}
              loading={valuation.isLoading}
            />
            <StatCard
              label="Valor a venda"
              value={money(totals?.retailValueMinor ?? 0)}
              loading={valuation.isLoading}
            />
            <StatCard
              label="Lucro potencial"
              value={money(totals?.potentialProfitMinor ?? 0)}
              tone="success"
              loading={valuation.isLoading}
            />
            <StatCard
              label="Margem potencial"
              value={percent(totals?.marginBps ?? 0)}
              loading={valuation.isLoading}
            />
          </div>

          <ChartFrame
            title="Valorizacao de stock por categoria"
            description="Capital parado em cada categoria, a preco de custo. Eixo horizontal em Kwanza."
            height={Math.max(220, chartRows.length * 44 + 60)}
            loading={valuation.isLoading}
            error={valuation.error}
            onRetry={() => void valuation.refetch()}
            empty={chartRows.length === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartRows}
                layout="vertical"
                margin={{ top: 8, right: 16, bottom: 24, left: 8 }}
                barCategoryGap={4}
              >
                <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  stroke={INK.axis}
                  tickLine={false}
                  axisLine={{ stroke: INK.grid }}
                  tickFormatter={moneyTick}
                  tick={{ fontSize: 12, fill: INK.axis }}
                  label={{ value: 'Custo (Kz)', position: 'insideBottom', offset: -14, fill: INK.axis, fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={150}
                  stroke={INK.axis}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: INK.axis }}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))' }}
                  content={seriesTooltip({ fallback: 'money' })}
                />
                <Bar dataKey="costValueMinor" name="Valor a custo" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {chartRows.map((row, index) => (
                    <Cell key={row.id} fill={seriesColor(index)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>

          <Panel title="Valorizacao detalhada">
            <ReportState loading={false} error={valuation.error} onRetry={() => void valuation.refetch()}>
              <DataTable<ValuationRow>
                columns={valuationColumns}
                rows={valuationRows}
                rowKey={(row) => row.id}
                loading={valuation.isLoading}
                defaultSort={{ key: 'costValueMinor', direction: 'desc' }}
                stickyHeader
                caption="Quantidade e valor de stock por categoria."
                emptyTitle="Sem stock valorizado"
              />
            </ReportState>
          </Panel>

          <Panel
            title="Stock morto"
            description={`Artigos com stock que nao venderam nada nos ultimos ${deadStock.data?.days ?? 90} dias. Capital parado: ${money(deadStock.data?.totalTiedUpMinor ?? 0)}.`}
          >
            <ReportState loading={false} error={deadStock.error} onRetry={() => void deadStock.refetch()}>
              <DataTable<DeadStockRow>
                columns={deadStockColumns}
                rows={deadStock.data?.rows ?? []}
                rowKey={(row) => row.productId}
                loading={deadStock.isLoading}
                defaultSort={{ key: 'tiedUpCapitalMinor', direction: 'desc' }}
                stickyHeader
                caption="Artigos parados e o capital que prendem."
                emptyTitle="Nenhum artigo parado"
                emptyDescription="Tudo o que esta em stock vendeu pelo menos uma vez no periodo."
              />
            </ReportState>
          </Panel>
        </>
      ) : (
        <NoPermission description="A valorizacao de stock e o stock morto expoem precos de custo. Exigem a permissao report:financial." />
      )}

      {canReadInventory && (
        <Panel
          title="Artigos a expirar"
          description="Lotes com validade nos proximos 30 dias, os mais urgentes primeiro."
        >
          <ReportState loading={false} error={expiring.error} onRetry={() => void expiring.refetch()}>
            <DataTable<ExpiringRow>
              columns={expiringColumns}
              rows={expiring.data?.data ?? []}
              rowKey={(row) => row.batchId}
              loading={expiring.isLoading}
              stickyHeader
              caption="Lotes com validade proxima."
              emptyTitle="Nada a expirar"
              emptyDescription="Nenhum lote expira nos proximos 30 dias."
            />
          </ReportState>
        </Panel>
      )}
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel overflow-hidden">
      <header className="space-y-1 border-b border-border p-5">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

const valuationColumns: Array<DataTableColumn<ValuationRow>> = [
  { key: 'label', header: 'Categoria', cell: (row) => <span className="font-medium text-foreground">{row.label}</span> },
  {
    key: 'productCount',
    header: 'Artigos',
    numeric: true,
    sortable: true,
    width: '7rem',
    cell: (row) => <span className="tabular">{formatNumber(row.productCount, 0)}</span>,
  },
  {
    key: 'quantity',
    header: 'Unidades',
    numeric: true,
    sortable: true,
    width: '8rem',
    cell: (row) => <span className="tabular">{formatQuantity(row.quantity)}</span>,
  },
  {
    key: 'costValueMinor',
    header: 'Custo',
    numeric: true,
    sortable: true,
    width: '9.5rem',
    cell: (row) => <MoneyCell minor={row.costValueMinor} />,
  },
  {
    key: 'retailValueMinor',
    header: 'Venda',
    numeric: true,
    sortable: true,
    width: '9.5rem',
    cell: (row) => <MoneyCell minor={row.retailValueMinor} />,
  },
  {
    key: 'marginBps',
    header: 'Margem',
    numeric: true,
    sortable: true,
    width: '7.5rem',
    cell: (row) => <span className="tabular">{percent(row.marginBps)}</span>,
  },
  {
    key: 'share',
    header: '% do total',
    numeric: true,
    sortable: true,
    width: '7rem',
    cell: (row) => <span className="tabular text-muted-foreground">{shareLabel(row.share)}</span>,
  },
];

const deadStockColumns: Array<DataTableColumn<DeadStockRow>> = [
  {
    key: 'name',
    header: 'Produto',
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{row.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.sku} &middot; {row.categoryName}
        </p>
      </div>
    ),
  },
  {
    key: 'quantity',
    header: 'Em stock',
    numeric: true,
    sortable: true,
    width: '8rem',
    cell: (row) => <span className="tabular">{formatQuantity(row.quantity)}</span>,
  },
  {
    key: 'tiedUpCapitalMinor',
    header: 'Capital parado',
    numeric: true,
    sortable: true,
    width: '10rem',
    cell: (row) => <MoneyCell minor={row.tiedUpCapitalMinor} />,
  },
  {
    key: 'daysSinceSale',
    header: 'Dias sem vender',
    numeric: true,
    sortable: true,
    width: '10rem',
    sortValue: (row) => row.daysSinceSale ?? Number.MAX_SAFE_INTEGER,
    cell: (row) =>
      row.daysSinceSale === null ? (
        <Badge variant="destructive" size="sm">
          Nunca vendeu
        </Badge>
      ) : (
        <span className="tabular">{formatNumber(row.daysSinceSale, 0)}</span>
      ),
  },
  {
    key: 'lastSoldAt',
    header: 'Ultima venda',
    width: '9rem',
    cell: (row) => <span className="tabular text-muted-foreground">{formatDate(row.lastSoldAt)}</span>,
  },
];

const expiringColumns: Array<DataTableColumn<ExpiringRow>> = [
  {
    key: 'productName',
    header: 'Produto',
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{row.productName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.sku}
          {row.variantName ? ` - ${row.variantName}` : ''}
          {row.batchNumber ? ` - Lote ${row.batchNumber}` : ''}
        </p>
      </div>
    ),
  },
  {
    key: 'quantityRemaining',
    header: 'Quantidade',
    numeric: true,
    sortable: true,
    width: '8.5rem',
    cell: (row) => <span className="tabular">{formatQuantity(row.quantityRemaining)}</span>,
  },
  {
    key: 'expiryDate',
    header: 'Validade',
    sortable: true,
    width: '9rem',
    cell: (row) => <span className="tabular">{formatDate(row.expiryDate)}</span>,
  },
  {
    key: 'daysToExpiry',
    header: 'Dias',
    numeric: true,
    sortable: true,
    width: '9rem',
    sortValue: (row) => row.daysToExpiry ?? Number.MAX_SAFE_INTEGER,
    cell: (row) => {
      if (row.expired) {
        return (
          <Badge variant="destructive" size="sm">
            Expirado
          </Badge>
        );
      }
      const days = row.daysToExpiry ?? 0;
      return (
        <Badge variant={days <= 7 ? 'warning' : 'muted'} size="sm">
          {formatNumber(days, 0)} dias
        </Badge>
      );
    },
  },
  {
    key: 'stockValueMinor',
    header: 'Valor',
    numeric: true,
    sortable: true,
    width: '9rem',
    cell: (row) => <MoneyCell minor={row.stockValueMinor} tone="muted" />,
  },
];

export default StockTab;
