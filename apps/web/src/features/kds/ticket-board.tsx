import { useTranslation } from 'react-i18next';
import { ChefHat, TriangleAlert } from 'lucide-react';

import { Button, EmptyState, Skeleton } from '@/components/ui';

import type { AgeThresholds, BoardEntry, KdsTicketItem } from './kds-types';
import { TicketCard } from './ticket-card';
import type { TicketAction } from './use-kds';

/**
 * The board itself: a horizontally-flowing column grid, oldest first, so the
 * next thing to cook is always top-left. Loading, empty and error each get a
 * full-size treatment - a blank kitchen screen is indistinguishable from a
 * broken one.
 */

export interface TicketBoardProps {
  entries: BoardEntry[];
  nowMs: number;
  thresholds: AgeThresholds;
  canAct: boolean;
  newTicketIds: ReadonlySet<string>;
  pendingTicketIds: ReadonlySet<string>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onAction: (ticketId: string, action: TicketAction) => void;
  onAdvanceItem: (ticketId: string, item: KdsTicketItem) => void;
  onEightySix: (item: KdsTicketItem) => void;
}

/*
 * items-start is deliberate. Grid rows stretch by default, so one twenty-line
 * banquet ticket made every other card in its row just as tall and parked their
 * "Iniciar" / "Marcar Pronto" buttons at the bottom of all that empty space,
 * off the screen. Each card now keeps its own height.
 */
const GRID = 'grid items-start gap-4 grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]';

export function TicketBoard({
  entries,
  nowMs,
  thresholds,
  canAct,
  newTicketIds,
  pendingTicketIds,
  isLoading,
  isError,
  onRetry,
  onAction,
  onAdvanceItem,
  onEightySix,
}: TicketBoardProps) {
  const { t } = useTranslation();

  if (isLoading && entries.length === 0) {
    return (
      <div className={GRID} aria-busy="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-xl border-4 border-border p-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError && entries.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2">
        <EmptyState
          icon={TriangleAlert}
          title={t('kds.loadError', 'Nao foi possivel carregar os pedidos')}
          description={t(
            'kds.loadErrorHint',
            'Verifique a ligacao ao servidor e tente novamente. O ecra volta a tentar sozinho.',
          )}
        />
        <Button size="xl" className="text-xl" onClick={onRetry}>
          {t('common.retry', 'Tentar novamente')}
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={ChefHat}
        title={t('kds.noTickets', 'Sem pedidos pendentes')}
        description={t('kds.noTicketsHint', 'Tudo despachado. Os novos pedidos aparecem aqui.')}
        className="min-h-[50vh]"
      />
    );
  }

  return (
    <div className={GRID}>
      {entries.map((entry) => (
        <TicketCard
          key={entry.ticket.id}
          entry={entry}
          nowMs={nowMs}
          thresholds={thresholds}
          canAct={canAct}
          busy={pendingTicketIds.has(entry.ticket.id)}
          isNew={newTicketIds.has(entry.ticket.id)}
          onAction={onAction}
          onAdvanceItem={(item) => onAdvanceItem(entry.ticket.id, item)}
          onEightySix={onEightySix}
        />
      ))}
    </div>
  );
}

export default TicketBoard;
