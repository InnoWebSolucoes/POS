import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Grid3x3, Plus, Trash2, X } from 'lucide-react';
import type { ProductVariantDto } from '@pos/shared';

import { ApiRequestError } from '@/lib/api';
import { number } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  toast,
} from '@/components/ui';
import { catalogApi, invalidateProducts, type ProductFull, type VariantAxis } from '../catalog-api';
import { VariantRow } from './variant-row';

const MAX_AXES = 4;
const MAX_VARIANTS = 200;

interface AxisDraft {
  name: string;
  values: string[];
  input: string;
}

/** Cartesian product, mirroring cartesian() on the server. */
function combinations(axes: VariantAxis[]): Array<Record<string, string>> {
  let rows: Array<Record<string, string>> = [{}];
  for (const axis of axes) {
    const next: Array<Record<string, string>> = [];
    for (const row of rows) {
      for (const value of axis.values) next.push({ ...row, [axis.name]: value });
    }
    rows = next;
  }
  return rows;
}

export interface VariantesTabProps {
  product: ProductFull | null;
  canWrite: boolean;
  canSeeCost: boolean;
}

export function VariantesTab({ product, canWrite, canSeeCost }: VariantesTabProps) {
  const [axes, setAxes] = React.useState<AxisDraft[]>([
    { name: 'Tamanho', values: [], input: '' },
  ]);
  const [pendingDelete, setPendingDelete] = React.useState<ProductVariantDto | null>(null);

  const cleanAxes: VariantAxis[] = axes
    .filter((axis) => axis.name.trim().length > 0 && axis.values.length > 0)
    .map((axis) => ({ name: axis.name.trim(), values: [...new Set(axis.values)] }));

  const preview = cleanAxes.length > 0 ? combinations(cleanAxes) : [];
  const tooMany = preview.length > MAX_VARIANTS;

  const generate = useMutation({
    mutationFn: () => {
      if (!product) throw new Error('missing product');
      return catalogApi.variantMatrix(product.id, cleanAxes);
    },
    onSuccess: (result) => {
      invalidateProducts(product?.id);
      toast.success(
        'Variantes geradas',
        `${result.created.length} criadas${result.skipped.length > 0 ? `, ${result.skipped.length} ja existiam` : ''}.`,
      );
    },
    onError: (error) =>
      toast.error(
        'Nao foi possivel gerar',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      ),
  });

  const remove = useMutation({
    mutationFn: (variant: ProductVariantDto) => catalogApi.deleteVariant(variant.id),
    onSuccess: () => {
      invalidateProducts(product?.id);
      toast.success('Variante eliminada');
      setPendingDelete(null);
    },
    onError: (error) => {
      toast.error(
        'Nao foi possivel eliminar',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      );
      setPendingDelete(null);
    },
  });

  const patchAxis = (index: number, part: Partial<AxisDraft>) =>
    setAxes((current) =>
      current.map((axis, position) => (position === index ? { ...axis, ...part } : axis)),
    );

  const addValue = (index: number) => {
    const axis = axes[index];
    if (!axis) return;
    const value = axis.input.trim();
    if (!value || axis.values.includes(value)) {
      patchAxis(index, { input: '' });
      return;
    }
    patchAxis(index, { values: [...axis.values, value], input: '' });
  };

  if (!product) {
    return (
      <EmptyState
        icon={Grid3x3}
        title="Guarde o produto primeiro"
        description="As variantes sao criadas sobre um produto ja existente. Guarde e volte a este separador."
      />
    );
  }

  const variants = product.variants ?? [];

  return (
    <div className="flex flex-col gap-6">
      {canWrite && (
        <Card>
          <CardContent className="flex flex-col gap-4 py-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Construtor de matriz</h2>
              <p className="text-sm text-muted-foreground">
                Defina os eixos (por exemplo Tamanho: S, M, L e Cor: Branco, Preto) e o sistema cria
                todas as combinacoes que ainda nao existem.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {axes.map((axis, index) => (
                <div key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label htmlFor={`eixo-${index}`} size="sm">
                        Nome do eixo
                      </Label>
                      <Input
                        id={`eixo-${index}`}
                        value={axis.name}
                        onChange={(event) => patchAxis(index, { name: event.target.value })}
                        placeholder="Tamanho"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover eixo"
                      className="mt-5"
                      onClick={() =>
                        setAxes((current) => current.filter((_, position) => position !== index))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label htmlFor={`eixo-valor-${index}`} size="sm">
                        Valores
                      </Label>
                      <Input
                        id={`eixo-valor-${index}`}
                        value={axis.input}
                        onChange={(event) => patchAxis(index, { input: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ',') return;
                          event.preventDefault();
                          addValue(index);
                        }}
                        placeholder="S, M, L - Enter para juntar"
                      />
                    </div>
                    <Button variant="outline" onClick={() => addValue(index)}>
                      Juntar
                    </Button>
                  </div>

                  {axis.values.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {axis.values.map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            patchAxis(index, {
                              values: axis.values.filter((item) => item !== value),
                            })
                          }
                          className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-full border border-border bg-muted px-3 text-sm font-medium text-foreground"
                        >
                          {value}
                          <X className="size-3.5" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="outline"
                leftIcon={<Plus />}
                disabled={axes.length >= MAX_AXES}
                onClick={() =>
                  setAxes((current) => [...current, { name: '', values: [], input: '' }])
                }
              >
                Juntar eixo
              </Button>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {preview.length === 0
                    ? 'Nenhuma combinacao ainda'
                    : `${number(preview.length)} combinacoes`}
                </span>
                <Button
                  leftIcon={<Grid3x3 />}
                  disabled={preview.length === 0 || tooMany}
                  loading={generate.isPending}
                  loadingLabel="A gerar..."
                  onClick={() => generate.mutate()}
                >
                  Gerar variantes
                </Button>
              </div>
            </div>

            {tooMany && (
              <p className="text-sm font-medium text-destructive">
                A matriz gera {number(preview.length)} variantes; o maximo por pedido e{' '}
                {MAX_VARIANTS}. Reduza os valores de um eixo.
              </p>
            )}

            {preview.length > 0 && !tooMany && (
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-dashed border-border p-3">
                {preview.slice(0, 40).map((combo, index) => (
                  <Badge key={index} variant="outline" size="sm">
                    {Object.values(combo).join(' / ')}
                  </Badge>
                ))}
                {preview.length > 40 && (
                  <Badge variant="muted" size="sm">
                    e mais {preview.length - 40}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">
            Variantes ({number(variants.length)})
          </h2>
          <p className="text-xs text-muted-foreground">
            O stock de cada variante muda por entrada ou ajuste, nunca aqui.
          </p>
        </div>

        {variants.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Este produto ainda nao tem variantes.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {variants.map((variant) => (
              <VariantRow
                key={variant.id}
                variant={variant}
                productId={product.id}
                unit={product.unit}
                canWrite={canWrite}
                canSeeCost={canSeeCost}
                onDelete={setPendingDelete}
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Eliminar a variante ${pendingDelete?.sku ?? ''}?`}
        description="A variante deixa de estar disponivel na caixa. O historico de vendas mantem-se."
        confirmLabel="Eliminar"
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </div>
  );
}

export default VariantesTab;
