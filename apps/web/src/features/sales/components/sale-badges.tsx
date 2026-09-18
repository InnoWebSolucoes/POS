import { Globe, Store, UtensilsCrossed } from 'lucide-react';
import type { PaymentDto, SaleChannel, SaleStatus } from '@pos/shared';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  channelLabel,
  paymentMethodLabel,
  statusLabel,
  STATUS_TONE,
  type UiLang,
} from '../labels';

const CHANNEL_ICON: Record<SaleChannel, typeof Store> = {
  pos: Store,
  restaurant: UtensilsCrossed,
  online: Globe,
};

export function SaleStatusBadge({
  status,
  lang,
  size = 'default',
}: {
  status: SaleStatus;
  lang: UiLang;
  size?: 'sm' | 'default' | 'lg';
}) {
  return (
    <Badge variant={STATUS_TONE[status]} size={size} dot>
      {statusLabel(status, lang)}
    </Badge>
  );
}

export function ChannelBadge({
  channel,
  lang,
  size = 'default',
}: {
  channel: SaleChannel;
  lang: UiLang;
  size?: 'sm' | 'default' | 'lg';
}) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <Badge variant="outline" size={size}>
      <Icon className="size-3.5" aria-hidden="true" />
      {channelLabel(channel, lang)}
    </Badge>
  );
}

/** One small badge per distinct method, so a split payment reads at a glance. */
export function PaymentMethodBadges({
  payments,
  lang,
  className,
}: {
  payments: PaymentDto[];
  lang: UiLang;
  className?: string;
}) {
  const methods = Array.from(new Set(payments.map((payment) => payment.method)));
  if (methods.length === 0) return <span className="text-muted-foreground">-</span>;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {methods.map((method) => (
        <Badge key={method} variant="muted" size="sm">
          {paymentMethodLabel(method, lang)}
        </Badge>
      ))}
    </div>
  );
}
