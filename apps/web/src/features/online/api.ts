import type { OnlineOrderStatus, Paginated } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

import type { OnlineOrderDto, OnlineOrderFilters } from './types';

/** The back-office half of /api/online. Every call needs online:order:*. */
const BASE = '/api/online/admin/orders';

export const onlineKeys = {
  root: ['online-orders'] as const,
  list: (filters: OnlineOrderFilters) => qk.onlineOrders({ list: filters }),
  detail: (id: string) => qk.onlineOrders({ id }),
};

export function listOnlineOrders(filters: OnlineOrderFilters): Promise<Paginated<OnlineOrderDto>> {
  return api.get<Paginated<OnlineOrderDto>>(BASE, {
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status,
    paymentStatus: filters.paymentStatus,
    from: filters.from,
    to: filters.to,
    search: filters.search,
  });
}

export async function loadOnlineOrder(id: string): Promise<OnlineOrderDto> {
  const response = await api.get<{ data: OnlineOrderDto }>(`${BASE}/${encodeURIComponent(id)}`);
  return response.data;
}

export async function changeOrderStatus(
  id: string,
  status: OnlineOrderStatus,
  note?: string | null,
): Promise<OnlineOrderDto> {
  const response = await api.patch<{ data: OnlineOrderDto }>(
    `${BASE}/${encodeURIComponent(id)}/status`,
    { status, note: note ?? null },
  );
  return response.data;
}

export async function saveTracking(
  id: string,
  input: { carrier: string; trackingNumber: string },
): Promise<OnlineOrderDto> {
  const response = await api.patch<{ data: OnlineOrderDto }>(
    `${BASE}/${encodeURIComponent(id)}/tracking`,
    input,
  );
  return response.data;
}

export async function markReadyForPickup(id: string): Promise<OnlineOrderDto> {
  const response = await api.post<{ data: OnlineOrderDto }>(
    `${BASE}/${encodeURIComponent(id)}/ready-for-pickup`,
  );
  return response.data;
}

/**
 * The packing slip.
 *
 * It is a protected HTML page, so window.open() on the URL would arrive
 * without the bearer token. The document is fetched through the api client and
 * handed to a new window as a blob, where its own onload calls print().
 */
export async function openPackingSlip(id: string): Promise<void> {
  const html = await api.get<string>(`${BASE}/${encodeURIComponent(id)}/packing-slip`);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    URL.revokeObjectURL(url);
    throw new Error('O navegador bloqueou a janela de impressao.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
