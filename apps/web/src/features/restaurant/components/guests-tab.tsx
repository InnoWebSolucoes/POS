import { UserRound } from 'lucide-react';
import type { OrderDto, OrderItemDto } from '@pos/shared';

import {
  Badge,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { amount } from '@/lib/format';

import { isLiveItem, isPendingItem, modifierLine } from './types';
import type { OrderActions } from './use-order';

export interface GuestsTabProps {
  order: OrderDto;
  actions: OrderActions;
  editable: boolean;
}

/** The "Convidados" tab: which seat each line belongs to, for a by-seat split. */
export function GuestsTab({ order, actions, editable }: GuestsTabProps) {
  const items = order.items.filter(isLiveItem);
  const seats = Array.from({ length: Math.max(order.guestCount, 1) }, (_, index) => index + 1);

  if (items.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={UserRound}
        title="Sem artigos"
        description="Atribua lugares depois de juntar artigos a conta."
      />
    );
  }

  const buckets: Array<{ key: string; label: string; items: OrderItemDto[] }> = [
    ...seats.map((seat) => ({
      key: `seat-${seat}`,
      label: `Lugar ${seat}`,
      items: items.filter((item) => item.seat === seat),
    })),
    { key: 'none', label: 'Sem lugar', items: items.filter((item) => item.seat === null) },
  ];

  return (
    <div className="divide-y divide-border">
      {buckets.map((bucket) => (
        <section key={bucket.key}>
          <header className="flex items-center justify-between gap-2 bg-muted/50 px-4 py-2">
            <p className="text-sm font-semibold text-foreground">{bucket.label}</p>
            <span className="tabular text-sm text-muted-foreground">
              {amount(bucket.items.reduce((sum, item) => sum + item.totalMinor, 0))}
            </span>
          </header>

          {bucket.items.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">Sem artigos</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {bucket.items.map((item) => {
                const details = modifierLine(item);
                const canMove = editable && isPendingItem(item);

                return (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                      {details && <p className="truncate text-xs text-muted-foreground">{details}</p>}
                    </div>

                    {canMove ? (
                      <Select
                        value={item.seat === null ? 'none' : String(item.seat)}
                        onValueChange={(value) =>
                          actions.updateItem.mutate({
                            itemId: item.id,
                            patch: { seat: value === 'none' ? null : Number(value) },
                          })
                        }
                      >
                        <SelectTrigger
                          aria-label={`Lugar de ${item.name}`}
                          className="h-11 w-[8.5rem] shrink-0"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem lugar</SelectItem>
                          {seats.map((seat) => (
                            <SelectItem key={seat} value={String(seat)}>
                              Lugar {seat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="muted" size="sm">
                        Enviado
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

export default GuestsTab;
