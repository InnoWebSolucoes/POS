import * as React from 'react';
import { Check } from 'lucide-react';
import type { EntityMode } from '@pos/shared';

import { cn } from '@/lib/utils';
import { BUSINESS_MODES } from './business-modes';

/**
 * The single most important screen of the sign-up: what kind of business is
 * this? Big tap targets first, but a real radiogroup underneath - arrow keys
 * move and pick, Space picks, Enter picks and moves the wizard on. The
 * selection is never signalled by colour alone: the chosen card carries a ring,
 * a filled icon tile and a "Escolhido" badge with a check.
 */

export interface ModePickerProps {
  value: EntityMode | null;
  onChange: (mode: EntityMode) => void;
  /** Enter on a card selects it and advances. */
  onConfirm?: () => void;
  labelledBy?: string;
}

export function ModePicker({ value, onChange, onConfirm, labelledBy }: ModePickerProps) {
  const cards = React.useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = BUSINESS_MODES.findIndex((option) => option.mode === value);
  // Nothing picked yet: the first card is the one Tab lands on.
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const pickAt = (index: number) => {
    const option = BUSINESS_MODES[index];
    if (!option) return;
    onChange(option.mode);
    cards.current[index]?.focus();
  };

  const move = (from: number, delta: number) => {
    pickAt((from + delta + BUSINESS_MODES.length) % BUSINESS_MODES.length);
  };

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid gap-3">
      {BUSINESS_MODES.map((option, index) => {
        const Icon = option.icon;
        const selected = option.mode === value;

        return (
          <button
            key={option.mode}
            ref={(node) => {
              cards.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === focusIndex ? 0 : -1}
            onClick={() => onChange(option.mode)}
            onKeyDown={(event) => {
              switch (event.key) {
                case 'ArrowDown':
                case 'ArrowRight':
                  event.preventDefault();
                  move(index, 1);
                  break;
                case 'ArrowUp':
                case 'ArrowLeft':
                  event.preventDefault();
                  move(index, -1);
                  break;
                case 'Home':
                  event.preventDefault();
                  pickAt(0);
                  break;
                case 'End':
                  event.preventDefault();
                  pickAt(BUSINESS_MODES.length - 1);
                  break;
                case 'Enter':
                  event.preventDefault();
                  onChange(option.mode);
                  onConfirm?.();
                  break;
                default:
                  break;
              }
            }}
            className={cn(
              'flex w-full flex-col gap-3 rounded-xl border-2 p-4 text-left transition-colors',
              'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border bg-card hover:bg-muted/50',
            )}
          >
            <span className="flex items-start gap-3">
              <span
                className={cn(
                  'flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors',
                  selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                <Icon className="size-6" aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold leading-tight text-foreground">
                    {option.title}
                  </span>
                  {selected && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                      <Check className="size-3.5" aria-hidden="true" />
                      Escolhido
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-sm leading-snug text-muted-foreground">
                  {option.tagline}
                </span>
              </span>
            </span>

            <span className="grid gap-1.5 sm:grid-cols-2">
              {option.features.map((feature) => (
                <span key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      selected ? 'bg-primary' : 'bg-muted-foreground/60',
                    )}
                  />
                  <span className="leading-snug">{feature}</span>
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default ModePicker;
