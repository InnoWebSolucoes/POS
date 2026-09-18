import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { UNIT_LABELS, bpsToPct, computeLine, pctToBps, type DiscountType, type PricingMode } from '@pos/shared';

import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/ui/money-input';
import { QuantityStepper } from '@/components/ui/quantity-stepper';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { amount, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { stepFor, type PosLine } from './types';

export interface LineEditorSheetProps {
  line: PosLine | null;
  pricingMode: PricingMode;
  canDiscount: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (key: string, patch: { quantity: number; discountType: DiscountType | null; discountValue: number | null; note: string | null }) => void;
  onRemove: (key: string) => void;
}

/** Tapping a cart row opens this: quantity, discount, note, remove. */
export function LineEditorSheet({
  line,
  pricingMode,
  canDiscount,
  onOpenChange,
  onApply,
  onRemove,
}: LineEditorSheetProps) {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState(1);
  const [discountType, setDiscountType] = useState<DiscountType | null>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [note, setNote] = useState('');

  // Reload the draft whenever a different row is opened.
  useEffect(() => {
    if (!line) return;
    setQuantity(line.quantity);
    setDiscountType(line.discountType);
    setDiscountValue(line.discountValue ?? 0);
    setNote(line.note ?? '');
  }, [line]);

  if (!line) return null;

  const step = stepFor(line);
  const unitShort = UNIT_LABELS[line.unit]?.short ?? '';
  const subtotalMinor = Math.round(line.unitPriceMinor * quantity);

  const preview = computeLine({
    unitPriceMinor: line.unitPriceMinor,
    quantity,
    taxRateBps: line.taxRateBps,
    pricingMode,
    discount: discountType && discountValue > 0 ? { type: discountType, value: discountValue } : null,
  });

  const chooseType = (next: DiscountType | null) => {
    setDiscountType(next);
    setDiscountValue(0);
  };

  const apply = () => {
    onApply(line.key, {
      quantity,
      discountType: discountValue > 0 ? discountType : null,
      discountValue: discountValue > 0 ? discountValue : null,
      note: note.trim() ? note.trim() : null,
    });
    onOpenChange(false);
  };

  const typeButton = (value: DiscountType | null, label: string) => (
    <Button
      key={label}
      variant={discountType === value ? 'default' : 'outline'}
      className="flex-1"
      onClick={() => chooseType(value)}
    >
      {label}
    </Button>
  );

  return (
    <Sheet open={Boolean(line)} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="default" className="w-[min(32rem,96vw)]">
        <SheetHeader>
          <SheetTitle className="break-words pr-2">{line.name}</SheetTitle>
          <p className="tabular text-sm text-muted-foreground">
            {money(line.unitPriceMinor)}
            {step < 1 ? `/${unitShort}` : ' / unidade'}
            {line.sku ? ` - ${line.sku}` : ''}
          </p>
        </SheetHeader>

        <SheetBody className="space-y-6">
          <div className="space-y-2">
            <Label>{t('common.quantity', 'Quantidade')}</Label>
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              step={step}
              min={step}
              size="lg"
              editable
              unit={step < 1 ? line.unit : undefined}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('pos.lineDiscount', 'Desconto na Linha')}</Label>
            {canDiscount ? (
              <>
                <div className="flex gap-2">
                  {typeButton(null, t('common.none', 'Nenhum'))}
                  {typeButton('percentage', '%')}
                  {typeButton('fixed', t('pos.fixedAmount', 'Valor'))}
                </div>

                {discountType === 'percentage' && (
                  <div className="relative">
                    <NumericInput
                      value={bpsToPct(discountValue)}
                      onValueChange={(pct) => setDiscountValue(pctToBps(pct))}
                      decimals={2}
                      min={0}
                      max={100}
                      className="h-14 pr-10 text-lg"
                      aria-label="Percentagem de desconto"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted-foreground">
                      %
                    </span>
                  </div>
                )}

                {discountType === 'fixed' && (
                  <MoneyInput
                    value={discountValue}
                    onChange={setDiscountValue}
                    min={0}
                    max={subtotalMinor}
                    inputSize="lg"
                    aria-label="Valor do desconto"
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sem permissao para aplicar descontos. Chame um responsavel.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pos-line-note">{t('pos.lineNote', 'Nota')}</Label>
            <Textarea
              id="pos-line-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ex.: embalar em separado"
            />
          </div>

          <dl className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('common.subtotal', 'Subtotal')}</dt>
              <dd className="tabular font-medium">{amount(preview.subtotalMinor)}</dd>
            </div>
            {preview.discountMinor > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('common.discount', 'Desconto')}</dt>
                <dd className="tabular font-medium text-success">- {amount(preview.discountMinor)}</dd>
              </div>
            )}
            <div className={cn('flex justify-between border-t border-border pt-1.5')}>
              <dt className="font-semibold">Total da linha</dt>
              <dd className="tabular text-lg font-bold">{money(preview.grossMinor)}</dd>
            </div>
          </dl>
        </SheetBody>

        <SheetFooter className="sm:justify-between">
          <Button
            variant="destructive"
            leftIcon={<Trash2 />}
            onClick={() => {
              onRemove(line.key);
              onOpenChange(false);
            }}
          >
            {t('common.remove', 'Remover')}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button onClick={apply}>{t('common.save', 'Guardar')}</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default LineEditorSheet;
