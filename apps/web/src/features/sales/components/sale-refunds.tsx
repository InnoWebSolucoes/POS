import { Undo2 } from 'lucide-react';

import { Badge } from '@/components/ui';
import { formatDateTime, money, number } from '@/lib/format';
import { refundMethodLabel, refundReasonLabel, type UiLang } from '../labels';
import type { RefundDto } from '../types';

export interface SaleRefundsProps {
  refunds: RefundDto[];
  lang: UiLang;
}

/** Only rendered when there is something to show - no empty "no refunds" panel. */
export function SaleRefunds({ refunds, lang }: SaleRefundsProps) {
  if (refunds.length === 0) return null;

  return (
    <section className="panel flex flex-col gap-4 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Undo2 className="size-4" aria-hidden="true" />
        Devolucoes
      </h2>

      <ul className="flex flex-col gap-4">
        {refunds.map((refund) => (
          <li key={refund.id} className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <span className="tabular font-semibold text-foreground">{refund.reference}</span>
                <span className="block text-xs text-muted-foreground">
                  <span className="tabular">{formatDateTime(refund.createdAt)}</span>
                  {refund.userName ? ` - ${refund.userName}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="muted" size="sm">
                  {refundMethodLabel(refund.method, lang)}
                </Badge>
                <span className="tabular font-semibold text-destructive">
                  -{money(refund.totalMinor, { bare: true })}
                </span>
              </div>
            </div>

            {refund.note && (
              <p className="mt-2 text-sm italic text-muted-foreground">Nota: {refund.note}</p>
            )}

            <ul className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
              {refund.lines.map((line) => (
                <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="text-foreground">{line.name ?? 'Artigo removido'}</span>
                    {line.sku && <span className="ml-2 text-xs text-muted-foreground tabular">{line.sku}</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {refundReasonLabel(line.reason, lang)}
                    </span>
                    {!line.restocked && (
                      <Badge variant="warning" size="sm">
                        Sem reposicao
                      </Badge>
                    )}
                    <span className="tabular text-muted-foreground">
                      x{number(line.quantity, Number.isInteger(line.quantity) ? 0 : 3)}
                    </span>
                    <span className="tabular font-medium text-foreground">
                      {money(line.amountMinor)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default SaleRefunds;
