import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { amount, number as formatNumber, percent, quantity as formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  ChartFrame,
  ChartLegend,
  INK,
  ReportState,
  moneyTick,
  seriesColor,
  seriesTooltip,
  shareLabel,
} from '@/features/reports/chart-kit';
import { bucketLabel } from '@/features/reports/tabs/sales-tab';
import {
  useSalesByCategory,
  useSalesByProduct,
  useSalesSeries,
  type Granularity,
  type ReportFilterState,
} from '@/features/reports/report-api';

/* -------------------------------------------------------------------------- */
/* Revenue over time                                                           */
/* -------------------------------------------------------------------------- */

export function RevenueChart({
  filters,
  granularity,
}: {
  filters: ReportFilterState;
  granularity: Granularity;
}) {
  const can = useAuth((state) => state.can);
  const showProfit = can('report:financial');

  const query = useSalesSeries(filters, granularity);
  const points = React.useMemo(
    () =>
      (query.data?.data ?? []).map((point) => ({
        ...point,
        label: bucketLabel(point.bucket, granularity),
      })),
    [query.data, granularity],
  );

  return (
    <div className="flex flex-col gap-3">
      <ChartFrame
        title="Receita ao longo do tempo"
        description={
          showProfit
            ? 'Area: receita liquida. Linha: lucro bruto. Eixo vertical em Kwanza.'
            : 'Receita liquida de devolucoes e descontos. Eixo vertical em Kwanza.'
        }
        height={280}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={points.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              stroke={INK.axis}
              tickLine={false}
              axisLine={{ stroke: INK.grid }}
              tick={{ fontSize: 12, fill: INK.axis }}
              minTickGap={28}
            />
            <YAxis
              stroke={INK.axis}
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={moneyTick}
              tick={{ fontSize: 12, fill: INK.axis }}
            />
            <Tooltip
              cursor={{ stroke: INK.axis, strokeWidth: 1 }}
              content={seriesTooltip({
                fallback: 'money',
                footer: (row) => {
                  const count = typeof row.transactions === 'number' ? row.transactions : 0;
                  return `${formatNumber(count, 0)} transaccoes`;
                },
              })}
            />
            <Area
              type="monotone"
              dataKey="revenueMinor"
              name="Receita"
              stroke={INK.revenue}
              strokeWidth={2}
              fill={INK.revenue}
              fillOpacity={0.14}
              isAnimationActive={false}
              dot={false}
            />
            {showProfit && (
              <Line
                type="monotone"
                dataKey="profitMinor"
                name="Lucro bruto"
                stroke={INK.profit}
                strokeWidth={2}
                isAnimationActive={false}
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartLegend
        className="px-1"
        items={[
          { label: 'Receita', color: INK.revenue },
          ...(showProfit ? [{ label: 'Lucro bruto', color: INK.profit }] : []),
        ]}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sales by category                                                           */
/* -------------------------------------------------------------------------- */

export function CategoryBars({ filters }: { filters: ReportFilterState }) {
  const query = useSalesByCategory(filters);
  const rows = React.useMemo(
    () => (query.data?.data ?? []).filter((row) => row.revenueMinor > 0).slice(0, 8),
    [query.data],
  );

  return (
    <ChartFrame
      title="Vendas por categoria"
      description="As oito categorias com mais receita no periodo. Eixo horizontal em Kwanza."
      height={Math.max(240, rows.length * 44 + 40)}
      loading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
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
          />
          <YAxis
            type="category"
            dataKey="label"
            width={130}
            stroke={INK.axis}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: INK.axis }}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))' }}
            content={seriesTooltip({
              fallback: 'money',
              footer: (row) => {
                const share = typeof row.share === 'number' ? row.share : 0;
                return `${shareLabel(share)} do total`;
              },
            })}
          />
          <Bar dataKey="revenueMinor" name="Receita" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {rows.map((row, index) => (
              <Cell key={row.id} fill={seriesColor(index)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Top products                                                                */
/* -------------------------------------------------------------------------- */

export function TopProducts({ filters }: { filters: ReportFilterState }) {
  const can = useAuth((state) => state.can);
  const showFinancial = can('report:financial');

  const query = useSalesByProduct(filters, { limit: 10, sort: 'revenue' });
  const rows = query.data?.data ?? [];

  return (
    <section className="panel flex flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">Top 10 produtos</h3>
          <p className="text-sm text-muted-foreground">Por receita no periodo seleccionado.</p>
        </div>
        <Link
          to="/relatorios?tab=produtos"
          className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Ver todos
        </Link>
      </header>

      <ReportState loading={false} error={query.error} onRetry={() => void query.refetch()}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Produto</TableHead>
              <TableHead align="right">Qtd.</TableHead>
              <TableHead align="right">Receita</TableHead>
              {showFinancial && <TableHead align="right">Margem</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableEmpty colSpan={showFinancial ? 4 : 3} message="A carregar..." />
            )}
            {!query.isLoading && rows.length === 0 && (
              <TableEmpty
                colSpan={showFinancial ? 4 : 3}
                message="Sem vendas no periodo"
                description="Escolha outro intervalo de datas."
              />
            )}
            {!query.isLoading &&
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span className="block truncate font-medium text-foreground">{row.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {shareLabel(row.share)} da receita
                    </span>
                  </TableCell>
                  <TableCell align="right">
                    <span className="tabular">{formatQuantity(row.quantity)}</span>
                  </TableCell>
                  <TableCell align="right">
                    <span className="tabular font-semibold">{amount(row.revenueMinor)}</span>
                  </TableCell>
                  {showFinancial && (
                    <TableCell align="right">
                      <span
                        className={cn(
                          'tabular',
                          (row.marginBps ?? 0) < 0 && 'font-semibold text-destructive',
                        )}
                      >
                        {row.marginBps === undefined ? '--' : percent(row.marginBps)}
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </ReportState>
    </section>
  );
}
