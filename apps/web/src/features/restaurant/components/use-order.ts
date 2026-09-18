import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { DiscountType, OrderDto } from '@pos/shared';

import { toast } from '@/components/ui';
import { api, ApiRequestError } from '@/lib/api';
import { qk } from '@/lib/query';

import { ordersListPrefix, tablesListPrefix, type SendResponse } from './types';

/** Whatever the server said, or a sane Portuguese fallback. */
export function apiMessage(error: unknown, fallback = 'Ocorreu um erro.'): string {
  if (error instanceof ApiRequestError) {
    return error.isOffline ? 'Sem ligacao ao servidor.' : error.message;
  }
  return fallback;
}

export interface AddItemInput {
  productId: string;
  quantity?: number;
  course?: number;
  seat?: number | null;
  note?: string | null;
  modifiers?: Array<{ modifierId: string }>;
}

export interface ItemPatch {
  quantity?: number;
  course?: number;
  seat?: number | null;
  note?: string | null;
  modifiers?: Array<{ modifierId: string }>;
}

export interface OrderPatch {
  guestCount?: number;
  note?: string | null;
  serverId?: string | null;
  discount?: { type: DiscountType; value: number } | null;
}

type Mutation<TData, TVars> = UseMutationResult<TData, unknown, TVars>;

export interface OrderActions {
  addItems: Mutation<OrderDto, AddItemInput[]>;
  updateItem: Mutation<OrderDto, { itemId: string; patch: ItemPatch }>;
  removeItem: Mutation<OrderDto, string>;
  send: Mutation<SendResponse, { itemIds?: string[]; course?: number } | void>;
  fireCourse: Mutation<{ data: OrderDto }, number>;
  holdItems: Mutation<OrderDto, string[]>;
  patchOrder: Mutation<OrderDto, OrderPatch>;
  cancelOrder: Mutation<OrderDto, string | null>;
  setTip: Mutation<{ data: OrderDto; tipMinor: number }, { tipMinor?: number; tipBps?: number }>;
  busy: boolean;
}

/**
 * Every write the check panel can make against one order. They all land on the
 * same three caches, so invalidation lives here instead of at each call site.
 */
export function useOrderActions(orderId: string | null): OrderActions {
  const queryClient = useQueryClient();
  const base = `/api/restaurant/orders/${orderId ?? ''}`;

  const refresh = () => {
    if (orderId) void queryClient.invalidateQueries({ queryKey: qk.order(orderId) });
    void queryClient.invalidateQueries({ queryKey: ordersListPrefix });
    void queryClient.invalidateQueries({ queryKey: tablesListPrefix });
  };

  const fail = (fallback: string) => (error: unknown) => {
    toast.error(fallback, apiMessage(error));
  };

  const addItems = useMutation({
    mutationFn: (items: AddItemInput[]) => api.post<OrderDto>(`${base}/items`, { items }),
    onSuccess: refresh,
    onError: fail('Nao foi possivel adicionar o artigo'),
  });

  const updateItem = useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: ItemPatch }) =>
      api.patch<OrderDto>(`${base}/items/${itemId}`, patch),
    onSuccess: refresh,
    onError: fail('Nao foi possivel alterar o artigo'),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.delete<OrderDto>(`${base}/items/${itemId}`),
    onSuccess: refresh,
    onError: fail('Nao foi possivel remover o artigo'),
  });

  const send = useMutation({
    mutationFn: (payload: { itemIds?: string[]; course?: number } | void) =>
      api.post<SendResponse>(`${base}/send`, payload ?? {}),
    onSuccess: (result) => {
      refresh();
      toast.success(
        'Enviado para a cozinha',
        result.held > 0 ? `${result.sent} artigos enviados, ${result.held} retidos.` : undefined,
      );
    },
    onError: fail('Nao foi possivel enviar'),
  });

  const fireCourse = useMutation({
    mutationFn: (course: number) => api.post<{ data: OrderDto }>(`${base}/fire-course`, { course }),
    onSuccess: () => {
      refresh();
      toast.success('Prato lancado');
    },
    onError: fail('Nao foi possivel lancar o prato'),
  });

  const holdItems = useMutation({
    mutationFn: (itemIds: string[]) => api.post<OrderDto>(`${base}/hold`, { itemIds }),
    onSuccess: () => {
      refresh();
      toast.success('Artigos retidos');
    },
    onError: fail('Nao foi possivel reter os artigos'),
  });

  const patchOrder = useMutation({
    mutationFn: (patch: OrderPatch) => api.patch<OrderDto>(base, patch),
    onSuccess: refresh,
    onError: fail('Nao foi possivel actualizar o pedido'),
  });

  const cancelOrder = useMutation({
    mutationFn: (reason: string | null) => api.post<OrderDto>(`${base}/cancel`, { reason }),
    onSuccess: () => {
      refresh();
      toast.success('Pedido cancelado');
    },
    onError: fail('Nao foi possivel cancelar o pedido'),
  });

  const setTip = useMutation({
    mutationFn: (payload: { tipMinor?: number; tipBps?: number }) =>
      api.post<{ data: OrderDto; tipMinor: number }>(`${base}/tip`, payload),
    onSuccess: refresh,
    onError: fail('Nao foi possivel registar a gorjeta'),
  });

  return {
    addItems,
    updateItem,
    removeItem,
    send,
    fireCourse,
    holdItems,
    patchOrder,
    cancelOrder,
    setTip,
    busy:
      addItems.isPending ||
      updateItem.isPending ||
      removeItem.isPending ||
      send.isPending ||
      fireCourse.isPending ||
      holdItems.isPending ||
      patchOrder.isPending ||
      cancelOrder.isPending ||
      setTip.isPending,
  };
}
