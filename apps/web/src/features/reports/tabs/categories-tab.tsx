import * as React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { DataTable, type DataTableColumn } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { money, percent, quantity as formatQuantity } from '@/lib/format';

import {
  ChartFrame,
  MoneyCell,
  ReportState,
  RestrictedCell,
  SERIES_OTHER,
  seriesColor,
  seriesTooltip,
  shareLabel,
} from '../chart-kit';
import { ExportButtons } from '../export-buttons';
import { useSalesByCategory, type BreakdownRow, type ReportFilterState } from '../report-api';

/**
 * Categories: the donut answers "where does the money come from", the table
 * answers "how much, exactly". Only the first seven categories get a hue; the
 * rest fold into "Outras" rather than inventing an eighth colour, and every
 * slice is named in the list beside the chart, so identity is never colour
 * alone.
 */

const MAX_SLICES = 7;

interface Slice {
  id: string;
  label: string;
  revenueMinor: number;
  share: number;
  color: string;
}

function toSlices(rows: BreakdownRow[]): Slice[] {
  const positive = rows.filter((row) => row.revenueMinor > 0);
  const head = positive.slice(0, MAX_SLICES).map((row, index) => ({
    id: row.id,
    label: row.label,
    revenueMinor: row.revenueMinor,
    share: row.share,
    color: seriesColor(index),
  }));

  const tail = positive.slice(MAX_SLICES);
  if (tail.length === 0) return head;

  return [
    ...head,
    {
      id: '__outras__',
      label: `Outras (${tail.length})`,
      revenueMinor: tail.reduce((sum, row) => sum + row.revenueMinor, 0),
      share: tail.reduce((sum, row) => sum + row.share, 0),
      color: SERIES_OTHER,
    },
  ];
}

export function CategoriesTab({ filters }: { filters: ReportFilterState }) {
  const can = useAuth((state) => state.can);
  const showFinancial = can('report:financial');

  const query = useSalesByCategory(filters);
  const rows = query.data?.data ?? [];
  const slices = React.useMemo(() => toSlices(rows), [rows]);
  const total = slices.reduce((sum, slice) => sum + slice.revenueMinor, 0);

  const columns: Array<DataTableColumn<BreakdownRow>> = [
    {
      key: 'label',
      header: 'Categoria',
      cell: (row, index) => (
        <span className="flex items-center gap-2 font-medium text-foreground">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-sm"
            style={{ backgroundColor: index < MAX_SLICES ? seriesColor(index) : SERIES_OTHER }}
          />
          {row.label}
        </span>
      ),
    },
    {
      key: 'quantity',
      header: 'Qtd.',
      numeric: true,
      sortable: true,
      width: '7rem',
      cell: (row) => <span className="tabular">{formatQuantity(row.quantity)}</span>,
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
      key: 'share',
      header: '% do total',
      numeric: true,
      sortable: true,
      width: '7rem',
      cell: (row) => <span className="tabular text-muted-foreground">{shareLabel(row.share)}</span>,
    },
  ];

  if (showFinancial) {
    columns.splice(
      3,
      0,
      {
        key: 'profitMinor',
        header: 'Lucro',
        numeric: true,
        sortable: true,
        width: '9.5rem',
        cell: (row) => (
          <RestrictedCell
            value={row.profitMinor === undefined ? null : <MoneyCell minor={row.profitMinor} tone="signed" />}
          />
        ),
      },
      {
        key: 'marginBps',
        header: 'Margem',
        numeric: true,
        sortable: true,
        width: '7.5rem',
        cell: (row) =>
          row.marginBps === undefined ? (
            <RestrictedCell value={null} />
          ) : (
            <span className={row.marginBps < 0 ? 'tabular font-semibold text-destructive' : 'tabular'}>
              {percent(row.marginBps)}
            </span>
          ),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ExportButtons report="categories" filters={filters} />
      </div>

      <ChartFrame
        title="Reparticao da receita por categoria"
        description="Cada fatia e uma categoria; a lista ao lado da o valor exacto e a quota."
        height="auto"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={slices.length === 0}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-center">
          <div className="relative h-[16rem] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="revenueMinor"
                  nameKey="label"
                  innerRadius="58%"
                  outerRadius="88%"
                  paddingAngle={2}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.id} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip content={seriesTooltip({ fallback: 'money' })} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total
              </span>
              <span className="tabular text-lg font-semibold text-foreground">{money(total)}</span>
            </div>
          </div>

          <ul className="flex flex-col gap-1">
            {slices.map((slice) => (
              <li
                key={slice.id}
                className="flex min-h-[2.75rem] items-center justify-between gap-3 rounded-lg px-2 py-1.5 odd:bg-muted/40"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="truncate font-medium text-foreground">{slice.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-sm">
                  <span className="tabular font-semibold text-foreground">{money(slice.revenueMinor)}</span>
                  <span className="tabular w-14 text-right text-muted-foreground">
                    {shareLabel(slice.share)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </ChartFrame>

      <div className="panel overflow-hidden">
        <ReportState loading={false} error={query.error} onRetry={() => void query.refetch()}>
          <DataTable<BreakdownRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            defaultSort={{ key: 'revenueMinor', direction: 'desc' }}
            stickyHeader
            caption="Receita, quantidade e quota de cada categoria no periodo."
            emptyTitle="Sem vendas no periodo"
          />
        </ReportState>
      </div>
    </div>
  );
}

export default CategoriesTab;
