import * as React from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Unit } from '@pos/shared';

import { quantity as formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NumericInput } from './input';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** 1 for discrete goods, 0.001 for anything sold by weight. */
  step?: number;
  min?: number;
  max?: number;
  /** Renders "1,350 kg" instead of a bare number. */
  unit?: Unit;
  /** Lets the cashier type the quantity instead of tapping. */
  editable?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  'aria-label'?: string;
}

const SIZES = {
  sm: { button: 'size-11', value: 'min-w-[3rem] text-sm', icon: 'size-4' },
  default: { button: 'size-12', value: 'min-w-[4rem] text-base', icon: 'size-5' },
  lg: { button: 'size-14', value: 'min-w-[5rem] text-xl', icon: 'size-6' },
} as const;

const decimalsFor = (step: number): number => {
  if (step >= 1) return 0;
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : Math.min(3, text.length - dot - 1);
};

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * Minus / value / plus. Weighted goods pass step={0.001}; the arithmetic is
 * rounded back to the step's precision so 0.1 + 0.2 never shows up on a bill.
 */
export function QuantityStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  unit,
  editable = false,
  disabled = false,
  size = 'default',
  className,
  'aria-label': ariaLabel = 'Quantidade',
}: QuantityStepperProps) {
  const decimals = decimalsFor(step);
  const dims = SIZES[size];

  const commit = (next: number) => {
    let out = round(next, decimals);
    if (typeof min === 'number' && out < min) out = min;
    if (typeof max === 'number' && out > max) out = max;
    onChange(out);
  };

  const canDecrease = !disabled && round(value - step, decimals) >= min;
  const canIncrease = !disabled && (max === undefined || round(value + step, decimals) <= max);

  const buttonClass = cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground',
    'transition-colors hover:bg-muted active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40',
    'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    dims.button,
  );

  return (
    <div
      className={cn('inline-flex items-center gap-2', className)}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={buttonClass}
        onClick={() => commit(value - step)}
        disabled={!canDecrease}
        aria-label="Diminuir"
      >
        <Minus className={dims.icon} />
      </button>

      {editable ? (
        <NumericInput
          value={value}
          onValueChange={commit}
          decimals={decimals}
          min={min}
          max={max}
          align="right"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn('h-12 px-2', dims.value)}
        />
      ) : (
        <output
          aria-live="polite"
          className={cn(
            'tabular flex items-center justify-center px-1 text-center font-semibold text-foreground',
            dims.value,
          )}
        >
          {unit ? formatQuantity(value, unit) : round(value, decimals).toFixed(decimals).replace('.', ',')}
        </output>
      )}

      <button
        type="button"
        className={buttonClass}
        onClick={() => commit(value + step)}
        disabled={!canIncrease}
        aria-label="Aumentar"
      >
        <Plus className={dims.icon} />
      </button>
    </div>
  );
}

export default QuantityStepper;
