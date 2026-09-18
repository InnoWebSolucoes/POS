import { Prisma } from '@prisma/client';
import type {
  CartModifier,
  FloorAreaDto,
  KitchenTicketDto,
  OrderDto,
  OrderItemDto,
  OrderItemStatus,
  OrderStatus,
  PrepStation,
  RestaurantTableDto,
  TableShape,
  TableStatus,
  TicketStatus,
} from '@pos/shared';

/* -------------------------------------------------------------------------- */
/* Selects                                                                     */
/* -------------------------------------------------------------------------- */

export const tableSelect = {
  id: true,
  entityId: true,
  areaId: true,
  name: true,
  shape: true,
  x: true,
  y: true,
  width: true,
  height: true,
  rotation: true,
  seats: true,
  status: true,
  mergedIntoId: true,
  activeOrderId: true,
  active: true,
} satisfies Prisma.RestaurantTableSelect;

export type TableRow = Prisma.RestaurantTableGetPayload<{ select: typeof tableSelect }>;

export const areaSelect = {
  id: true,
  entityId: true,
  name: true,
  sortOrder: true,
  backgroundUrl: true,
  width: true,
  height: true,
} satisfies Prisma.FloorAreaSelect;

export type AreaRow = Prisma.FloorAreaGetPayload<{ select: typeof areaSelect }>;

export const orderItemSelect = {
  id: true,
  orderId: true,
  productId: true,
  name: true,
  quantity: true,
  unitPriceMinor: true,
  unitCostMinor: true,
  taxRateBps: true,
  discountMinor: true,
  totalMinor: true,
  status: true,
  course: true,
  seat: true,
  prepStation: true,
  note: true,
  modifiers: true,
  ticketId: true,
  sentAt: true,
  readyAt: true,
  servedAt: true,
  createdAt: true,
} satisfies Prisma.OrderItemSelect;

export type OrderItemRow = Prisma.OrderItemGetPayload<{ select: typeof orderItemSelect }>;

export const orderSelect = {
  id: true,
  entityId: true,
  tableId: true,
  orderNumber: true,
  status: true,
  serverId: true,
  serverName: true,
  guestCount: true,
  note: true,
  subtotalMinor: true,
  discountMinor: true,
  taxMinor: true,
  serviceChargeMinor: true,
  tipMinor: true,
  totalMinor: true,
  openedAt: true,
  closedAt: true,
  table: { select: { id: true, name: true } },
  items: {
    select: orderItemSelect,
    orderBy: [{ course: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.OrderSelect;

export type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

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
  order: { select: { orderNumber: true } },
  items: { select: orderItemSelect, orderBy: [{ createdAt: 'asc' }] },
} satisfies Prisma.KitchenTicketSelect;

export type TicketRow = Prisma.KitchenTicketGetPayload<{ select: typeof ticketSelect }>;

/* -------------------------------------------------------------------------- */
/* Modifier JSON                                                               */
/* -------------------------------------------------------------------------- */

/** OrderItem.modifiers is a JSON string column; never trust its contents. */
export function parseModifiers(raw: string | null | undefined): CartModifier[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
      .map((m) => ({
        modifierId: String(m.modifierId ?? ''),
        name: String(m.name ?? ''),
        priceDeltaMinor: Number(m.priceDeltaMinor ?? 0) || 0,
      }))
      .filter((m) => m.modifierId.length > 0);
  } catch {
    return [];
  }
}

export function serializeModifiers(modifiers: CartModifier[]): string {
  return JSON.stringify(modifiers);
}

/* -------------------------------------------------------------------------- */
/* DTOs                                                                        */
/* -------------------------------------------------------------------------- */

export interface TableRollup {
  activeOrderId: string | null;
  orderTotalMinor: number;
  openedAt: string | null;
  serverName: string | null;
  guestCount: number | null;
}

export function toTableDto(row: TableRow, rollup?: TableRollup | null): RestaurantTableDto {
  return {
    id: row.id,
    entityId: row.entityId,
    areaId: row.areaId,
    name: row.name,
    shape: row.shape as TableShape,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    seats: row.seats,
    status: row.status as TableStatus,
    mergedIntoId: row.mergedIntoId,
    activeOrderId: rollup?.activeOrderId ?? row.activeOrderId,
    orderTotalMinor: rollup?.orderTotalMinor ?? 0,
    openedAt: rollup?.openedAt ?? null,
    serverName: rollup?.serverName ?? null,
    guestCount: rollup?.guestCount ?? null,
  };
}

export function toAreaDto(row: AreaRow, tables: RestaurantTableDto[]): FloorAreaDto {
  return {
    id: row.id,
    entityId: row.entityId,
    name: row.name,
    sortOrder: row.sortOrder,
    backgroundUrl: row.backgroundUrl,
    width: row.width,
    height: row.height,
    tables,
  };
}

export function toOrderItemDto(row: OrderItemRow): OrderItemDto {
  return {
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    name: row.name,
    quantity: row.quantity,
    unitPriceMinor: Number(row.unitPriceMinor),
    taxRateBps: row.taxRateBps,
    totalMinor: Number(row.totalMinor),
    status: row.status as OrderItemStatus,
    course: row.course,
    seat: row.seat,
    note: row.note,
    prepStation: (row.prepStation as PrepStation | null) ?? null,
    modifiers: parseModifiers(row.modifiers),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    readyAt: row.readyAt ? row.readyAt.toISOString() : null,
  };
}

/** Items that never reached the kitchen - still editable by the waiter. */
export const PENDING_ITEM_STATUSES: OrderItemStatus[] = ['unsent', 'held'];

export function toOrderDto(row: OrderRow): OrderDto {
  const items = row.items.map(toOrderItemDto);

  let sentTotalMinor = 0;
  let unsentTotalMinor = 0;
  for (const item of row.items) {
    if (item.status === 'cancelled') continue;
    const total = Number(item.totalMinor);
    if (PENDING_ITEM_STATUSES.includes(item.status as OrderItemStatus)) {
      unsentTotalMinor += total;
    } else {
      sentTotalMinor += total;
    }
  }

  return {
    id: row.id,
    entityId: row.entityId,
    tableId: row.tableId,
    tableName: row.table?.name ?? null,
    orderNumber: row.orderNumber,
    status: row.status as OrderStatus,
    serverId: row.serverId,
    serverName: row.serverName,
    guestCount: row.guestCount,
    items,
    subtotalMinor: Number(row.subtotalMinor),
    discountMinor: Number(row.discountMinor),
    taxMinor: Number(row.taxMinor),
    serviceChargeMinor: Number(row.serviceChargeMinor),
    totalMinor: Number(row.totalMinor),
    sentTotalMinor,
    unsentTotalMinor,
    note: row.note,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

export function toTicketDto(row: TicketRow, now = new Date()): KitchenTicketDto {
  return {
    id: row.id,
    entityId: row.entityId,
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber ?? '',
    tableName: row.tableName,
    station: (row.station as PrepStation | null) ?? null,
    status: row.status as TicketStatus,
    course: row.course,
    items: row.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      note: item.note,
      modifiers: parseModifiers(item.modifiers).map((m) => m.name),
      status: item.status as OrderItemStatus,
    })),
    serverName: row.serverName,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    readyAt: row.readyAt ? row.readyAt.toISOString() : null,
    ageSeconds: Math.max(0, Math.round((now.getTime() - row.createdAt.getTime()) / 1000)),
  };
}
