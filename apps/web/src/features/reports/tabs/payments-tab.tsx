import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { DataTable, type DataTableColumn } from '@/components/ui';
import { money, number as formatNumber } from '@/lib/format';

import {
  ChartFrame,
  INK,
  MoneyCell,
  ReportState,
  moneyTick,
  seriesColor,
  seriesTooltip,
  shareLabel,
} from '../chart-kit';
import { ExportButtons } from '../export-buttons';
import { useSalesByPaymentMethod, type PaymentRow, type ReportFilterState } from '../report-api';

/**
 * How the money actually arrived: numerario, cartao, Multicaixa Express,
 * dinheiro movel and the rest. The API already nets refunds out of the tender
 * they went back through, so these figures reconcile against the till.
 */
export function PaymentsTab({ filters }: { filters: ReportFilterState }) {
  const query = useSalesByPaymentMethod(filters);
  const rows = query.data?.data ?? [];

  const total = React.useMemo(
    () => rows.reduce((sum, row) => sum + row.revenueMinor, 0),
    [rows],
  );

  const columns: Array<DataTableColumn<PaymentRow>> = [
    {
      key: 'label',
      header: 'Metodo',
      cell: (row, index) => (
        <span className="flex items-center gap-2 font-medium text-foreground">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-sm"
            style={{ backgroundColor: seriesColor(index) }}
          />
          {row.label}
        </span>
      ),
    },
    {
      key: 'revenueMinor',
      header: 'Recebido',
      numeric: true,
      sortable: true,
      width: '10rem',
      cell: (row) => <MoneyCell minor={row.revenueMinor} tone="signed" />,
    },
    {
      key: 'refundMinor',
      header: 'Devolvido',
      numeric: true,
      sortable: true,
      width: '9.5rem',
      cell: (row) =>
        row.refundMinor > 0 ? (
          <span className="tabular text-destructive">{money(row.refundMinor)}</span>
        ) : (
          <span className="tabular text-muted-foreground">-</span>
        ),
    },
    {
      key: 'transactions',
      header: 'Pagamentos',
      numeric: true,
      sortable: true,
      width: '8.5rem',
      cell: (row) => <span className="tabular">{formatNumber(row.transactions, 0)}</span>,
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Total recebido no periodo:{' '}
          <span className="tabular font-semibold text-foreground">{money(total)}</span>
        </p>
        <ExportButtons report="payments" filters={filters} />
      </div>

      <ChartFrame
        title="Reparticao por metodo de pagamento"
        description="Valor liquido por tender, ja descontadas as devolucoes. Eixo horizontal em Kwanza."
        height={Math.max(220, rows.length * 48 + 60)}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={rows.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 16, bottom: 24, left: 8 }}
            barCategoryGap={6}
          >
            <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              stroke={INK.axis}
              tickLine={false}
              axisLine={{ stroke: INK.grid }}
              tickFormatter={moneyTick}
              tick={{ fontSize: 12, fill: INK.axis }}
              label={{ value: 'Valor (Kz)', position: 'insideBottom', offset: -14, fill: INK.axis, fontSize: 12 }}
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
              content={seriesTooltip({
                fallback: 'money',
                footer: (row) => {
                  const count = typeof row.transactions === 'number' ? row.transactions : 0;
                  return `${formatNumber(count, 0)} pagamentos`;
                },
              })}
            />
            <Bar dataKey="revenueMinor" name="Recebido" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell key={row.id} fill={seriesColor(index)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <div className="panel overflow-hidden">
        <ReportState loading={false} error={query.error} onRetry={() => void query.refetch()}>
          <DataTable<PaymentRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            defaultSort={{ key: 'revenueMinor', direction: 'desc' }}
            caption="Valor recebido e devolvido por metodo de pagamento."
            emptyTitle="Sem pagamentos no periodo"
          />
        </ReportState>
      </div>
    </div>
  );
}

export default PaymentsTab;
