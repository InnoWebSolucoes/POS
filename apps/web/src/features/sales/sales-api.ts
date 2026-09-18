import { useCallback } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { SOCKET_EVENTS, type CustomerDto, type Paginated, type SaleDto } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { useSocketEvent } from '@/hooks/use-socket';
import type { CashierOption, RefundDto, SaleDetailDto, SalesFilters, SalesSummary } from './types';

/** The prefix every sales query shares, so one invalidation reaches them all. */
const SALES_ROOT = qk.sales()[0];

const AGGREGATE_PAGE_SIZE = 200;
/** The summary strip aggregates client-side; beyond this it says so. */
const AGGREGATE_CAP = 1000;

function queryOf(filters: SalesFilters): Record<string, unknown> {
  return {
    from: filters.from,
    to: filters.to,
    cashierId: filters.cashierId,
    customerId: filters.customerId,
    channel: filters.channel,
    status: filters.status,
    paymentMethod: filters.paymentMethod,
    search: filters.search,
  };
}

async function fetchAllPages<T>(
  path: string,
  query: Record<string, unknown>,
): Promise<{ rows: T[]; total: number; truncated: boolean }> {
  const first = await api.get<Paginated<T>>(path, { ...query, page: 1, pageSize: AGGREGATE_PAGE_SIZE });
  const rows = [...first.data];

  let page = 1;
  while (rows.length < Math.min(first.total, AGGREGATE_CAP) && page < first.totalPages) {
    page += 1;
    const next = await api.get<Paginated<T>>(path, { ...query, page, pageSize: AGGREGATE_PAGE_SIZE });
    if (next.data.length === 0) break;
    rows.push(...next.data);
  }

  return { rows, total: first.total, truncated: first.total > rows.length };
}

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

export function useSalesList(
  filters: SalesFilters,
  page: number,
  pageSize: number,
): UseQueryResult<Paginated<SaleDto>> {
  const params = { ...queryOf(filters), page, pageSize, view: 'list' as const };
  return useQuery({
    queryKey: qk.sales(params),
    queryFn: () => api.get<Paginated<SaleDto>>('/api/sales', { ...queryOf(filters), page, pageSize }),
    placeholderData: (previous) => previous,
  });
}

/**
 * The strip above the table. The list endpoint has no aggregate, so the sales
 * in the window are walked page by page - honestly capped, and flagged when the
 * window is larger than the cap rather than quietly under-reporting.
 */
export function useSalesSummary(filters: SalesFilters): UseQueryResult<SalesSummary> {
  const params = { ...queryOf(filters), view: 'summary' as const };
  return useQuery({
    queryKey: qk.sales(params),
    async queryFn(): Promise<SalesSummary> {
      const [sales, refunds] = await Promise.all([
        fetchAllPages<SaleDto>('/api/sales', queryOf(filters)),
        fetchAllPages<RefundDto>('/api/sales/refunds', { from: filters.from, to: filters.to }),
      ]);

      let grossMinor = 0;
      let discountMinor = 0;
      let counted = 0;
      for (const sale of sales.rows) {
        if (sale.status === 'voided') continue;
        grossMinor += sale.totalMinor;
        discountMinor += sale.discountMinor;
        counted += 1;
      }

      const refundMinor = refunds.rows.reduce((acc, refund) => acc + refund.totalMinor, 0);

      return {
        transactionCount: sales.total,
        grossMinor,
        discountMinor,
        refundMinor,
        averageTicketMinor: counted > 0 ? Math.round(grossMinor / counted) : 0,
        truncated: sales.truncated || refunds.truncated,
      };
    },
  });
}

export function useSale(saleId: string | undefined): UseQueryResult<SaleDetailDto> {
  return useQuery({
    queryKey: qk.sale(saleId ?? 'none'),
    queryFn: () => api.get<SaleDetailDto>(`/api/sales/${saleId ?? ''}`),
    enabled: Boolean(saleId),
  });
}

/* -------------------------------------------------------------------------- */
/* Filter option lists                                                         */
/* -------------------------------------------------------------------------- */

/** Cashiers for the filter. Needs user:read, which a cashier does not have. */
export function useCashierOptions(enabled: boolean): UseQueryResult<CashierOption[]> {
  return useQuery({
    queryKey: qk.users({ view: 'sale-filter' }),
    queryFn: async () => {
      const response = await api.get<Paginated<CashierOption>>('/api/users', {
        pageSize: 200,
        sort: 'name',
        order: 'asc',
      });
      return response.data;
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useCustomerOptions(enabled: boolean, search: string): UseQueryResult<CustomerDto[]> {
  return useQuery({
    queryKey: qk.customers({ view: 'sale-filter', search }),
    queryFn: async () => {
      const response = await api.get<Paginated<CustomerDto>>('/api/customers', {
        pageSize: 20,
        search: search || undefined,
        sort: 'name',
        order: 'asc',
      });
      return response.data;
    },
    enabled,
    staleTime: 60_000,
  });
}

/* -------------------------------------------------------------------------- */
/* Realtime                                                                    */
/* -------------------------------------------------------------------------- */

/** Keeps the table and the summary strip live while a register keeps selling. */
export function useSalesRealtime(): void {
  const client = useQueryClient();
  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: [SALES_ROOT] });
  }, [client]);
  useSocketEvent<SaleDto>(SOCKET_EVENTS.SALE_COMPLETED, refresh);
}

/** After a void or a receipt send, both the row and the detail must reload. */
export function useInvalidateSale(): (saleId: string) => void {
  const client = useQueryClient();
  return useCallback(
    (saleId: string) => {
      void client.invalidateQueries({ queryKey: qk.sale(saleId) });
      void client.invalidateQueries({ queryKey: [SALES_ROOT] });
    },
    [client],
  );
}
