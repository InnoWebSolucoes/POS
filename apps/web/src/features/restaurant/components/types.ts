import {
  COURSE_MAX,
  type CartModifier,
  type KitchenTicketDto,
  type ModifierGroupDto,
  type OrderDto,
  type OrderItemDto,
  type PrepStation,
  type ProductType,
  type Unit,
} from '@pos/shared';

import { qk } from '@/lib/query';

/* -------------------------------------------------------------------------- */
/* GET /api/products/menu                                                      */
/* -------------------------------------------------------------------------- */

export interface MenuItem {
  id: string;
  sku: string;
  namePt: string;
  nameEn: string | null;
  salePriceMinor: number;
  taxRateBps: number;
  unit: Unit;
  type: ProductType;
  tileColor: string | null;
  imageUrl: string | null;
  prepStation: PrepStation | null;
  available: boolean;
  trackStock: boolean;
  stockQuantity: number;
  modifierGroups: ModifierGroupDto[];
}

export interface MenuCategory {
  id: string | null;
  namePt: string;
  nameEn: string | null;
  color: string | null;
  sortOrder: number;
  items: MenuItem[];
}

export interface MenuResponse {
  categories: MenuCategory[];
}

/* -------------------------------------------------------------------------- */
/* Bill / split payloads                                                       */
/* -------------------------------------------------------------------------- */

export interface TaxBucket {
  rateBps: number;
  netMinor: number;
  taxMinor: number;
}

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

export type SplitMode = 'even' | 'by_seat' | 'by_item';

export interface SplitResponse {
  orderId: string;
  orderNumber: string;
  mode: SplitMode;
  currency: string;
  orderTotalMinor: number;
  tipMinor: number;
  bills: Bill[];
}

/** GET /api/restaurant/orders/:id/bill - the read-only pre-bill. */
export interface PreBill {
  orderId: string;
  orderNumber: string;
  tableName: string | null;
  serverName: string | null;
  guestCount: number;
  openedAt: string;
  currency: string;
  pricingMode: 'inclusive' | 'exclusive';
  lines: BillLine[];
  subtotalMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  taxBreakdown: TaxBucket[];
  serviceChargeBps: number;
  serviceChargeMinor: number;
  tipMinor: number;
  totalMinor: number;
  dueMinor: number;
  /** Omitted for anyone without product:cost - never assume it is here. */
  costMinor?: number;
}

export interface SendResponse {
  data: OrderDto;
  tickets: KitchenTicketDto[];
  sent: number;
  held: number;
}

export interface OrderEnvelope {
  data: OrderDto;
}

/** Payload of SOCKET_EVENTS.TICKET_READY, as kds/service.ts emits it. */
export interface TicketReadyPayload {
  entityId: string;
  orderId: string;
  orderNumber: string;
  tableId: string | null;
  tableName: string | null;
  serverName: string | null;
  ticketId: string;
  station: PrepStation | null;
  readyAt: string | null;
}

/** ORDER_UPDATED carries a full OrderDto from the order routes, a stub from sales. */
export type OrderUpdatedPayload = Partial<OrderDto> & { id?: string };

/* -------------------------------------------------------------------------- */
/* Query-key prefixes                                                          */
/* -------------------------------------------------------------------------- */

/**
 * qk.orders(params) keys on its params, so a socket event that does not know
 * which filters are on screen invalidates the whole family by its prefix.
 * Derived from qk so a rename there still reaches here.
 */
export const ordersListPrefix = qk.orders().slice(0, 1);
export const tablesListPrefix = qk.tables().slice(0, 1);

/* -------------------------------------------------------------------------- */
/* Courses and item state                                                      */
/* -------------------------------------------------------------------------- */

/** 0 = straight fire, 1..COURSE_MAX = the numbered courses. */
export const COURSES: number[] = Array.from({ length: COURSE_MAX + 1 }, (_, index) => index);

export function courseLabel(course: number): string {
  return course === 0 ? 'Envio Directo' : `Prato ${course}`;
}

export function isLiveItem(item: OrderItemDto): boolean {
  return item.status !== 'cancelled';
}

/** Still ours to edit: the kitchen has not seen it yet. */
export function isPendingItem(item: OrderItemDto): boolean {
  return item.status === 'unsent' || item.status === 'held';
}

export function isHeldItem(item: OrderItemDto): boolean {
  return item.status === 'held';
}

export type CourseState = 'pending' | 'sent' | 'ready';

export const COURSE_STATE_LABELS: Record<CourseState, string> = {
  pending: 'Por enviar',
  sent: 'Enviado',
  ready: 'Pronto',
};

export function courseState(items: OrderItemDto[]): CourseState {
  if (items.length > 0 && items.every((item) => item.status === 'ready' || item.status === 'served')) {
    return 'ready';
  }
  if (items.some(isPendingItem)) return 'pending';
  return 'sent';
}

export interface CourseGroup {
  course: number;
  items: OrderItemDto[];
  state: CourseState;
  held: boolean;
  totalMinor: number;
}

export function groupByCourse(items: OrderItemDto[]): CourseGroup[] {
  const buckets = new Map<number, OrderItemDto[]>();
  for (const item of items) {
    if (!isLiveItem(item)) continue;
    const bucket = buckets.get(item.course);
    if (bucket) bucket.push(item);
    else buckets.set(item.course, [item]);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([course, courseItems]) => ({
      course,
      items: courseItems,
      state: courseState(courseItems),
      held: courseItems.some(isHeldItem),
      totalMinor: courseItems.reduce((sum, item) => sum + item.totalMinor, 0),
    }));
}

export function unsentItems(order: OrderDto | undefined): OrderItemDto[] {
  if (!order) return [];
  return order.items.filter((item) => item.status === 'unsent');
}

export function sentItems(order: OrderDto | undefined): OrderItemDto[] {
  if (!order) return [];
  return order.items.filter((item) => isLiveItem(item) && !isPendingItem(item));
}

/** "sem cebola, Extra queijo" - the muted second line of a check row. */
export function modifierLine(item: OrderItemDto): string {
  return item.modifiers.map((modifier) => modifier.name).join(', ');
}

export function orderIsEditable(order: OrderDto | undefined): boolean {
  if (!order) return false;
  return order.status !== 'paid' && order.status !== 'cancelled';
}
