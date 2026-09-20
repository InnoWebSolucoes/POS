import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Delete } from 'lucide-react';
import { UNIT_LABELS, parseLocaleNumber } from '@pos/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LookupProductDto } from './types';

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', 'back'] as const;

export interface WeightDialogProps {
  product: LookupProductDto | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (quantity: number) => void;
}

/**
 * The scale did not speak: the cashier types the weight. Three decimals, a
 * keypad big enough to hit without looking, and the money it comes to shown
 * live so a fat-fingered kilo is obvious before it is charged.
 */
export function WeightDialog({ product, onOpenChange, onConfirm }: WeightDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');

  useEffect(() => {
    if (product) setText('');
  }, [product]);

  if (!product) return null;

  const unitShort = UNIT_LABELS[product.unit]?.short ?? 'kg';
  const quantity = Number(parseLocaleNumber(text).toFixed(3));
  const totalMinor = Math.round(product.salePriceMinor * quantity);
  const valid = quantity > 0;

  const press = (key: string) => {
    setText((current) => {
      if (key === 'back') return current.slice(0, -1);
      if (key === ',') return current.includes(',') ? current : `${current || '0'},`;
      const [whole, decimals] = current.split(',');
      if (decimals !== undefined && decimals.length >= 3) return current;
      if (decimals === undefined && whole.length >= 4) return current;
      return current + key;
    });
  };

  const confirm = () => {
    if (!valid) return;
    onConfirm(quantity);
    onOpenChange(false);
  };

  return (
    <Dialog open={Boolean(product)} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="break-words">
            {t('pos.enterWeight', 'Introduza o peso')} - {product.namePt}
          </DialogTitle>
          <p className="tabular text-sm text-muted-foreground">
            {money(product.salePriceMinor)}/{unitShort}
          </p>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/50 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('pos.weight', 'Peso')} ({unitShort})
            </p>
            <p className="tabular mt-1 text-5xl font-bold leading-none text-foreground">
              {text || '0'}
            </p>
            <p className="tabular mt-3 border-t border-border pt-3 text-2xl font-bold text-primary">
              {money(totalMinor)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <Button
                key={key}
                variant={key === 'back' ? 'secondary' : 'outline'}
                className="h-16 text-2xl"
                onClick={() => press(key)}
                aria-label={key === 'back' ? 'Apagar' : key}
              >
                {key === 'back' ? <Delete className="size-6" /> : key}
              </Button>
            ))}
          </div>

          <Button variant="ghost" block onClick={() => setText('')} className={cn(!text && 'invisible')}>
            {t('common.clear', 'Limpar')}
          </Button>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancelar')}
          </Button>
          {/* A mis-keyed weight makes this total enormous; let the label shrink
              rather than push the button out of the dialog. */}
          <Button size="lg" className="min-w-0" disabled={!valid} onClick={confirm}>
            <span className="min-w-0 truncate">
              {valid ? `${t('common.add', 'Adicionar')} ${money(totalMinor)}` : t('common.add', 'Adicionar')}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default WeightDialog;
