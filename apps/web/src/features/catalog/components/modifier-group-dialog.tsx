import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { MODIFIER_GROUP_TYPES, type ModifierGroupDto, type ModifierGroupType } from '@pos/shared';

import { ApiRequestError } from '@/lib/api';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@/components/ui';
import { catalogApi, invalidateModifierGroups } from '../catalog-api';
import { MODIFIER_GROUP_TYPE_HINTS, MODIFIER_GROUP_TYPE_LABELS } from '../catalog-labels';
import { FieldError, FormError } from './catalog-page';

export interface ModifierGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: ModifierGroupDto | null;
}

/** Create or edit a modifier group. Min/max are validated before the round trip. */
export function ModifierGroupDialog({ open, onOpenChange, group }: ModifierGroupDialogProps) {
  const editing = group !== null;

  const [namePt, setNamePt] = React.useState('');
  const [nameEn, setNameEn] = React.useState('');
  const [type, setType] = React.useState<ModifierGroupType>('optional');
  const [minSelect, setMinSelect] = React.useState(0);
  const [maxSelect, setMaxSelect] = React.useState(1);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setNamePt(group?.namePt ?? '');
    setNameEn(group?.nameEn ?? '');
    setType(group?.type ?? 'optional');
    setMinSelect(group?.minSelect ?? 0);
    setMaxSelect(group?.maxSelect ?? 1);
    setTouched(false);
  }, [open, group]);

  // A required group has to demand at least one answer - the server insists too.
  React.useEffect(() => {
    if (type === 'required' && minSelect < 1) setMinSelect(1);
  }, [type, minSelect]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        namePt: namePt.trim(),
        nameEn: nameEn.trim() ? nameEn.trim() : null,
        type,
        minSelect,
        maxSelect,
      };
      return editing && group
        ? catalogApi.updateModifierGroup(group.id, body)
        : catalogApi.createModifierGroup(body);
    },
    onSuccess: () => {
      invalidateModifierGroups();
      toast.success(editing ? 'Grupo actualizado' : 'Grupo criado', namePt.trim());
      onOpenChange(false);
    },
  });

  const serverError = mutation.error instanceof ApiRequestError ? mutation.error : null;

  const nameError =
    touched && namePt.trim().length === 0
      ? 'O nome e obrigatorio.'
      : serverError?.fieldError('namePt');

  const maxError =
    maxSelect > 0 && maxSelect < minSelect
      ? 'O maximo nao pode ser inferior ao minimo.'
      : serverError?.fieldError('maxSelect');

  const submit = () => {
    setTouched(true);
    if (namePt.trim().length === 0) return;
    if (maxSelect > 0 && maxSelect < minSelect) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar grupo' : 'Novo grupo de opcoes'}</DialogTitle>
          <DialogDescription>{MODIFIER_GROUP_TYPE_HINTS[type]}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {mutation.isError && <FormError error={mutation.error} />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grupo-nome" required>
              Nome (PT)
            </Label>
            <Input
              id="grupo-nome"
              value={namePt}
              onChange={(event) => setNamePt(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={Boolean(nameError)}
              autoFocus
              placeholder="Ponto da carne"
            />
            <FieldError message={nameError} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grupo-nome-en">Nome (EN)</Label>
            <Input
              id="grupo-nome-en"
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              placeholder="Cooking preference"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grupo-tipo">Tipo</Label>
            <Select value={type} onValueChange={(next) => setType(next as ModifierGroupType)}>
              <SelectTrigger id="grupo-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODIFIER_GROUP_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {MODIFIER_GROUP_TYPE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{MODIFIER_GROUP_TYPE_HINTS[type]}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grupo-min">Minimo de escolhas</Label>
              <NumericInput
                id="grupo-min"
                value={minSelect}
                onValueChange={setMinSelect}
                decimals={0}
                min={type === 'required' ? 1 : 0}
                max={50}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grupo-max">Maximo de escolhas</Label>
              <NumericInput
                id="grupo-max"
                value={maxSelect}
                onValueChange={setMaxSelect}
                decimals={0}
                min={0}
                max={50}
                aria-invalid={Boolean(maxError)}
              />
              <p className="text-xs text-muted-foreground">0 = sem limite.</p>
              <FieldError message={maxError} />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending} loadingLabel="A guardar...">
            {editing ? 'Guardar' : 'Criar grupo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ModifierGroupDialog;
