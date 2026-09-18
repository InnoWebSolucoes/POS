import { RETURN_REASONS, UNIT_LABELS, type ReturnReason, type SaleDto, type SaleLineDto, type Unit } from '@pos/shared';

import { Badge } from '@/components/ui/badge';
import { QuantityStepper } from '@/components/ui/quantity-stepper';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SwitchField } from '@/components/ui/switch';
import { amount, quantity as formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';
import { RETURN_REASON_LABELS } from './types';

export interface ReturnDraftLine {
  quantity: number;
  reason: ReturnReason;
  restock: boolean;
}

export type ReturnDraft = Record<string, ReturnDraftLine>;

const FRACTIONAL: Unit[] = ['kg', 'g', 'litre', 'ml', 'metre'];

export function availableToReturn(line: SaleLineDto): number {
  return Number((line.quantity - line.refundedQuantity).toFixed(3));
}

export function emptyDraft(sale: SaleDto): ReturnDraft {
  const draft: ReturnDraft = {};
  for (const line of sale.lines) {
    draft[line.id] = { quantity: 0, reason: 'changed_mind', restock: true };
  }
  return draft;
}

export interface ReturnLinesProps {
  sale: SaleDto;
  draft: ReturnDraft;
  onChange: (saleLineId: string, patch: Partial<ReturnDraftLine>) => void;
}

/** One row per sold line: how much is still returnable, and why it is coming back. */
export function ReturnLines({ sale, draft, onChange }: ReturnLinesProps) {
  return (
    <ul className="divide-y divide-border">
      {sale.lines.map((line) => {
        const remaining = availableToReturn(line);
        const step = FRACTIONAL.includes(line.unit) ? 0.001 : 1;
        const row = draft[line.id] ?? { quantity: 0, reason: 'changed_mind' as ReturnReason, restock: true };
        const exhausted = remaining <= 0;

        return (
          <li key={line.id} className={cn('space-y-3 px-4 py-4', exhausted && 'opacity-60')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-base font-semibold text-foreground">{line.name}</p>
                <p className="tabular text-sm text-muted-foreground">
                  {formatQuantity(line.quantity, line.unit)} x {amount(line.unitPriceMinor)}
                  {line.sku ? ` - ${line.sku}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular text-base font-semibold text-foreground">{amount(line.totalMinor)}</p>
                {line.refundedQuantity > 0 && (
                  <Badge variant="muted" size="sm" className="mt-1">
                    {formatQuantity(line.refundedQuantity, line.unit)} devolvido
                  </Badge>
                )}
              </div>
            </div>

            {exhausted ? (
              <p className="text-sm text-muted-foreground">Ja foi devolvido na totalidade.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <QuantityStepper
                  value={row.quantity}
                  onChange={(value) => onChange(line.id, { quantity: value })}
                  step={step}
                  min={0}
                  max={remaining}
                  unit={step < 1 ? line.unit : undefined}
                  editable={step < 1}
                  aria-label={`Quantidade a devolver de ${line.name}`}
                />
                <span className="text-sm text-muted-foreground">
                  de {formatQuantity(remaining, line.unit)} {UNIT_LABELS[line.unit]?.short ?? ''}
                </span>

                {row.quantity > 0 && (
                  <>
                    <div className="min-w-[12rem] flex-1">
                      <Select
                        value={row.reason}
                        onValueChange={(value) => onChange(line.id, { reason: value as ReturnReason })}
                      >
                        <SelectTrigger aria-label={`Motivo da devolucao de ${line.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RETURN_REASONS.map((reason) => (
                            <SelectItem key={reason} value={reason}>
                              {RETURN_REASON_LABELS[reason]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <SwitchField
                      label="Devolver ao stock"
                      checked={row.restock}
                      onCheckedChange={(checked) => onChange(line.id, { restock: checked })}
                    />
                  </>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default ReturnLines;
