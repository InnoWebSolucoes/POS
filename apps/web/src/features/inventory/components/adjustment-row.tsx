import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { ADJUSTMENT_REASONS, ADJUSTMENT_REASON_LABELS, FRACTIONAL_UNITS, type AdjustmentReason, type Unit } from '@pos/shared';

import {
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
import { quantity as formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

export type AdjustMode = 'delta' | 'absolute';

export interface AdjustmentDraft {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  unit: Unit;
  /** What the system believes is on hand right now. */
  currentQuantity: number;
  mode: AdjustMode;
  delta: number;
  absolute: number;
  reason: AdjustmentReason | '';
  note: string;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** The signed movement this line will write, whichever way it was entered. */
export function effectiveDelta(line: AdjustmentDraft): number {
  return line.mode === 'delta' ? round3(line.delta) : round3(line.absolute - line.currentQuantity);
}

export interface AdjustmentRowProps {
  line: AdjustmentDraft;
  highlighted: boolean;
  onChange: (key: string, patch: Partial<AdjustmentDraft>) => void;
  onRemove: (key: string) => void;
}

export function AdjustmentRow({ line, highlighted, onChange, onRemove }: AdjustmentRowProps) {
  const delta = effectiveDelta(line);
  const resulting = round3(line.currentQuantity + delta);
  const decimals = FRACTIONAL_UNITS.includes(line.unit) ? 3 : 0;
  const noteId = React.useId();
  const valueId = React.useId();

  return (
    <li
      className={cn(
        'grid grid-cols-1 gap-3 p-4 lg:grid-cols-[minmax(0,2fr)_auto_minmax(0,9rem)_minmax(0,12rem)_minmax(0,12rem)_auto] lg:items-end',
        highlighted && 'bg-accent',
      )}
    >
      <div className="min-w-0">
        <span className="block truncate font-medium text-foreground">{line.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {line.sku} - em stock <span className="tabular">{formatQuantity(line.currentQuantity, line.unit)}</span>
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Como quer contar</span>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(['delta', 'absolute'] as AdjustMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={line.mode === mode}
              onClick={() => onChange(line.key, { mode })}
              className={cn(
                'min-h-touch flex-1 rounded-md px-3 text-sm font-semibold transition-colors',
                line.mode === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {mode === 'delta' ? '+/- Diferenca' : 'Nova quantidade'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={valueId}>{line.mode === 'delta' ? 'Diferenca' : 'Contado'}</Label>
        <NumericInput
          id={valueId}
          value={line.mode === 'delta' ? line.delta : line.absolute}
          decimals={decimals}
          min={line.mode === 'absolute' ? 0 : undefined}
          onValueChange={(value) =>
            onChange(line.key, line.mode === 'delta' ? { delta: value } : { absolute: value })
          }
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label>Motivo</Label>
        <Select
          value={line.reason || undefined}
          onValueChange={(value) => onChange(line.key, { reason: value as AdjustmentReason })}
        >
          <SelectTrigger aria-label="Motivo do ajuste" aria-invalid={line.reason === ''}>
            <SelectValue placeholder="Obrigatorio" />
          </SelectTrigger>
          <SelectContent>
            {ADJUSTMENT_REASONS.map((reason) => (
              <SelectItem key={reason} value={reason}>
                {ADJUSTMENT_REASON_LABELS[reason].pt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={noteId}>Nota</Label>
        <Input
          id={noteId}
          value={line.note}
          maxLength={500}
          placeholder="Opcional"
          onChange={(event) => onChange(line.key, { note: event.target.value })}
        />
      </div>

      <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end">
        <span className="text-right">
          <span className="block text-xs text-muted-foreground">Fica com</span>
          <span
            className={cn(
              'tabular text-base font-semibold',
              delta === 0 ? 'text-muted-foreground' : delta > 0 ? 'text-success' : 'text-destructive',
            )}
          >
            {formatQuantity(resulting, line.unit)}
          </span>
          <span className="tabular block text-xs text-muted-foreground">
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        </span>
        <Button variant="ghost" size="icon" aria-label={`Remover ${line.name}`} onClick={() => onRemove(line.key)}>
          <Trash2 className="size-5 text-destructive" />
        </Button>
      </div>
    </li>
  );
}

export default AdjustmentRow;
