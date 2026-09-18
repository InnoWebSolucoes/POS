import type { PricingMode } from '@pos/shared';

import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The money column, shared by the basket and the checkout review.
 *
 * Every figure arrives from the server in minor units and is only formatted
 * here. Under inclusive pricing the tax is already inside the subtotal, so it
 * is labelled as included rather than added - the total must never look like
 * it grew between two screens.
 */
export interface OrderTotalsProps {
  subtotalMinor: number;
  discountMinor?: number;
  shippingMinor?: number | null;
  taxMinor: number;
  totalMinor: number;
  pricingMode?: PricingMode;
  className?: string;
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4',
        strong ? 'text-lg font-bold' : 'text-sm text-muted-foreground',
      )}
    >
      <span>{label}</span>
      <span className={cn('tabular', strong ? 'text-foreground' : 'text-foreground')}>{value}</span>
    </div>
  );
}

export function OrderTotals({
  subtotalMinor,
  discountMinor = 0,
  shippingMinor,
  taxMinor,
  totalMinor,
  pricingMode = 'inclusive',
  className,
}: OrderTotalsProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Row label="Subtotal" value={money(subtotalMinor)} />
      {discountMinor > 0 && <Row label="Desconto" value={`- ${money(discountMinor)}`} />}
      {shippingMinor !== null && shippingMinor !== undefined && (
        <Row label="Entrega" value={shippingMinor > 0 ? money(shippingMinor) : 'Gratis'} />
      )}
      <Row
        label={pricingMode === 'inclusive' ? 'IVA incluido' : 'IVA'}
        value={money(taxMinor)}
      />
      <div className="border-t border-border pt-2">
        <Row label="Total" value={money(totalMinor)} strong />
      </div>
    </div>
  );
}

export default OrderTotals;
