import { Prisma } from '@prisma/client';
import {
  computeLine,
  computeSale,
  SOCKET_EVENTS,
  type FulfilmentMethod,
  type LineInput,
  type PaymentGateway,
} from '@pos/shared';

import { ApiError } from '../../lib/http.js';
import { prisma, TX_OPTIONS, type Tx } from '../../lib/prisma.js';
import {
  applyStockChange,
  consumeForSale,
  defaultLocationId,
  publishStockChanges,
  round3,
  type StockChangeResult,
} from '../../lib/inventory.js';
import { nextDocumentNumber } from '../../lib/sequence.js';
import { emitToEntity } from '../../lib/realtime.js';

import { onlineOrderSelect, type OnlineOrderRow } from './mappers.js';
import {
  adapterFor,
  assertCartBelongsToEntity,
  costingMethodOf,
  loadCart,
  pricingModeOf,
  publishedProductWhere,
  sanitizeGatewayPayload,
  sellableQuantity,
  shippingFeeMinor,
  type StorefrontEntity,
} from './service.js';
import type { CreateOrderInput, PayOrderInput } from './schemas.js';

/**
 * Checkout, payment confirmation and the fulfilment lifecycle.
 *
 * The single most important rule in this file: placing an order does NOT touch
 * stock. Stock moves once, on confirmed payment, through consumeForSale() - so
 * the web shop and the physical register draw from exactly the same pool and an
 * abandoned checkout never sterilises inventory.
 */

export interface OrderActor {
  userId?: string | null;
  userName?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Placing an order                                                            */
/* -------------------------------------------------------------------------- */

interface PreparedLine {
  productId: string;
  variantId: string | null;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
  totalMinor: number;
}

export async function placeOrder(
  entity: StorefrontEntity,
  input: CreateOrderInput,
): Promise<OnlineOrderRow> {
  const cart = await loadCart(input.cartId);
  assertCartBelongsToEntity(cart, entity.id);
  if (cart.items.length === 0) throw ApiError.unprocessable('O carrinho esta vazio.');

  let pickupLocationId: string | null = null;
  if (input.fulfilmentMethod === 'pickup') {
    const location = await prisma.location.findFirst({
      where: { id: input.pickupLocationId, entityId: entity.id, active: true },
      select: { id: true },
    });
    if (!location) throw ApiError.unprocessable('Ponto de levantamento invalido.');
    pickupLocationId = location.id;
  }

  // Prices are re-read from the database here - whatever the client believed
  // the cart was worth is irrelevant.
  const publishedIds = new Set(
    (
      await prisma.product.findMany({
        where: {
          ...publishedProductWhere(entity.id),
          id: { in: cart.items.map((item) => item.productId) },
        },
        select: { id: true },
      })
    ).map((row) => row.id),
  );

  const pricingMode = pricingModeOf(entity);
  const lineInputs: LineInput[] = [];
  const prepared: PreparedLine[] = [];

  for (const item of cart.items) {
    const product = item.product;
    const variant = item.variant;

    if (!publishedIds.has(product.id) || !product.available) {
      throw ApiError.conflict(`"${product.namePt}" ja nao esta disponivel na loja.`);
    }

    const quantity = round3(item.quantity);
    const sellable = sellableQuantity(product, variant);
    if (quantity > sellable) {
      throw ApiError.conflict(
        sellable <= 0
          ? `"${product.namePt}": Esgotado.`
          : `Stock insuficiente para "${product.namePt}": disponivel ${sellable}.`,
      );
    }

    const unitPriceMinor = Number(variant?.salePriceMinor ?? product.salePriceMinor);
    const lineInput: LineInput = {
      unitPriceMinor,
      quantity,
      taxRateBps: product.taxRateBps,
      pricingMode,
    };
    lineInputs.push(lineInput);
    prepared.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      name: variant ? `${product.namePt} (${variant.sku})` : product.namePt,
      quantity,
      unitPriceMinor,
      taxRateBps: product.taxRateBps,
      totalMinor: computeLine(lineInput).grossMinor,
    });
  }

  const totals = computeSale(lineInputs, null);
  const shippingMinor = await shippingFeeMinor(entity.id, input.fulfilmentMethod);

  // Reserved outside the transaction on purpose: lib/sequence creates-then-
  // updates, and a failed INSERT inside a transaction is unrecoverable on
  // PostgreSQL. A rolled-back checkout leaves a gap in WEB numbering, which is
  // harmless - the fiscal number is the Sale receipt, issued on payment.
  const orderNumber = await nextDocumentNumber(entity.id, 'online_order');

  const orderId = await prisma.$transaction(async (tx) => {
    const customerId = await resolveCheckoutCustomerId(tx, entity.id, input, cart.customerId);
    const shippingAddressId =
      input.fulfilmentMethod === 'delivery' && input.shippingAddress
        ? await createShippingAddress(tx, customerId, input)
        : null;

    const created = await tx.onlineOrder.create({
      data: {
        entityId: entity.id,
        orderNumber,
        customerId,
        guestName: input.guestName ?? null,
        guestEmail: input.guestEmail ?? null,
        guestPhone: input.guestPhone ?? null,
        shippingAddressId,
        fulfilmentMethod: input.fulfilmentMethod,
        pickupLocationId,
        status: 'pending',
        paymentStatus: 'pending',
        paymentGateway: input.paymentGateway,
        subtotalMinor: BigInt(Math.round(totals.subtotalMinor)),
        shippingMinor: BigInt(Math.round(shippingMinor)),
        discountMinor: BigInt(Math.round(totals.discountMinor)),
        taxMinor: BigInt(Math.round(totals.taxMinor)),
        totalMinor: BigInt(Math.round(totals.totalMinor + shippingMinor)),
        note: input.note ?? null,
        lines: {
          create: prepared.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            name: line.name,
            quantity: line.quantity,
            unitPriceMinor: BigInt(Math.round(line.unitPriceMinor)),
            taxRateBps: line.taxRateBps,
            totalMinor: BigInt(Math.round(line.totalMinor)),
          })),
        },
      },
      select: { id: true },
    });

    // The cart is emptied, not deleted: the browser session keeps working.
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return created.id;
  }, TX_OPTIONS);

  const order = await loadOrderById(entity.id, orderId);
  emitToEntity(entity.id, SOCKET_EVENTS.ONLINE_ORDER_CREATED, {
    entityId: entity.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    totalMinor: Number(order.totalMinor),
    fulfilmentMethod: order.fulfilmentMethod,
    customerName: order.customer?.name ?? order.guestName ?? null,
    createdAt: order.createdAt.toISOString(),
  });

  return order;
}

/**
 * A delivery address has to hang off a Customer row (the schema requires it),
 * so a guest who asks for delivery gets a lightweight customer record - matched
 * on email or phone first, so a returning guest is recognised rather than
 * duplicated. Pickup guests stay anonymous.
 */
async function resolveCheckoutCustomerId(
  tx: Tx,
  entityId: string,
  input: CreateOrderInput,
  cartCustomerId: string | null,
): Promise<string | null> {
  const requested = input.customerId ?? cartCustomerId ?? null;
  if (requested) {
    const customer = await tx.customer.findFirst({
      where: { id: requested, entityId, deletedAt: null, active: true },
      select: { id: true },
    });
    if (!customer) throw ApiError.unprocessable('Cliente nao encontrado.');
    return customer.id;
  }

  if (input.fulfilmentMethod !== 'delivery') return null;

  const or: Prisma.CustomerWhereInput[] = [];
  if (input.guestEmail) or.push({ email: input.guestEmail });
  if (input.guestPhone) or.push({ phone: input.guestPhone });
  if (or.length > 0) {
    const existing = await tx.customer.findFirst({
      where: { entityId, deletedAt: null, OR: or },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const created = await tx.customer.create({
    data: {
      entityId,
      name: input.guestName ?? input.shippingAddress?.recipient ?? 'Cliente Online',
      email: input.guestEmail ?? null,
      phone: input.guestPhone ?? null,
      notes: 'Criado automaticamente na loja online.',
    },
    select: { id: true },
  });
  return created.id;
}

async function createShippingAddress(
  tx: Tx,
  customerId: string | null,
  input: CreateOrderInput,
): Promise<string | null> {
  const address = input.shippingAddress;
  if (!address || !customerId) return null;

  const created = await tx.shippingAddress.create({
    data: {
      customerId,
      label: address.label ?? null,
      recipient: address.recipient,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? null,
      city: address.city,
      province: address.province ?? null,
      postalCode: address.postalCode ?? null,
      country: address.country ?? 'AO',
    },
    select: { id: true },
  });
  return created.id;
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

export async function loadOrderById(
  entityId: string,
  orderId: string,
  client: Tx = prisma,
): Promise<OnlineOrderRow> {
  const order = await client.onlineOrder.findFirst({
    where: { id: orderId, entityId },
    select: onlineOrderSelect,
  });
  if (!order) throw ApiError.notFound('Encomenda nao encontrada.');
  return order;
}

export async function loadOrderByNumber(
  entityId: string,
  orderNumber: string,
  client: Tx = prisma,
): Promise<OnlineOrderRow> {
  const order = await client.onlineOrder.findFirst({
    where: { entityId, orderNumber },
    select: onlineOrderSelect,
  });
  if (!order) throw ApiError.notFound('Encomenda nao encontrada.');
  return order;
}

/* -------------------------------------------------------------------------- */
/* Payment                                                                     */
/* -------------------------------------------------------------------------- */

export interface PaymentOutcome {
  order: OnlineOrderRow;
  status: 'pending' | 'confirmed' | 'failed';
  saleId: string | null;
}

/**
 * The gateway callback / manual confirmation surface.
 *
 * On a confirmed payment everything happens in ONE transaction: stock comes
 * off through consumeForSale(), the Sale + lines + Payment are posted to the
 * ledger, and the order is linked to the sale. publishStockChanges runs after
 * the commit, which is what lights up the storefront and every open register.
 */
export async function applyPayment(
  entity: StorefrontEntity,
  order: OnlineOrderRow,
  input: PayOrderInput,
  actor: OrderActor,
): Promise<PaymentOutcome> {
  if (order.status === 'cancelled') {
    throw ApiError.conflict('A encomenda esta cancelada.');
  }
  if (order.paymentStatus === 'confirmed') {
    // Gateways retry. A second callback is a no-op, never a second sale.
    return { order, status: 'confirmed', saleId: order.saleId };
  }

  const adapter = adapterFor(input.gateway as PaymentGateway);
  const verification = await adapter.verifyPayment({
    entity,
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountMinor: Number(order.totalMinor),
    reference: input.reference,
    reportedStatus: input.status,
    payload: sanitizeGatewayPayload(input.payload),
  });

  if (verification.status !== 'confirmed') {
    const updated = await prisma.onlineOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: verification.status === 'failed' ? 'failed' : 'pending',
        paymentGateway: adapter.gateway,
        paymentReference: verification.reference,
      },
      select: { id: true },
    });
    const reloaded = await loadOrderById(entity.id, updated.id);
    emitOrderUpdated(entity.id, reloaded);
    return { order: reloaded, status: verification.status, saleId: null };
  }

  const pricingMode = pricingModeOf(entity);
  const lineInputs: LineInput[] = order.lines.map((line) => ({
    unitPriceMinor: Number(line.unitPriceMinor),
    quantity: line.quantity,
    taxRateBps: line.taxRateBps,
    pricingMode,
  }));
  const totals = computeSale(lineInputs, null);

  const locationId =
    order.pickupLocationId ?? (await defaultLocationId(entity.id, prisma));

  // Reserved outside the transaction - see the note in placeOrder().
  const receiptNumber = await nextDocumentNumber(entity.id, 'receipt');

  const { saleId, changes } = await prisma.$transaction(async (tx) => {
    const consumption = await consumeForSale(
      tx,
      entity.id,
      order.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        locationId,
      })),
      {
        reference: order.orderNumber,
        userId: actor.userId ?? null,
        userName: actor.userName ?? 'Loja Online',
        costingMethod: costingMethodOf(entity),
        preventNegative: true,
      },
    );

    const sale = await tx.sale.create({
      data: {
        entityId: entity.id,
        locationId,
        receiptNumber,
        channel: 'online',
        status: 'completed',
        cashierId: actor.userId ?? null,
        cashierName: actor.userName ?? 'Loja Online',
        customerId: order.customerId,
        subtotalMinor: BigInt(Math.round(totals.subtotalMinor)),
        discountMinor: BigInt(Math.round(totals.discountMinor)),
        netMinor: BigInt(Math.round(totals.netMinor)),
        taxMinor: BigInt(Math.round(totals.taxMinor)),
        serviceChargeMinor: order.shippingMinor,
        totalMinor: order.totalMinor,
        cogsMinor: BigInt(Math.round(consumption.cogsMinor)),
        taxBreakdown: JSON.stringify(totals.taxBreakdown),
        receiptEmail: order.guestEmail ?? order.customer?.email ?? null,
        receiptPhone: order.guestPhone ?? order.customer?.phone ?? null,
        note: `Encomenda online ${order.orderNumber}`,
        // Unique per tenant: a replayed callback can never post twice.
        idempotencyKey: `online:${order.id}`,
        completedAt: new Date(),
        lines: {
          create: order.lines.map((line, index) => {
            const computed = computeLine(lineInputs[index]!);
            return {
              productId: line.productId,
              variantId: line.variantId,
              name: line.name,
              sku: line.variant?.sku ?? line.product?.sku ?? null,
              unit: line.product?.unit ?? 'each',
              quantity: line.quantity,
              unitPriceMinor: BigInt(Math.round(Number(line.unitPriceMinor))),
              unitCostMinor: BigInt(Math.round(consumption.unitCosts[index] ?? 0)),
              taxRateBps: line.taxRateBps,
              netMinor: BigInt(Math.round(computed.netMinor)),
              taxMinor: BigInt(Math.round(computed.taxMinor)),
              totalMinor: BigInt(Math.round(computed.grossMinor)),
              sortOrder: index,
            };
          }),
        },
        payments: {
          create: [
            {
              method: adapter.saleMethod,
              label: adapter.label,
              amountMinor: order.totalMinor,
              reference: verification.reference,
              status: 'confirmed',
              gateway: adapter.gateway,
              gatewayPayload: JSON.stringify(verification.gatewayPayload),
            },
          ],
        },
      },
      select: { id: true },
    });

    // Freeze the cost on the order lines too, so margin reporting can read the
    // online order without joining back through the sale.
    for (const [index, line] of order.lines.entries()) {
      await tx.onlineOrderLine.update({
        where: { id: line.id },
        data: { unitCostMinor: BigInt(Math.round(consumption.unitCosts[index] ?? 0)) },
      });
    }

    await tx.onlineOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'confirmed',
        status: 'processing',
        paymentGateway: adapter.gateway,
        paymentReference: verification.reference,
        saleId: sale.id,
        confirmedAt: new Date(),
      },
    });

    return { saleId: sale.id, changes: consumption.changes };
  }, TX_OPTIONS);

  // AFTER the commit: announcing stock that could still roll back would show
  // the storefront quantities that never existed.
  await publishStockChanges(entity.id, changes);

  const reloaded = await loadOrderById(entity.id, order.id);
  emitOrderUpdated(entity.id, reloaded);
  return { order: reloaded, status: 'confirmed', saleId };
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                   */
/* -------------------------------------------------------------------------- */

export interface StatusChangeResult {
  order: OnlineOrderRow;
  restocked: boolean;
}

export async function changeStatus(
  entity: StorefrontEntity,
  order: OnlineOrderRow,
  nextStatus: string,
  actor: OrderActor,
  note?: string | null,
): Promise<StatusChangeResult> {
  const now = new Date();
  const data: Prisma.OnlineOrderUpdateInput = { status: nextStatus };
  if (nextStatus === 'shipped') data.shippedAt = now;
  if (nextStatus === 'delivered') data.deliveredAt = now;
  // The buyer's own note is never overwritten - the back office appends to it.
  if (note) data.note = [order.note, note].filter(Boolean).join(' | ');

  // Cancelling an order whose payment was confirmed has to give the stock back
  // and void the sale, or the ledger and the shelf disagree forever.
  const mustRestock = nextStatus === 'cancelled' && Boolean(order.saleId);

  const changes = await prisma.$transaction(async (tx) => {
    const restocked: StockChangeResult[] = [];

    if (mustRestock) {
      const locationId =
        order.pickupLocationId ?? (await defaultLocationId(entity.id, tx));

      for (const line of order.lines) {
        const change = await applyStockChange(tx, {
          entityId: entity.id,
          productId: line.productId,
          variantId: line.variantId,
          locationId,
          quantity: round3(line.quantity),
          type: 'refund',
          unitCostMinor: Number(line.unitCostMinor) || null,
          reason: 'Encomenda online cancelada',
          reference: order.orderNumber,
          userId: actor.userId ?? null,
          userName: actor.userName ?? null,
        });
        restocked.push(change);
      }

      if (order.saleId) {
        await tx.sale.update({
          where: { id: order.saleId },
          data: { status: 'voided' },
        });
      }
      data.paymentStatus = 'refunded';
    }

    await tx.onlineOrder.update({ where: { id: order.id }, data });
    return restocked;
  }, TX_OPTIONS);

  if (changes.length > 0) await publishStockChanges(entity.id, changes);

  const reloaded = await loadOrderById(entity.id, order.id);
  emitOrderUpdated(entity.id, reloaded);
  return { order: reloaded, restocked: changes.length > 0 };
}

export function emitOrderUpdated(entityId: string, order: OnlineOrderRow): void {
  emitToEntity(entityId, SOCKET_EVENTS.ONLINE_ORDER_UPDATED, {
    entityId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfilmentMethod: order.fulfilmentMethod as FulfilmentMethod,
    totalMinor: Number(order.totalMinor),
    updatedAt: order.updatedAt.toISOString(),
  });
}
