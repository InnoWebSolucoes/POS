import * as React from 'react';
import {
  currencyConfig,
  formatMoney,
  parseLocaleNumber,
  roundHalfUp,
  toMajor,
  toMinor,
} from '@pos/shared';

import { amount, currencyDecimals, currencySymbol, minorToMajor } from '@/lib/format';
import { cn } from '@/lib/utils';
import { inputClassName } from './input';

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'size'> {
  /** The amount in MINOR units (centimos). Never a float price. */
  value: number | null | undefined;
  /** Emits MINOR units, already rounded to an integer. */
  onChange: (minor: number) => void;
  /** Overrides the entity currency configured in lib/format. */
  currency?: string;
  /** Lower / upper bounds, also in minor units; applied when the field blurs. */
  min?: number;
  max?: number;
  allowNegative?: boolean;
  showSymbol?: boolean;
  align?: 'left' | 'right';
  inputSize?: 'default' | 'lg';
}

/**
 * Every price field in the app. The contract is deliberately narrow: minor
 * units in, minor units out. The float only ever exists inside the parse, and
 * is turned back into an integer immediately, so no drift can accumulate.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  {
    className,
    value,
    onChange,
    currency,
    min,
    max,
    allowNegative = false,
    showSymbol = true,
    align = 'right',
    inputSize = 'default',
    onFocus,
    onBlur,
    disabled,
    ...props
  },
  ref,
) {
  const config = currency ? currencyConfig(currency) : null;
  const decimals = config ? config.decimals : currencyDecimals();
  const symbol = config ? config.symbol : currencySymbol();

  const [draft, setDraft] = React.useState<string | null>(null);

  const asMinor = React.useCallback(
    (text: string): number => {
      if (currency) return toMinor(text, currency);
      // Same maths as toMinor(), against the entity currency's decimals.
      return roundHalfUp(parseLocaleNumber(text) * 10 ** decimals);
    },
    [currency, decimals],
  );

  const asMajor = React.useCallback(
    (minor: number): number => (currency ? toMajor(minor, currency) : minorToMajor(minor)),
    [currency],
  );

  const formatted = (minor: number): string =>
    currency ? formatMoney(minor, { currency, bare: true }) : amount(minor);

  const editable = (minor: number): string =>
    asMajor(minor)
      .toFixed(decimals)
      .replace('.', ',');

  const clamp = (minor: number): number => {
    let out = minor;
    if (!allowNegative && out < 0) out = 0;
    if (typeof min === 'number' && out < min) out = min;
    if (typeof max === 'number' && out > max) out = max;
    return out;
  };

  const current = value ?? 0;
  const display = draft ?? formatted(current);

  return (
    <div className="relative w-full">
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        value={display}
        onFocus={(event) => {
          setDraft(editable(current));
          event.currentTarget.select();
          onFocus?.(event);
        }}
        onChange={(event) => {
          const cleaned = event.target.value.replace(allowNegative ? /[^0-9.,-]/g : /[^0-9.,]/g, '');
          setDraft(cleaned);
          if (cleaned === '' || cleaned === '-') {
            onChange(0);
            return;
          }
          onChange(asMinor(cleaned));
        }}
        onBlur={(event) => {
          const next = clamp(draft === null || draft === '' ? 0 : asMinor(draft));
          setDraft(null);
          onChange(next);
          onBlur?.(event);
        }}
        className={cn(
          inputClassName,
          'tabular',
          inputSize === 'lg' && 'h-14 text-lg',
          align === 'right' ? 'text-right' : 'text-left',
          showSymbol && 'pr-12',
          className,
        )}
        {...props}
      />
      {showSymbol && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-sm font-medium text-muted-foreground"
        >
          {symbol}
        </span>
      )}
    </div>
  );
});

export default MoneyInput;
