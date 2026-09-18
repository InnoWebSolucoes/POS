import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ScrollText, ShieldAlert, SlidersHorizontal } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Label,
  SwitchField,
  Textarea,
  toast,
} from '@/components/ui';
import { ApiRequestError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatDateTime, quantity as formatQuantity } from '@/lib/format';
import { successChime } from '@/lib/sound';
import { uid } from '@/lib/utils';
import { invalidateStock } from './api';
import { AdjustmentRow, effectiveDelta, type AdjustmentDraft } from './components/adjustment-row';
import { FieldError, InventoryShell, LocationSelect } from './components/inventory-shell';
import { ProductPicker, type PickedProduct } from './components/product-picker';
import type { AdjustmentResponse } from './types';

export default function StockAdjustPage() {
  const { t } = useTranslation();
  const can = useAuth((s) => s.can);
  const user = useAuth((s) => s.user);
  const canAdjust = can('inventory:adjust');

  const [lines, setLines] = React.useState<AdjustmentDraft[]>([]);
  const [highlight, setHighlight] = React.useState<string | null>(null);
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const [note, setNote] = React.useState('');
  const [allowNegative, setAllowNegative] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AdjustmentResponse | null>(null);

  const patchLine = React.useCallback((key: string, patch: Partial<AdjustmentDraft>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }, []);

  const removeLine = React.useCallback((key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
  }, []);

  const addProduct = React.useCallback((picked: PickedProduct) => {
    setLines((current) => {
      const existing = current.find(
        (line) => line.productId === picked.productId && line.variantId === (picked.variantId ?? null),
      );
      if (existing) {
        setHighlight(existing.key);
        return current;
      }
      const key = uid('ajuste');
      setHighlight(key);
      return [
        ...current,
        {
          key,
          productId: picked.productId,
          variantId: picked.variantId,
          name: picked.name,
          sku: picked.sku,
          unit: picked.unit,
          currentQuantity: picked.stockQuantity,
          mode: 'delta',
          delta: 0,
          absolute: picked.stockQuantity,
          reason: '',
          note: '',
        },
      ];
    });
  }, []);

  React.useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 1200);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  const submit = useMutation({
    mutationFn: (payload: unknown) => api.post<AdjustmentResponse>('/api/inventory/adjustments', payload),
    onSuccess: (response) => {
      successChime();
      invalidateStock();
      setResult(response);
      setLines([]);
      setNote('');
      setFormError(null);
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiRequestError ? error.message : 'Nao foi possivel aplicar o ajuste.';
      setFormError(message);
      toast.error('Ajuste nao aplicado', message);
    },
  });

  const handleSubmit = () => {
    if (lines.length === 0) {
      setFormError('Procure ou digitalize pelo menos um artigo.');
      return;
    }
    const withoutReason = lines.find((line) => line.reason === '');
    if (withoutReason) {
      setFormError(`Escolha o motivo do ajuste de "${withoutReason.name}". O motivo e obrigatorio.`);
      return;
    }
    const zero = lines.find((line) => effectiveDelta(line) === 0);
    if (zero) {
      setFormError(`"${zero.name}" nao altera a quantidade. Corrija ou remova a linha.`);
      return;
    }

    setFormError(null);
    submit.mutate({
      locationId: locationId ?? null,
      note: note.trim() || null,
      allowNegative,
      items: lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantityDelta: effectiveDelta(line),
        reason: line.reason,
        note: line.note.trim() || null,
      })),
    });
  };

  if (!canAdjust) {
    return (
      <InventoryShell title={t('inventory.adjustStock', 'Ajuste de Stock')}>
        <EmptyState
          icon={ShieldAlert}
          title="Sem permissao"
          description="Precisa da permissao inventory:adjust para corrigir quantidades."
        />
      </InventoryShell>
    );
  }

  return (
    <InventoryShell
      title={t('inventory.adjustStock', 'Ajuste de Stock')}
      description="Corrija quantidades com um motivo. Cada correccao entra no livro de movimentos."
    >
      <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
        <ScrollText className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sm text-foreground">
          Cada ajuste fica registado no historico de movimentos com o motivo, a data e o nome de quem o fez
          {user?.name ? ` - neste momento, ${user.name}` : ''}. Nao e possivel apagar um ajuste; corrige-se com outro.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contexto</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Localizacao</Label>
            <LocationSelect
              value={locationId}
              onChange={setLocationId}
              allLabel="Localizacao principal"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              As quantidades mostradas sao o total do artigo em todas as localizacoes.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="adjust-note">Nota comum a todas as linhas</Label>
            <Textarea
              id="adjust-note"
              value={note}
              rows={2}
              maxLength={500}
              placeholder="Ex.: contagem apos rotura de palete"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <SwitchField
            label="Permitir stock negativo"
            description="Por defeito, uma saida nao pode deixar o saldo abaixo de zero."
            checked={allowNegative}
            onCheckedChange={setAllowNegative}
            className="md:col-span-3"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Artigos a ajustar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ProductPicker onPick={addProduct} placeholder="Digitalizar ou procurar o artigo a ajustar..." />

          {lines.length === 0 ? (
            <EmptyState
              icon={SlidersHorizontal}
              size="sm"
              title="Nenhum artigo seleccionado"
              description="Pode ajustar varios artigos de uma so vez: cada um com o seu motivo."
            />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {lines.map((line) => (
                <AdjustmentRow
                  key={line.key}
                  line={line}
                  highlighted={highlight === line.key}
                  onChange={patchLine}
                  onRemove={removeLine}
                />
              ))}
            </ul>
          )}

          <FieldError message={formError} />

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">
              {lines.length} {lines.length === 1 ? 'linha' : 'linhas'} para ajustar
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setLines([])} disabled={lines.length === 0 || submit.isPending}>
                Limpar
              </Button>
              <Button size="lg" onClick={handleSubmit} loading={submit.isPending} disabled={lines.length === 0}>
                Aplicar ajuste
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
              Ajuste aplicado
            </DialogTitle>
            <DialogDescription>
              Referencia <span className="tabular font-semibold">{result?.reference}</span> - registado em{' '}
              {formatDateTime(new Date())} por {user?.name ?? 'utilizador actual'}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {(result?.changes ?? []).map((change) => (
                <li
                  key={`${change.productId}:${change.variantId ?? ''}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{change.productName}</span>
                    {change.belowMinimum && (
                      <span className="text-xs font-medium text-warning">
                        Abaixo do minimo ({formatQuantity(change.minStockLevel)})
                      </span>
                    )}
                  </span>
                  <span className="tabular shrink-0 font-semibold">{formatQuantity(change.balanceAfter)}</span>
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setResult(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </InventoryShell>
  );
}
