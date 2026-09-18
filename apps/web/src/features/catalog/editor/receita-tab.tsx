import * as React from 'react';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { ChefHat, Plus, Save, Trash2 } from 'lucide-react';
import { applyBps, bpsToPct, pctToBps, roundHalfUp, UNITS, type Unit } from '@pos/shared';

import { ApiRequestError } from '@/lib/api';
import { money } from '@/lib/format';
import { qk } from '@/lib/query';
import {
  Button,
  Card,
  CardContent,
  Label,
  NumericInput,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  toast,
} from '@/components/ui';
import { catalogApi, invalidateProducts, type ProductFull } from '../catalog-api';
import { unitLabel, unitShort } from '../catalog-labels';
import { FieldError } from '../components/catalog-page';
import type { ProductForm, PatchForm } from './use-product-form';

export interface ReceitaTabProps {
  form: ProductForm;
  patch: PatchForm;
  errors: Record<string, string>;
  product: ProductFull | null;
  canWrite: boolean;
  canSeeCost: boolean;
}

interface ComponentInfo {
  namePt: string;
  unit: Unit;
  costPriceMinor?: number;
}

/**
 * The bill of materials. The total cost recomputes as the quantities change, so
 * a kitchen can see straight away what a dish costs to make.
 */
export function ReceitaTab({
  form,
  patch,
  errors,
  product,
  canWrite,
  canSeeCost,
}: ReceitaTabProps) {
  const [search, setSearch] = React.useState('');

  const results = useQuery({
    queryKey: qk.products({ scope: 'recipe-search', search }),
    queryFn: () =>
      catalogApi.listProducts({ page: 1, pageSize: 10, search, active: true }),
    enabled: search.trim().length >= 2,
  });

  // One cached request per component, shared with the rest of the app through qk.
  const componentQueries = useQueries({
    queries: form.components.map((component) => ({
      queryKey: qk.product(component.componentProductId),
      queryFn: () => catalogApi.getProduct(component.componentProductId),
      staleTime: 60_000,
    })),
  });

  const info = new Map<string, ComponentInfo>();
  form.components.forEach((component, index) => {
    const loaded = componentQueries[index]?.data;
    const fallback = (product?.components ?? []).find(
      (row) => row.componentProductId === component.componentProductId,
    );
    info.set(component.componentProductId, {
      namePt: loaded?.namePt ?? fallback?.componentName ?? 'A carregar...',
      unit: loaded?.unit ?? component.unit ?? 'each',
      costPriceMinor: loaded?.costPriceMinor,
    });
  });

  const lineCost = (componentProductId: string, qty: number, wastageBps: number): number | null => {
    const unitCost = info.get(componentProductId)?.costPriceMinor;
    if (unitCost === undefined) return null;
    const base = roundHalfUp(unitCost * qty);
    return base + applyBps(base, wastageBps);
  };

  const totalCost = form.components.reduce((total, component) => {
    const cost = lineCost(
      component.componentProductId,
      component.quantity,
      component.wastagePercentBps ?? 0,
    );
    return cost === null ? total : total + cost;
  }, 0);

  const costKnown = form.components.every(
    (component) => info.get(component.componentProductId)?.costPriceMinor !== undefined,
  );

  const addComponent = (componentProductId: string, unit: Unit) => {
    // A product can never be an ingredient of itself - the server refuses too.
    if (product && componentProductId === product.id) {
      toast.warning('Nao e possivel', 'Um produto nao pode fazer parte da sua propria receita.');
      return;
    }
    if (form.components.some((row) => row.componentProductId === componentProductId)) {
      toast.warning('Ja esta na receita', 'Altere a quantidade da linha existente.');
      return;
    }
    patch({
      components: [
        ...form.components,
        { componentProductId, quantity: 1, unit, wastagePercentBps: 0 },
      ],
    });
    setSearch('');
  };

  const patchComponent = (index: number, part: Partial<(typeof form.components)[number]>) =>
    patch({
      components: form.components.map((component, position) =>
        position === index ? { ...component, ...part } : component,
      ),
    });

  const saveRecipe = useMutation({
    mutationFn: () => {
      if (!product) throw new Error('missing product');
      return catalogApi.putRecipe(product.id, form.components);
    },
    onSuccess: () => {
      invalidateProducts(product?.id);
      toast.success('Receita guardada');
    },
    onError: (error) =>
      toast.error(
        'Nao foi possivel guardar a receita',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      ),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <section className="flex flex-col gap-4">
        {canWrite && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="receita-pesquisa">Juntar componente</Label>
            <SearchInput
              id="receita-pesquisa"
              value={search}
              onValueChange={setSearch}
              onSearch={setSearch}
              placeholder="Procurar produto por nome, SKU ou codigo"
            />

            {search.trim().length >= 2 && (
              <div className="rounded-lg border border-border">
                {results.isLoading ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                    <Spinner className="size-4" /> A procurar...
                  </div>
                ) : results.isError ? (
                  <div className="flex items-center justify-between gap-2 px-3 py-3 text-sm">
                    <span className="text-destructive">Falhou a pesquisa.</span>
                    <Button variant="ghost" onClick={() => void results.refetch()}>
                      Tentar novamente
                    </Button>
                  </div>
                ) : (results.data?.data.length ?? 0) === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">Sem resultados.</p>
                ) : (
                  <ul className="max-h-64 overflow-y-auto">
                    {results.data?.data.map((candidate) => (
                      <li key={candidate.id}>
                        <button
                          type="button"
                          disabled={candidate.id === product?.id}
                          onClick={() => addComponent(candidate.id, candidate.unit)}
                          className="flex min-h-touch w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                        >
                          <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {candidate.namePt}
                            </span>
                            <span className="tabular block truncate text-xs text-muted-foreground">
                              {candidate.sku} - {unitShort(candidate.unit)}
                            </span>
                          </span>
                          {candidate.id === product?.id && (
                            <span className="text-xs text-muted-foreground">Este produto</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <FieldError message={errors.components} />

        {form.components.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            A receita esta vazia. Um produto composto precisa de pelo menos um componente.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {form.components.map((component, index) => {
              const detail = info.get(component.componentProductId);
              const cost = lineCost(
                component.componentProductId,
                component.quantity,
                component.wastagePercentBps ?? 0,
              );

              return (
                <li
                  key={component.componentProductId}
                  className="flex flex-col gap-3 rounded-xl border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {detail?.namePt}
                    </span>
                    {canSeeCost && (
                      <span className="tabular shrink-0 text-sm">
                        {cost === null ? '-' : money(cost)}
                      </span>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Quantidade
                      <NumericInput
                        value={component.quantity}
                        onValueChange={(quantity) => patchComponent(index, { quantity })}
                        decimals={3}
                        min={0}
                        disabled={!canWrite}
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Unidade
                      <Select
                        value={component.unit ?? 'each'}
                        onValueChange={(next) => patchComponent(index, { unit: next as Unit })}
                        disabled={!canWrite}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {unitLabel(unit)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Desperdicio (%)
                      <NumericInput
                        value={bpsToPct(component.wastagePercentBps ?? 0)}
                        onValueChange={(pct) =>
                          patchComponent(index, { wastagePercentBps: pctToBps(pct) })
                        }
                        decimals={2}
                        min={0}
                        max={100}
                        disabled={!canWrite}
                      />
                    </label>
                  </div>

                  {canWrite && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover ${detail?.namePt ?? 'componente'}`}
                        onClick={() =>
                          patch({
                            components: form.components.filter(
                              (_, position) => position !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3 py-5">
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ChefHat className="size-4" aria-hidden="true" />
              Custo total da receita
            </span>
            {canSeeCost ? (
              <>
                <span className="tabular text-3xl font-semibold text-foreground">
                  {money(totalCost)}
                </span>
                {!costKnown && (
                  <p className="text-xs text-muted-foreground">
                    Alguns componentes ainda nao trouxeram o custo; o total esta incompleto.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Inclui o desperdicio de cada linha. Compare com o preco de venda no separador
                  Precos.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                O custo da receita esta reservado a contas com permissao de custos.
              </p>
            )}
          </CardContent>
        </Card>

        {canWrite && product && (
          <Button
            variant="outline"
            leftIcon={<Save />}
            loading={saveRecipe.isPending}
            loadingLabel="A guardar..."
            onClick={() => saveRecipe.mutate()}
          >
            Guardar apenas a receita
          </Button>
        )}
      </section>
    </div>
  );
}

export default ReceitaTab;
