import type {
  FulfilmentMethod,
  OnlineOrderStatus,
  PaymentGateway,
  PaymentStatus,
  Unit,
} from '@pos/shared';

/**
 * The fulfilment queue's view of an online order.
 *
 * Mirrors toOnlineOrderDto() in apps/api/src/modules/online/mappers.ts. The two
 * cost fields are optional because the API strips them for anyone without
 * product:cost - a packer sees what to pick, never the margin on it.
 */

export interface OnlineOrderLineDto {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  options: Record<string, string>;
  unit: Unit;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
  totalMinor: number;
  unitCostMinor?: number;
}

export interface OnlineOrderAddressDto {
  recipient: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  province: string | null;
  postalCode: string | null;
  country: string;
}

export interface OnlineOrderDto {
  id: string;
  entityId: string;
  orderNumber: string;
  status: OnlineOrderStatus;
  statusLabelPt: string;
  paymentStatus: PaymentStatus;
  paymentGateway: PaymentGateway | null;
  paymentReference: string | null;
  fulfilmentMethod: FulfilmentMethod;
  customerId: string | null;
  customerName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  shippingAddress: OnlineOrderAddressDto | null;
  pickupLocation: { id: string; name: string; address: string | null; phone: string | null } | null;
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  saleId: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  note: string | null;
  lines: OnlineOrderLineDto[];
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  /** Only present for callers holding product:cost. */
  cogsMinor?: number;
}

export interface OnlineOrderFilters {
  page: number;
  pageSize: number;
  status?: OnlineOrderStatus;
  paymentStatus?: PaymentStatus;
  from?: string;
  to?: string;
  search?: string;
}

/** online:order_created, as broadcast to the tenant room. */
export interface OnlineOrderCreatedEvent {
  entityId: string;
  orderId: string;
  orderNumber: string;
  totalMinor: number;
  fulfilmentMethod: FulfilmentMethod;
  customerName: string | null;
  createdAt: string;
}

/** online:order_updated. */
export interface OnlineOrderUpdatedEvent {
  entityId: string;
  orderId: string;
  orderNumber: string;
  status: OnlineOrderStatus;
  paymentStatus: PaymentStatus;
  fulfilmentMethod: FulfilmentMethod;
  totalMinor: number;
  updatedAt: string;
}
