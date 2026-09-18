/**
 * Every inventory screen talks to the server through here.
 *
 * Query keys all come from `qk` so an invalidation after a receipt, an
 * adjustment, a transfer or a stocktake approval reaches the levels table, the
 * ledger, the low-stock report and the catalogue at once.
 */
import { useQuery } from '@tanstack/react-query';
import type { CategoryDto, LocationDto, Paginated, ProductDto } from '@pos/shared';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query';
import type {
  DeadStockPage,
  ExpiringPage,
  LookupResultDto,
  LowStockRowDto,
  PurchaseOrderDto,
  StockLevelDto,
  SupplierOptionDto,
  UserOptionDto,
  ValuationDto,
} from './types';

/** ['inventory', {...}] -> ['inventory'], so a prefix invalidation is possible. */
function prefixOf(key: readonly unknown[]): unknown[] {
  return [key[0]];
}

/**
 * Called after anything that writes to the stock ledger. Deliberately broad:
 * a receipt changes levels, movements, low stock, the catalogue quantity and
 * possibly a purchase order.
 */
export function invalidateStock(): void {
  void queryClient.invalidateQueries({ queryKey: prefixOf(qk.inventory()) });
  void queryClient.invalidateQueries({ queryKey: prefixOf(qk.movements()) });
  void queryClient.invalidateQueries({ queryKey: qk.lowStock() });
  void queryClient.invalidateQueries({ queryKey: prefixOf(qk.products()) });
  void queryClient.invalidateQueries({ queryKey: prefixOf(qk.purchaseOrders()) });
}

/* -------------------------------------------------------------------------- */
/* Levels and insight                                                          */
/* -------------------------------------------------------------------------- */

export interface LevelsFilters {
  page: number;
  pageSize: number;
  locationId?: string;
  categoryId?: string;
  search?: string;
  lowStock?: boolean;
  outOfStock?: boolean;
}

export function useStockLevels(filters: LevelsFilters, enabled = true) {
  return useQuery({
    queryKey: qk.inventory({ scope: 'levels', ...filters }),
    queryFn: () => api.get<Paginated<StockLevelDto>>('/api/inventory/levels', { ...filters }),
    enabled,
  });
}

/** Exact count for a status card, without pulling the rows themselves. */
export function useLevelCount(flag: 'lowStock' | 'outOfStock', locationId?: string, categoryId?: string) {
  const params = { page: 1, pageSize: 1, locationId, categoryId, [flag]: true };
  return useQuery({
    queryKey: qk.inventory({ scope: 'levels-count', flag, locationId, categoryId }),
    queryFn: () => api.get<Paginated<StockLevelDto>>('/api/inventory/levels', params),
    select: (page: Paginated<StockLevelDto>) => page.total,
  });
}

export function useValuation(locationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.inventory({ scope: 'valuation', locationId }),
    queryFn: () => api.get<ValuationDto>('/api/inventory/valuation', { locationId }),
    enabled,
  });
}

export function useLowStock(params: { page: number; pageSize: number; locationId?: string; categoryId?: string }) {
  return useQuery({
    // Same prefix as qk.lowStock(), so the dashboard invalidation reaches it.
    queryKey: [...qk.lowStock(), params],
    queryFn: () => api.get<Paginated<LowStockRowDto>>('/api/inventory/low-stock', { ...params }),
  });
}

export function useDeadStock(params: { page: number; pageSize: number; days: number; categoryId?: string }) {
  return useQuery({
    queryKey: qk.inventory({ scope: 'dead-stock', ...params }),
    queryFn: () => api.get<DeadStockPage>('/api/inventory/dead-stock', { ...params }),
  });
}

export function useExpiring(params: {
  page: number;
  pageSize: number;
  days: number;
  locationId?: string;
  includeExpired: boolean;
}) {
  return useQuery({
    queryKey: qk.inventory({ scope: 'expiring', ...params }),
    queryFn: () => api.get<ExpiringPage>('/api/inventory/expiring', { ...params }),
  });
}

/* -------------------------------------------------------------------------- */
/* Supporting lists                                                            */
/* -------------------------------------------------------------------------- */

export function useLocations() {
  const entityId = useAuth((s) => s.entity?.id ?? null);
  return useQuery({
    queryKey: qk.entities({ scope: 'locations', entityId }),
    queryFn: () => api.get<LocationDto[]>(`/api/entities/${entityId}/locations`, { active: true }),
    enabled: Boolean(entityId),
    staleTime: 5 * 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: qk.categories({ scope: 'flat' }),
    queryFn: () => api.get<{ data: CategoryDto[] }>('/api/categories'),
    select: (payload: { data: CategoryDto[] }) => payload.data,
    staleTime: 5 * 60_000,
  });
}

export function useSuppliers(enabled = true) {
  return useQuery({
    queryKey: qk.suppliers({ scope: 'options' }),
    queryFn: () => api.get<Paginated<SupplierOptionDto>>('/api/suppliers', { pageSize: 200, active: true }),
    select: (page: Paginated<SupplierOptionDto>) => page.data,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useOpenPurchaseOrders(supplierId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.purchaseOrders({ scope: 'open', supplierId }),
    queryFn: async () => {
      const [sent, partial] = await Promise.all([
        api.get<Paginated<PurchaseOrderDto>>('/api/suppliers/purchase-orders', {
          status: 'sent',
          supplierId,
          pageSize: 100,
        }),
        api.get<Paginated<PurchaseOrderDto>>('/api/suppliers/purchase-orders', {
          status: 'partially_received',
          supplierId,
          pageSize: 100,
        }),
      ]);
      return [...sent.data, ...partial.data];
    },
    enabled,
  });
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: qk.purchaseOrders({ scope: 'detail', id }),
    queryFn: () => api.get<PurchaseOrderDto>(`/api/suppliers/purchase-orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useStaff(enabled: boolean) {
  return useQuery({
    queryKey: qk.users({ scope: 'options' }),
    queryFn: () => api.get<Paginated<UserOptionDto>>('/api/users', { pageSize: 200 }),
    select: (page: Paginated<UserOptionDto>) => page.data,
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Typeahead for the pickers; short cache because stock moves constantly. */
export function useProductSearch(search: string, enabled = true) {
  return useQuery({
    queryKey: qk.products({ scope: 'inventory-picker', search }),
    queryFn: () => api.get<Paginated<ProductDto>>('/api/products', { search, pageSize: 20, active: true }),
    select: (page: Paginated<ProductDto>) => page.data,
    enabled: enabled && search.trim().length > 0,
    staleTime: 10_000,
  });
}

export function lookupByCode(code: string): Promise<LookupResultDto> {
  return api.get<LookupResultDto>('/api/products/lookup', { code });
}
