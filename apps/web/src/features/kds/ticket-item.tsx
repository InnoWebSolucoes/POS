import { Ban, Check, Flame, StickyNote } from 'lucide-react';

import { number } from '@/lib/format';
import { cn } from '@/lib/utils';

import { isRemoval, nextItemStatus, type KdsTicketItem } from './kds-types';

/**
 * One line on a ticket. The whole row is the tap target that advances just this
 * line; "86" sits beside it as its own button, because a mis-tap there takes a
 * dish off every waiter's tablet.
 */

export interface TicketItemRowProps {
  item: KdsTicketItem;
  canAct: boolean;
  busy: boolean;
  onAdvance: (item: KdsTicketItem) => void;
  onEightySix: (item: KdsTicketItem) => void;
}

const STATUS_ROW: Record<string, string> = {
  ready: 'bg-success/15',
  served: 'opacity-55',
  in_progress: 'bg-warning/10',
};

export function TicketItemRow({ item, canAct, busy, onAdvance, onEightySix }: TicketItemRowProps) {
  const next = nextItemStatus(item.status);
  const done = item.status === 'ready' || item.status === 'served';
  const quantityLabel = number(item.quantity, Number.isInteger(item.quantity) ? 0 : 3);

  return (
    <li className="flex items-stretch gap-2">
      <button
        type="button"
        disabled={!canAct || busy || next === null}
        onClick={() => onAdvance(item)}
        aria-label={`Avancar ${item.name}`}
        className={cn(
          'flex min-h-touch-lg flex-1 items-start gap-3 rounded-lg px-3 py-3 text-left',
          'outline-none ring-offset-background focus-visible:ring-4 focus-visible:ring-ring',
          'transition-transform duration-75 active:scale-[0.99] disabled:active:scale-100',
          STATUS_ROW[item.status] ?? 'bg-muted/40',
        )}
      >
        <span className="tabular shrink-0 text-kds leading-tight text-foreground">
          {quantityLabel}
          <span className="text-muted-foreground">x</span>
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block break-words text-kds leading-tight text-foreground',
              done && 'line-through decoration-2',
            )}
          >
            {item.name}
          </span>

          {item.modifiers.length > 0 && (
            <span className="mt-1 block space-y-0.5">
              {item.modifiers.map((modifier, index) => (
                <span
                  key={`${item.id}-mod-${index}`}
                  className={cn(
                    'block text-xl font-bold uppercase leading-tight',
                    isRemoval(modifier) ? 'text-destructive' : 'text-primary',
                  )}
                >
                  {isRemoval(modifier) ? '! ' : '+ '}
                  {modifier}
                </span>
              ))}
            </span>
          )}

          {item.note && (
            <span className="mt-1 flex items-start gap-2 text-xl font-semibold leading-tight text-warning">
              <StickyNote className="mt-1 size-5 shrink-0" aria-hidden="true" />
              <span className="break-words">{item.note}</span>
            </span>
          )}

          {typeof item.seat === 'number' && item.seat > 0 && (
            <span className="mt-1 block text-lg font-semibold text-muted-foreground">
              Lugar {item.seat}
            </span>
          )}
        </span>

        <span className="mt-1 shrink-0 text-foreground" aria-hidden="true">
          {item.status === 'served' || item.status === 'ready' ? (
            <Check className="size-8 text-success" />
          ) : item.status === 'in_progress' ? (
            <Flame className="size-8 text-warning" />
          ) : null}
        </span>
      </button>

      {canAct && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onEightySix(item)}
          aria-label={`Marcar ${item.name} em falta`}
          className={cn(
            'flex min-h-touch-lg w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg',
            'border-2 border-border bg-muted/40 text-base font-bold text-muted-foreground',
            'outline-none ring-offset-background focus-visible:ring-4 focus-visible:ring-ring',
            'transition-transform duration-75 active:scale-[0.96]',
          )}
        >
          <Ban className="size-5" aria-hidden="true" />
          86
        </button>
      )}
    </li>
  );
}

export default TicketItemRow;
