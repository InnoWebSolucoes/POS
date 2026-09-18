import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomerDto, Paginated } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

import type {
  CustomerDetail,
  CustomerListParams,
  CustomerPurchase,
  LoyaltyAdjustResult,
  RetentionReport,
  StoreCreditResult,
  TierConfig,
} from './customer-types';

const BASE = '/api/customers';

/**
 * Every customers list variant hangs off the same prefix, so one invalidate
 * reaches the CRM list, the stat tiles and the "novos este mes" counter.
 * Derived from qk rather than hand-written, so a rename in lib/query wins.
 */
const customersRoot = qk.customers().slice(0, 1);

/** How many rows the "novos este mes" counter is prepared to look through. */
export const NEW_CUSTOMERS_SCAN = 200;

export function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export function useCustomerList(params: CustomerListParams) {
  const query = {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search || undefined,
    tier: params.tier === 'all' ? undefined : params.tier,
    active: params.active === 'all' ? undefined : params.active,
    sort: params.sort,
    order: params.order,
  };

  return useQuery({
    queryKey: qk.customers(query),
    queryFn: () => api.get<Paginated<CustomerDto>>(BASE, query),
    placeholderData: (previous) => previous,
  });
}

/** Tier thresholds, loyalty rates and the head-count per tier, in one call. */
export function useTierConfig() {
  return useQuery({
    queryKey: qk.customers({ scope: 'tiers' }),
    queryFn: () => api.get<TierConfig>(`${BASE}/tiers`),
    staleTime: 5 * 60_000,
  });
}

/** Registrations since the first of the month, capped at NEW_CUSTOMERS_SCAN. */
export function useNewThisMonth() {
  const since = startOfMonth().getTime();
  const query = { pageSize: NEW_CUSTOMERS_SCAN, sort: 'created', order: 'desc' };

  return useQuery({
    queryKey: qk.customers({ scope: 'new-this-month' }),
    queryFn: async () => {
      const page = await api.get<Paginated<CustomerDto>>(BASE, query);
      const count = page.data.filter((row) => Date.parse(row.createdAt) >= since).length;
      return { count, capped: count >= NEW_CUSTOMERS_SCAN };
    },
  });
}

/** Head-count of active customers - the fallback tile when reports are barred. */
export function useActiveCount(enabled = true) {
  const query = { pageSize: 1, active: 'true' };
  return useQuery({
    queryKey: qk.customers({ scope: 'active-count' }),
    queryFn: async () => {
      const page = await api.get<Paginated<CustomerDto>>(BASE, query);
      return page.total;
    },
    enabled,
  });
}

/** Needs report:read - pass enabled=false for everyone else. */
export function useRetentionThisMonth(enabled: boolean) {
  const from = startOfMonth().toISOString();
  return useQuery({
    queryKey: qk.reports('customer-retention', { from }),
    queryFn: () => api.get<RetentionReport>(`${BASE}/reports/retention`, { from }),
    enabled,
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: qk.customer(id ?? ''),
    queryFn: () => api.get<CustomerDetail>(`${BASE}/${id}`),
    enabled: Boolean(id),
  });
}

export function useCustomerPurchases(id: string | undefined, page: number, pageSize: number) {
  const query = { page, pageSize };
  return useQuery({
    // Prefixed with qk.customer(id) so invalidating the customer sweeps the
    // purchase pages with it.
    queryKey: [...qk.customer(id ?? ''), 'purchases', page, pageSize],
    queryFn: () => api.get<Paginated<CustomerPurchase>>(`${BASE}/${id}/purchases`, query),
    enabled: Boolean(id),
    placeholderData: (previous) => previous,
  });
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

function useInvalidate() {
  const client = useQueryClient();
  return (customerId?: string) => {
    void client.invalidateQueries({ queryKey: customersRoot });
    if (customerId) void client.invalidateQueries({ queryKey: qk.customer(customerId) });
  };
}

export function useCreateCustomer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { body: Record<string, unknown>; withCard: boolean }) =>
      api.post<CustomerDto>(
        input.withCard ? `${BASE}?withCard=true` : BASE,
        input.body,
      ),
    onSuccess: (customer) => invalidate(customer.id),
  });
}

export function useUpdateCustomer(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<CustomerDto>(`${BASE}/${id}`, body),
    onSuccess: () => invalidate(id),
  });
}

/** Soft delete: the sales history and the loyalty ledger stay intact. */
export function useDeleteCustomer(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.delete<{ id: string; deleted: boolean }>(`${BASE}/${id}`),
    onSuccess: () => invalidate(id),
  });
}

export function useAdjustPoints(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { points: number; note: string }) =>
      api.post<LoyaltyAdjustResult>(`${BASE}/${id}/loyalty/adjust`, body),
    onSuccess: () => invalidate(id),
  });
}

export function useMoveStoreCredit(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { amountMinor: number; note: string }) =>
      api.post<StoreCreditResult>(`${BASE}/${id}/store-credit`, body),
    onSuccess: () => invalidate(id),
  });
}
