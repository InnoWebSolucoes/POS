import type { FulfilmentMethod, OnlineOrderStatus, PaymentStatus } from '@pos/shared';

/**
 * The fulfilment lifecycle, mirrored from the API's STATUS_FLOW.
 *
 * The server is the authority - it refuses an illegal jump with a 409 - but
 * the queue must not offer a button that is going to be refused, so the same
 * graph is encoded here and filtered by the delivery/pickup rule.
 */
export const STATUS_FLOW: Record<OnlineOrderStatus, OnlineOrderStatus[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'ready_for_pickup', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  ready_for_pickup: ['delivered', 'cancelled'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

export const STATUS_LABELS: Record<OnlineOrderStatus, string> = {
  pending: 'Pendente',
  processing: 'Em preparacao',
  ready_for_pickup: 'Pronta para levantamento',
  shipped: 'Expedida',
  delivered: 'Entregue',
  completed: 'Concluida',
  cancelled: 'Cancelada',
};

/** What the button says, which is an action rather than a state. */
export const STATUS_ACTIONS: Record<OnlineOrderStatus, string> = {
  pending: 'Reabrir',
  processing: 'Iniciar preparacao',
  ready_for_pickup: 'Pronta para recolha',
  shipped: 'Marcar como expedida',
  delivered: 'Marcar como entregue',
  completed: 'Concluir',
  cancelled: 'Cancelar encomenda',
};

export type BadgeTone = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'muted' | 'outline';

export const STATUS_TONES: Record<OnlineOrderStatus, BadgeTone> = {
  pending: 'warning',
  processing: 'default',
  ready_for_pickup: 'secondary',
  shipped: 'secondary',
  delivered: 'success',
  completed: 'success',
  cancelled: 'destructive',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Pago',
  failed: 'Falhou',
  refunded: 'Reembolsado',
  partially_refunded: 'Parc. reembolsado',
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, BadgeTone> = {
  pending: 'warning',
  confirmed: 'success',
  failed: 'destructive',
  refunded: 'muted',
  partially_refunded: 'muted',
};

export const FULFILMENT_LABELS: Record<FulfilmentMethod, string> = {
  delivery: 'Entrega',
  pickup: 'Levantamento',
};

/** The transitions this order can actually make right now. */
export function nextStatuses(
  status: OnlineOrderStatus,
  method: FulfilmentMethod,
): OnlineOrderStatus[] {
  return (STATUS_FLOW[status] ?? []).filter((next) => {
    if (next === 'shipped') return method === 'delivery';
    if (next === 'ready_for_pickup') return method === 'pickup';
    return true;
  });
}
