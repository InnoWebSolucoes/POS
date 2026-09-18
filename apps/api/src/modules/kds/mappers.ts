import { Prisma } from '@prisma/client';
import {
  PREP_STATIONS,
  ORDER_ITEM_STATUSES,
  TICKET_STATUSES,
  type KitchenTicketDto,
  type OrderItemStatus,
  type PrepStation,
  type TicketStatus,
} from '@pos/shared';

import { round3 } from '../../lib/inventory.js';

/**
 * Shaping layer for the Kitchen Display System.
 *
 * The KDS never shows money: no prices, no cost, no margin. It shows what to
 * cook, for whom, and how long the ticket has been hanging - so the only
 * derived value here is `ageSeconds`. Colour thresholds live on the client
 * (settings.kdsWarnAfterMinutes / kdsAlertAfterMinutes); the server only
 * reports honest timestamps.
 */

/** Everything a kitchen screen needs for one ticket. */
export const ticketSelect = {
  id: true,
  entityId: true,
  orderId: true,
  ticketNumber: true,
  station: true,
  status: true,
  course: true,
  tableName: true,
  serverName: true,
  createdAt: true,
  startedAt: true,
  readyAt: true,
  servedAt: true,
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      tableId: true,
      serverName: true,
      table: { select: { name: true } },
    },
  },
  items: {
    // A voided line must disappear from the pass immediately.
    where: { status: { not: 'cancelled' } },
    select: {
      id: true,
      name: true,
      quantity: true,
      note: true,
      modifiers: true,
      status: true,
      seat: true,
      course: true,
    },
    orderBy: [{ course: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.KitchenTicketSelect;

export type TicketRow = Prisma.KitchenTicketGetPayload<{ select: typeof ticketSelect }>;

export interface KdsTicketItemDto {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  /** Flattened out of the OrderItem.modifiers JSON column - names only. */
  modifiers: string[];
  status: OrderItemStatus;
  seat: number | null;
}

/**
 * KitchenTicketDto plus the few extras a real kitchen screen wants
 * (ticket number on the rail, table id for the floor plan, served stamp).
 * It is a superset, so anything typed KitchenTicketDto still accepts it.
 */
export interface KdsTicketDto extends Omit<KitchenTicketDto, 'items'> {
  ticketNumber: string;
  tableId: string | null;
  servedAt: string | null;
  items: KdsTicketItemDto[];
}

const STATION_SET = new Set<string>(PREP_STATIONS);
const TICKET_STATUS_SET = new Set<string>(TICKET_STATUSES);
const ITEM_STATUS_SET = new Set<string>(ORDER_ITEM_STATUSES);

export function toStation(value: string | null | undefined): PrepStation | null {
  if (!value) return null;
  return STATION_SET.has(value) ? (value as PrepStation) : null;
}

export function toTicketStatus(value: string): TicketStatus {
  return TICKET_STATUS_SET.has(value) ? (value as TicketStatus) : 'new';
}

export function toItemStatus(value: string): OrderItemStatus {
  return ITEM_STATUS_SET.has(value) ? (value as OrderItemStatus) : 'sent';
}

/**
 * OrderItem.modifiers is a JSON string of [{ modifierId, name, priceDeltaMinor }].
 * The kitchen only cares about the names - a removal group is already worded
 * as "Sem cebola", so the stored name is exactly the line to print.
 */
export function parseModifiers(raw: string | null | undefined): string[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A hand-edited or legacy value must never take the board down.
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: string[] = [];
  for (const entry of parsed) {
    if (typeof entry === 'string') {
      const text = entry.trim();
      if (text) out.push(text);
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;

    const record = entry as Record<string, unknown>;
    const candidate = [record.name, record.namePt, record.nameEn, record.label].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    if (candidate) out.push(candidate.trim());
  }
  return out;
}

/** Seconds a ticket has been hanging. Never negative, even with clock skew. */
export function ageSeconds(createdAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 1000));
}

export function toTicketDto(row: TicketRow, now: Date = new Date()): KdsTicketDto {
  return {
    id: row.id,
    entityId: row.entityId,
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber ?? '',
    ticketNumber: row.ticketNumber,
    tableId: row.order?.tableId ?? null,
    tableName: row.tableName ?? row.order?.table?.name ?? null,
    station: toStation(row.station),
    status: toTicketStatus(row.status),
    course: row.course,
    items: row.items.map((item) => ({
      id: item.id,
      name: item.name,
      // Quantities are Float and may be fractional (0.350 kg of prawns).
      quantity: round3(item.quantity),
      note: item.note,
      modifiers: parseModifiers(item.modifiers),
      status: toItemStatus(item.status),
      seat: item.seat,
    })),
    serverName: row.serverName ?? row.order?.serverName ?? null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    readyAt: row.readyAt ? row.readyAt.toISOString() : null,
    servedAt: row.servedAt ? row.servedAt.toISOString() : null,
    ageSeconds: ageSeconds(row.createdAt, now),
  };
}
