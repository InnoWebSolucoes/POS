import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { FRACTIONAL_UNITS, type Unit } from '@pos/shared';

import { Button, Input, Label, MoneyInput, QuantityStepper } from '@/components/ui';
import { amount } from '@/lib/format';

export interface ReceiptLineDraft {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  unit: Unit;
  quantity: number;
  unitCostMinor: number;
  batchNumber: string;
  /** yyyy-MM-dd, straight from the native date field. */
  expiryDate: string;
}

export const stepFor = (unit: Unit): number => (FRACTIONAL_UNITS.includes(unit) ? 0.001 : 1);

export const lineTotalMinor = (line: ReceiptLineDraft): number =>
  Math.round(line.quantity * line.unitCostMinor);

export interface ReceiptLineRowProps {
  line: ReceiptLineDraft;
  index: number;
  highlighted: boolean;
  onChange: (key: string, patch: Partial<ReceiptLineDraft>) => void;
  onRemove: (key: string) => void;
}

/**
 * One received line. Everything the warehouse needs to type is on the row:
 * quantity, cost, batch and expiry - no drill-in, because the tablet is being
 * held in one hand.
 */
export function ReceiptLineRow({ line, index, highlighted, onChange, onRemove }: ReceiptLineRowProps) {
  const costId = React.useId();
  const batchId = React.useId();
  const expiryId = React.useId();

  return (
    <li
      data-line-key={line.key}
      className={`grid grid-cols-1 gap-3 p-4 transition-colors lg:grid-cols-[minmax(0,2fr)_auto_minmax(0,10rem)_minmax(0,9rem)_minmax(0,10rem)_auto_auto] lg:items-end ${
        highlighted ? 'bg-accent' : ''
      }`}
    >
      <div className="min-w-0">
        <span className="block truncate font-medium text-foreground">
          {index + 1}. {line.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{line.sku}</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Quantidade</span>
        <QuantityStepper
          value={line.quantity}
          onChange={(value) => onChange(line.key, { quantity: value })}
          step={stepFor(line.unit)}
          min={stepFor(line.unit)}
          unit={line.unit}
          editable
          aria-label={`Quantidade de ${line.name}`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={costId}>Custo unitario</Label>
        <MoneyInput
          id={costId}
          value={line.unitCostMinor}
          onChange={(minor) => onChange(line.key, { unitCostMinor: minor })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={batchId}>Lote</Label>
        <Input
          id={batchId}
          value={line.batchNumber}
          maxLength={80}
          placeholder="Opcional"
          onChange={(event) => onChange(line.key, { batchNumber: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={expiryId}>Validade</Label>
        <Input
          id={expiryId}
          type="date"
          value={line.expiryDate}
          onChange={(event) => onChange(line.key, { expiryDate: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1 lg:items-end">
        <span className="text-xs text-muted-foreground">Total da linha</span>
        <span className="tabular text-base font-semibold text-foreground">{amount(lineTotalMinor(line))}</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remover ${line.name}`}
        onClick={() => onRemove(line.key)}
      >
        <Trash2 className="size-5 text-destructive" />
      </Button>
    </li>
  );
}

export default ReceiptLineRow;
