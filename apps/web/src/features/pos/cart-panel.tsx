import { useTranslation } from 'react-i18next';
import { CloudOff, CreditCard, PauseCircle, PlayCircle, ShoppingCart, Trash2 } from 'lucide-react';
import { UNIT_LABELS, type PricingMode } from '@pos/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { amount, money, percent, quantity as formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isFractional, lineTotalMinor, type CartTotals, type PosLine } from './types';

interface CartLineRowProps {
  line: PosLine;
  pricingMode: PricingMode;
  flashing: boolean;
  onOpen: (line: PosLine) => void;
}

function CartLineRow({ line, pricingMode, flashing, onOpen }: CartLineRowProps) {
  const unitShort = UNIT_LABELS[line.unit]?.short ?? '';
  const fractional = isFractional(line);

  // "1,350 kg x 2 500,00 Kz/kg" for a weighed line, "2 x 1 250,00 Kz" otherwise.
  const detail = fractional
    ? `${formatQuantity(line.quantity, line.unit)} x ${money(line.unitPriceMinor)}/${unitShort}`
    : `${line.quantity} x ${money(line.unitPriceMinor)}`;

  const discountLabel =
    line.discountType && line.discountValue
      ? line.discountType === 'percentage'
        ? `- ${percent(line.discountValue)}`
        : `- ${money(line.discountValue)}`
      : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(line)}
      className={cn(
        'flex w-full items-start justify-between gap-3 border-b border-border px-4 py-3 text-left',
        'min-h-touch transition-colors hover:bg-muted/60 active:bg-muted',
        'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        flashing && 'animate-scan-flash',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block break-words text-base font-semibold leading-tight text-foreground">
          {line.name}
        </span>
        <span className="tabular mt-1 block text-sm text-muted-foreground">{detail}</span>
        {discountLabel && (
          <Badge variant="success" size="sm" className="mt-1.5">
            {discountLabel}
          </Badge>
        )}
        {line.note && (
          <span className="mt-1 block break-words text-xs text-muted-foreground">{line.note}</span>
        )}
      </span>
      <span className="tabular shrink-0 pt-0.5 text-right text-base font-semibold text-foreground">
        {amount(lineTotalMinor(line, pricingMode))}
      </span>
    </button>
  );
}

export interface CartPanelProps {
  lines: PosLine[];
  totals: CartTotals;
  pricingMode: PricingMode;
  flashKey: string | null;
  online: boolean;
  queued: number;
  canHold: boolean;
  onOpenLine: (line: PosLine) => void;
  onPay: () => void;
  onHold: () => void;
  onRecall: () => void;
  onClear: () => void;
}

export function CartPanel({
  lines,
  totals,
  pricingMode,
  flashKey,
  online,
  queued,
  canHold,
  onOpenLine,
  onPay,
  onHold,
  onRecall,
  onClear,
}: CartPanelProps) {
  const { t } = useTranslation();
  const empty = lines.length === 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col border-r border-border bg-card" aria-label="Venda actual">
      {/* Header strip: how much is on the counter, and whether we are online. */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShoppingCart className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-foreground">
            {totals.itemCount === 1 ? '1 artigo' : `${totals.itemCount} artigos`}
          </span>
          {!online && (
            // The badge never wraps, so it is what gives way when the panel is
            // narrow - the running total on the right has to stay whole.
            <Badge variant="warning" size="sm" dot pulse className="min-w-0 overflow-hidden">
              <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">
                {t('common.offline', 'Sem ligacao')}
                {queued > 0 ? ` - ${queued} por sincronizar` : ''}
              </span>
            </Badge>
          )}
        </div>
        <span className="tabular shrink-0 whitespace-nowrap text-lg font-bold text-foreground">
          {money(totals.totalMinor)}
        </span>
      </header>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {empty ? (
          <EmptyState
            icon={ShoppingCart}
            title={t('pos.emptyCart', 'Nenhum artigo. Leia um codigo de barras para comecar.')}
            description={t(
              'pos.emptyCartHint',
              'Ou toque num artigo do acesso rapido, a direita.',
            )}
            className="h-full"
          />
        ) : (
          lines.map((line) => (
            <CartLineRow
              key={line.key}
              line={line}
              pricingMode={pricingMode}
              flashing={flashKey === line.key}
              onOpen={onOpenLine}
            />
          ))
        )}
      </div>

      {/* Totals */}
      <div className="shrink-0 border-t border-border bg-muted/40 px-4 py-3">
        {/*
          The tax breakdown grows by one row per distinct rate in the basket, so
          a mixed basket can make this block taller than the space left over.
          It scrolls internally instead of pushing down: everything below here -
          the total and the Pagar button - must stay on screen no matter what
          has been scanned.
        */}
        <dl className="max-h-24 space-y-1.5 overflow-y-auto overscroll-contain text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{t('common.subtotal', 'Subtotal')}</dt>
            <dd className="tabular min-w-0 truncate font-medium text-foreground">{amount(totals.subtotalMinor)}</dd>
          </div>
          {totals.discountMinor > 0 && (
            <div className="flex items-center justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">{t('common.discount', 'Desconto')}</dt>
              <dd className="tabular min-w-0 truncate font-medium text-success">- {amount(totals.discountMinor)}</dd>
            </div>
          )}
          {totals.taxBreakdown.map((row) => (
            <div key={row.rateBps} className="flex items-center justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">IVA {percent(row.rateBps)}</dt>
              <dd className="tabular min-w-0 truncate font-medium text-foreground">{amount(row.taxMinor)}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-3">
          <span className="shrink-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('common.total', 'Total')}
          </span>
          {/* Kwanza totals run long; shrink the type rather than overflow the panel. */}
          <span className="tabular min-w-0 truncate text-2xl font-bold leading-none text-foreground sm:text-3xl">
            {money(totals.totalMinor)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="safe-bottom shrink-0 border-t border-border px-4 py-3">
        <Button size="xl" block disabled={empty} onClick={onPay} leftIcon={<CreditCard />}>
          <span className="min-w-0 truncate">
            {empty ? t('pos.pay', 'Pagar') : `${t('pos.pay', 'Pagar')} ${money(totals.totalMinor)}`}
          </span>
        </Button>
        {/* A control that can never be pressed only teaches the cashier that the
            app is broken, so suspender/recuperar are absent - not greyed out -
            for a member whose permissions do not include them. */}
        <div className={cn('mt-2 grid gap-2', canHold ? 'grid-cols-3' : 'grid-cols-1')}>
          {canHold && (
            <Button variant="outline" disabled={empty} onClick={onHold} leftIcon={<PauseCircle />}>
              {t('pos.hold', 'Suspender')}
            </Button>
          )}
          {canHold && (
            <Button variant="outline" onClick={onRecall} leftIcon={<PlayCircle />}>
              {t('pos.recall', 'Recuperar')}
            </Button>
          )}
          <Button variant="outline" disabled={empty} onClick={onClear} leftIcon={<Trash2 />}>
            {t('common.clear', 'Limpar')}
          </Button>
        </div>
      </div>
    </section>
  );
}

export default CartPanel;
