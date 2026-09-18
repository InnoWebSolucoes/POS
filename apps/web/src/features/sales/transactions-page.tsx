import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, Receipt } from 'lucide-react';
import type { PaymentMethod, SaleChannel, SaleDto, SaleStatus } from '@pos/shared';

import {
  Button,
  DataTable,
  Pagination,
  rangeForPreset,
  toast,
  type DataTableColumn,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatDateTime, money, number } from '@/lib/format';
import { ChannelBadge, PaymentMethodBadges, SaleStatusBadge } from './components/sale-badges';
import { QueryError, errorMessage } from './components/query-error';
import { TransactionFilters } from './components/transaction-filters';
import { TransactionsSummary } from './components/transactions-summary';
import { langOf } from './labels';
import { useCashierOptions, useSalesList, useSalesRealtime, useSalesSummary } from './sales-api';
import type { SalesFilters } from './types';

const DEFAULT_PAGE_SIZE = 25;

/** Every filter lives in the query string, so a back-tap keeps the search. */
function readFilters(params: URLSearchParams, fallback: { from: string; to: string }): SalesFilters {
  return {
    from: params.get('de') || fallback.from,
    to: params.get('ate') || fallback.to,
    cashierId: params.get('operador') || undefined,
    customerId: params.get('cliente') || undefined,
    channel: (params.get('canal') as SaleChannel | null) ?? undefined,
    status: (params.get('estado') as SaleStatus | null) ?? undefined,
    paymentMethod: (params.get('pagamento') as PaymentMethod | null) ?? undefined,
    search: params.get('recibo') || undefined,
  };
}

const PARAM_OF: Record<keyof SalesFilters, string> = {
  from: 'de',
  to: 'ate',
  cashierId: 'operador',
  customerId: 'cliente',
  channel: 'canal',
  status: 'estado',
  paymentMethod: 'pagamento',
  search: 'recibo',
};

export default function TransactionsPage() {
  const { i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const navigate = useNavigate();
  const can = useAuth((state) => state.can);

  const [params, setParams] = useSearchParams();
  const today = useMemo(() => rangeForPreset('hoje'), []);
  const filters = useMemo(() => readFilters(params, today), [params, today]);

  const page = Math.max(1, Number(params.get('pagina') ?? '1') || 1);
  const pageSize = Math.max(1, Number(params.get('tamanho') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE);

  // Functional updates: Pagination fires size and page in the same tick, and a
  // snapshot of the previous params would drop whichever landed first.
  const patch = useCallback(
    (next: Partial<SalesFilters>) => {
      setParams(
        (previous) => {
          const merged = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(next)) {
            const param = PARAM_OF[key as keyof SalesFilters];
            if (value) merged.set(param, String(value));
            else merged.delete(param);
          }
          merged.delete('pagina');
          return merged;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setPaging = useCallback(
    (nextPage: number, nextPageSize?: number) => {
      setParams(
        (previous) => {
          const merged = new URLSearchParams(previous);
          merged.set('pagina', String(nextPage));
          if (nextPageSize) merged.set('tamanho', String(nextPageSize));
          return merged;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const [resetKey, setResetKey] = useState(0);
  const clearFilters = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
    setResetKey((value) => value + 1);
  }, [setParams]);

  const hasActiveFilters =
    filters.from !== today.from ||
    filters.to !== today.to ||
    Boolean(
      filters.cashierId ||
        filters.customerId ||
        filters.channel ||
        filters.status ||
        filters.paymentMethod ||
        filters.search,
    );

  useSalesRealtime();

  const list = useSalesList(filters, page, pageSize);
  const summary = useSalesSummary(filters);
  const canSeeStaff = can('user:read');
  const cashiers = useCashierOptions(canSeeStaff);

  const exportCsv = useMutation({
    mutationFn: () =>
      api.download(
        '/api/reports/export/sales',
        {
          from: filters.from,
          to: filters.to,
          channel: filters.channel,
          userId: filters.cashierId,
          format: 'csv',
        },
        'transaccoes.csv',
      ),
    onSuccess: () => toast.success('Exportacao concluida'),
    onError: (error) => toast.error('Exportacao falhou', errorMessage(error)),
  });

  const columns: Array<DataTableColumn<SaleDto>> = useMemo(
    () => [
      {
        key: 'receiptNumber',
        header: 'Recibo',
        width: '11rem',
        cell: (sale) => (
          <div className="min-w-0">
            <span className="tabular font-semibold text-foreground">{sale.receiptNumber}</span>
            <span className="block truncate text-xs text-muted-foreground lg:hidden">
              {sale.customerName ?? sale.cashierName ?? '-'}
            </span>
          </div>
        ),
      },
      {
        key: 'createdAt',
        header: 'Data',
        width: '11rem',
        cell: (sale) => <span className="tabular whitespace-nowrap">{formatDateTime(sale.createdAt)}</span>,
      },
      {
        key: 'channel',
        header: 'Canal',
        className: 'hidden md:table-cell',
        headClassName: 'hidden md:table-cell',
        cell: (sale) => <ChannelBadge channel={sale.channel} lang={lang} size="sm" />,
      },
      {
        key: 'cashierName',
        header: 'Operador',
        className: 'hidden lg:table-cell',
        headClassName: 'hidden lg:table-cell',
        cell: (sale) => sale.cashierName ?? '-',
      },
      {
        key: 'customerName',
        header: 'Cliente',
        className: 'hidden lg:table-cell',
        headClassName: 'hidden lg:table-cell',
        cell: (sale) => sale.customerName ?? '-',
      },
      {
        key: 'lines',
        header: 'Artigos',
        numeric: true,
        className: 'hidden sm:table-cell',
        headClassName: 'hidden sm:table-cell',
        cell: (sale) => number(sale.lines.length),
      },
      {
        key: 'payments',
        header: 'Pagamento',
        className: 'hidden xl:table-cell',
        headClassName: 'hidden xl:table-cell',
        cell: (sale) => <PaymentMethodBadges payments={sale.payments} lang={lang} />,
      },
      {
        key: 'totalMinor',
        header: 'Total',
        numeric: true,
        width: '9rem',
        cell: (sale) => <span className="font-semibold">{money(sale.totalMinor)}</span>,
      },
      {
        key: 'status',
        header: 'Estado',
        width: '12rem',
        cell: (sale) => <SaleStatusBadge status={sale.status} lang={lang} size="sm" />,
      },
    ],
    [lang],
  );

  const rows = list.data?.data ?? [];

  return (
    <div className="flex flex-col gap-5 p-4 pb-24 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Transaccoes</h1>
          <p className="text-sm text-muted-foreground">
            Historico de vendas de todos os canais. Toque numa linha para ver o recibo completo.
          </p>
        </div>

        {can('report:read') && (
          <Button
            variant="outline"
            leftIcon={<Download />}
            loading={exportCsv.isPending}
            loadingLabel="A exportar..."
            onClick={() => exportCsv.mutate()}
          >
            Exportar CSV
          </Button>
        )}
      </header>

      <TransactionFilters
        filters={filters}
        lang={lang}
        cashiers={cashiers.data ?? []}
        showCashierFilter={canSeeStaff}
        showCustomerFilter={can('customer:read')}
        hasActiveFilters={hasActiveFilters}
        resetKey={resetKey}
        onChange={patch}
        onClear={clearFilters}
      />

      <TransactionsSummary summary={summary.data} loading={summary.isLoading} />

      {list.isError ? (
        <QueryError error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className="panel overflow-hidden">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(sale) => sale.id}
            loading={list.isLoading}
            skeletonRows={8}
            manualSorting
            stickyHeader
            emptyIcon={Receipt}
            emptyTitle="Sem transaccoes"
            emptyDescription="Nenhuma venda corresponde aos filtros escolhidos."
            emptyAction={{
              label: 'Ver este mes',
              onClick: () => patch(rangeForPreset('mes')),
            }}
            onRowClick={(sale) => navigate(`/transaccoes/${sale.id}`)}
            containerClassName="max-h-[60vh]"
          />

          <div className="border-t border-border px-2">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={list.data?.total ?? 0}
              pageCount={list.data?.totalPages}
              onPageChange={(next) => setPaging(next)}
              onPageSizeChange={(next) => setPaging(1, next)}
              pageSizeOptions={[25, 50, 100]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
