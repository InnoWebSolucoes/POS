import * as React from 'react';
import { X } from 'lucide-react';
import { pctToBps, PROMOTION_TYPES, type PromotionType } from '@pos/shared';

import {
  Button,
  Input,
  MoneyInput,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SwitchField,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

import { useCreatePromotion, useUpdatePromotion } from '../api';
import {
  buyGetLabel,
  emptyPromotionForm,
  formToPayload,
  promotionToForm,
  PROMOTION_TYPE_HINTS,
  PROMOTION_TYPE_LABELS,
  validatePromotionForm,
  type PromotionDto,
  type PromotionFormErrors,
  type PromotionFormValues,
} from '../types';
import { Field } from './field';
import { ScopePicker } from './scope-picker';

export interface PromotionFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates, a promotion edits. */
  promotion?: PromotionDto | null;
  onSaved?: (promotion: PromotionDto) => void;
}

/** Turns the API's field errors into the same shape the local rules produce. */
function errorsFromApi(error: ApiRequestError, type: PromotionType): PromotionFormErrors {
  const valueError = error.fieldError('value');
  return {
    code: error.fieldError('code'),
    namePt: error.fieldError('namePt'),
    percent: type === 'percent_off' ? valueError : undefined,
    fixedMinor: type === 'fixed_off' ? valueError : undefined,
    buyQuantity: error.fieldError('buyQuantity'),
    getQuantity: error.fieldError('getQuantity'),
    categoryId: error.fieldError('categoryId'),
    productIds: error.fieldError('productIds'),
    minSpendMinor: error.fieldError('minSpendMinor'),
    usageLimit: error.fieldError('usageLimit'),
    startsAt: error.fieldError('startsAt'),
    endsAt: error.fieldError('endsAt'),
  };
}

/** Create and edit share one sheet, so the fields can never drift apart. */
export function PromotionFormSheet({ open, onOpenChange, promotion, onSaved }: PromotionFormSheetProps) {
  const editing = Boolean(promotion);
  const [values, setValues] = React.useState<PromotionFormValues>(emptyPromotionForm);
  const [errors, setErrors] = React.useState<PromotionFormErrors>({});

  React.useEffect(() => {
    if (!open) return;
    setValues(promotion ? promotionToForm(promotion) : emptyPromotionForm());
    setErrors({});
  }, [open, promotion]);

  const create = useCreatePromotion();
  const update = useUpdatePromotion();
  const saving = create.isPending || update.isPending;

  const patch = (next: Partial<PromotionFormValues>) => setValues((prev) => ({ ...prev, ...next }));

  const handleError = (cause: unknown) => {
    if (cause instanceof ApiRequestError) {
      setErrors(errorsFromApi(cause, values.type));
      toast.error('Nao foi possivel guardar', cause.message);
      return;
    }
    toast.error('Nao foi possivel guardar', 'Tente novamente.');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const found = validatePromotionForm(values);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      toast.error('Promocao incompleta', 'Corrija os campos assinalados.');
      return;
    }

    const body = formToPayload(values);

    const done = (saved: PromotionDto, message: string) => {
      toast.success(message, `${saved.code} - ${saved.namePt}`);
      onSaved?.(saved);
      onOpenChange(false);
    };

    if (promotion) {
      update.mutate(
        { id: promotion.id, body },
        { onSuccess: (saved) => done(saved, 'Promocao actualizada'), onError: handleError },
      );
      return;
    }

    create.mutate(body, {
      onSuccess: (saved) => done(saved, 'Promocao criada'),
      onError: handleError,
    });
  };

  const clearButton = (onClear: () => void) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9"
      aria-label="Limpar data"
      onClick={onClear}
    >
      <X className="size-4" />
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{editing ? 'Editar promocao' : 'Nova promocao'}</SheetTitle>
          <SheetDescription>
            {editing
              ? 'Altere as regras e a janela desta promocao.'
              : 'Defina o codigo, o desconto e onde se aplica.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody>
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Codigo" htmlFor="promo-code" required error={errors.code}>
                  <Input
                    id="promo-code"
                    value={values.code}
                    onChange={(event) => patch({ code: event.target.value.toUpperCase() })}
                    placeholder="NATAL25"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={40}
                    aria-invalid={Boolean(errors.code)}
                    className="tabular uppercase"
                  />
                </Field>

                <Field label="Nome (pt)" htmlFor="promo-name-pt" required error={errors.namePt}>
                  <Input
                    id="promo-name-pt"
                    value={values.namePt}
                    onChange={(event) => patch({ namePt: event.target.value })}
                    placeholder="Desconto de Natal"
                    maxLength={140}
                    aria-invalid={Boolean(errors.namePt)}
                  />
                </Field>
              </div>

              <Field label="Nome (en)" htmlFor="promo-name-en" hint="Opcional, para o modo ingles.">
                <Input
                  id="promo-name-en"
                  value={values.nameEn}
                  onChange={(event) => patch({ nameEn: event.target.value })}
                  placeholder="Christmas discount"
                  maxLength={140}
                />
              </Field>

              <Field label="Tipo" hint={PROMOTION_TYPE_HINTS[values.type]} required>
                <Select
                  value={values.type}
                  onValueChange={(value) => patch({ type: value as PromotionType })}
                >
                  <SelectTrigger aria-label="Tipo de promocao">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROMOTION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {PROMOTION_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {values.type === 'percent_off' && (
                <Field
                  label="Percentagem"
                  htmlFor="promo-percent"
                  required
                  error={errors.percent}
                  hint={`Guardado como ${pctToBps(values.percent)} pontos base.`}
                >
                  <div className="flex items-center gap-2">
                    <NumericInput
                      id="promo-percent"
                      className="flex-1"
                      value={values.percent}
                      onValueChange={(percent) => patch({ percent })}
                      decimals={2}
                      min={0}
                      max={100}
                      aria-invalid={Boolean(errors.percent)}
                    />
                    <span className="text-base font-semibold text-muted-foreground">%</span>
                  </div>
                </Field>
              )}

              {values.type === 'fixed_off' && (
                <Field label="Valor do desconto" htmlFor="promo-fixed" required error={errors.fixedMinor}>
                  <MoneyInput
                    id="promo-fixed"
                    value={values.fixedMinor}
                    onChange={(fixedMinor) => patch({ fixedMinor })}
                    min={0}
                    aria-invalid={Boolean(errors.fixedMinor)}
                  />
                </Field>
              )}

              {values.type === 'buy_x_get_y' && (
                <div className="space-y-3 rounded-xl border border-border p-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Compra (X)" htmlFor="promo-buy" required error={errors.buyQuantity}>
                      <NumericInput
                        id="promo-buy"
                        value={values.buyQuantity}
                        onValueChange={(buyQuantity) => patch({ buyQuantity })}
                        decimals={0}
                        min={1}
                        max={999}
                        aria-invalid={Boolean(errors.buyQuantity)}
                      />
                    </Field>
                    <Field label="Oferta (Y)" htmlFor="promo-get" required error={errors.getQuantity}>
                      <NumericInput
                        id="promo-get"
                        value={values.getQuantity}
                        onValueChange={(getQuantity) => patch({ getQuantity })}
                        decimals={0}
                        min={1}
                        max={999}
                        aria-invalid={Boolean(errors.getQuantity)}
                      />
                    </Field>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {buyGetLabel(values.buyQuantity, values.getQuantity)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    As unidades oferecidas sao sempre as mais baratas do mesmo produto.
                  </p>
                </div>
              )}

              <ScopePicker
                scope={values.scope}
                categoryId={values.categoryId}
                productIds={values.productIds}
                errors={errors}
                onScopeChange={(scope) => patch({ scope })}
                onCategoryChange={(categoryId) => patch({ categoryId })}
                onProductIdsChange={(productIds) => patch({ productIds })}
              />

              <Field
                label="Compra minima"
                htmlFor="promo-min-spend"
                error={errors.minSpendMinor}
                hint="Zero significa sem minimo."
              >
                <MoneyInput
                  id="promo-min-spend"
                  value={values.minSpendMinor}
                  onChange={(minSpendMinor) => patch({ minSpendMinor })}
                  min={0}
                />
              </Field>

              <div className="space-y-3 rounded-xl border border-border p-3">
                <SwitchField
                  label="Limitar utilizacoes"
                  description="Deixe desligado para utilizacoes ilimitadas."
                  checked={values.limitUsage}
                  onCheckedChange={(limitUsage) => patch({ limitUsage })}
                />
                {values.limitUsage && (
                  <Field label="Limite de utilizacoes" htmlFor="promo-usage" error={errors.usageLimit}>
                    <NumericInput
                      id="promo-usage"
                      value={values.usageLimit}
                      onValueChange={(usageLimit) => patch({ usageLimit })}
                      decimals={0}
                      min={1}
                      max={1_000_000}
                      aria-invalid={Boolean(errors.usageLimit)}
                    />
                  </Field>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Inicio"
                  htmlFor="promo-starts"
                  error={errors.startsAt}
                  hint="Vazio comeca de imediato."
                >
                  <Input
                    id="promo-starts"
                    type="datetime-local"
                    value={values.startsAt}
                    onChange={(event) => patch({ startsAt: event.target.value })}
                    className="tabular"
                    endAdornment={values.startsAt ? clearButton(() => patch({ startsAt: '' })) : undefined}
                  />
                </Field>

                <Field label="Fim" htmlFor="promo-ends" error={errors.endsAt} hint="Vazio nunca expira.">
                  <Input
                    id="promo-ends"
                    type="datetime-local"
                    value={values.endsAt}
                    onChange={(event) => patch({ endsAt: event.target.value })}
                    className="tabular"
                    aria-invalid={Boolean(errors.endsAt)}
                    endAdornment={values.endsAt ? clearButton(() => patch({ endsAt: '' })) : undefined}
                  />
                </Field>
              </div>

              <SwitchField
                label="Promocao activa"
                description="Inactiva nao e aceite na caixa, mesmo dentro da janela."
                checked={values.active}
                onCheckedChange={(active) => patch({ active })}
              />
            </div>
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" loading={saving} loadingLabel="A guardar...">
              {editing ? 'Guardar alteracoes' : 'Criar promocao'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default PromotionFormSheet;
