import { useState } from 'react';
import { Flame, MoreHorizontal, PauseCircle, Trash2 } from 'lucide-react';
import type { OrderDto, OrderItemDto } from '@pos/shared';

import {
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  EmptyState,
  QuantityStepper,
} from '@/components/ui';
import { amount, quantity as formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  COURSES,
  COURSE_STATE_LABELS,
  courseLabel,
  groupByCourse,
  isPendingItem,
  modifierLine,
} from './types';
import type { OrderActions } from './use-order';

export interface CheckItemsProps {
  order: OrderDto;
  actions: OrderActions;
  editable: boolean;
}

/** The body of the "Conta" tab: one section per course, oldest course first. */
export function CheckItems({ order, actions, editable }: CheckItemsProps) {
  const [confirmCourse, setConfirmCourse] = useState<number | null>(null);
  const groups = groupByCourse(order.items);

  if (groups.length === 0) {
    return (
      <EmptyState
        size="sm"
        title="Conta vazia"
        description="Escolha artigos no menu a esquerda para os juntar a conta."
      />
    );
  }

  const removeCourse = (course: number) => {
    const group = groups.find((entry) => entry.course === course);
    if (!group) return;
    for (const item of group.items.filter(isPendingItem)) {
      actions.removeItem.mutate(item.id);
    }
  };

  const moveCourse = (from: number, to: number) => {
    const group = groups.find((entry) => entry.course === from);
    if (!group) return;
    for (const item of group.items.filter(isPendingItem)) {
      actions.updateItem.mutate({ itemId: item.id, patch: { course: to } });
    }
  };

  return (
    <div className="divide-y divide-border">
      {groups.map((group) => {
        const pending = group.items.filter(isPendingItem);

        return (
          <section key={group.course}>
            <header className="flex items-center justify-between gap-2 bg-muted/50 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{courseLabel(group.course)}</p>
                <p
                  className={cn(
                    'text-xs font-medium',
                    group.state === 'ready' ? 'text-success' : 'text-muted-foreground',
                  )}
                >
                  {COURSE_STATE_LABELS[group.state]}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {editable && group.held && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Lancar ${courseLabel(group.course)}`}
                    onClick={() => actions.fireCourse.mutate(group.course)}
                  >
                    <Flame className="text-warning" />
                  </Button>
                )}

                {editable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Accoes de ${courseLabel(group.course)}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>{courseLabel(group.course)}</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => actions.fireCourse.mutate(group.course)}>
                        <Flame />
                        Lancar agora
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={pending.length === 0}
                        onSelect={() => actions.holdItems.mutate(pending.map((item) => item.id))}
                      >
                        <PauseCircle />
                        Reter
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger disabled={pending.length === 0}>
                          Mover para
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {COURSES.filter((course) => course !== group.course).map((course) => (
                            <DropdownMenuItem
                              key={course}
                              onSelect={() => moveCourse(group.course, course)}
                            >
                              {courseLabel(course)}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={pending.length === 0}
                        onSelect={() => setConfirmCourse(group.course)}
                      >
                        <Trash2 />
                        Remover por enviar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </header>

            <ul>
              {group.items.map((item) => (
                <CheckRow
                  key={item.id}
                  item={item}
                  actions={actions}
                  editable={editable && isPendingItem(item)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      <ConfirmDialog
        open={confirmCourse !== null}
        onOpenChange={(open) => setConfirmCourse(open ? confirmCourse : null)}
        title="Remover artigos por enviar?"
        description="Os artigos ja enviados para a cozinha mantem-se na conta."
        confirmLabel="Remover"
        onConfirm={() => {
          if (confirmCourse !== null) removeCourse(confirmCourse);
          setConfirmCourse(null);
        }}
      />
    </div>
  );
}

interface CheckRowProps {
  item: OrderItemDto;
  actions: OrderActions;
  editable: boolean;
}

function CheckRow({ item, actions, editable }: CheckRowProps) {
  const details = [modifierLine(item), item.note ?? ''].filter(Boolean).join(' - ');

  return (
    <li className={cn('px-4 py-3', !editable && 'bg-card/40')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium', editable ? 'text-foreground' : 'text-muted-foreground')}>
            {item.quantity !== 1 && <span className="tabular mr-1.5">{formatQuantity(item.quantity)}</span>}
            {item.name}
          </p>
          {details && <p className="mt-0.5 truncate text-xs text-muted-foreground">{details}</p>}
          {item.seat !== null && (
            <Badge variant="outline" size="sm" className="mt-1.5">
              Lugar {item.seat}
            </Badge>
          )}
        </div>
        <span
          className={cn(
            'tabular shrink-0 text-sm font-semibold',
            editable ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {amount(item.totalMinor)}
        </span>
      </div>

      {editable && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <QuantityStepper
            size="sm"
            value={item.quantity}
            min={1}
            max={999}
            onChange={(value) => actions.updateItem.mutate({ itemId: item.id, patch: { quantity: value } })}
            aria-label={`Quantidade de ${item.name}`}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remover ${item.name}`}
            onClick={() => actions.removeItem.mutate(item.id)}
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      )}
    </li>
  );
}

export default CheckItems;
