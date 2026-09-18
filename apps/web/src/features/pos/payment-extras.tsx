import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BadgePercent, Tag } from 'lucide-react';
import { bpsToPct, pctToBps, type CustomerDto, type DiscountType, type LineDiscount } from '@pos/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NumericInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/ui/money-input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { amount, money } from '@/lib/format';
import { CustomerPicker } from './customer-picker';
import type { CartTotals, PosLine } from './types';

interface PromotionEvaluation {
  valid: boolean;
  reason?: string;
  promotion?: { id: string; code: string; namePt: string };
  discountMinor: number;
}

export interface PaymentExtrasProps {
  open: boolean;
  lines: PosLine[];
  totals: CartTotals;
  orderDiscount: LineDiscount | null;
  onOrderDiscountChange: (discount: LineDiscount | null) => void;
  promotionCode: string | null;
  promotionDiscountMinor: number;
  onPromotionChange: (code: string | null, discountMinor: number) => void;
  customer: CustomerDto | null;
  onCustomerChange: (customer: CustomerDto | null) => void;
}

/**
 * Everything that changes what is owed rather than how it is paid: the customer,
 * a promo code the server has to bless, a manual discount, and the running
 * breakdown so the cashier can see where the number came from.
 */
export function PaymentExtras({
  open,
  lines,
  totals,
  orderDiscount,
  onOrderDiscountChange,
  promotionCode,
  promotionDiscountMinor,
  onPromotionChange,
  customer,
  onCustomerChange,
}: PaymentExtrasProps) {
  const { t } = useTranslation();
  const can = useAuth((s) => s.can);
  const canDiscount = can('sale:discount');

  const [promoDraft, setPromoDraft] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPromoDraft(promotionCode ?? '');
    setPromoError(null);
    // Reset only as the dialog opens, never while the cashier is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The discount is whatever the server says it is - never guessed locally, or
  // the payment would not match the total the server charges.
  const validatePromo = useMutation({
    mutationFn: (code: string) =>
      api.post<PromotionEvaluation>('/api/promotions/validate', {
        code,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          categoryId: line.categoryId,
        })),
        subtotalMinor: totals.subtotalMinor,
      }),
    onSuccess: (result, code) => {
      if (!result.valid) {
        setPromoError(result.reason ?? 'Codigo promocional invalido.');
        onPromotionChange(null, 0);
        return;
      }
      setPromoError(null);
      onPromotionChange(code, result.discountMinor);
    },
    onError: (error) => setPromoError((error as Error).message),
  });

  const setDiscountType = (type: DiscountType | null) => {
    onOrderDiscountChange(type ? { type, value: 0 } : null);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t('pos.attachCustomer', 'Associar Cliente')}</Label>
        <CustomerPicker customer={customer} onChange={onCustomerChange} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pos-promo">{t('pos.promoCode', 'Codigo Promocional')}</Label>
        <div className="flex gap-2">
          <Input
            id="pos-promo"
            value={promoDraft}
            onChange={(event) => setPromoDraft(event.target.value.toUpperCase())}
            placeholder="Ex.: VERAO10"
            maxLength={40}
            autoComplete="off"
          />
          <Button
            variant="outline"
            loading={validatePromo.isPending}
            disabled={!promoDraft.trim()}
            onClick={() => validatePromo.mutate(promoDraft.trim())}
          >
            {t('pos.applyPromo', 'Aplicar')}
          </Button>
        </div>
        {promoError && <p className="text-sm text-destructive">{promoError}</p>}
        {promotionCode && promotionDiscountMinor > 0 && (
          <Badge variant="success" size="lg">
            <Tag className="size-3.5" aria-hidden="true" />
            {promotionCode} - {money(promotionDiscountMinor)}
          </Badge>
        )}
      </div>

      {canDiscount && (
        <div className="space-y-2">
          <Label>{t('pos.saleDiscount', 'Desconto na Venda')}</Label>
          <div className="flex gap-2">
            <Button
              variant={orderDiscount === null ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setDiscountType(null)}
            >
              {t('common.none', 'Nenhum')}
            </Button>
            <Button
              variant={orderDiscount?.type === 'percentage' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setDiscountType('percentage')}
            >
              %
            </Button>
            <Button
              variant={orderDiscount?.type === 'fixed' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setDiscountType('fixed')}
            >
              {t('pos.fixedAmount', 'Valor')}
            </Button>
          </div>

          {orderDiscount?.type === 'percentage' && (
            <NumericInput
              value={bpsToPct(orderDiscount.value)}
              onValueChange={(pct) => onOrderDiscountChange({ type: 'percentage', value: pctToBps(pct) })}
              decimals={2}
              min={0}
              max={100}
              aria-label="Percentagem de desconto na venda"
            />
          )}
          {orderDiscount?.type === 'fixed' && (
            <MoneyInput
              value={orderDiscount.value}
              onChange={(value) => onOrderDiscountChange({ type: 'fixed', value })}
              min={0}
              max={totals.subtotalMinor}
              aria-label="Valor de desconto na venda"
            />
          )}
        </div>
      )}

      <dl className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('common.subtotal', 'Subtotal')}</dt>
          <dd className="tabular font-medium">{amount(totals.subtotalMinor)}</dd>
        </div>
        {totals.discountMinor > 0 && (
          <div className="flex justify-between">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <BadgePercent className="size-4" aria-hidden="true" />
              {t('common.discount', 'Desconto')}
            </dt>
            <dd className="tabular font-medium text-success">- {amount(totals.discountMinor)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('common.tax', 'Imposto')}</dt>
          <dd className="tabular font-medium">{amount(totals.taxMinor)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5">
          <dt className="font-semibold">{t('common.total', 'Total')}</dt>
          <dd className="tabular text-lg font-bold">{money(totals.totalMinor)}</dd>
        </div>
      </dl>
    </div>
  );
}

export default PaymentExtras;
