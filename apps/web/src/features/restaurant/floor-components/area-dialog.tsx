import { useEffect, useState } from 'react';

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
} from '@/components/ui';

export interface AreaFormValue {
  name: string;
  width: number;
  height: number;
}

export interface AreaDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial: AreaFormValue | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: AreaFormValue) => void;
}

const DEFAULTS: AreaFormValue = { name: '', width: 1200, height: 800 };

/** Create a zone, or rename and resize the one being edited. */
export function AreaDialog({ open, mode, initial, pending, onOpenChange, onSubmit }: AreaDialogProps) {
  const [value, setValue] = useState<AreaFormValue>(DEFAULTS);

  useEffect(() => {
    if (open) setValue(initial ?? DEFAULTS);
  }, [open, initial]);

  const valid = value.name.trim().length > 0 && value.width >= 200 && value.height >= 200;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nova zona' : 'Editar zona'}</DialogTitle>
          <DialogDescription>
            As dimensoes sao as da sala em unidades do plano, nao em pixeis.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="area-name">Nome</Label>
            <Input
              id="area-name"
              value={value.name}
              maxLength={60}
              placeholder="Sala Principal"
              onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="area-width">Largura</Label>
              <NumericInput
                id="area-width"
                value={value.width}
                decimals={0}
                min={200}
                max={8000}
                onValueChange={(width) => setValue((current) => ({ ...current, width }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="area-height">Profundidade</Label>
              <NumericInput
                id="area-height"
                value={value.height}
                decimals={0}
                min={200}
                max={8000}
                onValueChange={(height) => setValue((current) => ({ ...current, height }))}
              />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            size="lg"
            disabled={!valid}
            loading={pending}
            loadingLabel="A guardar..."
            onClick={() => onSubmit({ ...value, name: value.name.trim() })}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AreaDialog;
