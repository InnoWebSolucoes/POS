import { Prisma } from '@prisma/client';
import type {
  EntityMode,
  FulfilmentMethod,
  Locale,
  OnlineOrderStatus,
  PaymentGateway,
  PaymentStatus,
  PricingMode,
  ProductType,
  SaleTotals,
  Unit,
} from '@pos/shared';

import {
  displayPriceMinor,
  pricingModeOf,
  productInStock,
  type CartRow,
  type PricedLine,
  type StorefrontEntity,
  type StorefrontProductRow,
  type StorefrontVariantRow,
} from './service.js';

/**
 * Row -> DTO. This file is the boundary: if a field is not written here it
 * cannot reach the storefront, which is exactly how costPriceMinor, avgCost,
 * margins and exact stock counts stay on the server.
 */

export const IN_STOCK_LABEL_PT = 'Disponivel';
export const OUT_OF_STOCK_LABEL_PT = 'Esgotado';

function availabilityLabel(inStock: boolean): string {
  return inStock ? IN_STOCK_LABEL_PT : OUT_OF_STOCK_LABEL_PT;
}

function parseOptions(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      out[key] = String(value);
    }
    return out;
  } catch {
    return {};
  }
}

/* -------------------------------------------------------------------------- */
/* Storefront                                                                  */
/* -------------------------------------------------------------------------- */

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
  /** Public contact details only - never the NIF or internal configuration. */
  phone: string | null;
  email: string | null;
  address: string | null;
}

export function toStorefrontEntityDto(entity: StorefrontEntity): StorefrontEntityDto {
  return {
    id: entity.id,
    name: entity.name,
    slug: entity.slug,
    mode: entity.mode as EntityMode,
    logoUrl: entity.logoUrl,
    accentColor: entity.accentColor,
    currency: entity.currency,
    locale: entity.locale as Locale,
    pricingMode: pricingModeOf(entity),
    phone: entity.phone,
    email: entity.email,
    address: entity.address,
  };
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
  /** Availability is a boolean - the exact count is never published. */
  inStock: boolean;
  availabilityLabel: string;
  weightGrams: number | null;
  createdAt: string;
}

export interface StorefrontProductDetailDto extends StorefrontProductDto {
  related: StorefrontProductDto[];
}

function sortImages(images: StorefrontProductRow['images']): StorefrontProductRow['images'] {
  return [...images].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  );
}

export function toStorefrontVariantDto(
  variant: StorefrontVariantRow,
  product: StorefrontProductRow,
  pricingMode: PricingMode,
): StorefrontVariantDto {
  const unitPrice = Number(variant.salePriceMinor ?? product.salePriceMinor);
  const inStock = product.available && (!product.trackStock || variant.stockQuantity > 0);
  return {
    id: variant.id,
    sku: variant.sku,
    options: parseOptions(variant.options),
    priceMinor: displayPriceMinor(unitPrice, product.taxRateBps, pricingMode),
    inStock,
    availabilityLabel: availabilityLabel(inStock),
    imageUrl: variant.imageUrl,
  };
}

export function toStorefrontProductDto(
  product: StorefrontProductRow,
  entity: StorefrontEntity,
): StorefrontProductDto {
  const pricingMode = pricingModeOf(entity);
  const images = sortImages(product.images).map((image) => ({
    id: image.id,
    url: image.url,
    alt: image.alt,
    sortOrder: image.sortOrder,
    isPrimary: image.isPrimary,
  }));
  const inStock = productInStock(product);

  return {
    id: product.id,
    sku: product.sku,
    slug: product.onlineSlug ?? product.id,
    namePt: product.namePt,
    nameEn: product.nameEn,
    descriptionPt: product.descriptionPt,
    descriptionEn: product.descriptionEn,
    categoryId: product.categoryId,
    category: product.category
      ? {
          id: product.category.id,
          namePt: product.category.namePt,
          nameEn: product.category.nameEn,
          color: product.category.color,
        }
      : null,
    type: product.type as ProductType,
    unit: product.unit as Unit,
    priceMinor: displayPriceMinor(
      Number(product.salePriceMinor),
      product.taxRateBps,
      pricingMode,
    ),
    taxRateBps: product.taxRateBps,
    images,
    imageUrl: images[0]?.url ?? null,
    variants: product.variants.map((variant) =>
      toStorefrontVariantDto(variant, product, pricingMode),
    ),
    inStock,
    availabilityLabel: availabilityLabel(inStock),
    weightGrams: product.weightGrams,
    createdAt: product.createdAt.toISOString(),
  };
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

export interface CategoryCountRow {
  id: string;
  parentId: string | null;
  namePt: string;
  nameEn: string | null;
  color: string | null;
  iconUrl: string | null;
  sortOrder: number;
  _count: { products: number };
}

/**
 * The published category tree.
 *
 * A branch survives only if something published hangs off it - directly or
 * further down - so the storefront never renders an empty aisle. Category trees
 * are a few dozen rows, so one query plus an in-memory walk beats recursive SQL
 * and keeps us on the Prisma query API that SQLite and PostgreSQL both speak.
 */
export function buildPublishedCategoryTree(rows: CategoryCountRow[]): StorefrontCategoryDto[] {
  const byId = new Map<string, CategoryCountRow>(rows.map((row) => [row.id, row]));

  const keep = new Set<string>();
  for (const row of rows) {
    if (row._count.products <= 0) continue;
    let cursor: CategoryCountRow | undefined = row;
    let guard = 0;
    while (cursor && guard < 16) {
      if (keep.has(cursor.id)) break;
      keep.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      guard += 1;
    }
  }

  const dtos = new Map<string, StorefrontCategoryDto>();
  for (const id of keep) {
    const row = byId.get(id)!;
    dtos.set(id, {
      id: row.id,
      parentId: row.parentId && keep.has(row.parentId) ? row.parentId : null,
      namePt: row.namePt,
      nameEn: row.nameEn,
      color: row.color,
      iconUrl: row.iconUrl,
      sortOrder: row.sortOrder,
      productCount: row._count.products,
      children: [],
    });
  }

  const roots: StorefrontCategoryDto[] = [];
  for (const dto of dtos.values()) {
    const parent = dto.parentId ? dtos.get(dto.parentId) : undefined;
    if (parent) parent.children.push(dto);
    else roots.push(dto);
  }

  const compare = (a: StorefrontCategoryDto, b: StorefrontCategoryDto) =>
    a.sortOrder - b.sortOrder || a.namePt.localeCompare(b.namePt, 'pt');

  // Post-order: a parent's count includes everything published beneath it.
  const rollUp = (node: StorefrontCategoryDto): number => {
    node.children.sort(compare);
    for (const child of node.children) node.productCount += rollUp(child);
    return node.productCount;
  };
  roots.sort(compare);
  for (const root of roots) rollUp(root);

  return roots;
}

/* -------------------------------------------------------------------------- */
/* Cart                                                                        */
/* -------------------------------------------------------------------------- */

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
  /** True when every line can still be bought right now. */
  fulfillable: boolean;
  updatedAt: string;
}

export function toCartDto(
  cart: CartRow,
  entity: StorefrontEntity,
  priced: { lines: PricedLine[]; totals: SaleTotals },
): CartDto {
  const lines: CartLineDto[] = priced.lines.map((line) => {
    const product = line.item.product;
    const variant = line.item.variant;
    const images = sortImages(product.images);
    return {
      id: line.item.id,
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.namePt,
      sku: variant?.sku ?? product.sku,
      slug: product.onlineSlug ?? product.id,
      imageUrl: variant?.imageUrl ?? images[0]?.url ?? null,
      options: parseOptions(variant?.options),
      unit: product.unit as Unit,
      quantity: line.quantity,
      unitPriceMinor: line.displayUnitPriceMinor,
      lineTotalMinor: line.lineTotalMinor,
      taxRateBps: line.taxRateBps,
      inStock: line.inStock,
      availabilityLabel: availabilityLabel(line.inStock),
    };
  });

  return {
    id: cart.id,
    entityId: cart.entityId,
    customerId: cart.customerId,
    sessionId: cart.sessionId,
    currency: entity.currency,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalMinor: priced.totals.subtotalMinor,
    discountMinor: priced.totals.discountMinor,
    taxMinor: priced.totals.taxMinor,
    totalMinor: priced.totals.totalMinor,
    fulfillable: lines.length > 0 && lines.every((line) => line.inStock),
    updatedAt: cart.updatedAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                      */
/* -------------------------------------------------------------------------- */

export const onlineOrderSelect = {
  id: true,
  entityId: true,
  orderNumber: true,
  customerId: true,
  customer: { select: { id: true, name: true, email: true, phone: true } },
  guestName: true,
  guestEmail: true,
  guestPhone: true,
  shippingAddressId: true,
  shippingAddress: {
    select: {
      id: true,
      label: true,
      recipient: true,
      phone: true,
      line1: true,
      line2: true,
      city: true,
      province: true,
      postalCode: true,
      country: true,
    },
  },
  fulfilmentMethod: true,
  pickupLocationId: true,
  pickupLocation: { select: { id: true, name: true, address: true, phone: true } },
  status: true,
  paymentStatus: true,
  paymentGateway: true,
  paymentReference: true,
  subtotalMinor: true,
  shippingMinor: true,
  discountMinor: true,
  taxMinor: true,
  totalMinor: true,
  saleId: true,
  trackingNumber: true,
  carrier: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  confirmedAt: true,
  shippedAt: true,
  deliveredAt: true,
  lines: {
    select: {
      id: true,
      productId: true,
      variantId: true,
      name: true,
      quantity: true,
      unitPriceMinor: true,
      unitCostMinor: true,
      taxRateBps: true,
      totalMinor: true,
      product: { select: { sku: true, unit: true, onlineSlug: true } },
      variant: { select: { sku: true, options: true } },
    },
  },
} satisfies Prisma.OnlineOrderSelect;

export type OnlineOrderRow = Prisma.OnlineOrderGetPayload<{ select: typeof onlineOrderSelect }>;

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
  /** Only for callers holding product:cost. */
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
  /** Only for callers holding product:cost. */
  cogsMinor?: number;
}

const STATUS_LABELS_PT: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Em preparacao',
  ready_for_pickup: 'Pronta para levantamento',
  shipped: 'Expedida',
  delivered: 'Entregue',
  completed: 'Concluida',
  cancelled: 'Cancelada',
};

export function toOnlineOrderDto(
  order: OnlineOrderRow,
  options: { includeCost: boolean } = { includeCost: false },
): OnlineOrderDto {
  const lines: OnlineOrderLineDto[] = order.lines.map((line) => {
    const dto: OnlineOrderLineDto = {
      id: line.id,
      productId: line.productId,
      variantId: line.variantId,
      name: line.name,
      sku: line.variant?.sku ?? line.product?.sku ?? '',
      options: parseOptions(line.variant?.options),
      unit: (line.product?.unit ?? 'each') as Unit,
      quantity: line.quantity,
      unitPriceMinor: Number(line.unitPriceMinor),
      taxRateBps: line.taxRateBps,
      totalMinor: Number(line.totalMinor),
    };
    if (options.includeCost) dto.unitCostMinor = Number(line.unitCostMinor);
    return dto;
  });

  const dto: OnlineOrderDto = {
    id: order.id,
    entityId: order.entityId,
    orderNumber: order.orderNumber,
    status: order.status as OnlineOrderStatus,
    statusLabelPt: STATUS_LABELS_PT[order.status] ?? order.status,
    paymentStatus: order.paymentStatus as PaymentStatus,
    paymentGateway: (order.paymentGateway as PaymentGateway | null) ?? null,
    paymentReference: order.paymentReference,
    fulfilmentMethod: order.fulfilmentMethod as FulfilmentMethod,
    customerId: order.customerId,
    customerName: order.customer?.name ?? order.guestName ?? null,
    contactEmail: order.guestEmail ?? order.customer?.email ?? null,
    contactPhone: order.guestPhone ?? order.customer?.phone ?? null,
    shippingAddress: order.shippingAddress
      ? {
          recipient: order.shippingAddress.recipient,
          phone: order.shippingAddress.phone,
          line1: order.shippingAddress.line1,
          line2: order.shippingAddress.line2,
          city: order.shippingAddress.city,
          province: order.shippingAddress.province,
          postalCode: order.shippingAddress.postalCode,
          country: order.shippingAddress.country,
        }
      : null,
    pickupLocation: order.pickupLocation
      ? {
          id: order.pickupLocation.id,
          name: order.pickupLocation.name,
          address: order.pickupLocation.address,
          phone: order.pickupLocation.phone,
        }
      : null,
    subtotalMinor: Number(order.subtotalMinor),
    shippingMinor: Number(order.shippingMinor),
    discountMinor: Number(order.discountMinor),
    taxMinor: Number(order.taxMinor),
    totalMinor: Number(order.totalMinor),
    saleId: order.saleId,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    note: order.note,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
  };

  if (options.includeCost) {
    dto.cogsMinor = order.lines.reduce(
      (sum, line) => sum + Math.round(Number(line.unitCostMinor) * line.quantity),
      0,
    );
  }

  return dto;
}

/**
 * The public order tracker. A shopper who knows the order number AND the email
 * or phone on it sees progress and nothing else: no internal ids, no costs, no
 * other customers' data.
 */
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

export function toPublicOrderStatusDto(
  order: OnlineOrderRow,
  entity: StorefrontEntity,
): PublicOrderStatusDto {
  return {
    orderNumber: order.orderNumber,
    status: order.status as OnlineOrderStatus,
    statusLabelPt: STATUS_LABELS_PT[order.status] ?? order.status,
    paymentStatus: order.paymentStatus as PaymentStatus,
    fulfilmentMethod: order.fulfilmentMethod as FulfilmentMethod,
    totalMinor: Number(order.totalMinor),
    currency: entity.currency,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    pickupLocation: order.pickupLocation
      ? {
          name: order.pickupLocation.name,
          address: order.pickupLocation.address,
          phone: order.pickupLocation.phone,
        }
      : null,
    lines: order.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      totalMinor: Number(line.totalMinor),
    })),
    placedAt: order.createdAt.toISOString(),
    shippedAt: order.shippedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
  };
}
