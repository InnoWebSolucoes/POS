import * as React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { applyBps, bpsToPct, margin, pctToBps } from '@pos/shared';

import { money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  Label,
  MoneyInput,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { FieldError } from '../components/catalog-page';
import type { TaxRateOption } from '../catalog-api';
import type { ProductForm, PatchForm } from './use-product-form';

export interface PrecosTabProps {
  form: ProductForm;
  patch: PatchForm;
  errors: Record<string, string>;
  taxRates: TaxRateOption[];
  /** False for a cashier: the API never sent a cost, so nothing here shows one. */
  canSeeCost: boolean;
  /** The entity sells tax-inclusive or tax-exclusive prices. */
  pricingMode: 'inclusive' | 'exclusive';
}

/** The number the owner actually cares about, recomputed on every keystroke. */
function MarginReadout({ saleMinor, costMinor }: { saleMinor: number; costMinor: number }) {
  const { profitMinor, marginBps } = margin(saleMinor, costMinor);
  const negative = profitMinor < 0;
  const thin = !negative && marginBps < 1000;

  return (
    <Card
      className={cn(
        'border-2',
        negative ? 'border-destructive/60' : thin ? 'border-warning/60' : 'border-success/60',
      )}
    >
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-muted-foreground">Margem</span>
          <span
            className={cn(
              'tabular text-3xl font-semibold',
              negative ? 'text-destructive' : thin ? 'text-warning' : 'text-success',
            )}
          >
            {percent(marginBps)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {negative ? (
              <TrendingDown className="size-4" aria-hidden="true" />
            ) : (
              <TrendingUp className="size-4" aria-hidden="true" />
            )}
            Lucro por unidade
          </span>
          <span className={cn('tabular text-lg font-medium', negative && 'text-destructive')}>
            {money(profitMinor, { signed: true })}
          </span>
        </div>

        {negative && (
          <p className="text-xs font-medium text-destructive">
            O preco de venda esta abaixo do custo. Cada venda perde dinheiro.
          </p>
        )}
        {thin && (
          <p className="text-xs text-muted-foreground">
            Margem abaixo de 10%. Confirme que cobre os custos de operacao.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function PrecosTab({
  form,
  patch,
  errors,
  taxRates,
  canSeeCost,
  pricingMode,
}: PrecosTabProps) {
  // A product may carry a rate that is no longer in the catalogue; keep it, or
  // the next save would silently change it.
  const options = React.useMemo(() => {
    const known = taxRates.map((rate) => ({ value: rate.rateBps, label: rate.namePt }));
    if (!known.some((option) => option.value === form.taxRateBps)) {
      known.push({ value: form.taxRateBps, label: `Taxa actual (${percent(form.taxRateBps)})` });
    }
    return known;
  }, [taxRates, form.taxRateBps]);

  const taxMinor = applyBps(form.salePriceMinor, form.taxRateBps);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-preco" required>
            Preco de venda
          </Label>
          <MoneyInput
            id="produto-preco"
            inputSize="lg"
            value={form.salePriceMinor}
            onChange={(salePriceMinor) => patch({ salePriceMinor })}
            aria-invalid={Boolean(errors.salePriceMinor)}
          />
          <FieldError message={errors.salePriceMinor} />
        </div>

        {canSeeCost && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="produto-custo">Preco de custo</Label>
            <MoneyInput
              id="produto-custo"
              inputSize="lg"
              value={form.costPriceMinor}
              onChange={(costPriceMinor) => patch({ costPriceMinor })}
              aria-invalid={Boolean(errors.costPriceMinor)}
            />
            <FieldError message={errors.costPriceMinor} />
            <p className="text-xs text-muted-foreground">
              O custo medio ponderado so muda com uma entrada de stock; este e o custo de referencia.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-imposto">Taxa de imposto</Label>
          {options.length > 0 ? (
            <Select
              value={String(form.taxRateBps)}
              onValueChange={(next) => patch({ taxRateBps: Number(next) })}
            >
              <SelectTrigger id="produto-imposto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label} - {percent(option.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <NumericInput
              id="produto-imposto"
              value={bpsToPct(form.taxRateBps)}
              onValueChange={(pct) => patch({ taxRateBps: pctToBps(pct) })}
              decimals={2}
              min={0}
              max={100}
              aria-label="Taxa de imposto em percentagem"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {pricingMode === 'inclusive'
              ? `O preco de venda ja inclui ${percent(form.taxRateBps)} de imposto.`
              : `Imposto acrescido na venda: ${money(taxMinor)} (total ${money(form.salePriceMinor + taxMinor)}).`}
          </p>
          <FieldError message={errors.taxRateBps} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        {canSeeCost ? (
          <MarginReadout saleMinor={form.salePriceMinor} costMinor={form.costPriceMinor} />
        ) : (
          <Card>
            <CardContent className="py-5 text-sm text-muted-foreground">
              A margem e o custo estao reservados a contas com permissao de custos.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

export default PrecosTab;
