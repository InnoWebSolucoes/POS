import { Prisma } from '@prisma/client';
import {
  allocate,
  applyBps,
  computeLine,
  computeSale,
  splitEvenly,
  SOCKET_EVENTS,
  type CartModifier,
  type KitchenTicketDto,
  type OrderItemStatus,
  type OrderStatus,
  type PricingMode,
  type RestaurantTableDto,
  type OrderDto,
} from '@pos/shared';

import { ApiError } from '../../lib/http.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { emitToEntity, emitToKds } from '../../lib/realtime.js';
import { nextTicketNumber } from '../../lib/sequence.js';
import { getSettings } from '../../lib/settings.js';
import { round3 } from '../../lib/inventory.js';

import {
  orderSelect,
  parseModifiers,
  ticketSelect,
  toOrderDto,
  toTicketDto,
  type OrderItemRow,
  type OrderRow,
  type TicketRow,
} from './mappers.js';

/** Statuses in which an order still occupies its table. */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ['open', 'sent', 'ready', 'served'];

/** Item statuses that still count towards the bill. */
export function isLiveItem(status: string): boolean {
  return status !== 'cancelled';
}

/* -------------------------------------------------------------------------- */
/* Context                                                                     */
/* -------------------------------------------------------------------------- */

export interface OrderContext {
  entityId: string;
  pricingMode: PricingMode;
  currency: string;
  serviceChargeBps: number;
}

export async function loadOrderContext(
  entityId: string,
  client: Tx = prisma,
): Promise<OrderContext> {
  const entity = await client.entity.findFirst({
    where: { id: entityId, deletedAt: null },
    select: { pricingMode: true, currency: true },
  });
  if (!entity) throw ApiError.notFound('Entidade nao encontrada.');

  const settings = await getSettings(entityId, client);

  return {
    entityId,
    pricingMode: (entity.pricingMode === 'exclusive' ? 'exclusive' : 'inclusive') as PricingMode,
    currency: entity.currency,
    serviceChargeBps: Number(settings.serviceChargeBps) || 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

export async function findOrder(
  entityId: string,
  orderId: string,
  client: Tx = prisma,
): Promise<OrderRow | null> {
  return client.order.findFirst({ where: { id: orderId, entityId }, select: orderSelect });
}

export async function loadOrderOrThrow(
  entityId: string,
  orderId: string,
  client: Tx = prisma,
): Promise<OrderRow> {
  const row = await findOrder(entityId, orderId, client);
  if (!row) throw ApiError.notFound('Pedido nao encontrado.');
  return row;
}

/** Refuses to mutate an order that has already been paid or cancelled. */
export function assertOrderEditable(order: { status: string; orderNumber: string }): void {
  if (!OPEN_ORDER_STATUSES.includes(order.status as OrderStatus)) {
    throw ApiError.conflict(`O pedido ${order.orderNumber} ja foi fechado.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Totals                                                                      */
/* -------------------------------------------------------------------------- */

export interface TaxBucket {
  rateBps: number;
  netMinor: number;
  taxMinor: number;
}

export interface OrderTotals {
  subtotalMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  serviceChargeMinor: number;
  totalMinor: number;
  taxBreakdown: TaxBucket[];
}

export interface TotalsInput {
  status: string;
  quantity: number;
  unitPriceMinor: bigint;
  taxRateBps: number;
  discountMinor: bigint;
}

/**
 * The single place order money is decided.
 *
 * Line discounts are never set by this module, so `Order.discountMinor` holds
 * the order-level discount alone and can safely be fed back in as a fixed
 * amount on every recompute. `computeSale` clamps it if items are removed.
 */
export function computeOrderTotals(
  items: TotalsInput[],
  options: { pricingMode: PricingMode; orderDiscountMinor: number; serviceChargeBps: number },
): OrderTotals {
  const { pricingMode, orderDiscountMinor, serviceChargeBps } = options;

  const lines = items
    .filter((item) => isLiveItem(item.status))
    .map((item) => ({
      unitPriceMinor: Number(item.unitPriceMinor),
      quantity: item.quantity,
      taxRateBps: item.taxRateBps,
      pricingMode,
      discount: Number(item.discountMinor)
        ? { type: 'fixed' as const, value: Number(item.discountMinor) }
        : null,
    }));

  const sale = computeSale(
    lines,
    orderDiscountMinor > 0 ? { type: 'fixed', value: orderDiscountMinor } : null,
  );

  const serviceChargeMinor = applyBps(sale.totalMinor, serviceChargeBps);

  return {
    subtotalMinor: sale.subtotalMinor,
    discountMinor: sale.discountMinor,
    netMinor: sale.netMinor,
    taxMinor: sale.taxMinor,
    serviceChargeMinor,
    totalMinor: sale.totalMinor + serviceChargeMinor,
    taxBreakdown: sale.taxBreakdown,
  };
}

/** Recomputes and persists the order header. Must run inside a transaction. */
export async function recomputeOrder(
  tx: Tx,
  orderId: string,
  options: { pricingMode: PricingMode; orderDiscountMinor: number; serviceChargeBps: number },
): Promise<OrderTotals> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: {
      status: true,
      quantity: true,
      unitPriceMinor: true,
      taxRateBps: true,
      discountMinor: true,
    },
  });

  const totals = computeOrderTotals(items, options);

  await tx.order.update({
    where: { id: orderId },
    data: {
      subtotalMinor: BigInt(Math.round(totals.subtotalMinor)),
      discountMinor: BigInt(Math.round(totals.discountMinor)),
      taxMinor: BigInt(Math.round(totals.taxMinor)),
      serviceChargeMinor: BigInt(Math.round(totals.serviceChargeMinor)),
      totalMinor: BigInt(Math.round(totals.totalMinor)),
    },
  });

  return totals;
}

/* -------------------------------------------------------------------------- */
/* Menu pricing                                                                */
/* -------------------------------------------------------------------------- */

const menuProductSelect = {
  id: true,
  namePt: true,
  nameEn: true,
  salePriceMinor: true,
  costPriceMinor: true,
  avgCostMinor: true,
  taxRateBps: true,
  prepStation: true,
  active: true,
  available: true,
  modifierGroups: {
    select: {
      group: {
        select: {
          id: true,
          namePt: true,
          type: true,
          minSelect: true,
          maxSelect: true,
          modifiers: {
            select: { id: true, namePt: true, priceDeltaMinor: true, available: true },
          },
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

export type MenuProduct = Prisma.ProductGetPayload<{ select: typeof menuProductSelect }>;

export async function loadMenuProducts(
  entityId: string,
  productIds: string[],
  client: Tx = prisma,
) {
  const rows = await client.product.findMany({
    where: { entityId, deletedAt: null, id: { in: [...new Set(productIds)] } },
    select: menuProductSelect,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Turns the client's `[{ modifierId }]` selection into priced CartModifiers,
 * rejecting anything that is not attached to the product, is unavailable, or
 * leaves a required choice unsatisfied.
 */
export function resolveModifiers(
  product: MenuProduct,
  selection: Array<{ modifierId: string }>,
): CartModifier[] {
  const allowed = new Map<
    string,
    { groupId: string; name: string; priceDeltaMinor: number; available: boolean }
  >();

  for (const link of product.modifierGroups) {
    for (const modifier of link.group.modifiers) {
      allowed.set(modifier.id, {
        groupId: link.group.id,
        name: modifier.namePt,
        priceDeltaMinor: Number(modifier.priceDeltaMinor),
        available: modifier.available,
      });
    }
  }

  const chosen: CartModifier[] = [];
  const perGroup = new Map<string, number>();
  const seen = new Set<string>();

  for (const entry of selection) {
    if (seen.has(entry.modifierId)) continue;
    seen.add(entry.modifierId);

    const modifier = allowed.get(entry.modifierId);
    if (!modifier) {
      throw ApiError.unprocessable(`Modificador nao pertence a ${product.namePt}.`);
    }
    if (!modifier.available) {
      throw ApiError.unprocessable(`Modificador indisponivel: ${modifier.name}.`);
    }

    perGroup.set(modifier.groupId, (perGroup.get(modifier.groupId) ?? 0) + 1);
    chosen.push({
      modifierId: entry.modifierId,
      name: modifier.name,
      priceDeltaMinor: modifier.priceDeltaMinor,
    });
  }

  for (const link of product.modifierGroups) {
    const group = link.group;
    const count = perGroup.get(group.id) ?? 0;
    const min = group.type === 'required' ? Math.max(1, group.minSelect) : group.minSelect;

    if (count < min) {
      throw ApiError.unprocessable(`Escolha obrigatoria em falta: ${group.namePt}.`);
    }
    if (group.maxSelect > 0 && count > group.maxSelect) {
      throw ApiError.unprocessable(
        `Escolheu demasiadas opcoes em ${group.namePt} (maximo ${group.maxSelect}).`,
      );
    }
  }

  return chosen;
}

export interface PricedItem {
  unitPriceMinor: number;
  unitCostMinor: number;
  totalMinor: number;
  taxRateBps: number;
}

/** Price is always decided here, never accepted from the client. */
export function priceItem(
  product: MenuProduct,
  modifiers: CartModifier[],
  quantity: number,
  pricingMode: PricingMode,
): PricedItem {
  const unitPriceMinor =
    Number(product.salePriceMinor) +
    modifiers.reduce((sum, modifier) => sum + modifier.priceDeltaMinor, 0);

  const line = computeLine({
    unitPriceMinor,
    quantity,
    taxRateBps: product.taxRateBps,
    pricingMode,
    discount: null,
  });

  const unitCostMinor =
    Number(product.avgCostMinor) || Number(product.costPriceMinor) || 0;

  return {
    unitPriceMinor,
    unitCostMinor,
    totalMinor: line.grossMinor,
    taxRateBps: product.taxRateBps,
  };
}

export { round3 };

/* -------------------------------------------------------------------------- */
/* Kitchen tickets                                                             */
/* -------------------------------------------------------------------------- */

const NO_STATION = '__none__';

/**
 * Groups items by prep station and opens one ticket per station. Returns the
 * freshly-loaded tickets so the caller can push them to the KDS after commit.
 */
export async function createTicketsForItems(
  tx: Tx,
  entityId: string,
  order: { id: string; serverName: string | null; tableName: string | null },
  items: Array<Pick<OrderItemRow, 'id' | 'course' | 'prepStation'>>,
): Promise<string[]> {
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.prepStation ?? NO_STATION;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const now = new Date();
  const ticketIds: string[] = [];

  for (const [key, group] of groups) {
    const station = key === NO_STATION ? null : key;
    const ticketNumber = await nextTicketNumber(entityId, tx);

    const ticket = await tx.kitchenTicket.create({
      data: {
        entityId,
        orderId: order.id,
        ticketNumber,
        station,
        status: 'new',
        course: group.reduce((min, item) => Math.min(min, item.course), group[0]!.course),
        tableName: order.tableName,
        serverName: order.serverName,
      },
      select: { id: true },
    });

    await tx.orderItem.updateMany({
      where: { id: { in: group.map((item) => item.id) } },
      data: { ticketId: ticket.id, status: 'sent', sentAt: now },
    });

    ticketIds.push(ticket.id);
  }

  return ticketIds;
}

export async function loadTickets(
  entityId: string,
  ticketIds: string[],
  client: Tx = prisma,
): Promise<TicketRow[]> {
  if (!ticketIds.length) return [];
  return client.kitchenTicket.findMany({
    where: { entityId, id: { in: ticketIds } },
    select: ticketSelect,
  });
}

/* -------------------------------------------------------------------------- */
/* Realtime                                                                    */
/* -------------------------------------------------------------------------- */

export function emitOrderUpdated(entityId: string, order: OrderDto): void {
  emitToEntity(entityId, SOCKET_EVENTS.ORDER_UPDATED, order);
}

export function emitTableUpdated(entityId: string, table: RestaurantTableDto): void {
  emitToEntity(entityId, SOCKET_EVENTS.TABLE_UPDATED, table);
}

export function emitTicketsCreated(entityId: string, tickets: KitchenTicketDto[]): void {
  for (const ticket of tickets) {
    emitToKds(entityId, ticket.station, SOCKET_EVENTS.TICKET_CREATED, ticket);
  }
}

export function ticketDtos(rows: TicketRow[]): KitchenTicketDto[] {
  const now = new Date();
  return rows.map((row) => toTicketDto(row, now));
}

export function orderDto(row: OrderRow): OrderDto {
  return toOrderDto(row);
}

/* -------------------------------------------------------------------------- */
/* Bills                                                                       */
/* -------------------------------------------------------------------------- */

export interface BillLine {
  orderItemId: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
  course: number;
  seat: number | null;
  modifiers: CartModifier[];
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface Bill {
  label: string;
  seat: number | null;
  orderItemIds: string[];
  lines: BillLine[];
  subtotalMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  serviceChargeMinor: number;
  tipMinor: number;
  totalMinor: number;
  taxBreakdown: TaxBucket[];
}

export function billLines(items: OrderItemRow[], pricingMode: PricingMode): BillLine[] {
  return items.map((item) => {
    const line = computeLine({
      unitPriceMinor: Number(item.unitPriceMinor),
      quantity: item.quantity,
      taxRateBps: item.taxRateBps,
      pricingMode,
      discount: Number(item.discountMinor)
        ? { type: 'fixed', value: Number(item.discountMinor) }
        : null,
    });
    return {
      orderItemId: item.id,
      productId: item.productId,
      name: item.name,
      quantity: round3(item.quantity),
      unitPriceMinor: Number(item.unitPriceMinor),
      taxRateBps: item.taxRateBps,
      course: item.course,
      seat: item.seat,
      modifiers: parseModifiers(item.modifiers),
      netMinor: line.netMinor,
      taxMinor: line.taxMinor,
      totalMinor: line.grossMinor,
    };
  });
}

export interface OrderMoney {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceChargeMinor: number;
  tipMinor: number;
  totalMinor: number;
}

/**
 * Splits the order's authoritative totals across groups of items, weighted by
 * each group's gross value. Using `allocate()` for every component guarantees
 * the bills add back up to the order to the last centimo.
 */
export function allocateBills(
  groups: Array<{ label: string; seat: number | null; items: OrderItemRow[] }>,
  money: OrderMoney,
  pricingMode: PricingMode,
): Bill[] {
  const perGroup = groups.map((group) => {
    const lines = billLines(group.items, pricingMode);
    const sale = computeSale(
      group.items.map((item) => ({
        unitPriceMinor: Number(item.unitPriceMinor),
        quantity: item.quantity,
        taxRateBps: item.taxRateBps,
        pricingMode,
        discount: Number(item.discountMinor)
          ? { type: 'fixed' as const, value: Number(item.discountMinor) }
          : null,
      })),
      null,
    );
    return { group, lines, sale };
  });

  const weights = perGroup.map((g) => g.sale.totalMinor);
  const discount = allocate(money.discountMinor, weights);
  const tax = allocate(money.taxMinor, weights);
  const service = allocate(money.serviceChargeMinor, weights);
  const tip = allocate(money.tipMinor, weights);
  const total = allocate(money.totalMinor, weights);

  return perGroup.map((entry, index) => {
    const totalMinor = total[index] ?? 0;
    const taxMinor = tax[index] ?? 0;
    const serviceChargeMinor = service[index] ?? 0;
    return {
      label: entry.group.label,
      seat: entry.group.seat,
      orderItemIds: entry.group.items.map((item) => item.id),
      lines: entry.lines,
      subtotalMinor: entry.sale.subtotalMinor,
      discountMinor: discount[index] ?? 0,
      netMinor: totalMinor - taxMinor - serviceChargeMinor,
      taxMinor,
      serviceChargeMinor,
      tipMinor: tip[index] ?? 0,
      totalMinor,
      taxBreakdown: entry.sale.taxBreakdown,
    };
  });
}

/** An even split has no lines - only a share of every number on the check. */
export function evenBills(money: OrderMoney, people: number): Bill[] {
  const totals = splitEvenly(money.totalMinor, people);
  const ones = new Array(people).fill(1) as number[];
  const subtotal = allocate(money.subtotalMinor, ones);
  const discount = allocate(money.discountMinor, ones);
  const tax = allocate(money.taxMinor, ones);
  const service = allocate(money.serviceChargeMinor, ones);
  const tip = allocate(money.tipMinor, ones);

  return totals.map((totalMinor, index) => {
    const taxMinor = tax[index] ?? 0;
    const serviceChargeMinor = service[index] ?? 0;
    return {
      label: `Pessoa ${index + 1}`,
      seat: null,
      orderItemIds: [],
      lines: [],
      subtotalMinor: subtotal[index] ?? 0,
      discountMinor: discount[index] ?? 0,
      netMinor: totalMinor - taxMinor - serviceChargeMinor,
      taxMinor,
      serviceChargeMinor,
      tipMinor: tip[index] ?? 0,
      totalMinor,
      taxBreakdown: [],
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Item status helpers                                                         */
/* -------------------------------------------------------------------------- */

export const PENDING: OrderItemStatus[] = ['unsent', 'held'];

export function isPending(status: string): boolean {
  return PENDING.includes(status as OrderItemStatus);
}
