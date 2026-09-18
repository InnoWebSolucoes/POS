import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Combine,
  Receipt,
  Sparkles,
  Tag,
} from 'lucide-react';
import { TABLE_STATUSES, type RestaurantTableDto, type TableStatus } from '@pos/shared';

import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
} from '@/components/ui';
import { money } from '@/lib/format';
import { cn, contrastText } from '@/lib/utils';

import { statusColor } from './floor-utils';

type View = 'root' | 'status' | 'move' | 'merge';

export interface TableActionsDialogProps {
  table: RestaurantTableDto | null;
  /** Every table in the entity - move and merge can cross areas. */
  allTables: RestaurantTableDto[];
  labels: Record<TableStatus, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  canOrder: boolean;
  pending: boolean;
  onOpenCheck: (table: RestaurantTableDto) => void;
  onStatus: (table: RestaurantTableDto, status: TableStatus) => void;
  onMove: (table: RestaurantTableDto, toTableId: string) => void;
  onMerge: (table: RestaurantTableDto, intoTableId: string) => void;
}

function TargetList({
  tables,
  emptyTitle,
  emptyDescription,
  onPick,
  disabled,
}: {
  tables: RestaurantTableDto[];
  emptyTitle: string;
  emptyDescription: string;
  onPick: (id: string) => void;
  disabled: boolean;
}) {
  if (!tables.length) {
    return <EmptyState icon={Tag} title={emptyTitle} description={emptyDescription} size="sm" />;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {tables.map((target) => (
        <button
          key={target.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(target.id)}
          className={cn(
            'flex min-h-touch-lg flex-col items-start justify-center gap-1 rounded-xl border border-border',
            'bg-card px-3 py-2 text-left active:scale-[0.98] disabled:opacity-50',
          )}
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span className="truncate font-semibold">{target.name}</span>
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: statusColor(target.status) }}
            />
          </span>
          <span className="tabular text-xs text-muted-foreground">
            {target.seats} lug.
            {target.orderTotalMinor ? ` - ${money(target.orderTotalMinor)}` : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The long-press menu: change the status, move the check to another table,
 * join two tables, or clear a dirty one.
 */
export function TableActionsDialog({
  table,
  allTables,
  labels,
  open,
  onOpenChange,
  canManage,
  canOrder,
  pending,
  onOpenCheck,
  onStatus,
  onMove,
  onMerge,
}: TableActionsDialogProps) {
  const [view, setView] = useState<View>('root');

  useEffect(() => {
    if (open) setView('root');
  }, [open, table?.id]);

  if (!table) return null;

  const hasCheck = Boolean(table.activeOrderId) || table.status === 'occupied' || table.status === 'attention';
  const moveTargets = allTables.filter(
    (candidate) =>
      candidate.id !== table.id && !candidate.mergedIntoId && !candidate.activeOrderId && candidate.status !== 'occupied',
  );
  const mergeTargets = allTables.filter((candidate) => candidate.id !== table.id && !candidate.mergedIntoId);

  const title =
    view === 'status'
      ? 'Mudar estado'
      : view === 'move'
        ? 'Mudar de mesa'
        : view === 'merge'
          ? 'Juntar mesas'
          : `Mesa ${table.name}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {view !== 'root' && (
              <button
                type="button"
                aria-label="Voltar"
                className="inline-flex size-11 items-center justify-center rounded-lg border border-border bg-card"
                onClick={() => setView('root')}
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            {title}
          </DialogTitle>
          <DialogDescription>
            {view === 'root' ? (
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: statusColor(table.status), color: contrastText(statusColor(table.status)) }}
                >
                  {labels[table.status]}
                </span>
                <span className="tabular">{table.seats} lugares</span>
                {table.serverName ? <span>- {table.serverName}</span> : null}
                {table.orderTotalMinor ? (
                  <span className="tabular font-semibold text-foreground">{money(table.orderTotalMinor)}</span>
                ) : null}
              </span>
            ) : view === 'move' ? (
              'Escolha a mesa que recebe esta conta.'
            ) : view === 'merge' ? (
              'A conta desta mesa passa para a mesa escolhida.'
            ) : (
              'Escolha o novo estado da mesa.'
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          {view === 'root' && (
            <>
              {hasCheck && canOrder && (
                <Button
                  size="xl"
                  block
                  className="justify-start"
                  leftIcon={<Receipt />}
                  onClick={() => onOpenCheck(table)}
                >
                  Ver conta
                </Button>
              )}

              <Button
                size="xl"
                block
                variant="outline"
                className="justify-start"
                leftIcon={<Tag />}
                disabled={!canManage}
                onClick={() => setView('status')}
              >
                Mudar estado
              </Button>

              <Button
                size="xl"
                block
                variant="outline"
                className="justify-start"
                leftIcon={<ArrowRightLeft />}
                disabled={!canManage || !hasCheck}
                onClick={() => setView('move')}
              >
                Mudar de mesa
              </Button>

              <Button
                size="xl"
                block
                variant="outline"
                className="justify-start"
                leftIcon={<Combine />}
                disabled={!canManage}
                onClick={() => setView('merge')}
              >
                Juntar mesas
              </Button>

              <Button
                size="xl"
                block
                variant="success"
                className="justify-start"
                leftIcon={<Sparkles />}
                disabled={!canManage || pending}
                loading={pending}
                loadingLabel="A actualizar..."
                onClick={() => onStatus(table, 'available')}
              >
                Marcar como limpa
              </Button>

              {!canManage && (
                <p className="text-sm text-muted-foreground">
                  Sem permissao para gerir mesas. Peca a um responsavel.
                </p>
              )}
            </>
          )}

          {view === 'status' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TABLE_STATUSES.map((status) => {
                const color = statusColor(status);
                const active = table.status === status;
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={pending}
                    onClick={() => onStatus(table, status)}
                    className={cn(
                      'flex min-h-touch-lg items-center justify-center gap-2 rounded-xl border-2 px-3 py-2',
                      'text-base font-semibold active:scale-[0.98] disabled:opacity-50',
                      active ? 'border-foreground' : 'border-transparent',
                    )}
                    style={{ backgroundColor: color, color: contrastText(color) }}
                  >
                    {labels[status]}
                  </button>
                );
              })}
            </div>
          )}

          {view === 'move' && (
            <TargetList
              tables={moveTargets}
              disabled={pending}
              emptyTitle="Sem mesas livres"
              emptyDescription="Todas as outras mesas estao ocupadas ou unidas."
              onPick={(id) => onMove(table, id)}
            />
          )}

          {view === 'merge' && (
            <TargetList
              tables={mergeTargets}
              disabled={pending}
              emptyTitle="Sem mesas para juntar"
              emptyDescription="Nao ha outra mesa disponivel nesta sala."
              onPick={(id) => onMerge(table, id)}
            />
          )}
        </DialogBody>

        <DialogFooter>
          {table.mergedIntoId && view === 'root' && (
            <Badge variant="muted" className="mr-auto self-center">
              Unida a outra mesa
            </Badge>
          )}
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TableActionsDialog;
