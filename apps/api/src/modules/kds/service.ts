import { Prisma } from '@prisma/client';
import { SOCKET_EVENTS, type OrderItemStatus, type TicketStatus } from '@pos/shared';

import { ApiError } from '../../lib/http.js';
import { prisma, TX_OPTIONS, type Tx } from '../../lib/prisma.js';
import { emitToEntity, emitToKds, emitToRole } from '../../lib/realtime.js';
import { toTicketDto, ticketSelect, type KdsTicketDto, type TicketRow } from './mappers.js';
import type { KdsItemStatus } from './schemas.js';

/**
 * The kitchen side of a table order.
 *
 * A ticket is a slice of one order: the lines of a single course that belong to
 * a single prep station. The order is "ready" only when every one of its
 * tickets is - which is why each transition here ends with syncOrderStatus().
 */

/** Tickets the kitchen still has to work on. */
export const ACTIVE_TICKET_STATUSES: TicketStatus[] = ['new', 'in_progress'];

/** Orders past this point are settled; the kitchen must not move them. */
const CLOSED_ORDER_STATUSES = new Set<string>(['paid', 'cancelled']);

/** Lines that have not been picked up yet. */
const PENDING_ITEM_STATUSES: OrderItemStatus[] = ['unsent', 'held', 'sent'];

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  tableId: string | null;
  tableName: string | null;
  serverName: string | null;
}

export interface TicketMutation {
  ticket: KdsTicketDto;
  order: OrderSummary;
  /** The whole order just turned ready - the waiter must be called. */
  orderBecameReady: boolean;
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

export async function loadTicket(
  client: Tx,
  entityId: string,
  ticketId: string,
): Promise<TicketRow> {
  const ticket = await client.kitchenTicket.findFirst({
    where: { id: ticketId, entityId },
    select: ticketSelect,
  });
  if (!ticket) throw ApiError.notFound('Ticket nao encontrado.');
  return ticket;
}

function assertMovable(ticket: TicketRow): void {
  if (ticket.status === 'cancelled') {
    throw ApiError.conflict('Este ticket foi anulado.');
  }
}

/* -------------------------------------------------------------------------- */
/* Status maths                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Derives a ticket's status from its lines, for stations that plate dish by
 * dish: all served -> served, all ready -> ready, anything started -> in
 * progress. A ticket with no live lines keeps the status it already had.
 */
export function recomputeTicketStatus(
  items: Array<{ status: string }>,
  current: TicketStatus,
): TicketStatus {
  const live = items.filter((item) => item.status !== 'cancelled');
  if (live.length === 0) return current;

  if (live.every((item) => item.status === 'served')) return 'served';
  if (live.every((item) => item.status === 'ready' || item.status === 'served')) return 'ready';
  if (live.some((item) => ['in_progress', 'ready', 'served'].includes(item.status))) {
    return 'in_progress';
  }
  return 'new';
}

/** Timestamps that go with a ticket status. Never rewrites an honest stamp. */
function ticketTimestamps(
  ticket: Pick<TicketRow, 'startedAt' | 'readyAt' | 'servedAt'>,
  next: TicketStatus,
  now: Date,
): Prisma.KitchenTicketUncheckedUpdateInput {
  switch (next) {
    case 'new':
      return { status: next, startedAt: null, readyAt: null, servedAt: null };
    case 'in_progress':
      return { status: next, startedAt: ticket.startedAt ?? now, readyAt: null, servedAt: null };
    case 'ready':
      return {
        status: next,
        startedAt: ticket.startedAt ?? now,
        readyAt: ticket.readyAt ?? now,
        servedAt: null,
      };
    case 'served':
      return {
        status: next,
        startedAt: ticket.startedAt ?? now,
        readyAt: ticket.readyAt ?? now,
        servedAt: ticket.servedAt ?? now,
      };
    default:
      return { status: next };
  }
}

/* -------------------------------------------------------------------------- */
/* Order rollup                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Pulls the order's status up (or back) from the state of all its tickets.
 * Paid and cancelled orders are left strictly alone.
 */
async function syncOrderStatus(
  tx: Tx,
  orderId: string,
): Promise<{ order: OrderSummary; becameReady: boolean }> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      tableId: true,
      serverName: true,
      table: { select: { name: true } },
    },
  });
  if (!order) throw ApiError.notFound('Comanda nao encontrada.');

  const tickets = await tx.kitchenTicket.findMany({
    where: { orderId },
    select: { status: true },
  });
  const live = tickets.filter((ticket) => ticket.status !== 'cancelled');

  let next = order.status;
  if (!CLOSED_ORDER_STATUSES.has(order.status) && live.length > 0) {
    if (live.every((ticket) => ticket.status === 'served')) {
      next = 'served';
    } else if (live.every((ticket) => ticket.status === 'ready' || ticket.status === 'served')) {
      next = 'ready';
    } else if (order.status === 'ready' || order.status === 'served') {
      // A recall drops the order back to "sent": it is cooking again.
      next = 'sent';
    }
  }

  if (next !== order.status) {
    await tx.order.update({ where: { id: order.id }, data: { status: next } });
  }

  return {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: next,
      tableId: order.tableId,
      tableName: order.table?.name ?? null,
      serverName: order.serverName,
    },
    becameReady: next === 'ready' && order.status !== 'ready',
  };
}

/* -------------------------------------------------------------------------- */
/* Realtime                                                                    */
/* -------------------------------------------------------------------------- */

function orderEventPayload(entityId: string, result: TicketMutation) {
  return {
    entityId,
    orderId: result.order.id,
    orderNumber: result.order.orderNumber,
    status: result.order.status,
    tableId: result.order.tableId,
    tableName: result.order.tableName,
    ticketId: result.ticket.id,
    ticketStatus: result.ticket.status,
    station: result.ticket.station,
    source: 'kds' as const,
  };
}

/**
 * Every mutation lands on three surfaces: the station screen, the pass, and the
 * waiter's check panel. Called AFTER the transaction has committed.
 */
export function publishTicketMutation(entityId: string, result: TicketMutation): void {
  emitToKds(entityId, result.ticket.station, SOCKET_EVENTS.TICKET_UPDATED, result.ticket);
  emitToEntity(entityId, SOCKET_EVENTS.ORDER_UPDATED, orderEventPayload(entityId, result));

  if (!result.orderBecameReady) return;

  const readyPayload = {
    entityId,
    orderId: result.order.id,
    orderNumber: result.order.orderNumber,
    tableId: result.order.tableId,
    tableName: result.order.tableName,
    serverName: result.order.serverName ?? result.ticket.serverName,
    ticketId: result.ticket.id,
    station: result.ticket.station,
    readyAt: result.ticket.readyAt,
    ticket: result.ticket,
  };

  emitToEntity(entityId, SOCKET_EVENTS.TICKET_READY, readyPayload);
  // The floor tablet sounds its alert off this one.
  emitToRole(entityId, 'waiter', SOCKET_EVENTS.TICKET_READY, readyPayload);
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                 */
/* -------------------------------------------------------------------------- */

async function finish(
  tx: Tx,
  entityId: string,
  ticketId: string,
  now: Date,
): Promise<TicketMutation> {
  const fresh = await loadTicket(tx, entityId, ticketId);
  const { order, becameReady } = await syncOrderStatus(tx, fresh.orderId);
  return { ticket: toTicketDto(fresh, now), order, orderBecameReady: becameReady };
}

/** 'new' -> 'in_progress'. The kitchen picked the ticket up. */
export async function startTicket(entityId: string, ticketId: string): Promise<TicketMutation> {
  return prisma.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, entityId, ticketId);
    assertMovable(ticket);
    if (ticket.status === 'served') throw ApiError.conflict('Este ticket ja foi entregue.');

    const now = new Date();
    await tx.kitchenTicket.update({
      where: { id: ticket.id },
      data: ticketTimestamps(ticket, 'in_progress', now),
    });
    await tx.orderItem.updateMany({
      where: { ticketId: ticket.id, status: { in: PENDING_ITEM_STATUSES } },
      data: { status: 'in_progress', readyAt: null, servedAt: null },
    });

    return finish(tx, entityId, ticket.id, now);
  }, TX_OPTIONS);
}

/** -> 'ready'. The food is on the pass. */
export async function readyTicket(entityId: string, ticketId: string): Promise<TicketMutation> {
  return prisma.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, entityId, ticketId);
    assertMovable(ticket);
    if (ticket.status === 'served') throw ApiError.conflict('Este ticket ja foi entregue.');

    const now = new Date();
    await tx.kitchenTicket.update({
      where: { id: ticket.id },
      data: ticketTimestamps(ticket, 'ready', now),
    });
    await tx.orderItem.updateMany({
      where: {
        ticketId: ticket.id,
        status: { in: [...PENDING_ITEM_STATUSES, 'in_progress'] },
      },
      data: { status: 'ready', readyAt: now, servedAt: null },
    });

    return finish(tx, entityId, ticket.id, now);
  }, TX_OPTIONS);
}

/** -> 'served'. The waiter took it to the table. */
export async function serveTicket(entityId: string, ticketId: string): Promise<TicketMutation> {
  return prisma.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, entityId, ticketId);
    assertMovable(ticket);

    const now = new Date();
    await tx.kitchenTicket.update({
      where: { id: ticket.id },
      data: ticketTimestamps(ticket, 'served', now),
    });
    await tx.orderItem.updateMany({
      where: {
        ticketId: ticket.id,
        status: { in: [...PENDING_ITEM_STATUSES, 'in_progress', 'ready'] },
      },
      data: { status: 'served', servedAt: now },
    });

    return finish(tx, entityId, ticket.id, now);
  }, TX_OPTIONS);
}

/** 'ready' -> 'in_progress'. The kitchen tapped ready too early. */
export async function recallTicket(entityId: string, ticketId: string): Promise<TicketMutation> {
  return prisma.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, entityId, ticketId);
    assertMovable(ticket);
    if (ticket.status !== 'ready') {
      throw ApiError.conflict('So e possivel recuperar um ticket que esteja pronto.');
    }

    const now = new Date();
    await tx.kitchenTicket.update({
      where: { id: ticket.id },
      data: ticketTimestamps(ticket, 'in_progress', now),
    });
    await tx.orderItem.updateMany({
      where: { ticketId: ticket.id, status: 'ready' },
      data: { status: 'in_progress', readyAt: null, servedAt: null },
    });

    return finish(tx, entityId, ticket.id, now);
  }, TX_OPTIONS);
}

/* -------------------------------------------------------------------------- */
/* Single line                                                                 */
/* -------------------------------------------------------------------------- */

export interface ItemMutation extends TicketMutation {
  itemId: string;
  itemStatus: KdsItemStatus;
}

/**
 * Advances ONE line. The parent ticket's status is then recomputed from all of
 * its lines, so plating dish by dish still rolls the ticket up correctly.
 */
export async function setItemStatus(
  entityId: string,
  itemId: string,
  status: KdsItemStatus,
): Promise<ItemMutation> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findFirst({
      where: { id: itemId, order: { entityId } },
      select: { id: true, orderId: true, ticketId: true, status: true, name: true },
    });
    if (!item) throw ApiError.notFound('Linha de pedido nao encontrada.');
    if (item.status === 'cancelled') throw ApiError.conflict('Esta linha foi anulada.');
    if (!item.ticketId) {
      throw ApiError.conflict('Esta linha ainda nao foi enviada para a cozinha.');
    }

    const now = new Date();
    const data: Prisma.OrderItemUncheckedUpdateInput = { status };
    if (status === 'ready') {
      data.readyAt = now;
      data.servedAt = null;
    } else if (status === 'served') {
      data.servedAt = now;
    } else {
      data.readyAt = null;
      data.servedAt = null;
    }
    await tx.orderItem.update({ where: { id: item.id }, data });

    const ticket = await loadTicket(tx, entityId, item.ticketId);
    const next = recomputeTicketStatus(ticket.items, ticket.status as TicketStatus);
    if (next !== ticket.status) {
      await tx.kitchenTicket.update({
        where: { id: ticket.id },
        data: ticketTimestamps(ticket, next, now),
      });
    }

    const result = await finish(tx, entityId, ticket.id, now);
    return { ...result, itemId: item.id, itemStatus: status };
  }, TX_OPTIONS);
}

/* -------------------------------------------------------------------------- */
/* Availability ("86")                                                         */
/* -------------------------------------------------------------------------- */

export interface AvailabilityResult {
  productId: string;
  name: string;
  available: boolean;
  changed: boolean;
  prepStation: string | null;
}

/**
 * "86 an item": the kitchen ran out. Marks the PRODUCT unavailable for the rest
 * of service so every waiter tablet greys the tile out. Stock is untouched -
 * this is a service decision, not a count, so no StockMovement is written.
 */
export async function setProductAvailability(
  entityId: string,
  pathId: string,
  input: { productId?: string; available: boolean },
): Promise<AvailabilityResult> {
  let productId = input.productId ?? null;

  if (!productId) {
    const item = await prisma.orderItem.findFirst({
      where: { id: pathId, order: { entityId } },
      select: { productId: true },
    });
    // No line with that id? Then the caller put the product id in the path.
    productId = item?.productId ?? pathId;
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, entityId, deletedAt: null },
    select: { id: true, namePt: true, available: true, prepStation: true },
  });
  if (!product) throw ApiError.notFound('Produto nao encontrado.');

  const changed = product.available !== input.available;
  if (changed) {
    await prisma.product.update({
      where: { id: product.id },
      data: { available: input.available },
    });
  }

  return {
    productId: product.id,
    name: product.namePt,
    available: input.available,
    changed,
    prepStation: product.prepStation,
  };
}

export function publishAvailability(
  entityId: string,
  result: AvailabilityResult,
  note?: string | null,
): void {
  emitToEntity(entityId, SOCKET_EVENTS.ORDER_UPDATED, {
    entityId,
    type: 'product_availability' as const,
    productId: result.productId,
    name: result.name,
    available: result.available,
    prepStation: result.prepStation,
    note: note ?? null,
    source: 'kds' as const,
  });
}
