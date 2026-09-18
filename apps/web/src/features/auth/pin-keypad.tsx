import * as React from 'react';
import { Delete } from 'lucide-react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

/* -------------------------------------------------------------------------- */
/* Dots                                                                        */
/* -------------------------------------------------------------------------- */

export interface PinDotsProps {
  value: string;
  /** Bump this number to shake the row - a wrong PIN has to be felt, not read. */
  shakeToken?: number;
}

export function PinDots({ value, shakeToken = 0 }: PinDotsProps) {
  const row = React.useRef<HTMLDivElement>(null);
  const previous = React.useRef(shakeToken);

  React.useEffect(() => {
    if (shakeToken === previous.current) return;
    previous.current = shakeToken;
    const node = row.current;
    if (!node || typeof node.animate !== 'function') return;
    node.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-10px)' },
        { transform: 'translateX(9px)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 380, easing: 'ease-in-out' },
    );
  }, [shakeToken]);

  return (
    <div
      ref={row}
      className="flex items-center justify-center gap-3"
      role="status"
      aria-live="polite"
      aria-label={`${value.length} digitos introduzidos`}
    >
      {Array.from({ length: PIN_MAX_LENGTH }).map((_, index) => {
        const filled = index < value.length;
        const optional = index >= PIN_MIN_LENGTH;
        return (
          <span
            key={index}
            className={cn(
              'size-4 rounded-full border-2 transition-colors duration-100',
              filled ? 'border-primary bg-primary' : 'border-border bg-transparent',
              !filled && optional && 'opacity-40',
            )}
          />
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Keypad                                                                      */
/* -------------------------------------------------------------------------- */

export interface PinKeypadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  disabled?: boolean;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/** Keys are 80px tall: a mis-tap on a register costs a re-login, or worse. */
export function PinKeypad({ onDigit, onBackspace, onClear, disabled = false }: PinKeypadProps) {
  const keyClass = 'h-20 text-2xl font-semibold tabular';

  return (
    <div className="grid grid-cols-3 gap-3">
      {DIGITS.map((digit) => (
        <Button
          key={digit}
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onDigit(digit)}
          className={keyClass}
        >
          {digit}
        </Button>
      ))}

      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={onClear}
        className={cn(keyClass, 'text-base font-bold uppercase tracking-wide')}
      >
        Limpar
      </Button>

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onDigit('0')}
        className={keyClass}
      >
        0
      </Button>

      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={onBackspace}
        aria-label="Apagar ultimo digito"
        className={keyClass}
      >
        <Delete aria-hidden="true" />
      </Button>
    </div>
  );
}

export default PinKeypad;
