import type {
  EntityMode,
  FulfilmentMethod,
  Locale,
  OnlineOrderStatus,
  PaymentGateway,
  PaymentStatus,
  PricingMode,
  ProductType,
  Unit,
} from '@pos/shared';

/**
 * The shapes the public storefront endpoints return.
 *
 * Mirrors apps/api/src/modules/online/mappers.ts. Nothing here carries cost,
 * margin or an exact stock count - the API strips those before the response
 * leaves the server, and availability arrives as a boolean.
 */

export interface StorefrontEntityDto {
  id: string;
  name: string;
  slug: string;
  mode: EntityMode;
  logoUrl: string | null;
  accentColor: string;
  currency: string;
  locale: Locale;
  pricingMode: PricingMode;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface StorefrontImageDto {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface StorefrontVariantDto {
  id: string;
  sku: string;
  options: Record<string, string>;
  priceMinor: number;
  inStock: boolean;
  availabilityLabel: string;
  imageUrl: string | null;
}

export interface StorefrontProductDto {
  id: string;
  sku: string;
  slug: string;
  namePt: string;
  nameEn: string | null;
  descriptionPt: string | null;
  descriptionEn: string | null;
  categoryId: string | null;
  category: { id: string; namePt: string; nameEn: string | null; color: string | null } | null;
  type: ProductType;
  unit: Unit;
  /** Tax-inclusive display price, minor units. */
  priceMinor: number;
  taxRateBps: number;
  images: StorefrontImageDto[];
  imageUrl: string | null;
  variants: StorefrontVariantDto[];
  inStock: boolean;
  availabilityLabel: string;
  weightGrams: number | null;
  createdAt: string;
}

export interface StorefrontProductDetailDto extends StorefrontProductDto {
  related: StorefrontProductDto[];
}

export interface StorefrontCategoryDto {
  id: string;
  parentId: string | null;
  namePt: string;
  nameEn: string | null;
  color: string | null;
  iconUrl: string | null;
  sortOrder: number;
  productCount: number;
  children: StorefrontCategoryDto[];
}

export interface CartLineDto {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  slug: string;
  imageUrl: string | null;
  options: Record<string, string>;
  unit: Unit;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  taxRateBps: number;
  inStock: boolean;
  availabilityLabel: string;
}

export interface CartDto {
  id: string;
  entityId: string;
  customerId: string | null;
  sessionId: string | null;
  currency: string;
  lines: CartLineDto[];
  itemCount: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  fulfillable: boolean;
  updatedAt: string;
}

export interface PlacedOrderDto {
  id: string;
  orderNumber: string;
  status: OnlineOrderStatus;
  statusLabelPt: string;
  paymentStatus: PaymentStatus;
  paymentGateway: PaymentGateway | null;
  fulfilmentMethod: FulfilmentMethod;
  contactEmail: string | null;
  contactPhone: string | null;
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  itemCount: number;
  createdAt: string;
}

/** What the shopper must do next to pay: transfer, redirect, confirm on phone. */
export interface PaymentIntentDto {
  gateway: PaymentGateway;
  action: 'manual_transfer' | 'redirect' | 'push' | 'on_delivery';
  reference: string;
  instructionsPt: string;
  redirectUrl?: string | null;
}

export interface PlaceOrderResponse {
  data: PlacedOrderDto;
  payment: PaymentIntentDto;
}

export interface PublicOrderStatusDto {
  orderNumber: string;
  status: OnlineOrderStatus;
  statusLabelPt: string;
  paymentStatus: PaymentStatus;
  fulfilmentMethod: FulfilmentMethod;
  totalMinor: number;
  currency: string;
  carrier: string | null;
  trackingNumber: string | null;
  pickupLocation: { name: string; address: string | null; phone: string | null } | null;
  lines: Array<{ name: string; quantity: number; totalMinor: number }>;
  placedAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
}

/** A store counter a BOPIS order can be collected from. */
export interface PickupPointDto {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
}

export interface ShippingAddressInput {
  recipient: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
}

export interface CatalogueParams {
  search?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: 'price' | 'name' | 'newest';
}

/** inventory:updated, as broadcast to the public storefront room. */
export interface InventoryUpdateEvent {
  entityId: string;
  productId: string;
  variantId?: string | null;
  stockQuantity: number;
  available: boolean;
}
