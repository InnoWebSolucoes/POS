import * as React from 'react';

import { Badge, DataTable, StatCard, type DataTableColumn } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import {
  formatDate,
  formatPhone,
  money,
  number as formatNumber,
  percent,
  quantity as formatQuantity,
} from '@/lib/format';

import { MoneyCell, NoPermission, ReportState, seriesColor, shareLabel } from '../chart-kit';
import { ExportButtons } from '../export-buttons';
import {
  useCustomerRetention,
  useTopCustomers,
  type ReportFilterState,
  type TopCustomerRow,
} from '../report-api';

/**
 * Who buys, and whether they come back. "Novos vs recorrentes" is a two-part
 * whole, so it is a single proportion bar with both figures written on it -
 * a pie of two slices would be a worse way to show the same number.
 */
export function CustomersTab({ filters }: { filters: ReportFilterState }) {
  const can = useAuth((state) => state.can);
  const allowed = can('customer:read');

  const top = useTopCustomers(filters, 25, allowed);
  const retention = useCustomerRetention(filters, allowed);

  if (!allowed) {
    return <NoPermission description="Os relatorios de clientes exigem a permissao customer:read." />;
  }

  const report = retention.data;
  const identified = (report?.newCustomers ?? 0) + (report?.returningCustomers ?? 0);
  const newShare = identified > 0 ? (report?.newCustomers ?? 0) / identified : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ExportButtons report="customers" filters={filters} options={{ limit: 500 }} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Clientes novos"
          value={formatNumber(report?.newCustomers ?? 0, 0)}
          deltaHint="primeira compra no periodo"
          loading={retention.isLoading}
        />
        <StatCard
          label="Clientes recorrentes"
          value={formatNumber(report?.returningCustomers ?? 0, 0)}
          deltaHint="ja tinham comprado antes"
          tone="success"
          loading={retention.isLoading}
        />
        <StatCard
          label="Taxa de retorno"
          value={percent(report?.repeatRateBps ?? 0)}
          deltaHint="dos clientes identificados"
          loading={retention.isLoading}
        />
        <StatCard
          label="Vendas sem cliente"
          value={formatNumber(report?.guestTransactions ?? 0, 0)}
          deltaHint={money(report?.guestRevenueMinor ?? 0)}
          loading={retention.isLoading}
        />
      </div>

      <section className="panel flex flex-col gap-4 p-5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">Novos vs recorrentes</h3>
          <p className="text-sm text-muted-foreground">
            Receita atribuida a clientes identificados, repartida entre quem comprou pela primeira vez
            e quem regressou.
          </p>
        </div>

        <ReportState
          loading={retention.isLoading}
          error={retention.error}
          onRetry={() => void retention.refetch()}
          empty={identified === 0}
          emptyTitle="Sem clientes identificados"
          emptyDescription="Nenhuma venda do periodo foi associada a um cliente."
        >
          <div className="flex flex-col gap-3">
            <div
              className="flex h-10 w-full gap-[2px] overflow-hidden rounded-lg"
              role="img"
              aria-label={`Novos: ${formatNumber(report?.newCustomers ?? 0, 0)} clientes, ${money(report?.newRevenueMinor ?? 0)}. Recorrentes: ${formatNumber(report?.returningCustomers ?? 0, 0)} clientes, ${money(report?.returningRevenueMinor ?? 0)}.`}
            >
              <div
                className="flex items-center justify-center text-xs font-semibold text-primary-foreground"
                style={{ width: `${Math.max(newShare * 100, 4)}%`, backgroundColor: seriesColor(0) }}
              >
                {newShare >= 0.12 ? shareLabel(newShare) : ''}
              </div>
              <div
                className="flex flex-1 items-center justify-center text-xs font-semibold text-primary-foreground"
                style={{ backgroundColor: seriesColor(4) }}
              >
                {1 - newShare >= 0.12 ? shareLabel(1 - newShare) : ''}
              </div>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <SplitRow
                color={seriesColor(0)}
                label="Novos"
                customers={report?.newCustomers ?? 0}
                transactions={report?.newTransactions ?? 0}
                revenueMinor={report?.newRevenueMinor ?? 0}
              />
              <SplitRow
                color={seriesColor(4)}
                label="Recorrentes"
                customers={report?.returningCustomers ?? 0}
                transactions={report?.returningTransactions ?? 0}
                revenueMinor={report?.returningRevenueMinor ?? 0}
              />
            </dl>
          </div>
        </ReportState>
      </section>

      <div className="panel overflow-hidden">
        <header className="space-y-1 border-b border-border p-5">
          <h3 className="text-base font-semibold text-foreground">Melhores clientes</h3>
          <p className="text-sm text-muted-foreground">Os 25 clientes com maior gasto no periodo.</p>
        </header>
        <ReportState loading={false} error={top.error} onRetry={() => void top.refetch()}>
          <DataTable<TopCustomerRow>
            columns={customerColumns}
            rows={top.data?.data ?? []}
            rowKey={(row) => row.customerId}
            loading={top.isLoading}
            defaultSort={{ key: 'spendMinor', direction: 'desc' }}
            stickyHeader
            caption="Clientes ordenados pelo valor gasto no periodo."
            emptyTitle="Sem clientes no periodo"
            emptyDescription="Nenhuma venda foi associada a um cliente."
          />
        </ReportState>
      </div>
    </div>
  );
}

function SplitRow({
  color,
  label,
  customers,
  transactions,
  revenueMinor,
}: {
  color: string;
  label: string;
  customers: number;
  transactions: number;
  revenueMinor: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
        {label}
      </dt>
      <dd className="text-right text-sm">
        <p className="tabular font-semibold text-foreground">{money(revenueMinor)}</p>
        <p className="tabular text-xs text-muted-foreground">
          {formatNumber(customers, 0)} clientes &middot; {formatNumber(transactions, 0)} vendas
        </p>
      </dd>
    </div>
  );
}

const TIER_LABELS: Record<string, string> = {
  none: 'Sem nivel',
  bronze: 'Bronze',
  silver: 'Prata',
  gold: 'Ouro',
};

const customerColumns: Array<DataTableColumn<TopCustomerRow>> = [
  {
    key: 'name',
    header: 'Cliente',
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{row.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.phone ? formatPhone(row.phone) : row.email ?? '-'}
        </p>
      </div>
    ),
  },
  {
    key: 'tier',
    header: 'Nivel',
    width: '8rem',
    cell: (row) => (
      <Badge variant={row.tier === 'none' ? 'muted' : 'secondary'} size="sm">
        {TIER_LABELS[row.tier] ?? row.tier}
      </Badge>
    ),
  },
  {
    key: 'spendMinor',
    header: 'Gasto',
    numeric: true,
    sortable: true,
    width: '10rem',
    cell: (row) => <MoneyCell minor={row.spendMinor} />,
  },
  {
    key: 'orderCount',
    header: 'Compras',
    numeric: true,
    sortable: true,
    width: '8rem',
    cell: (row) => <span className="tabular">{formatNumber(row.orderCount, 0)}</span>,
  },
  {
    key: 'averageOrderMinor',
    header: 'Ticket medio',
    numeric: true,
    sortable: true,
    width: '9.5rem',
    cell: (row) => <MoneyCell minor={row.averageOrderMinor} tone="muted" />,
  },
  {
    key: 'itemsBought',
    header: 'Artigos',
    numeric: true,
    sortable: true,
    width: '7.5rem',
    cell: (row) => <span className="tabular">{formatQuantity(row.itemsBought)}</span>,
  },
  {
    key: 'share',
    header: '% do total',
    numeric: true,
    sortable: true,
    width: '7rem',
    cell: (row) => <span className="tabular text-muted-foreground">{shareLabel(row.share)}</span>,
  },
  {
    key: 'lastPurchaseAt',
    header: 'Ultima compra',
    sortable: true,
    width: '9.5rem',
    cell: (row) => <span className="tabular text-muted-foreground">{formatDate(row.lastPurchaseAt)}</span>,
  },
];

export default CustomersTab;
