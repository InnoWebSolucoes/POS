import * as React from 'react';

import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { percent, quantity as formatQuantity } from '@/lib/format';

import { MoneyCell, ReportState, RestrictedCell, shareLabel } from '../chart-kit';
import { ExportButtons } from '../export-buttons';
import {
  useSalesByProduct,
  type BreakdownRow,
  type ProductSort,
  type ReportFilterState,
} from '../report-api';

/**
 * The ranked product table. Sorting is server-side, because "top 50 by margin"
 * is a different fifty rows from "top 50 by revenue" - sorting the page in the
 * browser would quietly rank only what the first sort happened to return.
 */

const SORT_BY_COLUMN: Record<string, ProductSort> = {
  quantity: 'quantity',
  revenueMinor: 'revenue',
  profitMinor: 'profit',
  marginBps: 'margin',
};

const COLUMN_BY_SORT: Record<ProductSort, string> = {
  quantity: 'quantity',
  revenue: 'revenueMinor',
  profit: 'profitMinor',
  margin: 'marginBps',
};

export function ProductsTab({ filters }: { filters: ReportFilterState }) {
  const can = useAuth((state) => state.can);
  const showFinancial = can('report:financial');

  const [sort, setSort] = React.useState<ProductSort>('revenue');
  const query = useSalesByProduct(filters, { limit: 100, sort });
  const rows = query.data?.data ?? [];

  const tableSort: DataTableSort = { key: COLUMN_BY_SORT[sort], direction: 'desc' };

  const onSortChange = (next: DataTableSort | null) => {
    // The API only ranks descending, which is the only direction that answers
    // "what are my best products" - clearing a sort falls back to revenue.
    const mapped = next ? SORT_BY_COLUMN[next.key] : undefined;
    setSort(mapped ?? 'revenue');
  };

  const columns: Array<DataTableColumn<BreakdownRow>> = [
    {
      key: 'label',
      header: 'Produto',
      cell: (row) => <span className="font-medium text-foreground">{row.label}</span>,
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
      width: '9rem',
      cell: (row) => <MoneyCell minor={row.revenueMinor} tone="signed" />,
    },
    {
      key: 'share',
      header: '% do total',
      numeric: true,
      width: '7rem',
      cell: (row) => <span className="tabular text-muted-foreground">{shareLabel(row.share)}</span>,
    },
  ];

  if (showFinancial) {
    columns.splice(
      3,
      0,
      {
        key: 'cogsMinor',
        header: 'Custo',
        numeric: true,
        width: '9rem',
        cell: (row) => (
          <RestrictedCell value={row.cogsMinor === undefined ? null : <MoneyCell minor={row.cogsMinor} tone="muted" />} />
        ),
      },
      {
        key: 'profitMinor',
        header: 'Lucro',
        numeric: true,
        sortable: true,
        width: '9rem',
        cell: (row) => (
          <RestrictedCell value={row.profitMinor === undefined ? null : <MoneyCell minor={row.profitMinor} tone="signed" />} />
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Os 100 artigos com mais {sort === 'quantity' ? 'unidades vendidas' : sort === 'margin' ? 'margem' : sort === 'profit' ? 'lucro' : 'receita'} no
          periodo. Toque num cabecalho para mudar a ordenacao.
        </p>
        <ExportButtons report="products" filters={filters} options={{ sort, limit: 500 }} />
      </div>

      <div className="panel overflow-hidden">
        <ReportState
          loading={false}
          error={query.error}
          onRetry={() => void query.refetch()}
        >
          <DataTable<BreakdownRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            manualSorting
            sort={tableSort}
            onSortChange={onSortChange}
            stickyHeader
            caption="Artigos vendidos no periodo, ordenados pelo criterio seleccionado."
            emptyTitle="Sem vendas no periodo"
            emptyDescription="Nenhum artigo foi vendido com estes filtros."
          />
        </ReportState>
      </div>
    </div>
  );
}

export default ProductsTab;
