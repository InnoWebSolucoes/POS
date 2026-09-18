import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Where am I and how much is left. The count is announced politely so a screen
 * reader hears "Passo 2 de 3" when the wizard moves, and each step keeps its
 * title visible instead of a bare dot.
 */

export interface StepProgressProps {
  steps: readonly string[];
  /** Zero-based. */
  current: number;
}

export function StepProgress({ steps, current }: StepProgressProps) {
  return (
    <div>
      <p
        aria-live="polite"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Passo {current + 1} de {steps.length}
      </p>

      <ol className="mt-3 flex gap-2">
        {steps.map((title, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li
              key={title}
              aria-current={active ? 'step' : undefined}
              className="flex min-w-0 flex-1 flex-col gap-1.5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-1.5 rounded-full transition-colors',
                  done || active ? 'bg-primary' : 'bg-muted',
                )}
              />
              <span
                className={cn(
                  'flex items-center gap-1 text-xs font-medium',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {done ? (
                  <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <span className="tabular shrink-0">{index + 1}.</span>
                )}
                <span className="truncate">{title}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default StepProgress;
