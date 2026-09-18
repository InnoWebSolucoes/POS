import * as React from 'react';
import { Check } from 'lucide-react';
import { PREP_STATIONS, type ModifierGroupDto, type PrepStation } from '@pos/shared';

import { money } from '@/lib/format';
import { cn, colorForLabel, contrastText } from '@/lib/utils';
import {
  Badge,
  CheckboxField,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  SwitchField,
} from '@/components/ui';
import {
  MODIFIER_GROUP_TYPE_LABELS,
  prepStationLabel,
  TILE_COLORS,
} from '../catalog-labels';
import type { ProductForm, PatchForm } from './use-product-form';

const NO_STATION = '__none__';

export interface RestauranteTabProps {
  form: ProductForm;
  patch: PatchForm;
  modifierGroups: ModifierGroupDto[];
  modifierGroupsLoading: boolean;
}

export function RestauranteTab({
  form,
  patch,
  modifierGroups,
  modifierGroupsLoading,
}: RestauranteTabProps) {
  const toggleGroup = (groupId: string, checked: boolean) =>
    patch({
      modifierGroupIds: checked
        ? [...form.modifierGroupIds, groupId]
        : form.modifierGroupIds.filter((id) => id !== groupId),
    });

  const tile = form.tileColor ?? colorForLabel(form.namePt || 'Produto');

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4">
        <SwitchField
          label="Item de menu"
          description="Aparece na grelha do restaurante e pode ir para a cozinha."
          checked={form.isMenuItem}
          onCheckedChange={(isMenuItem) => patch({ isMenuItem })}
        />

        <SwitchField
          label="Disponivel agora"
          description="Desligue para marcar como esgotado sem desactivar o produto."
          checked={form.available}
          onCheckedChange={(available) => patch({ available })}
        />

        <SwitchField
          label="Mostrar na grelha rapida"
          description="Atalho na caixa, para os artigos mais vendidos."
          checked={form.showInQuickGrid}
          onCheckedChange={(showInQuickGrid) => patch({ showInQuickGrid })}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-estacao">Estacao de preparacao</Label>
          <Select
            value={form.prepStation ?? NO_STATION}
            onValueChange={(next) =>
              patch({ prepStation: next === NO_STATION ? null : (next as PrepStation) })
            }
          >
            <SelectTrigger id="produto-estacao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_STATION}>Sem estacao</SelectItem>
              {PREP_STATIONS.map((station) => (
                <SelectItem key={station} value={station}>
                  {prepStationLabel(station)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Decide em que ecra de cozinha o pedido aparece.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Cor do mosaico</Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => patch({ tileColor: null })}
              aria-pressed={form.tileColor === null}
              className={cn(
                'flex size-11 items-center justify-center rounded-lg border-2 text-xs font-semibold',
                form.tileColor === null ? 'border-primary' : 'border-border',
              )}
            >
              Auto
            </button>
            {TILE_COLORS.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                onClick={() => patch({ tileColor: swatch.value })}
                aria-label={swatch.label}
                aria-pressed={form.tileColor === swatch.value}
                className={cn(
                  'flex size-11 items-center justify-center rounded-lg border-2',
                  form.tileColor === swatch.value ? 'border-primary' : 'border-transparent',
                )}
                style={{ backgroundColor: swatch.value, color: contrastText(swatch.value) }}
              >
                {form.tileColor === swatch.value && <Check className="size-5" aria-hidden="true" />}
              </button>
            ))}
          </div>

          <div
            className="mt-2 flex h-24 w-40 flex-col justify-end rounded-xl p-3"
            style={{ backgroundColor: tile, color: contrastText(tile) }}
          >
            <span className="truncate text-sm font-semibold">{form.namePt || 'Pre-visualizacao'}</span>
            <span className="tabular text-xs opacity-90">{money(form.salePriceMinor)}</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Grupos de opcoes</h2>
          <p className="text-sm text-muted-foreground">
            Escolhas que o empregado responde ao lancar este item.
          </p>
        </div>

        {modifierGroupsLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : modifierGroups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
            Ainda nao existem grupos de opcoes. Crie-os no ecra Opcoes.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {modifierGroups.map((group) => (
              <li key={group.id} className="rounded-lg border border-border px-2">
                <CheckboxField
                  label={
                    <span className="flex flex-wrap items-center gap-2">
                      {group.namePt}
                      <Badge variant="outline" size="sm">
                        {MODIFIER_GROUP_TYPE_LABELS[group.type]}
                      </Badge>
                    </span>
                  }
                  description={
                    group.modifiers.length === 0
                      ? 'Sem opcoes definidas'
                      : group.modifiers.map((modifier) => modifier.namePt).join(', ')
                  }
                  checked={form.modifierGroupIds.includes(group.id)}
                  onCheckedChange={(checked) => toggleGroup(group.id, checked === true)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default RestauranteTab;
