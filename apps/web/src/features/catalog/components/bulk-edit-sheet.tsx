import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import type { CategoryDto } from '@pos/shared';

import { percent } from '@/lib/format';
import {
  Button,
  CheckboxField,
  Label,
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
  toast,
} from '@/components/ui';
import {
  catalogApi,
  invalidateProducts,
  type BulkPatch,
  type SupplierOption,
  type TaxRateOption,
} from '../catalog-api';
import { CategoryTreeSelect } from './category-tree-select';
import { FormError } from './catalog-page';

const NO_SUPPLIER = '__none__';

export interface BulkEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productIds: string[];
  categories: CategoryDto[];
  suppliers: SupplierOption[];
  taxRates: TaxRateOption[];
  canSeeSuppliers: boolean;
  onDone: () => void;
}

interface FieldState<T> {
  enabled: boolean;
  value: T;
}

/**
 * Bulk edit. Every row is opt-in: an untouched field is simply absent from the
 * patch, so "apply to 120 products" never quietly blanks a supplier.
 */
export function BulkEditSheet({
  open,
  onOpenChange,
  productIds,
  categories,
  suppliers,
  taxRates,
  canSeeSuppliers,
  onDone,
}: BulkEditSheetProps) {
  const [category, setCategory] = React.useState<FieldState<string | null>>({
    enabled: false,
    value: null,
  });
  const [taxRate, setTaxRate] = React.useState<FieldState<number>>({ enabled: false, value: 0 });
  const [supplier, setSupplier] = React.useState<FieldState<string | null>>({
    enabled: false,
    value: null,
  });
  const [active, setActive] = React.useState<FieldState<boolean>>({ enabled: false, value: true });
  const [quickGrid, setQuickGrid] = React.useState<FieldState<boolean>>({
    enabled: false,
    value: true,
  });

  // A fresh selection starts from a clean slate rather than the last edit.
  React.useEffect(() => {
    if (!open) return;
    setCategory({ enabled: false, value: null });
    setTaxRate({ enabled: false, value: taxRates[0]?.rateBps ?? 0 });
    setSupplier({ enabled: false, value: null });
    setActive({ enabled: false, value: true });
    setQuickGrid({ enabled: false, value: true });
  }, [open, taxRates]);

  const patch: BulkPatch = {};
  if (category.enabled) patch.categoryId = category.value;
  if (taxRate.enabled) patch.taxRateBps = taxRate.value;
  if (supplier.enabled) patch.supplierId = supplier.value;
  if (active.enabled) patch.active = active.value;
  if (quickGrid.enabled) patch.showInQuickGrid = quickGrid.value;

  const changeCount = Object.keys(patch).length;

  const mutation = useMutation({
    mutationFn: () => catalogApi.bulkEdit(productIds, patch),
    onSuccess: (result) => {
      invalidateProducts();
      toast.success(
        'Produtos actualizados',
        `${result.updated} ${result.updated === 1 ? 'produto alterado' : 'produtos alterados'}.`,
      );
      onOpenChange(false);
      onDone();
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>Editar em lote</SheetTitle>
          <SheetDescription>
            {productIds.length} {productIds.length === 1 ? 'produto seleccionado' : 'produtos seleccionados'}.
            Apenas os campos marcados sao alterados.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5">
          {mutation.isError && <FormError error={mutation.error} />}

          <section className="flex flex-col gap-2">
            <CheckboxField
              label="Alterar categoria"
              checked={category.enabled}
              onCheckedChange={(checked) =>
                setCategory((state) => ({ ...state, enabled: checked === true }))
              }
            />
            {category.enabled && (
              <CategoryTreeSelect
                tree={categories}
                value={category.value}
                onChange={(value) => setCategory((state) => ({ ...state, value }))}
                noneLabel="Remover categoria"
              />
            )}
          </section>

          <section className="flex flex-col gap-2">
            <CheckboxField
              label="Alterar taxa de imposto"
              checked={taxRate.enabled}
              onCheckedChange={(checked) =>
                setTaxRate((state) => ({ ...state, enabled: checked === true }))
              }
            />
            {taxRate.enabled && (
              <Select
                value={String(taxRate.value)}
                onValueChange={(next) =>
                  setTaxRate((state) => ({ ...state, value: Number(next) }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolher taxa" />
                </SelectTrigger>
                <SelectContent>
                  {taxRates.map((rate) => (
                    <SelectItem key={rate.id} value={String(rate.rateBps)}>
                      {rate.namePt} ({percent(rate.rateBps)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </section>

          {canSeeSuppliers && (
            <section className="flex flex-col gap-2">
              <CheckboxField
                label="Alterar fornecedor"
                checked={supplier.enabled}
                onCheckedChange={(checked) =>
                  setSupplier((state) => ({ ...state, enabled: checked === true }))
                }
              />
              {supplier.enabled && (
                <Select
                  value={supplier.value ?? NO_SUPPLIER}
                  onValueChange={(next) =>
                    setSupplier((state) => ({
                      ...state,
                      value: next === NO_SUPPLIER ? null : next,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SUPPLIER}>Remover fornecedor</SelectItem>
                    {suppliers.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <CheckboxField
              label="Alterar estado"
              checked={active.enabled}
              onCheckedChange={(checked) =>
                setActive((state) => ({ ...state, enabled: checked === true }))
              }
            />
            {active.enabled && (
              <Select
                value={active.value ? 'true' : 'false'}
                onValueChange={(next) =>
                  setActive((state) => ({ ...state, value: next === 'true' }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Activo</SelectItem>
                  <SelectItem value="false">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <CheckboxField
              label="Alterar grelha rapida"
              description="Mostrar ou esconder estes produtos na grelha de atalhos da caixa."
              checked={quickGrid.enabled}
              onCheckedChange={(checked) =>
                setQuickGrid((state) => ({ ...state, enabled: checked === true }))
              }
            />
            {quickGrid.enabled && (
              <Select
                value={quickGrid.value ? 'true' : 'false'}
                onValueChange={(next) =>
                  setQuickGrid((state) => ({ ...state, value: next === 'true' }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Mostrar na grelha rapida</SelectItem>
                  <SelectItem value="false">Esconder da grelha rapida</SelectItem>
                </SelectContent>
              </Select>
            )}
          </section>

          <div className="flex flex-col gap-1.5">
            <Label size="sm">Resumo</Label>
            <p className="text-sm text-muted-foreground">
              {changeCount === 0
                ? 'Nenhuma alteracao seleccionada.'
                : `${changeCount} ${changeCount === 1 ? 'campo sera alterado' : 'campos serao alterados'} em ${productIds.length} ${productIds.length === 1 ? 'produto' : 'produtos'}.`}
            </p>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={changeCount === 0 || productIds.length === 0}
            loading={mutation.isPending}
            loadingLabel="A guardar..."
          >
            Aplicar alteracoes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default BulkEditSheet;
