import * as React from 'react';
import { Lightbulb, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Small factual notes that sit under a field or a button.
 *
 * The rule for a hint: it must state something the screen does not already
 * show, in one line, and it must be true. A hint that decorates ("Bem-vindo!")
 * becomes noise within a day and people stop reading the ones that matter.
 */

export interface HintProps extends React.HTMLAttributes<HTMLParagraphElement> {
  icon?: LucideIcon | null;
}

export function Hint({ icon = Lightbulb, className, children, ...props }: HintProps) {
  const Icon = icon;
  return (
    <p
      className={cn('flex items-start gap-1.5 text-xs leading-snug text-muted-foreground', className)}
      {...props}
    >
      {Icon && <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" />}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** A single key, rendered as a key. Reads as a key even at a glance. */
export function KeyCap({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'mx-0.5 inline-block rounded border border-border bg-muted px-1.5 py-0.5',
        'font-mono text-[0.6875rem] font-semibold leading-none text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

/**
 * The register's quantity multiplier, in the words a cashier would use.
 *
 * Mirrors what the barcode field actually does: a numeric prefix typed before
 * a scan becomes the quantity, an explicit "5 *" arms the same multiplier, and
 * Escape clears both. Drop it straight under the barcode input.
 */
export const SCAN_QUANTITY_HINT =
  'Escreva a quantidade antes de ler o codigo para registar varias unidades de uma vez. Esc limpa o campo.';

export function ScanQuantityHint({ className }: { className?: string }) {
  return (
    <Hint className={className}>
      Escreva a quantidade e depois <KeyCap>*</KeyCap> antes de ler o codigo:
      <KeyCap>5</KeyCap>
      <KeyCap>*</KeyCap> e uma leitura registam 5 unidades. <KeyCap>Esc</KeyCap> limpa o campo.
    </Hint>
  );
}

export default Hint;
