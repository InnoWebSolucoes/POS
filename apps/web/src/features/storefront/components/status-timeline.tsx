import type { FulfilmentMethod, OnlineOrderStatus, PaymentStatus } from '@pos/shared';
import { Check, Package, Truck, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The progress a shopper actually cares about: pendente -> em preparacao ->
 * enviada (ou pronta para levantamento) -> entregue. A cancelled order says so
 * plainly instead of freezing half-way down the line.
 */

const DELIVERY_FLOW: OnlineOrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];
const PICKUP_FLOW: OnlineOrderStatus[] = ['pending', 'processing', 'ready_for_pickup', 'delivered'];

const STEP_LABELS: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Em preparacao',
  shipped: 'Enviada',
  ready_for_pickup: 'Pronta para levantamento',
  delivered: 'Entregue',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pagamento pendente',
  confirmed: 'Pago',
  failed: 'Pagamento falhou',
  refunded: 'Reembolsado',
  partially_refunded: 'Parcialmente reembolsado',
};

export function paymentBadgeVariant(
  status: PaymentStatus,
): 'success' | 'warning' | 'destructive' | 'muted' {
  if (status === 'confirmed') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'failed') return 'destructive';
  return 'muted';
}

export interface StatusTimelineProps {
  status: OnlineOrderStatus;
  fulfilmentMethod: FulfilmentMethod;
  placedAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export function StatusTimeline({
  status,
  fulfilmentMethod,
  placedAt,
  shippedAt,
  deliveredAt,
}: StatusTimelineProps) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
        <XCircle className="size-6 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-semibold text-destructive">Encomenda cancelada</p>
          <p className="text-sm text-muted-foreground">
            Fale com a loja se precisar de mais informacao.
          </p>
        </div>
      </div>
    );
  }

  const flow = fulfilmentMethod === 'pickup' ? PICKUP_FLOW : DELIVERY_FLOW;
  const current = status === 'completed' ? flow.length - 1 : flow.indexOf(status);
  const timestamps: Record<string, string | null> = {
    pending: placedAt,
    shipped: shippedAt,
    ready_for_pickup: shippedAt,
    delivered: deliveredAt,
  };

  return (
    <ol className="space-y-0">
      {flow.map((step, index) => {
        const done = index < current || status === 'completed';
        const active = index === current && status !== 'completed';
        const stamp = timestamps[step];

        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full border',
                  done && 'border-transparent bg-success text-success-foreground',
                  active && 'border-transparent bg-primary text-primary-foreground',
                  !done && !active && 'border-border bg-card text-muted-foreground',
                )}
              >
                {done ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : step === 'shipped' ? (
                  <Truck className="size-4" aria-hidden="true" />
                ) : (
                  <Package className="size-4" aria-hidden="true" />
                )}
              </span>
              {index < flow.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn('w-px flex-1', done ? 'bg-success' : 'bg-border')}
                />
              )}
            </div>

            <div className="pb-6 pt-1.5">
              <p
                className={cn(
                  'text-sm font-semibold',
                  done || active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {STEP_LABELS[step] ?? step}
                {active && (
                  <Badge variant="default" size="sm" className="ml-2">
                    Agora
                  </Badge>
                )}
              </p>
              {stamp && (done || active) && (
                <p className="tabular text-xs text-muted-foreground">{formatDateTime(stamp)}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default StatusTimeline;
