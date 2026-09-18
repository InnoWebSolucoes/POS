import {
  PREP_STATION_LABELS,
  type OrderItemStatus,
  type PrepStation,
  type TicketStatus,
} from '@pos/shared';

/**
 * The shapes GET /api/kds/* actually returns.
 *
 * The server maps tickets with apps/api/src/modules/kds/mappers.ts, which
 * returns a superset of KitchenTicketDto (ticket number, table id, served
 * stamp). Socket pushes come from the same mapper, so one type covers both -
 * but the fields the base DTO does not declare stay optional, because an older
 * producer may leave them out and a kitchen screen must never crash.
 */

export interface KdsTicketItem {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  modifiers: string[];
  status: OrderItemStatus;
  seat?: number | null;
}

export interface KdsTicket {
  id: string;
  entityId: string;
  orderId: string;
  orderNumber: string;
  ticketNumber?: string | null;
  tableId?: string | null;
  tableName: string | null;
  station: PrepStation | null;
  status: TicketStatus;
  course: number;
  items: KdsTicketItem[];
  serverName: string | null;
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  servedAt?: string | null;
  /** Measured server-side at the moment of the response. */
  ageSeconds: number;
}

export interface KdsStationBucket {
  station: PrepStation | null;
  labelPt: string;
  labelEn: string;
  /** Tickets still to cook (new + in progress). */
  ticketCount: number;
  /** Tickets sitting on the pass. */
  readyCount: number;
  itemCount: number;
  oldestAgeSeconds: number | null;
}

export interface KdsStationsResponse {
  data: KdsStationBucket[];
  unassigned: KdsStationBucket;
  totals: { ticketCount: number; readyCount: number; itemCount: number };
}

export interface KdsSummary {
  station: PrepStation | null;
  since: string;
  generatedAt: string;
  counts: Record<TicketStatus, number>;
  activeTickets: number;
  readyTickets: number;
  oldestAgeSeconds: number | null;
  oldest: {
    ticketId: string;
    orderNumber: string | null;
    station: PrepStation | null;
    status: TicketStatus;
    createdAt: string;
    ageSeconds: number | null;
  } | null;
}

/** "all" is the expo view: every station on one board. */
export type StationFilter = PrepStation | 'all';

/** What a ticket card looks like right now, and when its clock was zeroed. */
export interface BoardEntry {
  ticket: KdsTicket;
  /** Age reported by the server... */
  baseAgeSeconds: number;
  /** ...measured at this client timestamp, so the stopwatch can run locally. */
  baseAtMs: number;
}

export type AgeTier = 'normal' | 'warning' | 'alert';

export interface AgeThresholds {
  warnSeconds: number;
  alertSeconds: number;
}

export function ageTier(seconds: number, thresholds: AgeThresholds): AgeTier {
  if (seconds >= thresholds.alertSeconds) return 'alert';
  if (seconds >= thresholds.warnSeconds) return 'warning';
  return 'normal';
}

/** Live age of a ticket: server age plus the seconds since it arrived here. */
export function liveAgeSeconds(entry: BoardEntry, nowMs: number): number {
  return Math.max(0, entry.baseAgeSeconds + Math.floor((nowMs - entry.baseAtMs) / 1000));
}

export function toBoardEntry(ticket: KdsTicket, atMs: number): BoardEntry {
  return { ticket, baseAgeSeconds: ticket.ageSeconds ?? 0, baseAtMs: atMs };
}

/** Oldest first: the next thing to cook is always top-left. */
export function sortBoard(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => {
    const delta = Date.parse(a.ticket.createdAt) - Date.parse(b.ticket.createdAt);
    if (delta !== 0) return delta;
    return (a.ticket.ticketNumber ?? '').localeCompare(b.ticket.ticketNumber ?? '');
  });
}

/** Statuses that belong on the board. Served and cancelled leave it. */
export const BOARD_STATUSES: TicketStatus[] = ['new', 'in_progress', 'ready'];

export function isOnBoard(ticket: KdsTicket): boolean {
  return BOARD_STATUSES.includes(ticket.status);
}

/** The forward ladder for a single line. Null means "already done". */
export function nextItemStatus(
  status: OrderItemStatus,
): 'in_progress' | 'ready' | 'served' | null {
  switch (status) {
    case 'unsent':
    case 'held':
    case 'sent':
      return 'in_progress';
    case 'in_progress':
      return 'ready';
    case 'ready':
      return 'served';
    default:
      return null;
  }
}

/** "Sem cebola" is the line that gets missed - it has to look different. */
export function isRemoval(modifier: string): boolean {
  return /^(sem|s\/|no)\b/i.test(modifier.trim());
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

export function stationLabel(station: PrepStation | null, english: boolean): string {
  if (!station) return english ? 'Unassigned' : 'Sem posto';
  const label = PREP_STATION_LABELS[station];
  return english ? label.en : label.pt;
}

export function courseLabel(course: number, english: boolean): string {
  if (course <= 0) return english ? 'Immediate' : 'Imediato';
  return english ? `Course ${course}` : `Prato ${course}`;
}
