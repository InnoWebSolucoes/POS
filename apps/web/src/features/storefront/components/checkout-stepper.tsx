import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Where the shopper is in the checkout, on a phone and on a desktop. */
export const CHECKOUT_STEPS = ['Entrega', 'Dados', 'Pagamento', 'Revisao'] as const;

export function CheckoutStepper({ step }: { step: number }) {
  return (
    <nav aria-label="Etapas da compra" className="mb-6">
      <ol className="hidden items-center gap-2 sm:flex">
        {CHECKOUT_STEPS.map((label, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'tabular flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold',
                  done && 'border-transparent bg-success text-success-foreground',
                  current && 'border-transparent bg-primary text-primary-foreground',
                  !done && !current && 'border-border bg-card text-muted-foreground',
                )}
              >
                {done ? <Check className="size-4" aria-hidden="true" /> : index + 1}
              </span>
              <span
                className={cn(
                  'text-sm',
                  current ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
              {index < CHECKOUT_STEPS.length - 1 && (
                <span aria-hidden="true" className="ml-1 hidden h-px flex-1 bg-border md:block" />
              )}
            </li>
          );
        })}
      </ol>

      <div className="sm:hidden">
        <p className="text-sm font-semibold">
          <span className="tabular">
            Passo {step + 1} de {CHECKOUT_STEPS.length}
          </span>{' '}
          - {CHECKOUT_STEPS[step]}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${((step + 1) / CHECKOUT_STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </nav>
  );
}

export default CheckoutStepper;
