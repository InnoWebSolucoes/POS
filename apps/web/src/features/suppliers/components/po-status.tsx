import { PO_STATUSES, type PurchaseOrderStatus } from '@pos/shared';

import { Badge, type BadgeProps } from '@/components/ui';

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviada',
  partially_received: 'Parcialmente recebida',
  received: 'Recebida',
  cancelled: 'Cancelada',
};

const PO_STATUS_VARIANTS: Record<PurchaseOrderStatus, NonNullable<BadgeProps['variant']>> = {
  draft: 'muted',
  sent: 'default',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'destructive',
};

export const PO_STATUS_OPTIONS = PO_STATUSES.map((status) => ({
  value: status,
  label: PO_STATUS_LABELS[status],
}));

export function PoStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  return (
    <Badge variant={PO_STATUS_VARIANTS[status]} dot>
      {PO_STATUS_LABELS[status]}
    </Badge>
  );
}
