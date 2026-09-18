import { Copy, Trash2, TriangleAlert } from 'lucide-react';
import { TABLE_SHAPES, type TableShape } from '@pos/shared';

import {
  Badge,
  Button,
  Input,
  Label,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cn } from '@/lib/utils';

import { SHAPE_LABELS, useStatusLabels } from './floor-utils';
import { LIMITS, type EditorTable } from './editor-model';

export interface EditorPanelProps {
  table: EditorTable | null;
  area: { width: number; height: number };
  colliding: boolean;
  onPatch: (patch: Partial<EditorTable>) => void;
  /** Focus/blur bracket a numeric edit so it becomes one undo step. */
  onBeginEdit: () => void;
  onEndEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const ROTATIONS = [0, 45, 90, 135, 180, 225, 270, 315];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** Everything the drag does, typed exactly - which is how a room gets square. */
export function EditorPanel({
  table,
  area,
  colliding,
  onPatch,
  onBeginEdit,
  onEndEdit,
  onDuplicate,
  onDelete,
}: EditorPanelProps) {
  const statusLabels = useStatusLabels();

  if (!table) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-semibold">Nenhuma mesa seleccionada</p>
        <p className="text-sm text-muted-foreground">
          Toque numa mesa para a editar, ou adicione uma nova na barra de ferramentas.
        </p>
        <p className="text-xs text-muted-foreground">
          Setas movem 1 unidade, Shift+setas 10. Alt ignora a grelha.
        </p>
      </div>
    );
  }

  const numericProps = {
    decimals: 0,
    onFocus: onBeginEdit,
    onBlur: onEndEdit,
  } as const;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-lg font-bold">{table.name}</h2>
        <Badge variant="secondary">{statusLabels[table.status]}</Badge>
      </div>

      {colliding && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Esta mesa sobrepoe outra. Pode ser propositado, mas verifique.
        </p>
      )}

      {table.activeOrderId && (
        <p className="rounded-lg border border-border bg-muted p-2 text-sm text-muted-foreground">
          Tem um pedido em aberto: nao pode ser eliminada.
        </p>
      )}

      <Field label="Nome">
        <Input
          value={table.name}
          maxLength={30}
          onFocus={onBeginEdit}
          onBlur={onEndEdit}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
      </Field>

      <Field label="Forma">
        <Select
          value={table.shape}
          onValueChange={(value) => {
            onBeginEdit();
            onPatch({ shape: value as TableShape });
            onEndEdit();
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TABLE_SHAPES.map((shape) => (
              <SelectItem key={shape} value={shape}>
                {SHAPE_LABELS[shape]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Lugares">
        <NumericInput
          value={table.seats}
          min={LIMITS.minSeats}
          max={LIMITS.maxSeats}
          onValueChange={(value) => onPatch({ seats: Math.round(value) })}
          {...numericProps}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="X">
          <NumericInput
            value={table.x}
            min={0}
            max={area.width}
            onValueChange={(value) => onPatch({ x: value })}
            {...numericProps}
          />
        </Field>
        <Field label="Y">
          <NumericInput
            value={table.y}
            min={0}
            max={area.height}
            onValueChange={(value) => onPatch({ y: value })}
            {...numericProps}
          />
        </Field>
        <Field label="Largura">
          <NumericInput
            value={table.width}
            min={LIMITS.minSize}
            max={LIMITS.maxSize}
            onValueChange={(value) => onPatch({ width: value })}
            {...numericProps}
          />
        </Field>
        <Field label="Altura">
          <NumericInput
            value={table.height}
            min={LIMITS.minSize}
            max={LIMITS.maxSize}
            onValueChange={(value) => onPatch({ height: value })}
            {...numericProps}
          />
        </Field>
      </div>

      <Field label="Rotacao">
        <div className="flex flex-col gap-2">
          <NumericInput
            value={table.rotation}
            min={-360}
            max={360}
            onValueChange={(value) => onPatch({ rotation: value })}
            {...numericProps}
          />
          <div className="grid grid-cols-4 gap-1.5">
            {ROTATIONS.map((angle) => (
              <Button
                key={angle}
                type="button"
                size="sm"
                variant={Math.round(table.rotation) === angle ? 'default' : 'outline'}
                className={cn('tabular px-0')}
                onClick={() => {
                  onBeginEdit();
                  onPatch({ rotation: angle });
                  onEndEdit();
                }}
              >
                {angle}
              </Button>
            ))}
          </div>
        </div>
      </Field>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button variant="outline" size="lg" block leftIcon={<Copy />} onClick={onDuplicate}>
          Duplicar mesa
        </Button>
        <Button
          variant="destructive"
          size="lg"
          block
          leftIcon={<Trash2 />}
          disabled={Boolean(table.activeOrderId)}
          onClick={onDelete}
        >
          Eliminar mesa
        </Button>
      </div>
    </div>
  );
}

export default EditorPanel;
