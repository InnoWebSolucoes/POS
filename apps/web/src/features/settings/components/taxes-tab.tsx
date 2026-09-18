import * as React from 'react';
import { AlertTriangle, Package, Plus, Star, Trash2 } from 'lucide-react';
import { bpsToPct, pctToBps } from '@pos/shared';
import type { EntityDto } from '@pos/shared';

import {
  Badge,
  Button,
  EmptyState,
  Input,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { number as formatNumber, percent } from '@/lib/format';

import { useSaveTaxRates, useTaxRates, useUpdateEntity } from '../settings-queries';
import type { TaxRateInput, TaxRateRow } from '../settings-types';
import { Callout, Field, SaveBar, SettingsSection } from './settings-section';

export interface TaxesTabProps {
  entity: EntityDto;
  canWrite: boolean;
}

interface DraftRate extends TaxRateInput {
  /** Kept from the server so the screen can warn before a removal. */
  productCount: number;
}

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

function toDraft(rows: TaxRateRow[]): DraftRate[] {
  return rows.map((row) => ({
    id: row.id,
    namePt: row.namePt,
    rateBps: row.rateBps,
    productCount: row.productCount,
  }));
}

/**
 * The named tax catalogue. The rates themselves are basis points end to end -
 * 1400 is 14% - and the percent field is only ever a display of that integer.
 */
export function TaxesTab({ entity, canWrite }: TaxesTabProps) {
  const query = useTaxRates();
  const save = useSaveTaxRates();
  const saveEntity = useUpdateEntity(entity.id);

  const serverRates = React.useMemo(() => toDraft(query.data?.rates ?? []), [query.data]);
  const [draft, setDraft] = React.useState<DraftRate[]>([]);
  const [blocked, setBlocked] = React.useState<Record<string, string[]> | null>(null);

  React.useEffect(() => {
    setDraft(serverRates);
    setBlocked(null);
  }, [serverRates]);

  const dirty = React.useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(serverRates),
    [draft, serverRates],
  );

  const patchRate = (index: number, next: Partial<DraftRate>) =>
    setDraft((prev) => prev.map((rate, i) => (i === index ? { ...rate, ...next } : rate)));

  const addRate = () =>
    setDraft((prev) => [
      ...prev,
      { id: `taxa-${prev.length + 1}`, namePt: '', rateBps: 0, productCount: 0 },
    ]);

  const removeRate = (index: number) => {
    const rate = draft[index];
    if (rate.productCount > 0 && rate.rateBps !== entity.defaultTaxRateBps) {
      toast.error(
        'Taxa em uso',
        `${formatNumber(rate.productCount)} produto(s) ainda usam "${rate.namePt || rate.id}".`,
      );
      return;
    }
    setDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = () => {
    setBlocked(null);

    if (draft.length === 0) {
      toast.error('Lista vazia', 'Mantenha pelo menos uma taxa.');
      return;
    }
    const missingName = draft.find((rate) => !rate.namePt.trim());
    if (missingName) {
      toast.error('Nome obrigatorio', 'Cada taxa precisa de um nome.');
      return;
    }
    const ids = draft.map((rate) => rate.id.trim());
    if (new Set(ids).size !== ids.length) {
      toast.error('Identificador repetido', 'Os identificadores das taxas tem de ser unicos.');
      return;
    }

    const payload: TaxRateInput[] = draft.map((rate) => ({
      id: rate.id.trim(),
      namePt: rate.namePt.trim(),
      rateBps: rate.rateBps,
    }));

    save.mutate(payload, {
      onSuccess: () => toast.success('Taxas guardadas', 'O catalogo de impostos foi actualizado.'),
      onError: (cause) => {
        if (cause instanceof ApiRequestError) {
          if (cause.code === 'tax_rate_in_use') setBlocked(cause.details);
          toast.error('Nao foi possivel guardar', cause.message);
          return;
        }
        toast.error('Nao foi possivel guardar', 'Tente novamente.');
      },
    });
  };

  const setDefaultRate = (value: string) => {
    const rateBps = Number(value);
    if (!Number.isFinite(rateBps)) return;

    saveEntity.mutate(
      { defaultTaxRateBps: rateBps },
      {
        onSuccess: () => toast.success('Taxa por omissao actualizada', percent(rateBps)),
        onError: (cause) => {
          const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
          toast.error('Nao foi possivel guardar', message);
        },
      },
    );
  };

  if (query.isLoading) {
    return (
      <div className="panel p-5">
        <Skeleton className="mb-4 h-6 w-48" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="panel">
        <EmptyState
          icon={AlertTriangle}
          title="Nao foi possivel carregar as taxas"
          description={
            query.error instanceof ApiRequestError ? query.error.message : 'Ocorreu um erro.'
          }
          action={{ label: 'Tentar novamente', onClick: () => void query.refetch() }}
        />
      </div>
    );
  }

  const defaultBps = query.data?.defaultTaxRateBps ?? entity.defaultTaxRateBps;
  const defaultInList = serverRates.some((rate) => rate.rateBps === defaultBps);

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection
        title="Taxas de imposto"
        description="As taxas que o editor de produtos oferece. O valor e guardado em pontos base: 1400 = 14%."
        actions={
          canWrite ? (
            <Button variant="outline" leftIcon={<Plus />} onClick={addRate}>
              Adicionar taxa
            </Button>
          ) : undefined
        }
      >
        {draft.length === 0 ? (
          <EmptyState
            size="sm"
            title="Sem taxas definidas"
            description="Adicione pelo menos uma taxa para poder classificar produtos."
            action={canWrite ? { label: 'Adicionar taxa', onClick: addRate } : undefined}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {draft.map((rate, index) => {
              const isDefault = rate.rateBps === defaultBps;
              const blockedMessage = blocked?.[rate.id]?.[0];
              const locked = rate.productCount > 0 && !isDefault;

              return (
                <li
                  key={`${rate.id}-${index}`}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_9rem_auto] sm:items-end">
                    <Field label="Nome" htmlFor={`tax-name-${index}`}>
                      <Input
                        id={`tax-name-${index}`}
                        value={rate.namePt}
                        maxLength={60}
                        disabled={!canWrite}
                        placeholder="IVA Normal"
                        onChange={(e) => {
                          const namePt = e.target.value;
                          // A brand-new row keeps its id in step with the name.
                          const keepId = rate.productCount > 0 || serverRates.some((r) => r.id === rate.id);
                          patchRate(index, keepId ? { namePt } : { namePt, id: slugify(namePt) || rate.id });
                        }}
                      />
                    </Field>

                    <Field label="Identificador" htmlFor={`tax-id-${index}`}>
                      <Input
                        id={`tax-id-${index}`}
                        value={rate.id}
                        maxLength={32}
                        disabled={!canWrite}
                        className="tabular"
                        onChange={(e) => patchRate(index, { id: slugify(e.target.value) })}
                      />
                    </Field>

                    <Field label="Taxa (%)" htmlFor={`tax-rate-${index}`}>
                      <NumericInput
                        id={`tax-rate-${index}`}
                        value={bpsToPct(rate.rateBps)}
                        decimals={2}
                        min={0}
                        max={100}
                        disabled={!canWrite}
                        onValueChange={(value) => patchRate(index, { rateBps: pctToBps(value) })}
                      />
                    </Field>

                    <div className="flex items-center gap-2 pb-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover ${rate.namePt || rate.id}`}
                        disabled={!canWrite || locked || isDefault}
                        onClick={() => removeRate(index)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="muted" size="sm">
                      <Package className="size-3" aria-hidden="true" />
                      {formatNumber(rate.productCount)} produto(s)
                    </Badge>
                    {isDefault && (
                      <Badge variant="default" size="sm">
                        <Star className="size-3" aria-hidden="true" />
                        Por omissao
                      </Badge>
                    )}
                    {locked && (
                      <span className="text-xs text-warning">
                        Em uso: reatribua os produtos antes de remover esta taxa.
                      </span>
                    )}
                    {blockedMessage && (
                      <span className="text-xs font-medium text-destructive">{blockedMessage}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4">
          <SaveBar
            dirty={dirty}
            saving={save.isPending}
            canSave={canWrite}
            onSave={submit}
            onReset={() => {
              setDraft(serverRates);
              setBlocked(null);
            }}
            label="Existem taxas por guardar."
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Taxa por omissao"
        description="Aplicada a qualquer produto novo que nao escolha outra taxa."
      >
        <Field label="Taxa aplicada por omissao" htmlFor="tax-default">
          <Select
            value={String(defaultBps)}
            disabled={!canWrite || saveEntity.isPending}
            onValueChange={setDefaultRate}
          >
            <SelectTrigger id="tax-default" className="sm:w-[22rem]" aria-label="Taxa por omissao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!defaultInList && (
                <SelectItem value={String(defaultBps)}>
                  {percent(defaultBps)} (sem nome)
                </SelectItem>
              )}
              {serverRates.map((rate) => (
                <SelectItem key={rate.id} value={String(rate.rateBps)}>
                  {rate.namePt} - {percent(rate.rateBps)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Callout className="mt-4">
          A taxa por omissao nunca pode ser removida do catalogo, mesmo que nenhum produto a use.
          Escolha outra taxa aqui antes de a apagar da lista acima.
        </Callout>
      </SettingsSection>
    </div>
  );
}

export default TaxesTab;
