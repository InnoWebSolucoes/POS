import * as React from 'react';
import { parseLocaleNumber } from '@pos/shared';

import { cn } from '@/lib/utils';

export const inputClassName = [
  'flex h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground',
  'shadow-sm transition-colors placeholder:text-muted-foreground',
  'outline-none ring-offset-background focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
  'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
].join(' ');

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Adornment rendered inside the field, on the leading edge. */
  startAdornment?: React.ReactNode;
  /** Adornment rendered inside the field, on the trailing edge. */
  endAdornment?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = 'text', startAdornment, endAdornment, ...props },
  ref,
) {
  const field = (
    <input
      ref={ref}
      type={type}
      className={cn(
        inputClassName,
        startAdornment && 'pl-11',
        endAdornment && 'pr-11',
        className,
      )}
      {...props}
    />
  );

  if (!startAdornment && !endAdornment) return field;

  return (
    <div className="relative w-full">
      {startAdornment && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-foreground">
          {startAdornment}
        </span>
      )}
      {field}
      {endAdornment && (
        <span className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground">
          {endAdornment}
        </span>
      )}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* NumericInput                                                                */
/* -------------------------------------------------------------------------- */

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null | undefined;
  onValueChange?: (value: number) => void;
  /** Digits after the separator; 0 keeps it whole. */
  decimals?: number;
  min?: number;
  max?: number;
  /** Right-aligned, monospace - the default for quantity and money columns. */
  align?: 'left' | 'right';
  /** Selects the whole field on focus so a cashier can just overtype. */
  selectOnFocus?: boolean;
}

const clampValue = (value: number, min?: number, max?: number): number => {
  let out = value;
  if (typeof min === 'number' && out < min) out = min;
  if (typeof max === 'number' && out > max) out = max;
  return out;
};

/**
 * A plain number field that survives a Portuguese keyboard: "12,5" and "12.5"
 * both parse, and the draft text is kept while the field has focus so the
 * caret never jumps mid-typing.
 */
export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  function NumericInput(
    {
      className,
      value,
      onValueChange,
      decimals = 2,
      min,
      max,
      align = 'right',
      selectOnFocus = true,
      onFocus,
      onBlur,
      ...props
    },
    ref,
  ) {
    const [draft, setDraft] = React.useState<string | null>(null);

    const asText = (n: number | null | undefined): string => {
      if (n === null || n === undefined || Number.isNaN(n)) return '';
      return decimals > 0 ? String(n).replace('.', ',') : String(Math.round(n));
    };

    const display = draft ?? asText(value);

    return (
      <input
        ref={ref}
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={display}
        onFocus={(event) => {
          setDraft(asText(value));
          if (selectOnFocus) event.currentTarget.select();
          onFocus?.(event);
        }}
        onChange={(event) => {
          const raw = event.target.value;
          // Keep only what can belong to a number on either keyboard layout.
          const cleaned = raw.replace(decimals > 0 ? /[^0-9.,-]/g : /[^0-9-]/g, '');
          setDraft(cleaned);
          if (cleaned === '' || cleaned === '-') {
            onValueChange?.(clampValue(0, min, max));
            return;
          }
          const parsed = parseLocaleNumber(cleaned);
          onValueChange?.(clampValue(parsed, min, max));
        }}
        onBlur={(event) => {
          const parsed = draft === null || draft === '' ? 0 : parseLocaleNumber(draft);
          const next = clampValue(parsed, min, max);
          setDraft(null);
          onValueChange?.(next);
          onBlur?.(event);
        }}
        className={cn(
          inputClassName,
          'tabular',
          align === 'right' && 'text-right',
          className,
        )}
        {...props}
      />
    );
  },
);

export default Input;
