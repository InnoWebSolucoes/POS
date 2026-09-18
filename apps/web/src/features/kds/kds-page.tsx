import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { PREP_STATIONS, SOCKET_EVENTS } from '@pos/shared';

import { ConfirmDialog } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { connectSocket, getSocket } from '@/lib/socket';
import { alertChime, unlockAudio } from '@/lib/sound';
import { useTheme } from '@/lib/theme';
import { useSocketEvent, useSocketStatus } from '@/hooks/use-socket';

import { KdsHeader } from './kds-header';
import { TicketBoard } from './ticket-board';
import {
  isOnBoard,
  nextItemStatus,
  sortBoard,
  toBoardEntry,
  type BoardEntry,
  type KdsTicket,
  type KdsTicketItem,
  type StationFilter,
} from './kds-types';
import {
  invalidateBoard,
  useEightySix,
  useItemStatus,
  useKdsStations,
  useKdsSummary,
  useKdsThresholds,
  useKdsTickets,
  useTicketAction,
  type TicketAction,
} from './use-kds';

/**
 * The kitchen display.
 *
 * Mounted bare by App.tsx, so it owns the whole viewport and switches the theme
 * surface to 'kds' (near-black, oversized type) for as long as it is on screen.
 * Sockets drive the board; a 15s poll is the safety net, because a kitchen
 * screen that silently goes stale is worse than one that flickers.
 */

const STATION_STORAGE_KEY = 'pos.kds.station';
const NEW_HIGHLIGHT_MS = 8_000;
const REFRESH_DEBOUNCE_MS = 600;

function storedStation(): StationFilter {
  try {
    const saved = localStorage.getItem(STATION_STORAGE_KEY);
    if (saved && (PREP_STATIONS as readonly string[]).includes(saved)) {
      return saved as StationFilter;
    }
  } catch {
    /* a locked-down browser must not stop the kitchen working */
  }
  return 'all';
}

export default function KdsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canAct = useAuth((state) => state.can('restaurant:kds'));
  const { connected } = useSocketStatus();

  const [station, setStation] = useState<StationFilter>(storedStation);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [newTicketIds, setNewTicketIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [pendingTicketIds, setPendingTicketIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [eightySixTarget, setEightySixTarget] = useState<KdsTicketItem | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const thresholds = useKdsThresholds();
  const tickets = useKdsTickets(station);
  const stations = useKdsStations();
  const summary = useKdsSummary(station);

  const ticketAction = useTicketAction();
  const itemStatus = useItemStatus();
  const eightySix = useEightySix();

  const timers = useRef<number[]>([]);
  const refreshTimer = useRef<number | null>(null);

  /* ---------------------------------------------------------------- surface */

  useEffect(() => {
    const previous = useTheme.getState().surface;
    useTheme.getState().setSurface('kds');
    return () => useTheme.getState().setSurface(previous);
  }, []);

  /* ------------------------------------------------------- the local clock */

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    },
    [],
  );

  /* ------------------------------------------------------------ fullscreen */

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }, []);

  /* --------------------------------------------------- realtime membership */

  useEffect(() => {
    const socket = getSocket() ?? connectSocket();
    // The base KDS room receives every station, so one subscription is enough -
    // and it has to be renewed on reconnect, because rooms die with the socket.
    const join = () => socket.emit('kds:subscribe', null);
    join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('kds:unsubscribe', null);
    };
  }, []);

  /* ------------------------------------------------------------ board state */

  const matchesStation = useCallback(
    (ticket: KdsTicket) => station === 'all' || ticket.station === station,
    [station],
  );

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      invalidateBoard(queryClient);
    }, REFRESH_DEBOUNCE_MS);
  }, [queryClient]);

  const ticketData = tickets.data;
  const ticketsUpdatedAt = tickets.dataUpdatedAt;

  useEffect(() => {
    if (!ticketData) return;
    const at = ticketsUpdatedAt || Date.now();
    setEntries(sortBoard(ticketData.filter(isOnBoard).map((ticket) => toBoardEntry(ticket, at))));
  }, [ticketData, ticketsUpdatedAt]);

  const flagAsNew = useCallback((ticketId: string) => {
    setNewTicketIds((prev) => new Set(prev).add(ticketId));
    const id = window.setTimeout(() => {
      setNewTicketIds((prev) => {
        if (!prev.has(ticketId)) return prev;
        const next = new Set(prev);
        next.delete(ticketId);
        return next;
      });
    }, NEW_HIGHLIGHT_MS);
    timers.current.push(id);
  }, []);

  useSocketEvent<KdsTicket>(SOCKET_EVENTS.TICKET_CREATED, (ticket) => {
    if (!ticket?.id) return;
    scheduleRefresh();
    if (!matchesStation(ticket) || !isOnBoard(ticket)) return;

    const at = Date.now();
    setEntries((prev) => {
      if (prev.some((entry) => entry.ticket.id === ticket.id)) return prev;
      // Oldest first, so an arriving ticket lands at the end and never shoves a
      // card out from under someone's hand.
      return sortBoard([...prev, toBoardEntry(ticket, at)]);
    });
    flagAsNew(ticket.id);
    alertChime();
  });

  useSocketEvent<KdsTicket>(SOCKET_EVENTS.TICKET_UPDATED, (ticket) => {
    if (!ticket?.id) return;
    scheduleRefresh();

    const at = Date.now();
    setEntries((prev) => {
      const index = prev.findIndex((entry) => entry.ticket.id === ticket.id);
      if (!isOnBoard(ticket) || !matchesStation(ticket)) {
        return index === -1 ? prev : prev.filter((_, position) => position !== index);
      }
      if (index === -1) return sortBoard([...prev, toBoardEntry(ticket, at)]);
      const next = [...prev];
      next[index] = toBoardEntry(ticket, at);
      return next;
    });
  });

  useSocketEvent(SOCKET_EVENTS.ORDER_UPDATED, () => scheduleRefresh());

  /* --------------------------------------------------------------- actions */

  const markPending = useCallback((ticketId: string, busy: boolean) => {
    setPendingTicketIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(ticketId);
      else next.delete(ticketId);
      return next;
    });
  }, []);

  const handleAction = useCallback(
    (ticketId: string, action: TicketAction) => {
      if (!canAct) return;
      markPending(ticketId, true);
      ticketAction.mutate(
        { ticketId, action },
        {
          onSuccess: () => {
            if (action === 'served') {
              setEntries((prev) => prev.filter((entry) => entry.ticket.id !== ticketId));
            }
          },
          onSettled: () => markPending(ticketId, false),
        },
      );
    },
    [canAct, markPending, ticketAction],
  );

  const handleAdvanceItem = useCallback(
    (ticketId: string, item: KdsTicketItem) => {
      if (!canAct) return;
      const next = nextItemStatus(item.status);
      if (!next) return;

      // Paint it immediately; the refetch that follows is the source of truth.
      setEntries((prev) =>
        prev.map((entry) =>
          entry.ticket.id !== ticketId
            ? entry
            : {
                ...entry,
                ticket: {
                  ...entry.ticket,
                  items: entry.ticket.items.map((line) =>
                    line.id === item.id ? { ...line, status: next } : line,
                  ),
                },
              },
        ),
      );

      markPending(ticketId, true);
      itemStatus.mutate(
        { itemId: item.id, status: next },
        { onSettled: () => markPending(ticketId, false) },
      );
    },
    [canAct, itemStatus, markPending],
  );

  const confirmEightySix = useCallback(() => {
    if (!eightySixTarget) return;
    eightySix.mutate({ itemId: eightySixTarget.id, name: eightySixTarget.name });
    setEightySixTarget(null);
  }, [eightySix, eightySixTarget]);

  const refresh = useCallback(() => {
    invalidateBoard(queryClient);
  }, [queryClient]);

  const handleStationChange = useCallback((value: StationFilter) => {
    setStation(value);
    try {
      localStorage.setItem(STATION_STORAGE_KEY, value);
    } catch {
      /* not worth failing a shift over */
    }
  }, []);

  const refreshing = tickets.isFetching || stations.isFetching || summary.isFetching;
  const summaryBaseMs = useMemo(() => summary.dataUpdatedAt || Date.now(), [summary.dataUpdatedAt]);

  return (
    <div
      className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground"
      onPointerDown={() => unlockAudio()}
    >
      <KdsHeader
        station={station}
        onStationChange={handleStationChange}
        stations={stations.data}
        stationsLoading={stations.isLoading}
        summary={summary.data}
        summaryBaseMs={summaryBaseMs}
        nowMs={nowMs}
        thresholds={thresholds}
        connected={connected}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      <main className="flex-1 overflow-y-auto p-4">
        <TicketBoard
          entries={entries}
          nowMs={nowMs}
          thresholds={thresholds}
          canAct={canAct}
          newTicketIds={newTicketIds}
          pendingTicketIds={pendingTicketIds}
          isLoading={tickets.isLoading}
          isError={tickets.isError}
          onRetry={() => void tickets.refetch()}
          onAction={handleAction}
          onAdvanceItem={handleAdvanceItem}
          onEightySix={setEightySixTarget}
        />
      </main>

      <ConfirmDialog
        open={eightySixTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEightySixTarget(null);
        }}
        title={t('kds.eightySixTitle', 'Marcar em falta?')}
        description={
          eightySixTarget
            ? t('kds.eightySixHint', {
                defaultValue:
                  '"{{name}}" deixa de aparecer no tablet de todos os empregados ate ao fim do servico.',
                name: eightySixTarget.name,
              })
            : undefined
        }
        confirmLabel={t('kds.eightySixConfirm', 'Sim, marcar em falta')}
        cancelLabel={t('common.cancel', 'Cancelar')}
        variant="destructive"
        onConfirm={confirmEightySix}
      />
    </div>
  );
}
