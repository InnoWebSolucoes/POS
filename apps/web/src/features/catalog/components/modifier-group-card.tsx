import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { MoreVertical, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import type { ModifierDto, ModifierGroupDto } from '@pos/shared';

import { ApiRequestError } from '@/lib/api';
import { money } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  MoneyInput,
  Switch,
  toast,
} from '@/components/ui';
import { catalogApi, invalidateModifierGroups } from '../catalog-api';
import { MODIFIER_GROUP_TYPE_LABELS } from '../catalog-labels';

const TYPE_VARIANT: Record<ModifierGroupDto['type'], 'default' | 'secondary' | 'muted'> = {
  required: 'default',
  optional: 'secondary',
  removal: 'muted',
};

/* -------------------------------------------------------------------------- */
/* One modifier row                                                            */
/* -------------------------------------------------------------------------- */

function ModifierRow({
  modifier,
  canWrite,
  onRemove,
}: {
  modifier: ModifierDto;
  canWrite: boolean;
  onRemove: (modifier: ModifierDto) => void;
}) {
  const [name, setName] = React.useState(modifier.namePt);
  const [price, setPrice] = React.useState(modifier.priceDeltaMinor);
  /** MoneyInput clamps on blur before calling ours, so read the latest here. */
  const priceRef = React.useRef(modifier.priceDeltaMinor);

  // The server is the source of truth after a refetch.
  React.useEffect(() => {
    setName(modifier.namePt);
    setPrice(modifier.priceDeltaMinor);
    priceRef.current = modifier.priceDeltaMinor;
  }, [modifier.namePt, modifier.priceDeltaMinor]);

  const patch = useMutation({
    mutationFn: (body: { namePt?: string; priceDeltaMinor?: number; available?: boolean }) =>
      catalogApi.updateModifier(modifier.id, body),
    onSuccess: () => invalidateModifierGroups(),
    onError: (error) => {
      setName(modifier.namePt);
      setPrice(modifier.priceDeltaMinor);
      toast.error(
        'Nao foi possivel guardar',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      );
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2 py-2">
      {canWrite ? (
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (!trimmed || trimmed === modifier.namePt) {
              setName(modifier.namePt);
              return;
            }
            patch.mutate({ namePt: trimmed });
          }}
          aria-label="Nome da opcao"
          className="min-w-[10rem] flex-1"
        />
      ) : (
        <span className="min-w-[10rem] flex-1 truncate text-sm font-medium">{modifier.namePt}</span>
      )}

      {canWrite ? (
        <MoneyInput
          value={price}
          onChange={(next) => {
            priceRef.current = next;
            setPrice(next);
          }}
          allowNegative
          aria-label="Diferenca de preco"
          className="w-36"
          onBlur={() => {
            if (priceRef.current === modifier.priceDeltaMinor) return;
            patch.mutate({ priceDeltaMinor: priceRef.current });
          }}
        />
      ) : (
        <span className="tabular w-36 text-right text-sm">
          {money(modifier.priceDeltaMinor, { signed: true })}
        </span>
      )}

      <label className="flex min-h-touch items-center gap-2 px-1 text-sm text-muted-foreground">
        <Switch
          checked={modifier.available}
          disabled={!canWrite}
          onCheckedChange={(checked) => patch.mutate({ available: checked })}
          aria-label="Disponivel"
        />
        <span>{modifier.available ? 'Disponivel' : 'Esgotado'}</span>
      </label>

      {canWrite && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remover ${modifier.namePt}`}
          onClick={() => onRemove(modifier)}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The group card                                                              */
/* -------------------------------------------------------------------------- */

export interface ModifierGroupCardProps {
  group: ModifierGroupDto;
  /** Menu items that already carry this group. */
  usedBy: string[];
  canWrite: boolean;
  onEdit: (group: ModifierGroupDto) => void;
  onDelete: (group: ModifierGroupDto) => void;
}

export function ModifierGroupCard({
  group,
  usedBy,
  canWrite,
  onEdit,
  onDelete,
}: ModifierGroupCardProps) {
  const [newName, setNewName] = React.useState('');
  const [newPrice, setNewPrice] = React.useState(0);

  const add = useMutation({
    mutationFn: () =>
      catalogApi.addModifier(group.id, { namePt: newName.trim(), priceDeltaMinor: newPrice }),
    onSuccess: () => {
      invalidateModifierGroups();
      setNewName('');
      setNewPrice(0);
    },
    onError: (error) =>
      toast.error(
        'Nao foi possivel adicionar',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      ),
  });

  const removeModifier = useMutation({
    mutationFn: (modifier: ModifierDto) => catalogApi.deleteModifier(modifier.id),
    onSuccess: () => invalidateModifierGroups(),
    onError: (error) =>
      toast.error(
        'Nao foi possivel remover',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      ),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{group.namePt}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={TYPE_VARIANT[group.type]} size="sm">
              {MODIFIER_GROUP_TYPE_LABELS[group.type]}
            </Badge>
            <Badge variant="outline" size="sm" className="tabular">
              min {group.minSelect} / max {group.maxSelect === 0 ? '-' : group.maxSelect}
            </Badge>
          </div>
        </div>

        {canWrite && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Accoes para ${group.namePt}`}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(group)}>Editar grupo</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(group)}>
                Eliminar grupo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        {group.modifiers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Sem opcoes neste grupo.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {group.modifiers.map((modifier) => (
              <ModifierRow
                key={modifier.id}
                modifier={modifier}
                canWrite={canWrite}
                onRemove={(target) => removeModifier.mutate(target)}
              />
            ))}
          </div>
        )}

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-2 py-2">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Nova opcao"
              aria-label="Nome da nova opcao"
              className="min-w-[10rem] flex-1"
            />
            <MoneyInput
              value={newPrice}
              onChange={setNewPrice}
              allowNegative
              aria-label="Diferenca de preco da nova opcao"
              className="w-36"
            />
            <Button
              variant="outline"
              leftIcon={<Plus />}
              disabled={newName.trim().length === 0}
              loading={add.isPending}
              onClick={() => add.mutate()}
            >
              Adicionar
            </Button>
          </div>
        )}

        <div className="mt-auto border-t border-border pt-3">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <UtensilsCrossed className="size-4" aria-hidden="true" />
            {usedBy.length === 0
              ? 'Nenhum item de menu usa este grupo'
              : `Usado por ${usedBy.length} ${usedBy.length === 1 ? 'item de menu' : 'itens de menu'}`}
          </p>
          {usedBy.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {usedBy.slice(0, 6).join(', ')}
              {usedBy.length > 6 ? ` e mais ${usedBy.length - 6}` : ''}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ModifierGroupCard;
