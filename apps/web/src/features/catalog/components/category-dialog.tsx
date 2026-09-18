import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import type { CategoryDto } from '@pos/shared';

import { ApiRequestError } from '@/lib/api';
import { cn, contrastText } from '@/lib/utils';
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
  SwitchField,
  toast,
} from '@/components/ui';
import { catalogApi, invalidateCategories } from '../catalog-api';
import { TILE_COLORS } from '../catalog-labels';
import { CategoryTreeSelect } from './category-tree-select';
import { FieldError, FormError } from './catalog-page';

export interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when renaming; absent when creating. */
  category: CategoryDto | null;
  /** Pre-selected parent when creating a subcategory. */
  defaultParentId: string | null;
  tree: CategoryDto[];
}

/** Create or rename a category. The same form either way - fewer surprises. */
export function CategoryDialog({
  open,
  onOpenChange,
  category,
  defaultParentId,
  tree,
}: CategoryDialogProps) {
  const editing = category !== null;

  const [namePt, setNamePt] = React.useState('');
  const [nameEn, setNameEn] = React.useState('');
  const [parentId, setParentId] = React.useState<string | null>(null);
  const [color, setColor] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(true);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setNamePt(category?.namePt ?? '');
    setNameEn(category?.nameEn ?? '');
    setParentId(category ? category.parentId : defaultParentId);
    setColor(category?.color ?? null);
    setActive(category?.active ?? true);
    setTouched(false);
  }, [open, category, defaultParentId]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        namePt: namePt.trim(),
        nameEn: nameEn.trim() ? nameEn.trim() : null,
        parentId,
        color,
        active,
      };
      return editing && category
        ? catalogApi.updateCategory(category.id, body)
        : catalogApi.createCategory(body);
    },
    onSuccess: () => {
      invalidateCategories();
      toast.success(editing ? 'Categoria actualizada' : 'Categoria criada', namePt.trim());
      onOpenChange(false);
    },
  });

  const nameError =
    touched && namePt.trim().length === 0
      ? 'O nome e obrigatorio.'
      : mutation.error instanceof ApiRequestError
        ? mutation.error.fieldError('namePt')
        : undefined;

  const submit = () => {
    setTouched(true);
    if (namePt.trim().length === 0) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
          <DialogDescription>
            A arvore aceita ate tres niveis. A cor aparece nos mosaicos da caixa.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {mutation.isError && <FormError error={mutation.error} />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categoria-nome" required>
              Nome (PT)
            </Label>
            <Input
              id="categoria-nome"
              value={namePt}
              onChange={(event) => setNamePt(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={Boolean(nameError)}
              autoFocus
              placeholder="Bebidas"
            />
            <FieldError message={nameError} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categoria-nome-en">Nome (EN)</Label>
            <Input
              id="categoria-nome-en"
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              placeholder="Drinks"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categoria-parente">Categoria superior</Label>
            <CategoryTreeSelect
              id="categoria-parente"
              tree={tree}
              value={parentId}
              onChange={setParentId}
              noneLabel="Categoria de topo"
              excludeBranchOf={category?.id ?? null}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setColor(null)}
                aria-pressed={color === null}
                className={cn(
                  'flex size-11 items-center justify-center rounded-lg border-2 text-xs font-semibold',
                  color === null ? 'border-primary' : 'border-border',
                )}
              >
                Auto
              </button>
              {TILE_COLORS.map((swatch) => (
                <button
                  key={swatch.value}
                  type="button"
                  onClick={() => setColor(swatch.value)}
                  aria-label={swatch.label}
                  aria-pressed={color === swatch.value}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-lg border-2',
                    color === swatch.value ? 'border-primary' : 'border-transparent',
                  )}
                  style={{ backgroundColor: swatch.value, color: contrastText(swatch.value) }}
                >
                  {color === swatch.value && <Check className="size-5" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>

          <SwitchField
            label="Categoria activa"
            description="Uma categoria inactiva deixa de aparecer na caixa."
            checked={active}
            onCheckedChange={setActive}
          />
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending} loadingLabel="A guardar...">
            {editing ? 'Guardar' : 'Criar categoria'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CategoryDialog;
