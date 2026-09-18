import * as React from 'react';
import { ENTITY_MODES, type EntityDto, type EntityMode } from '@pos/shared';

import {
  Button,
  Input,
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
  Textarea,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

import { useUpdateEntity, type EntityPatch } from '../platform-queries';
import { CONSOLE_MODE_HINTS, CONSOLE_MODE_LABELS } from '../platform-types';

/**
 * Editing a client account: who they are and what kind of business they run.
 *
 * The type is here because it is the one field that reshapes the product the
 * client sees - the same choice they made when they signed up.
 */

interface Draft {
  name: string;
  mode: EntityMode;
  nif: string;
  phone: string;
  email: string;
  address: string;
}

const toDraft = (entity: EntityDto): Draft => ({
  name: entity.name,
  mode: entity.mode,
  nif: entity.nif ?? '',
  phone: entity.phone ?? '',
  email: entity.email ?? '',
  address: entity.address ?? '',
});

/** '' means "clear the column", which the API spells as null. */
const nullable = (value: string): string | null => (value.trim() ? value.trim() : null);

export interface EntityEditorProps {
  /** The client being edited; null keeps the sheet closed. */
  entity: EntityDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (entity: EntityDto) => void;
}

export function EntityEditor({ entity, onOpenChange, onSaved }: EntityEditorProps) {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<ApiRequestError | null>(null);
  const update = useUpdateEntity();

  React.useEffect(() => {
    setError(null);
    setDraft(entity ? toDraft(entity) : null);
  }, [entity]);

  const patch = (next: Partial<Draft>) => setDraft((prev) => (prev ? { ...prev, ...next } : prev));
  const fieldError = (path: string) => error?.fieldError(path);

  const submit = () => {
    if (!entity || !draft) return;

    if (draft.name.trim().length < 2) {
      toast.error('Falta informacao', 'Indique o nome do negocio (minimo 2 caracteres).');
      return;
    }

    // Only what actually changed travels - the API rejects an empty patch.
    const body: EntityPatch = {};
    if (draft.name.trim() !== entity.name) body.name = draft.name.trim();
    if (draft.mode !== entity.mode) body.mode = draft.mode;
    if (nullable(draft.nif) !== entity.nif) body.nif = nullable(draft.nif);
    if (nullable(draft.phone) !== entity.phone) body.phone = nullable(draft.phone);
    if (nullable(draft.email) !== entity.email) body.email = nullable(draft.email);
    if (nullable(draft.address) !== entity.address) body.address = nullable(draft.address);

    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      return;
    }

    setError(null);
    update.mutate(
      { id: entity.id, patch: body },
      {
        onSuccess: (saved) => {
          toast.success('Negocio actualizado', saved.name);
          onSaved?.(saved);
          onOpenChange(false);
        },
        onError: (cause) => {
          if (cause instanceof ApiRequestError) {
            setError(cause);
            toast.error('Nao foi possivel guardar', cause.message);
            return;
          }
          toast.error('Nao foi possivel guardar', 'Tente novamente.');
        },
      },
    );
  };

  return (
    <Sheet open={entity !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>Editar negocio</SheetTitle>
          <SheetDescription>
            {entity ? `Conta de cliente /${entity.slug}` : 'Conta de cliente'}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {draft && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-name" required>
                  Nome do negocio
                </Label>
                <Input
                  id="edit-name"
                  value={draft.name}
                  maxLength={120}
                  onChange={(event) => patch({ name: event.target.value })}
                />
                {fieldError('name') && (
                  <p className="text-xs font-medium text-destructive">{fieldError('name')}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-mode">Tipo de negocio</Label>
                <Select
                  value={draft.mode}
                  onValueChange={(value) => patch({ mode: value as EntityMode })}
                >
                  <SelectTrigger id="edit-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {CONSOLE_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {CONSOLE_MODE_HINTS[draft.mode]} O tipo decide o painel e a navegacao que o
                  cliente vai ver.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-nif">NIF</Label>
                  <Input
                    id="edit-nif"
                    className="tabular"
                    value={draft.nif}
                    maxLength={40}
                    onChange={(event) => patch({ nif: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-phone">Telefone</Label>
                  <Input
                    id="edit-phone"
                    type="tel"
                    inputMode="tel"
                    className="tabular"
                    value={draft.phone}
                    maxLength={40}
                    onChange={(event) => patch({ phone: event.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-email">Email de contacto</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={draft.email}
                  maxLength={160}
                  onChange={(event) => patch({ email: event.target.value })}
                />
                {fieldError('email') && (
                  <p className="text-xs font-medium text-destructive">{fieldError('email')}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-address">Morada</Label>
                <Textarea
                  id="edit-address"
                  rows={2}
                  maxLength={240}
                  value={draft.address}
                  onChange={(event) => patch({ address: event.target.value })}
                />
              </div>
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button loading={update.isPending} onClick={submit}>
            Guardar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default EntityEditor;
