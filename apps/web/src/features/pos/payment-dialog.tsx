import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import {
  PAYMENT_METHOD_LABELS,
  suggestTenders,
  type CustomerDto,
  type EntitySettings,
  type LineDiscount,
  type PaymentInput,
  type PaymentMethod,
} from '@pos/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/ui/money-input';
import { useAuth } from '@/lib/auth-store';
import { amount, money } from '@/lib/format';
import { cn, uid } from '@/lib/utils';
import { PaymentExtras } from './payment-extras';
import type { CartTotals, PosLine } from './types';

interface PaymentDraft {
  id: string;
  method: PaymentMethod;
  amountMinor: number;
  tenderedMinor: number;
}

/** These two settle against the customer record, so they need one attached. */
const NEEDS_CUSTOMER: PaymentMethod[] = ['store_credit', 'loyalty_points'];

export interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: PosLine[];
  totals: CartTotals;
  settings: EntitySettings;
  orderDiscount: LineDiscount | null;
  onOrderDiscountChange: (discount: LineDiscount | null) => void;
  promotionCode: string | null;
  promotionDiscountMinor: number;
  onPromotionChange: (code: string | null, discountMinor: number) => void;
  customer: CustomerDto | null;
  onCustomerChange: (customer: CustomerDto | null) => void;
  submitting: boolean;
  onConfirm: (payments: PaymentInput[]) => void;
}

export function PaymentDialog({
  open,
  onOpenChange,
  lines,
  totals,
  settings,
  orderDiscount,
  onOrderDiscountChange,
  promotionCode,
  promotionDiscountMinor,
  onPromotionChange,
  customer,
  onCustomerChange,
  submitting,
  onConfirm,
}: PaymentDialogProps) {
  const { t } = useTranslation();
  const entity = useAuth((s) => s.entity);

  const methods = settings.enabledPaymentMethods.length
    ? settings.enabledPaymentMethods
    : (['cash'] as PaymentMethod[]);
  const defaultMethod = methods.includes(settings.defaultPaymentMethod)
    ? settings.defaultPaymentMethod
    : methods[0];

  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Opening the dialog always starts from one payment for the full amount.
  useEffect(() => {
    if (!open) return;
    const row: PaymentDraft = {
      id: uid('pay'),
      method: defaultMethod,
      amountMinor: totals.totalMinor,
      tenderedMinor: totals.totalMinor,
    };
    setPayments([row]);
    setActiveId(row.id);
    // Only when the dialog opens: re-running this on every total change would
    // fight the cashier as they type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A discount or promotion applied inside the dialog moves the target; a
  // single untouched payment row follows it rather than going stale.
  useEffect(() => {
    setPayments((current) => {
      if (current.length !== 1) return current;
      const row = current[0];
      if (row.amountMinor === totals.totalMinor) return current;
      const tendered = row.tenderedMinor === row.amountMinor ? totals.totalMinor : row.tenderedMinor;
      return [{ ...row, amountMinor: totals.totalMinor, tenderedMinor: tendered }];
    });
  }, [totals.totalMinor]);

  const paidMinor = payments.reduce((sum, row) => sum + row.amountMinor, 0);
  const remainingMinor = totals.totalMinor - paidMinor;
  const changeMinor = payments.reduce(
    (sum, row) => sum + (row.method === 'cash' ? Math.max(0, row.tenderedMinor - row.amountMinor) : 0),
    0,
  );

  const active = payments.find((row) => row.id === activeId) ?? payments[0] ?? null;
  const tenders = useMemo(
    () => suggestTenders(totals.totalMinor, entity?.currency ?? 'AOA'),
    [totals.totalMinor, entity?.currency],
  );

  const patch = (id: string, changes: Partial<PaymentDraft>) => {
    setPayments((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  };

  const addPayment = () => {
    const row: PaymentDraft = {
      id: uid('pay'),
      method: defaultMethod,
      amountMinor: Math.max(0, remainingMinor),
      tenderedMinor: Math.max(0, remainingMinor),
    };
    setPayments((current) => [...current, row]);
    setActiveId(row.id);
  };

  const removePayment = (id: string) => {
    setPayments((current) => (current.length <= 1 ? current : current.filter((row) => row.id !== id)));
  };

  const setMethod = (method: PaymentMethod) => {
    if (!active) return;
    patch(active.id, { method, tenderedMinor: active.amountMinor });
  };

  const methodLabel = (method: PaymentMethod): string =>
    settings.customPaymentLabels[method] ?? PAYMENT_METHOD_LABELS[method].pt;

  const methodDisabled = (method: PaymentMethod): boolean => NEEDS_CUSTOMER.includes(method) && !customer;

  const settled = remainingMinor === 0 && payments.every((row) => row.amountMinor > 0);

  const confirm = () => {
    if (!settled) return;
    onConfirm(
      payments.map((row) => ({
        method: row.method,
        amountMinor: row.amountMinor,
        ...(row.method === 'cash' ? { tenderedMinor: Math.max(row.amountMinor, row.tenderedMinor) } : {}),
      })),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('pos.payment', 'Pagamento')}</DialogTitle>
        </DialogHeader>

        <DialogBody className="grid gap-5 md:grid-cols-2">
          {/* ------------------------------------------------ tender column */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('pos.amountDue', 'Valor a Pagar')}
              </p>
              <p className="tabular mt-1 text-5xl font-bold leading-none text-foreground">
                {money(totals.totalMinor)}
              </p>
              {changeMinor > 0 && (
                <p className="tabular mt-3 border-t border-border pt-3 text-3xl font-bold text-success">
                  {t('pos.change', 'Troco')} {money(changeMinor)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t('pos.paymentMethod', 'Metodo')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {methods.map((method) => (
                  <Button
                    key={method}
                    variant={active?.method === method ? 'default' : 'outline'}
                    disabled={methodDisabled(method)}
                    className="h-14 justify-start px-3 text-left text-sm"
                    onClick={() => setMethod(method)}
                  >
                    <span className="truncate">{methodLabel(method)}</span>
                  </Button>
                ))}
              </div>
              {methods.some(methodDisabled) && (
                <p className="text-xs text-muted-foreground">
                  Credito de loja e pontos exigem um cliente associado.
                </p>
              )}
            </div>

            {active?.method === 'cash' && (
              <div className="space-y-2">
                <Label>{t('pos.tendered', 'Valor Entregue')}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {tenders.map((value) => (
                    <Button
                      key={value}
                      variant="secondary"
                      className="tabular h-12"
                      onClick={() => patch(active.id, { tenderedMinor: value })}
                    >
                      {amount(value)}
                    </Button>
                  ))}
                </div>
                <MoneyInput
                  value={active.tenderedMinor}
                  onChange={(value) => patch(active.id, { tenderedMinor: value })}
                  min={0}
                  inputSize="lg"
                  aria-label={t('pos.tendered', 'Valor Entregue')}
                />
              </div>
            )}

            {/* Split payment */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('pos.splitPayment', 'Dividir Pagamento')}</Label>
                <span
                  className={cn(
                    'tabular text-sm font-semibold',
                    remainingMinor === 0 ? 'text-success' : 'text-destructive',
                  )}
                >
                  {t('pos.remaining', 'Em falta')} {money(remainingMinor)}
                </span>
              </div>

              {payments.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border p-2',
                    row.id === active?.id ? 'border-primary bg-accent/40' : 'border-border bg-card',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveId(row.id)}
                    className="min-h-touch min-w-0 flex-1 rounded-lg px-2 text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block truncate">{methodLabel(row.method)}</span>
                    {row.method === 'cash' && row.tenderedMinor > row.amountMinor && (
                      <span className="tabular block text-xs font-normal text-muted-foreground">
                        entregue {amount(row.tenderedMinor)}
                      </span>
                    )}
                  </button>
                  <div className="w-36 shrink-0">
                    <MoneyInput
                      value={row.amountMinor}
                      onChange={(value) => patch(row.id, { amountMinor: value })}
                      min={0}
                      showSymbol={false}
                      aria-label={`Valor em ${methodLabel(row.method)}`}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={payments.length <= 1}
                    aria-label="Remover pagamento"
                    onClick={() => removePayment(row.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}

              <Button variant="outline" block leftIcon={<Plus />} onClick={addPayment}>
                {t('pos.addPayment', 'Adicionar Pagamento')}
              </Button>
            </div>
          </div>

          <PaymentExtras
            open={open}
            lines={lines}
            totals={totals}
            orderDiscount={orderDiscount}
            onOrderDiscountChange={onOrderDiscountChange}
            promotionCode={promotionCode}
            promotionDiscountMinor={promotionDiscountMinor}
            onPromotionChange={onPromotionChange}
            customer={customer}
            onCustomerChange={onCustomerChange}
          />
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancelar')}
          </Button>
          <Button size="xl" disabled={!settled} loading={submitting} onClick={confirm}>
            {t('pos.completeSale', 'Concluir Venda')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PaymentDialog;
