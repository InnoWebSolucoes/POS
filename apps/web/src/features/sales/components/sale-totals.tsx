import { margin } from '@pos/shared';

import { Separator } from '@/components/ui';
import { money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SaleDetailDto } from '../types';

function Row({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className={cn('text-sm', muted ? 'text-muted-foreground' : 'text-foreground')}>{label}</span>
      <span
        className={cn(
          'tabular text-right',
          strong ? 'text-xl font-semibold text-foreground' : 'text-sm',
          muted && 'text-muted-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export interface SaleTotalsProps {
  sale: SaleDetailDto;
  /** can('product:cost') || can('report:financial') */
  showFinancials: boolean;
}

export function SaleTotals({ sale, showFinancials }: SaleTotalsProps) {
  const refundedMinor = sale.refunds.reduce((acc, refund) => acc + refund.totalMinor, 0);
  const hasCogs = typeof sale.cogsMinor === 'number';
  const profit = hasCogs ? margin(sale.totalMinor, sale.cogsMinor ?? 0) : null;

  return (
    <div className="panel flex flex-col p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Totais</h2>

      <div className="mt-2 flex flex-col">
        <Row label="Subtotal" value={money(sale.subtotalMinor)} />
        {sale.discountMinor > 0 && (
          <Row label="Descontos" value={`-${money(sale.discountMinor, { bare: true })}`} />
        )}

        {sale.taxBreakdown.length > 0 ? (
          sale.taxBreakdown.map((entry) => (
            <Row
              key={entry.rateBps}
              label={`IVA ${percent(entry.rateBps)} sobre ${money(entry.netMinor)}`}
              value={money(entry.taxMinor)}
              muted
            />
          ))
        ) : (
          <Row label="IVA" value={money(sale.taxMinor)} muted />
        )}

        {sale.tipMinor > 0 && <Row label="Gorjeta" value={money(sale.tipMinor)} />}
        {typeof sale.serviceChargeMinor === 'number' && sale.serviceChargeMinor > 0 && (
          <Row label="Taxa de servico" value={money(sale.serviceChargeMinor)} />
        )}

        <Separator className="my-2" />
        <Row label="TOTAL" value={money(sale.totalMinor)} strong />

        {sale.changeMinor > 0 && <Row label="Troco" value={money(sale.changeMinor)} muted />}
        {refundedMinor > 0 && (
          <Row label="Reembolsado" value={`-${money(refundedMinor, { bare: true })}`} />
        )}
      </div>

      {showFinancials && hasCogs && profit && (
        <>
          <Separator className="my-3" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Rentabilidade
          </h3>
          <div className="mt-1 flex flex-col">
            <Row label="Custo das mercadorias (COGS)" value={money(sale.cogsMinor ?? 0)} muted />
            <Row label="Lucro bruto" value={money(profit.profitMinor)} />
            <Row label="Margem" value={percent(profit.marginBps)} />
          </div>
        </>
      )}
    </div>
  );
}

export default SaleTotals;
