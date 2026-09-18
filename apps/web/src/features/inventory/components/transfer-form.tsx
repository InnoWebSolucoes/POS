import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Trash2, TriangleAlert } from 'lucide-react';
import { FRACTIONAL_UNITS, type Unit } from '@pos/shared';

import {
  Button,
  EmptyState,
  Label,
  QuantityStepper,
  SheetFooter,
  Textarea,
  toast,
} from '@/components/ui';
import { ApiRequestError, api } from '@/lib/api';
import { uid } from '@/lib/utils';
import { invalidateStock } from '../api';
import { FieldError, LocationSelect } from './inventory-shell';
import { ProductPicker, type PickedProduct } from './product-picker';
import type { StockTransferDto } from '../types';

interface TransferLineDraft {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  unit: Unit;
  quantity: number;
  available: number;
}

const stepFor = (unit: Unit): number => (FRACTIONAL_UNITS.includes(unit) ? 0.001 : 1);

export interface TransferFormProps {
  onCreated: (transfer: StockTransferDto) => void;
}

/**
 * Creating a transfer also sends it: the API books the stock out of the source
 * immediately and the destination confirms later, so the form says so plainly.
 */
export function TransferForm({ onCreated }: TransferFormProps) {
  const [fromLocationId, setFromLocationId] = React.useState<string | undefined>(undefined);
  const [toLocationId, setToLocationId] = React.useState<string | undefined>(undefined);
  const [lines, setLines] = React.useState<TransferLineDraft[]>([]);
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const sameLocation = Boolean(fromLocationId && toLocationId && fromLocationId === toLocationId);

  const addProduct = (picked: PickedProduct) => {
    setLines((current) => {
      const existing = current.find(
        (line) => line.productId === picked.productId && line.variantId === (picked.variantId ?? null),
      );
      const increment = picked.scannedQuantity ?? stepFor(picked.unit);
      if (existing) {
        return current.map((line) =>
          line.key === existing.key
            ? { ...line, quantity: Math.round((line.quantity + increment) * 1000) / 1000 }
            : line,
        );
      }
      return [
        ...current,
        {
          key: uid('transf'),
          productId: picked.productId,
          variantId: picked.variantId,
          name: picked.name,
          sku: picked.sku,
          unit: picked.unit,
          quantity: increment,
          available: picked.stockQuantity,
        },
      ];
    });
  };

  const create = useMutation({
    mutationFn: (payload: unknown) => api.post<StockTransferDto>('/api/inventory/transfers', payload),
    onSuccess: (transfer) => {
      invalidateStock();
      toast.success('Transferencia enviada', `${transfer.reference} - o stock saiu da origem.`);
      onCreated(transfer);
    },
    onError: (apiError: unknown) => {
      const message =
        apiError instanceof ApiRequestError ? apiError.message : 'Nao foi possivel criar a transferencia.';
      setError(message);
      toast.error('Transferencia nao criada', message);
    },
  });

  const submit = () => {
    if (!fromLocationId || !toLocationId) {
      setError('Escolha a localizacao de origem e a de destino.');
      return;
    }
    if (sameLocation) {
      setError('A origem e o destino tem de ser localizacoes diferentes.');
      return;
    }
    if (lines.length === 0) {
      setError('Adicione pelo menos um artigo a transferir.');
      return;
    }
    const invalid = lines.find((line) => line.quantity <= 0);
    if (invalid) {
      setError(`A quantidade de "${invalid.name}" tem de ser maior do que zero.`);
      return;
    }

    setError(null);
    create.mutate({
      fromLocationId,
      toLocationId,
      note: note.trim() || null,
      lines: lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
      })),
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label>Origem</Label>
          <LocationSelect
            value={fromLocationId}
            onChange={setFromLocationId}
            includeAll={false}
            placeholder="Escolher origem"
            className="w-full"
          />
        </div>
        <ArrowRight className="mx-auto hidden size-5 text-muted-foreground sm:block" aria-hidden="true" />
        <div className="flex flex-col gap-1.5">
          <Label>Destino</Label>
          <LocationSelect
            value={toLocationId}
            onChange={setToLocationId}
            includeAll={false}
            exclude={fromLocationId}
            placeholder="Escolher destino"
            className="w-full"
          />
        </div>
      </div>

      {sameLocation && <FieldError message="A origem e o destino tem de ser localizacoes diferentes." />}

      <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sm text-foreground">
          Ao criar, o stock sai imediatamente da origem e fica em transito. So entra no destino quando alguem receber
          a transferencia.
        </p>
      </div>

      <ProductPicker onPick={addProduct} placeholder="Digitalizar ou procurar artigo a transferir..." />

      {lines.length === 0 ? (
        <EmptyState size="sm" title="Sem artigos" description="Adicione o que vai sair desta localizacao." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {lines.map((line) => (
            <li key={line.key} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{line.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {line.sku} - total em stock <span className="tabular">{line.available}</span>
                </span>
              </div>
              <QuantityStepper
                value={line.quantity}
                onChange={(value) =>
                  setLines((current) =>
                    current.map((entry) => (entry.key === line.key ? { ...entry, quantity: value } : entry)),
                  )
                }
                step={stepFor(line.unit)}
                min={stepFor(line.unit)}
                unit={line.unit}
                editable
                aria-label={`Quantidade de ${line.name}`}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover ${line.name}`}
                onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}
              >
                <Trash2 className="size-5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transfer-note">Nota</Label>
        <Textarea
          id="transfer-note"
          value={note}
          rows={2}
          maxLength={2000}
          placeholder="Ex.: reposicao da loja para o fim-de-semana"
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <FieldError message={error} />

      <SheetFooter>
        <Button
          size="lg"
          block
          loading={create.isPending}
          disabled={sameLocation || lines.length === 0}
          onClick={submit}
        >
          Criar e enviar transferencia
        </Button>
      </SheetFooter>
    </div>
  );
}

export default TransferForm;
