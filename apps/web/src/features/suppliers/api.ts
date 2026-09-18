/** Every call this feature makes, in one place. */
import type { Paginated, PurchaseOrderStatus } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

import type {
  LowStockResult,
  PoInput,
  ProductPick,
  PurchaseOrderDto,
  SupplierDto,
  SupplierInput,
  SupplierPerformance,
  SupplierProductRow,
} from './types';

/**
 * Prefix roots derived from `qk`, so `invalidateQueries` reaches every list and
 * detail keyed under them instead of only the exact params of one screen.
 */
export const suppliersRoot = [qk.suppliers()[0]] as const;
export const purchaseOrdersRoot = [qk.purchaseOrders()[0]] as const;

export interface SupplierListParams {
  page: number;
  pageSize: number;
  search?: string;
  active?: boolean;
}

export interface PoListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
  from?: string;
  to?: string;
}

/* -------------------------------------------------------------------------- */
/* Suppliers                                                                   */
/* -------------------------------------------------------------------------- */

export const listSuppliers = (params: SupplierListParams) =>
  api.get<Paginated<SupplierDto>>('/api/suppliers', { ...params });

export const createSupplier = (body: SupplierInput) => api.post<SupplierDto>('/api/suppliers', body);

export const updateSupplier = (id: string, body: Partial<SupplierInput>) =>
  api.patch<SupplierDto>(`/api/suppliers/${id}`, body);

export const deleteSupplier = (id: string) => api.delete<void>(`/api/suppliers/${id}`);

export const listSupplierProducts = (id: string, params: { page: number; pageSize: number; search?: string }) =>
  api.get<Paginated<SupplierProductRow>>(`/api/suppliers/${id}/products`, { ...params });

export const getSupplierPerformance = (id: string, months: number) =>
  api.get<SupplierPerformance>(`/api/suppliers/${id}/performance`, { months });

/* -------------------------------------------------------------------------- */
/* Purchase orders                                                             */
/* -------------------------------------------------------------------------- */

export const listPurchaseOrders = (params: PoListParams) =>
  api.get<Paginated<PurchaseOrderDto>>('/api/suppliers/purchase-orders', { ...params });

export const getPurchaseOrder = (id: string) =>
  api.get<PurchaseOrderDto>(`/api/suppliers/purchase-orders/${id}`);

export const createPurchaseOrder = (body: PoInput) =>
  api.post<PurchaseOrderDto>('/api/suppliers/purchase-orders', body);

export const updatePurchaseOrder = (id: string, body: Partial<PoInput>) =>
  api.patch<PurchaseOrderDto>(`/api/suppliers/purchase-orders/${id}`, body);

export const sendPurchaseOrder = (id: string) =>
  api.post<PurchaseOrderDto>(`/api/suppliers/purchase-orders/${id}/send`);

export const cancelPurchaseOrder = (id: string, reason: string | null) =>
  api.post<PurchaseOrderDto>(`/api/suppliers/purchase-orders/${id}/cancel`, { reason });

export const purchaseOrdersFromLowStock = (supplierId: string | null) =>
  api.post<LowStockResult>('/api/suppliers/purchase-orders/from-low-stock', { supplierId });

export const downloadPurchaseOrderPdf = (id: string, reference: string) =>
  api.download(`/api/suppliers/purchase-orders/${id}/pdf`, undefined, `${reference}.pdf`);

/* -------------------------------------------------------------------------- */
/* Catalogue (order lines)                                                     */
/* -------------------------------------------------------------------------- */

export const searchProducts = (search: string, supplierId?: string) =>
  api.get<Paginated<ProductPick>>('/api/products', {
    search: search || undefined,
    supplierId,
    active: true,
    pageSize: 25,
  });
