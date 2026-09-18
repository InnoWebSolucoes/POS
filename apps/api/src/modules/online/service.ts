import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  applyBps,
  computeLine,
  computeSale,
  type FulfilmentMethod,
  type LineInput,
  type PaymentGateway,
  type PaymentMethod,
  type PricingMode,
  type SaleTotals,
} from '@pos/shared';

import { ApiError } from '../../lib/http.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { round3 } from '../../lib/inventory.js';

/**
 * Storefront + cart services.
 *
 * Everything here is written for the *public* side of the shop, which is the
 * only unauthenticated surface in the API. Two rules drive the shape of it:
 *
 *  1. the tenant is resolved from a SLUG, never from `req.entityId` (which only
 *     exists once a member of staff is logged in), and
 *  2. nothing that a competitor could use - cost price, margin, exact stock
 *     counts - ever crosses the boundary. Availability leaves as a boolean.
 */

/* -------------------------------------------------------------------------- */
/* Tenant resolution                                                           */
/* -------------------------------------------------------------------------- */

export const entitySelect = {
  id: true,
  name: true,
  slug: true,
  mode: true,
  nif: true,
  address: true,
  phone: true,
  email: true,
  logoUrl: true,
  accentColor: true,
  currency: true,
  locale: true,
  pricingMode: true,
  costingMethod: true,
  defaultTaxRateBps: true,
} satisfies Prisma.EntitySelect;

export type StorefrontEntity = Prisma.EntityGetPayload<{ select: typeof entitySelect }>;

export function pricingModeOf(entity: { pricingMode: string }): PricingMode {
  return entity.pricingMode === 'exclusive' ? 'exclusive' : 'inclusive';
}

export function costingMethodOf(entity: { costingMethod: string }): 'weighted_average' | 'fifo' {
  return entity.costingMethod === 'fifo' ? 'fifo' : 'weighted_average';
}

/**
 * The storefront tenant, from `?entitySlug=`, the `X-Entity-Slug` header or the
 * request body. Deliberately NOT from req.entityId: that one needs a session.
 */
export function entitySlugFrom(req: Request): string {
  const fromParams = typeof req.params?.entitySlug === 'string' ? req.params.entitySlug : '';
  const fromHeader = req.header('x-entity-slug') ?? '';
  const raw = (req.query?.entitySlug as string | undefined) ?? '';
  const body = req.body as { entitySlug?: unknown } | undefined;
  const fromBody = typeof body?.entitySlug === 'string' ? body.entitySlug : '';

  const slug = (fromParams || fromBody || raw || fromHeader).trim();
  if (!slug) {
    throw ApiError.badRequest('Loja nao indicada. Envie entitySlug ou o cabecalho X-Entity-Slug.');
  }
  return slug;
}

/** An inactive or soft-deleted tenant simply does not exist to the storefront. */
export async function resolveEntityBySlug(
  slug: string,
  client: Tx = prisma,
): Promise<StorefrontEntity> {
  const entity = await client.entity.findFirst({
    where: { slug, active: true, deletedAt: null },
    select: entitySelect,
  });
  if (!entity) throw ApiError.notFound('Loja nao encontrada.');
  return entity;
}

/** Same guarantees as resolveEntityBySlug, for flows that start from an id. */
export async function resolveEntityById(
  entityId: string,
  client: Tx = prisma,
): Promise<StorefrontEntity> {
  const entity = await client.entity.findFirst({
    where: { id: entityId, deletedAt: null },
    select: entitySelect,
  });
  if (!entity) throw ApiError.notFound('Loja nao encontrada.');
  return entity;
}

/**
 * A shop only exists online once something is actually published in it. The
 * entity `mode` is not the gate - a supermarket in 'retail' mode that publishes
 * products is a perfectly good storefront.
 */
export async function assertStorefrontOpen(entityId: string, client: Tx = prisma): Promise<void> {
  const published = await client.product.findFirst({
    where: publishedProductWhere(entityId),
    select: { id: true },
  });
  if (!published) throw ApiError.notFound('Loja nao encontrada.');
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                   */
/* -------------------------------------------------------------------------- */

export function publishedProductWhere(entityId: string): Prisma.ProductWhereInput {
  return { entityId, deletedAt: null, active: true, publishOnline: true };
}

export const storefrontVariantSelect = {
  id: true,
  sku: true,
  options: true,
  salePriceMinor: true,
  stockQuantity: true,
  imageUrl: true,
} satisfies Prisma.ProductVariantSelect;

export const storefrontProductSelect = {
  id: true,
  sku: true,
  namePt: true,
  nameEn: true,
  descriptionPt: true,
  descriptionEn: true,
  categoryId: true,
  category: { select: { id: true, namePt: true, nameEn: true, color: true } },
  type: true,
  unit: true,
  salePriceMinor: true,
  taxRateBps: true,
  trackStock: true,
  stockQuantity: true,
  available: true,
  onlineSlug: true,
  weightGrams: true,
  createdAt: true,
  images: {
    select: { id: true, url: true, alt: true, sortOrder: true, isPrimary: true },
  },
  variants: {
    where: { active: true, deletedAt: null },
    select: storefrontVariantSelect,
    orderBy: { sku: 'asc' },
  },
} satisfies Prisma.ProductSelect;

export type StorefrontProductRow = Prisma.ProductGetPayload<{
  select: typeof storefrontProductSelect;
}>;
export type StorefrontVariantRow = StorefrontProductRow['variants'][number];

/**
 * SQLite has no case-insensitive `contains`, so rather than one clever query we
 * probe the handful of casings a human actually types.
 */
export function searchTerms(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  const title = lower.replace(/(^|\s)(\S)/g, (_m, lead: string, first: string) => lead + first.toUpperCase());
  return [...new Set([trimmed, lower, upper, title])];
}

export function searchFilter(search: string): Prisma.ProductWhereInput[] {
  const or: Prisma.ProductWhereInput[] = [];
  for (const term of searchTerms(search)) {
    or.push({ namePt: { contains: term } });
    or.push({ nameEn: { contains: term } });
    or.push({ descriptionPt: { contains: term } });
  }
  return or;
}

/**
 * The price a shopper sees always includes tax. When the tenant prices
 * exclusive of tax the stored number is the net amount, so the tax is added on.
 */
export function displayPriceMinor(
  unitPriceMinor: number,
  taxRateBps: number,
  pricingMode: PricingMode,
): number {
  if (pricingMode === 'inclusive') return unitPriceMinor;
  return unitPriceMinor + applyBps(unitPriceMinor, taxRateBps);
}

/**
 * The inverse, used to turn a shopper's ?minPrice/?maxPrice (which they typed
 * against the displayed price) into a bound on the stored salePriceMinor so the
 * filter can run in the database and pagination stays honest. Exact under
 * inclusive pricing; under exclusive pricing it uses the tenant default rate,
 * because a per-product rate cannot be expressed in a single query.
 */
export function storedPriceBound(displayMinor: number, entity: StorefrontEntity): number {
  if (pricingModeOf(entity) === 'inclusive') return Math.round(displayMinor);
  return Math.round((displayMinor * 10_000) / (10_000 + entity.defaultTaxRateBps));
}

export function variantStock(variant: { stockQuantity: number }): number {
  return round3(variant.stockQuantity);
}

/** Availability leaves the API as a boolean and nothing else. */
export function productInStock(product: {
  available: boolean;
  trackStock: boolean;
  stockQuantity: number;
  variants?: Array<{ stockQuantity: number }>;
}): boolean {
  if (!product.available) return false;
  if (!product.trackStock) return true;
  if (product.variants && product.variants.length > 0) {
    return product.variants.some((v) => v.stockQuantity > 0);
  }
  return product.stockQuantity > 0;
}

/** The filter behind ?inStock=true. Mirrors productInStock() as closely as SQL allows. */
export const IN_STOCK_WHERE: Prisma.ProductWhereInput = {
  available: true,
  OR: [
    { trackStock: false },
    { stockQuantity: { gt: 0 } },
    { variants: { some: { active: true, deletedAt: null, stockQuantity: { gt: 0 } } } },
  ],
};

/** Quantity a shopper may still add. Infinity when the product is not tracked. */
export function sellableQuantity(
  product: { trackStock: boolean; stockQuantity: number },
  variant: { stockQuantity: number } | null,
): number {
  if (!product.trackStock) return Number.POSITIVE_INFINITY;
  return round3(variant ? variant.stockQuantity : product.stockQuantity);
}

/* -------------------------------------------------------------------------- */
/* Carts                                                                       */
/* -------------------------------------------------------------------------- */

export const cartItemSelect = {
  id: true,
  cartId: true,
  productId: true,
  variantId: true,
  variantKey: true,
  quantity: true,
  createdAt: true,
  product: { select: storefrontProductSelect },
  variant: { select: storefrontVariantSelect },
} satisfies Prisma.CartItemSelect;

export const cartSelect = {
  id: true,
  entityId: true,
  customerId: true,
  sessionId: true,
  createdAt: true,
  updatedAt: true,
  items: { select: cartItemSelect, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CartSelect;

export type CartRow = Prisma.CartGetPayload<{ select: typeof cartSelect }>;
export type CartItemRow = CartRow['items'][number];

export async function loadCart(cartId: string, client: Tx = prisma): Promise<CartRow> {
  const cart = await client.cart.findUnique({ where: { id: cartId }, select: cartSelect });
  if (!cart) throw ApiError.notFound('Carrinho nao encontrado.');
  return cart;
}

/** Guest carts key on sessionId; a signed-in shopper keys on customerId. */
export async function findOrCreateCart(
  entityId: string,
  input: { sessionId?: string; customerId?: string },
  client: Tx = prisma,
): Promise<CartRow> {
  if (input.customerId) {
    const customer = await client.customer.findFirst({
      where: { id: input.customerId, entityId, deletedAt: null, active: true },
      select: { id: true },
    });
    if (!customer) throw ApiError.notFound('Cliente nao encontrado.');

    const existing = await client.cart.findFirst({
      where: { entityId, customerId: input.customerId },
      select: cartSelect,
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) return existing;

    return client.cart.create({
      data: { entityId, customerId: input.customerId, sessionId: input.sessionId ?? null },
      select: cartSelect,
    });
  }

  const existing = await client.cart.findFirst({
    where: { entityId, sessionId: input.sessionId, customerId: null },
    select: cartSelect,
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) return existing;

  return client.cart.create({
    data: { entityId, sessionId: input.sessionId ?? null },
    select: cartSelect,
  });
}

export function assertCartBelongsToEntity(cart: CartRow, entityId: string): void {
  if (cart.entityId !== entityId) throw ApiError.notFound('Carrinho nao encontrado.');
}

/**
 * A cart line only survives if the product is still published. Anything that
 * was unpublished or deleted since it went in is reported as unavailable rather
 * than silently priced.
 */
export function isLineSellable(item: CartItemRow): boolean {
  return Boolean(item.product && item.product.available);
}

export interface PricedLine {
  item: CartItemRow;
  unitPriceMinor: number;
  displayUnitPriceMinor: number;
  taxRateBps: number;
  quantity: number;
  lineTotalMinor: number;
  inStock: boolean;
}

/** Prices a cart straight off the database - the client never sets a price. */
export function priceCart(cart: CartRow, entity: StorefrontEntity): {
  lines: PricedLine[];
  totals: SaleTotals;
} {
  const pricingMode = pricingModeOf(entity);
  const lines: PricedLine[] = [];
  const inputs: LineInput[] = [];

  for (const item of cart.items) {
    const product = item.product;
    const variant = item.variant;
    const unitPriceMinor = Number(variant?.salePriceMinor ?? product.salePriceMinor);
    const quantity = round3(item.quantity);

    inputs.push({
      unitPriceMinor,
      quantity,
      taxRateBps: product.taxRateBps,
      pricingMode,
    });

    lines.push({
      item,
      unitPriceMinor,
      displayUnitPriceMinor: displayPriceMinor(unitPriceMinor, product.taxRateBps, pricingMode),
      taxRateBps: product.taxRateBps,
      quantity,
      lineTotalMinor: 0,
      inStock: sellableQuantity(product, variant) >= quantity && productInStock(product),
    });
  }

  const totals = computeSale(inputs, null);

  // computeSale rolls the lines up; computeLine gives the per-line gross that
  // the cart screen renders next to each row.
  lines.forEach((line, index) => {
    line.lineTotalMinor = computeLine(inputs[index]!).grossMinor;
  });

  return { lines, totals };
}

/**
 * Stock is checked but never reserved: holding stock for an abandoned cart is
 * how a shop ends up with phantom shortages. The real guard is
 * consumeForSale(preventNegative) at payment confirmation.
 */
export function assertStockAvailable(
  product: { namePt: string; trackStock: boolean; stockQuantity: number; available: boolean },
  variant: { stockQuantity: number } | null,
  requestedQuantity: number,
): void {
  if (!product.available) {
    throw ApiError.conflict(`"${product.namePt}" nao esta disponivel de momento.`);
  }
  const sellable = sellableQuantity(product, variant);
  if (requestedQuantity > sellable) {
    throw ApiError.conflict(
      sellable <= 0
        ? `"${product.namePt}": Esgotado.`
        : `Stock insuficiente para "${product.namePt}": disponivel ${sellable}.`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Payment gateways                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Integration-ready payment adapters.
 *
 * Every gateway the shop can offer implements this pair. `createPayment` is
 * what the checkout calls to obtain whatever the shopper needs next (a
 * reference to transfer to, a redirect URL, a push notification on their
 * phone); `verifyPayment` is what the callback route calls to decide whether
 * money actually arrived.
 *
 * Only the manual/bank-transfer adapter is live. The card and wallet gateways
 * are deliberate stubs: they answer 501 rather than pretend, so no code path
 * can ever mark an order paid without a real integration behind it. No adapter
 * receives or stores a card number - that is the acquirer's job, not ours.
 */
export interface CreatePaymentInput {
  entity: StorefrontEntity;
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
}

export interface PaymentIntent {
  gateway: PaymentGateway;
  /** What the shopper must do next: pay by transfer, redirect, confirm on phone. */
  action: 'manual_transfer' | 'redirect' | 'push' | 'on_delivery';
  reference: string;
  instructionsPt: string;
  redirectUrl?: string | null;
}

export interface VerifyPaymentInput {
  entity: StorefrontEntity;
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  reference: string;
  /** What the caller (gateway callback or member of staff) claims happened. */
  reportedStatus: 'pending' | 'confirmed' | 'failed';
  payload?: Record<string, string | number | boolean | null>;
}

export interface PaymentVerification {
  status: 'pending' | 'confirmed' | 'failed';
  reference: string;
  /** Sanitised, stored on the Payment row. Never contains card data. */
  gatewayPayload: Record<string, string | number | boolean | null>;
  /** True when a human with online:order:write must sign the confirmation off. */
  requiresStaffConfirmation: boolean;
}

export interface PaymentAdapter {
  gateway: PaymentGateway;
  label: string;
  /** Maps onto the Payment.method column once the sale is posted. */
  saleMethod: PaymentMethod;
  implemented: boolean;
  /** True when only a member of staff may mark the payment as received. */
  manualConfirmation: boolean;
  createPayment(input: CreatePaymentInput): Promise<PaymentIntent>;
  verifyPayment(input: VerifyPaymentInput): Promise<PaymentVerification>;
}

/** Card PANs must never reach this database; strip anything that smells like one. */
const FORBIDDEN_PAYLOAD_KEYS = [
  'cardnumber',
  'card_number',
  'pan',
  'cvv',
  'cvc',
  'securitycode',
  'expiry',
  'password',
  'token',
];

export function sanitizeGatewayPayload(
  payload: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (FORBIDDEN_PAYLOAD_KEYS.includes(key.toLowerCase().replace(/[^a-z_]/g, ''))) continue;
    if (typeof value === 'string' && /\b\d{13,19}\b/.test(value.replace(/[\s-]/g, ''))) continue;
    out[key] = value;
  }
  return out;
}

function notIntegrated(label: string): never {
  throw new ApiError(
    501,
    'not_implemented',
    `A integracao com ${label} ainda nao esta disponivel. Use transferencia bancaria ou pagamento na entrega.`,
  );
}

/** Bank transfer and cash on delivery: both settled by a human, both live. */
function manualAdapter(
  gateway: PaymentGateway,
  label: string,
  saleMethod: PaymentMethod,
  action: PaymentIntent['action'],
  instructionsPt: (reference: string) => string,
): PaymentAdapter {
  return {
    gateway,
    label,
    saleMethod,
    implemented: true,
    manualConfirmation: true,
    async createPayment(input) {
      const reference = input.orderNumber;
      return { gateway, action, reference, instructionsPt: instructionsPt(reference) };
    },
    async verifyPayment(input) {
      return {
        status: input.reportedStatus,
        reference: input.reference,
        gatewayPayload: sanitizeGatewayPayload(input.payload),
        // Nothing external vouches for a transfer, so staff sign it off.
        requiresStaffConfirmation: true,
      };
    },
  };
}

/** TODO: replace with the real integration. Answers 501 until then. */
function stubAdapter(
  gateway: PaymentGateway,
  label: string,
  saleMethod: PaymentMethod,
): PaymentAdapter {
  return {
    gateway,
    label,
    saleMethod,
    implemented: false,
    manualConfirmation: false,
    async createPayment() {
      return notIntegrated(label);
    },
    async verifyPayment() {
      return notIntegrated(label);
    },
  };
}

export const PAYMENT_ADAPTERS: Record<PaymentGateway, PaymentAdapter> = {
  bank_transfer: manualAdapter(
    'bank_transfer',
    'Transferencia Bancaria',
    'bank_transfer',
    'manual_transfer',
    (reference) =>
      `Transfira o valor total e indique a referencia ${reference} no descritivo. A encomenda segue assim que a transferencia for confirmada.`,
  ),
  cash_on_delivery: manualAdapter(
    'cash_on_delivery',
    'Pagamento na Entrega',
    'cash',
    'on_delivery',
    (reference) => `Pague em numerario no momento da entrega. Referencia ${reference}.`,
  ),
  // TODO(multicaixa): EMIS Multicaixa Express push-to-phone API.
  multicaixa_express: stubAdapter('multicaixa_express', 'Multicaixa Express', 'multicaixa_express'),
  // TODO(stripe): Stripe PaymentIntents + webhook signature verification.
  stripe: stubAdapter('stripe', 'Stripe', 'card'),
  // TODO(paypal): PayPal Orders v2 + webhook verification.
  paypal: stubAdapter('paypal', 'PayPal', 'custom'),
};

export function adapterFor(gateway: PaymentGateway): PaymentAdapter {
  const adapter = PAYMENT_ADAPTERS[gateway];
  if (!adapter) throw ApiError.unprocessable('Metodo de pagamento invalido.');
  return adapter;
}

/** Fails fast with 501 before anything is written for an unintegrated gateway. */
export function assertGatewayAvailable(gateway: PaymentGateway): PaymentAdapter {
  const adapter = adapterFor(gateway);
  if (!adapter.implemented) notIntegrated(adapter.label);
  return adapter;
}

/* -------------------------------------------------------------------------- */
/* Fulfilment                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * pending -> processing -> (shipped | ready_for_pickup) -> delivered -> completed
 * with cancelled reachable from anything that has not yet been delivered.
 */
export const STATUS_FLOW: Record<string, string[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'ready_for_pickup', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  ready_for_pickup: ['delivered', 'cancelled'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

export const STATUS_LABELS_PT: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Em preparacao',
  ready_for_pickup: 'Pronta para levantamento',
  shipped: 'Expedida',
  delivered: 'Entregue',
  completed: 'Concluida',
  cancelled: 'Cancelada',
};

export function assertTransition(from: string, to: string, fulfilment: FulfilmentMethod): void {
  if (from === to) {
    throw ApiError.conflict(`A encomenda ja esta em "${STATUS_LABELS_PT[to] ?? to}".`);
  }
  const allowed = STATUS_FLOW[from] ?? [];
  if (!allowed.includes(to)) {
    throw ApiError.conflict(
      `Transicao invalida: ${STATUS_LABELS_PT[from] ?? from} -> ${STATUS_LABELS_PT[to] ?? to}.`,
    );
  }
  if (to === 'shipped' && fulfilment !== 'delivery') {
    throw ApiError.conflict('So encomendas com entrega podem ser expedidas.');
  }
  if (to === 'ready_for_pickup' && fulfilment !== 'pickup') {
    throw ApiError.conflict('So encomendas com levantamento podem ficar prontas para levantamento.');
  }
}

/** Flat shipping fee, kept in the per-tenant Setting table. Defaults to zero. */
export async function shippingFeeMinor(
  entityId: string,
  fulfilment: FulfilmentMethod,
  client: Tx = prisma,
): Promise<number> {
  if (fulfilment === 'pickup') return 0;
  const row = await client.setting.findUnique({
    where: { entityId_key: { entityId, key: 'onlineShippingFlatMinor' } },
    select: { value: true },
  });
  if (!row) return 0;
  const parsed = Number(String(row.value).replace(/"/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}
