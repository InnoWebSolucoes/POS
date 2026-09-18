import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Trash2 } from 'lucide-react';
import type { ProductVariantDto, Unit } from '@pos/shared';

import { ApiRequestError } from '@/lib/api';
import { quantity } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge, Button, Input, MoneyInput, Switch, toast } from '@/components/ui';
import { catalogApi, invalidateProducts, type VariantPatch } from '../catalog-api';

export interface VariantRowProps {
  variant: ProductVariantDto;
  productId: string;
  unit: Unit;
  canWrite: boolean;
  canSeeCost: boolean;
  onDelete: (variant: ProductVariantDto) => void;
}

/**
 * One row of the variant matrix. Edits are held locally and sent on "Guardar",
 * so a slow connection cannot leave half a row applied.
 */
export function VariantRow({
  variant,
  productId,
  unit,
  canWrite,
  canSeeCost,
  onDelete,
}: VariantRowProps) {
  const [sku, setSku] = React.useState(variant.sku);
  const [barcode, setBarcode] = React.useState(variant.barcode ?? '');
  const [price, setPrice] = React.useState<number>(variant.salePriceMinor ?? 0);
  const [cost, setCost] = React.useState<number>(variant.costPriceMinor ?? 0);

  React.useEffect(() => {
    setSku(variant.sku);
    setBarcode(variant.barcode ?? '');
    setPrice(variant.salePriceMinor ?? 0);
    setCost(variant.costPriceMinor ?? 0);
  }, [variant.sku, variant.barcode, variant.salePriceMinor, variant.costPriceMinor]);

  const save = useMutation({
    mutationFn: (patch: VariantPatch) => catalogApi.updateVariant(variant.id, patch),
    onSuccess: () => invalidateProducts(productId),
    onError: (error) =>
      toast.error(
        'Nao foi possivel guardar a variante',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      ),
  });

  const dirty =
    sku !== variant.sku ||
    barcode !== (variant.barcode ?? '') ||
    price !== (variant.salePriceMinor ?? 0) ||
    (canSeeCost && cost !== (variant.costPriceMinor ?? 0));

  const submit = () => {
    const patch: VariantPatch = {};
    if (sku.trim() && sku !== variant.sku) patch.sku = sku.trim();
    if (barcode !== (variant.barcode ?? '')) patch.barcode = barcode.trim() ? barcode.trim() : null;
    if (price !== (variant.salePriceMinor ?? 0)) patch.salePriceMinor = price;
    if (canSeeCost && cost !== (variant.costPriceMinor ?? 0)) patch.costPriceMinor = cost;
    if (Object.keys(patch).length === 0) return;
    save.mutate(patch);
  };

  const options = Object.entries(variant.options);

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-3',
        variant.active ? 'border-border' : 'border-dashed border-border opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {options.length === 0 ? (
          <Badge variant="muted" size="sm">
            Sem opcoes
          </Badge>
        ) : (
          options.map(([axis, value]) => (
            <Badge key={axis} variant="secondary" size="sm">
              {axis}: {value}
            </Badge>
          ))
        )}
        <span className="tabular ml-auto text-sm text-muted-foreground">
          {quantity(variant.stockQuantity, unit)}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          SKU
          <Input
            value={sku}
            onChange={(event) => setSku(event.target.value.toUpperCase())}
            disabled={!canWrite}
            className="tabular"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Codigo de barras
          <Input
            value={barcode}
            onChange={(event) => setBarcode(event.target.value.trim())}
            disabled={!canWrite}
            inputMode="numeric"
            className="tabular"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Preco
          <MoneyInput value={price} onChange={setPrice} disabled={!canWrite} />
        </label>

        {canSeeCost && (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Custo
            <MoneyInput value={cost} onChange={setCost} disabled={!canWrite} />
          </label>
        )}
      </div>

      {canWrite && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-touch items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={variant.active}
              onCheckedChange={(active) => save.mutate({ active })}
              aria-label="Variante activa"
            />
            <span>{variant.active ? 'Activa' : 'Inactiva'}</span>
          </label>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              leftIcon={<Check />}
              disabled={!dirty}
              loading={save.isPending}
              onClick={submit}
            >
              Guardar
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Eliminar variante ${variant.sku}`}
              onClick={() => onDelete(variant)}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default VariantRow;
