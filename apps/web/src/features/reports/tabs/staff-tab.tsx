import * as React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { DataTable, type DataTableColumn } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { number as formatNumber, quantity as formatQuantity } from '@/lib/format';

import { ChartFrame, INK, MoneyCell, ReportState, moneyTick, seriesTooltip, shareLabel } from '../chart-kit';
import { ExportButtons } from '../export-buttons';
import { useSalesByStaff, type ReportFilterState, type StaffRow } from '../report-api';

/**
 * Per-cashier performance. Revenue is a magnitude, so the bars are one hue -
 * a colour per person would imply the colours mean something.
 */
export function StaffTab({ filters }: { filters: ReportFilterState }) {
  const entity = useAuth((state) => state.entity);
  const showTips = entity?.mode === 'restaurant';

  const query = useSalesByStaff(filters);
  const rows = query.data?.data ?? [];

  const chartRows = React.useMemo(() => rows.slice(0, 12), [rows]);

  const columns: Array<DataTableColumn<StaffRow>> = [
    {
      key: 'label',
      header: 'Funcionario',
      cell: (row) => <span className="font-medium text-foreground">{row.label}</span>,
    },
    {
      key: 'revenueMinor',
      header: 'Receita',
      numeric: true,
      sortable: true,
      width: '9.5rem',
      cell: (row) => <MoneyCell minor={row.revenueMinor} tone="signed" />,
    },
    {
      key: 'transactions',
      header: 'Transaccoes',
      numeric: true,
      sortable: true,
      width: '8rem',
      cell: (row) => <span className="tabular">{formatNumber(row.transactions, 0)}</span>,
    },
    {
      key: 'averageTicketMinor',
      header: 'Ticket medio',
      numeric: true,
      sortable: true,
      width: '9.5rem',
      cell: (row) => <MoneyCell minor={row.averageTicketMinor} />,
    },
    {
      key: 'itemsSold',
      header: 'Artigos',
      numeric: true,
      sortable: true,
      width: '7.5rem',
      cell: (row) => <span className="tabular">{formatQuantity(row.itemsSold)}</span>,
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

  if (showTips) {
    columns.splice(5, 0, {
      key: 'tipsMinor',
      header: 'Gorjetas',
      numeric: true,
      sortable: true,
      width: '9rem',
      cell: (row) => <MoneyCell minor={row.tipsMinor} tone="muted" />,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ExportButtons report="staff" filters={filters} />
      </div>

      <ChartFrame
        title="Receita por funcionario"
        description="Os doze primeiros por receita. Eixo horizontal em Kwanza."
        height={Math.max(220, chartRows.length * 44 + 60)}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
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
              label={{ value: 'Receita (Kz)', position: 'insideBottom', offset: -14, fill: INK.axis, fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={140}
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
                  return `${formatNumber(count, 0)} transaccoes`;
                },
              })}
            />
            <Bar
              dataKey="revenueMinor"
              name="Receita"
              fill={INK.revenue}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <div className="panel overflow-hidden">
        <ReportState loading={false} error={query.error} onRetry={() => void query.refetch()}>
          <DataTable<StaffRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            defaultSort={{ key: 'revenueMinor', direction: 'desc' }}
            stickyHeader
            caption="Desempenho por funcionario no periodo seleccionado."
            emptyTitle="Sem vendas no periodo"
          />
        </ReportState>
      </div>
    </div>
  );
}

export default StaffTab;
