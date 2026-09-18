import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { PREP_STATIONS, type EntitySettings, type PrepStation } from '@pos/shared';

import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { qk } from '@/lib/query';
import { errorBeep, successChime } from '@/lib/sound';
import { toast } from '@/components/ui';

import type {
  AgeThresholds,
  KdsStationsResponse,
  KdsSummary,
  KdsTicket,
  StationFilter,
} from './kds-types';

/**
 * Server state for the kitchen display.
 *
 * Every key hangs off qk.tickets(station), so one invalidation pass reaches the
 * board, its summary counters and the station tabs at once. Polling is a safety
 * net: a screen that silently goes stale is worse than one that flickers.
 */

/** Defaults mirror apps/api/src/lib/settings.ts, for roles without settings:read. */
const DEFAULT_WARN_MINUTES = 8;
const DEFAULT_ALERT_MINUTES = 15;

export const BOARD_POLL_MS = 15_000;

function stationParam(station: StationFilter): PrepStation | null {
  return station === 'all' ? null : station;
}

function summaryKey(station: StationFilter) {
  return [...qk.tickets(stationParam(station)), 'summary'] as const;
}

function stationsKey() {
  return [...qk.tickets(null), 'stations'] as const;
}

/** Touches every board key, whichever station tab happens to be open. */
export function invalidateBoard(client: QueryClient): void {
  for (const station of [null, ...PREP_STATIONS]) {
    void client.invalidateQueries({ queryKey: qk.tickets(station) });
  }
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

export function useKdsTickets(station: StationFilter) {
  return useQuery({
    queryKey: qk.tickets(stationParam(station)),
    queryFn: () =>
      api.get<{ data: KdsTicket[] }>('/api/kds/tickets', {
        station: stationParam(station) ?? undefined,
        status: 'new,in_progress,ready',
        limit: 200,
      }),
    select: (response) => response.data,
    refetchInterval: BOARD_POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}

export function useKdsStations() {
  return useQuery({
    queryKey: stationsKey(),
    queryFn: () => api.get<KdsStationsResponse>('/api/kds/stations'),
    refetchInterval: BOARD_POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}

export function useKdsSummary(station: StationFilter) {
  return useQuery({
    queryKey: summaryKey(station),
    queryFn: () =>
      api.get<{ data: KdsSummary }>('/api/kds/summary', {
        station: stationParam(station) ?? undefined,
      }),
    select: (response) => response.data,
    refetchInterval: BOARD_POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}

/**
 * Colour thresholds. A kitchen login only carries restaurant:kds, so the
 * settings call is skipped entirely for them and the defaults stand in.
 */
export function useKdsThresholds(): AgeThresholds {
  const canReadSettings = useAuth((state) => state.can('settings:read'));

  const { data } = useQuery({
    queryKey: qk.settings(),
    queryFn: () => api.get<{ settings: EntitySettings }>('/api/settings'),
    select: (response) => response.settings,
    enabled: canReadSettings,
    staleTime: 10 * 60_000,
    refetchInterval: false,
  });

  const warnMinutes = data?.kdsWarnAfterMinutes ?? DEFAULT_WARN_MINUTES;
  const alertMinutes = data?.kdsAlertAfterMinutes ?? DEFAULT_ALERT_MINUTES;

  return {
    warnSeconds: Math.max(1, warnMinutes) * 60,
    alertSeconds: Math.max(warnMinutes + 1, alertMinutes) * 60,
  };
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

export type TicketAction = 'start' | 'ready' | 'served' | 'recall';

function failed(error: unknown, fallback: string): void {
  errorBeep();
  const message = error instanceof ApiRequestError ? error.message : fallback;
  toast.error(fallback, message);
}

export function useTicketAction() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketId, action }: { ticketId: string; action: TicketAction }) =>
      api.post<{ data: KdsTicket }>(`/api/kds/tickets/${ticketId}/${action}`),
    onSuccess: (_result, variables) => {
      if (variables.action === 'ready') successChime();
      invalidateBoard(client);
    },
    onError: (error) => failed(error, 'Nao foi possivel actualizar o pedido.'),
  });
}

export function useItemStatus() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      itemId,
      status,
    }: {
      itemId: string;
      status: 'sent' | 'in_progress' | 'ready' | 'served';
    }) => api.post<{ data: KdsTicket }>(`/api/kds/items/${itemId}/status`, { status }),
    onSuccess: () => invalidateBoard(client),
    onError: (error) => failed(error, 'Nao foi possivel actualizar a linha.'),
  });
}

export interface EightySixResult {
  productId: string;
  name: string;
  available: boolean;
  changed: boolean;
}

/** Kills a dish for the rest of service, on every waiter tablet at once. */
export function useEightySix() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId }: { itemId: string; name: string }) =>
      api.post<{ data: EightySixResult }>(`/api/kds/items/${itemId}/86`, { available: false }),
    onSuccess: (response) => {
      successChime();
      toast.warning(
        'Produto em falta',
        `${response.data.name} deixou de estar disponivel nesta sessao.`,
      );
      invalidateBoard(client);
      void client.invalidateQueries({ queryKey: qk.menu() });
    },
    onError: (error) => failed(error, 'Nao foi possivel marcar o produto em falta.'),
  });
}
