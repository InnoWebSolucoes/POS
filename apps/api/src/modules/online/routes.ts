import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { SOCKET_EVENTS, type FulfilmentMethod, type PaymentGateway } from '@pos/shared';

import { AUDIT_ACTIONS, auditRequest } from '../../lib/audit.js';
import {
  ApiError,
  asyncHandler,
  pageParams,
  paginated,
  parsedQuery,
  validateBody,
  validateQuery,
} from '../../lib/http.js';
import {
  canSeeCost,
  optionalAuth,
  requireAuth,
  requireEntity,
  requirePermission,
} from '../../lib/middleware.js';
import { prisma } from '../../lib/prisma.js';
import { round3 } from '../../lib/inventory.js';
import { emitToEntity } from '../../lib/realtime.js';

import {
  buildPublishedCategoryTree,
  onlineOrderSelect,
  toCartDto,
  toOnlineOrderDto,
  toPublicOrderStatusDto,
  toStorefrontEntityDto,
  toStorefrontProductDto,
  type CategoryCountRow,
  type StorefrontProductDetailDto,
} from './mappers.js';
import {
  applyPayment,
  changeStatus,
  emitOrderUpdated,
  loadOrderById,
  loadOrderByNumber,
  placeOrder,
} from './orders.js';
import {
  adapterFor,
  assertGatewayAvailable,
  assertStockAvailable,
  assertStorefrontOpen,
  assertTransition,
  entitySlugFrom,
  findOrCreateCart,
  IN_STOCK_WHERE,
  loadCart,
  priceCart,
  publishedProductWhere,
  resolveEntityById,
  resolveEntityBySlug,
  searchFilter,
  searchTerms,
  storedPriceBound,
  storefrontProductSelect,
  storefrontVariantSelect,
  type CartRow,
  type StorefrontEntity,
} from './service.js';
import {
  addCartItemSchema,
  adminOrderQuerySchema,
  catalogueQuerySchema,
  createCartSchema,
  createOrderSchema,
  mergeCartSchema,
  orderLookupQuerySchema,
  payOrderSchema,
  trackingSchema,
  updateCartItemSchema,
  updateStatusSchema,
  type AddCartItemInput,
  type AdminOrderQuery,
  type CatalogueQuery,
  type CreateCartInput,
  type CreateOrderInput,
  type MergeCartInput,
  type OrderLookupQuery,
  type PayOrderInput,
  type TrackingInput,
  type UpdateCartItemInput,
  type UpdateStatusInput,
} from './schemas.js';
import { renderPackingSlip } from './packing-slip.js';

/**
 * Online store: public storefront, cart, checkout and back-office fulfilment.
 *
 * Mounted at /api/online (see app.ts). Everything under /storefront, /cart and
 * /orders is reachable without a session - the tenant comes from the slug, and
 * each handler is written on the assumption that the caller is hostile.
 * Everything under /admin needs a session, a tenant and a permission.
 */
const router = Router();

/* ========================================================================== */
/* Storefront (public)                                                        */
/* ========================================================================== */

function catalogueOrderBy(
  sort: CatalogueQuery['sort'],
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price':
      return [{ salePriceMinor: 'asc' }, { namePt: 'asc' }];
    case 'name':
      return [{ namePt: 'asc' }];
    case 'newest':
    default:
      return [{ createdAt: 'desc' }, { namePt: 'asc' }];
  }
}

/**
 * GET /api/online/storefront/:entitySlug
 * Branding for the shop front. A tenant with nothing published is a 404 - the
 * `mode` column is not the gate, a retail supermarket may sell online too.
 */
router.get(
  '/storefront/:entitySlug',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const entity = await resolveEntityBySlug(entitySlugFrom(req));
    await assertStorefrontOpen(entity.id);
    res.json({ data: toStorefrontEntityDto(entity) });
  }),
);

/**
 * GET /api/online/storefront/:entitySlug/products
 * ?search= ?categoryId= ?minPrice= ?maxPrice= ?inStock=true ?sort=price|name|newest
 */
router.get(
  '/storefront/:entitySlug/products',
  optionalAuth,
  validateQuery(catalogueQuerySchema),
  asyncHandler(async (req, res) => {
    const entity = await resolveEntityBySlug(entitySlugFrom(req));
    const query = parsedQuery<CatalogueQuery>(res);

    const and: Prisma.ProductWhereInput[] = [];
    if (query.search) and.push({ OR: searchFilter(query.search) });
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.minPrice !== undefined) {
      and.push({ salePriceMinor: { gte: BigInt(storedPriceBound(query.minPrice, entity)) } });
    }
    if (query.maxPrice !== undefined) {
      and.push({ salePriceMinor: { lte: BigInt(storedPriceBound(query.maxPrice, entity)) } });
    }
    if (query.inStock) and.push(IN_STOCK_WHERE);

    const where: Prisma.ProductWhereInput = publishedProductWhere(entity.id);
    if (and.length > 0) where.AND = and;

    const params = pageParams(query);
    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: storefrontProductSelect,
        orderBy: catalogueOrderBy(query.sort),
        skip: params.skip,
        take: params.take,
      }),
      prisma.product.count({ where }),
    ]);

    res.json(paginated(rows.map((row) => toStorefrontProductDto(row, entity)), total, params));
  }),
);

/**
 * GET /api/online/storefront/:entitySlug/products/:idOrSlug
 * Detail plus up to 8 published siblings from the same category.
 */
router.get(
  '/storefront/:entitySlug/products/:idOrSlug',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const entity = await resolveEntityBySlug(entitySlugFrom(req));
    const idOrSlug = String(req.params.idOrSlug ?? '').trim();
    if (!idOrSlug) throw ApiError.notFound('Produto nao encontrado.');

    const product = await prisma.product.findFirst({
      where: {
        ...publishedProductWhere(entity.id),
        OR: [{ id: idOrSlug }, { onlineSlug: idOrSlug }],
      },
      select: storefrontProductSelect,
    });
    if (!product) throw ApiError.notFound('Produto nao encontrado.');

    const related = product.categoryId
      ? await prisma.product.findMany({
          where: {
            ...publishedProductWhere(entity.id),
            categoryId: product.categoryId,
            id: { not: product.id },
          },
          select: storefrontProductSelect,
          orderBy: [{ createdAt: 'desc' }],
          take: 8,
        })
      : [];

    const dto: StorefrontProductDetailDto = {
      ...toStorefrontProductDto(product, entity),
      related: related.map((row) => toStorefrontProductDto(row, entity)),
    };
    res.json({ data: dto });
  }),
);

/** GET /api/online/storefront/:entitySlug/categories - branches with published stock only. */
router.get(
  '/storefront/:entitySlug/categories',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const entity = await resolveEntityBySlug(entitySlugFrom(req));

    const rows = await prisma.category.findMany({
      where: { entityId: entity.id, deletedAt: null, active: true },
      select: {
        id: true,
        parentId: true,
        namePt: true,
        nameEn: true,
        color: true,
        iconUrl: true,
        sortOrder: true,
        _count: {
          select: { products: { where: { deletedAt: null, active: true, publishOnline: true } } },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { namePt: 'asc' }],
    });

    res.json({ data: buildPublishedCategoryTree(rows as CategoryCountRow[]) });
  }),
);

/* ========================================================================== */
/* Cart (public)                                                              */
/* ========================================================================== */

function respondWithCart(
  res: Response,
  cart: CartRow,
  entity: StorefrontEntity,
  status = 200,
): void {
  res.status(status).json({ data: toCartDto(cart, entity, priceCart(cart, entity)) });
}

/** Touches the cart so `updatedAt` reflects the last shopper activity. */
async function touchCart(cartId: string): Promise<void> {
  await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
}

/** POST /api/online/cart - creates or returns the cart for a session / customer. */
router.post(
  '/cart',
  optionalAuth,
  validateBody(createCartSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as CreateCartInput;
    const entity = await resolveEntityBySlug(input.entitySlug);
    const cart = await findOrCreateCart(entity.id, {
      sessionId: input.sessionId,
      customerId: input.customerId,
    });
    respondWithCart(res, cart, entity, 201);
  }),
);

/** GET /api/online/cart/:cartId */
router.get(
  '/cart/:cartId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const cart = await loadCart(String(req.params.cartId));
    const entity = await resolveEntityById(cart.entityId);
    respondWithCart(res, cart, entity);
  }),
);

/**
 * POST /api/online/cart/:cartId/items
 * Upserts on (cartId, productId, variantKey) - variantKey is '' for a plain
 * product, because a NULL would defeat the unique index and duplicate the line.
 * Stock is checked but never reserved.
 */
router.post(
  '/cart/:cartId/items',
  optionalAuth,
  validateBody(addCartItemSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as AddCartItemInput;
    const cart = await loadCart(String(req.params.cartId));
    const entity = await resolveEntityById(cart.entityId);

    const product = await prisma.product.findFirst({
      where: { ...publishedProductWhere(entity.id), id: input.productId },
      select: storefrontProductSelect,
    });
    if (!product) throw ApiError.notFound('Produto nao encontrado.');

    let variant: { id: string; stockQuantity: number } | null = null;
    if (input.variantId) {
      const found = await prisma.productVariant.findFirst({
        where: {
          id: input.variantId,
          productId: product.id,
          entityId: entity.id,
          active: true,
          deletedAt: null,
        },
        select: storefrontVariantSelect,
      });
      if (!found) throw ApiError.notFound('Variante nao encontrada.');
      variant = found;
    }

    const variantKey = variant?.id ?? '';
    const existing = await prisma.cartItem.findUnique({
      where: {
        cartId_productId_variantKey: { cartId: cart.id, productId: product.id, variantKey },
      },
      select: { id: true, quantity: true },
    });

    const quantity = round3((existing?.quantity ?? 0) + input.quantity);
    assertStockAvailable(product, variant, quantity);

    if (existing) {
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity } });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId: variant?.id ?? null,
          variantKey,
          quantity,
        },
      });
    }
    await touchCart(cart.id);

    respondWithCart(res, await loadCart(cart.id), entity, 201);
  }),
);

/** PATCH /api/online/cart/:cartId/items/:id - quantity 0 removes the line. */
router.patch(
  '/cart/:cartId/items/:id',
  optionalAuth,
  validateBody(updateCartItemSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as UpdateCartItemInput;
    const cart = await loadCart(String(req.params.cartId));
    const entity = await resolveEntityById(cart.entityId);

    const item = cart.items.find((line) => line.id === req.params.id);
    if (!item) throw ApiError.notFound('Linha do carrinho nao encontrada.');

    const quantity = round3(input.quantity);
    if (quantity <= 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      assertStockAvailable(item.product, item.variant, quantity);
      await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    }
    await touchCart(cart.id);

    respondWithCart(res, await loadCart(cart.id), entity);
  }),
);

/** DELETE /api/online/cart/:cartId/items/:id */
router.delete(
  '/cart/:cartId/items/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const cart = await loadCart(String(req.params.cartId));
    const entity = await resolveEntityById(cart.entityId);

    const item = cart.items.find((line) => line.id === req.params.id);
    if (!item) throw ApiError.notFound('Linha do carrinho nao encontrada.');

    await prisma.cartItem.delete({ where: { id: item.id } });
    await touchCart(cart.id);

    respondWithCart(res, await loadCart(cart.id), entity);
  }),
);

/**
 * POST /api/online/cart/:cartId/merge
 * Login: whatever the shopper put in the basket as a guest joins the basket on
 * their account. Quantities add up; the guest cart is then discarded.
 */
router.post(
  '/cart/:cartId/merge',
  optionalAuth,
  validateBody(mergeCartSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as MergeCartInput;
    const target = await loadCart(String(req.params.cartId));
    const entity = await resolveEntityById(target.entityId);

    const guest = await prisma.cart.findFirst({
      where: { entityId: target.entityId, sessionId: input.sessionId, customerId: null },
      select: { id: true, items: { select: { productId: true, variantId: true, variantKey: true, quantity: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    if (!guest || guest.id === target.id) {
      respondWithCart(res, target, entity);
      return;
    }

    for (const item of guest.items) {
      const existing = target.items.find(
        (line) => line.productId === item.productId && line.variantKey === item.variantKey,
      );
      const quantity = round3((existing?.quantity ?? 0) + item.quantity);

      if (existing) {
        await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity } });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId: target.id,
            productId: item.productId,
            variantId: item.variantId,
            variantKey: item.variantKey,
            quantity,
          },
        });
      }
    }

    await prisma.cart.delete({ where: { id: guest.id } });
    await touchCart(target.id);

    respondWithCart(res, await loadCart(target.id), entity);
  }),
);

/* ========================================================================== */
/* Checkout (public)                                                          */
/* ========================================================================== */

/**
 * POST /api/online/orders
 * Prices are re-read from the database, the order is created as
 * pending/pending, and the cart is emptied. Stock is NOT deducted here: it
 * moves only when the payment is confirmed.
 */
router.post(
  '/orders',
  optionalAuth,
  validateBody(createOrderSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as CreateOrderInput;
    const entity = await resolveEntityBySlug(input.entitySlug);

    // Refuse before writing anything if the gateway is still a stub.
    const adapter = assertGatewayAvailable(input.paymentGateway);

    const order = await placeOrder(entity, input);
    const payment = await adapter.createPayment({
      entity,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountMinor: Number(order.totalMinor),
      currency: entity.currency,
      customerEmail: order.guestEmail ?? order.customer?.email ?? null,
      customerPhone: order.guestPhone ?? order.customer?.phone ?? null,
    });

    res.status(201).json({ data: toOnlineOrderDto(order), payment });
  }),
);

/**
 * Phone numbers are stored however the shopper typed them (+244 923 000 111,
 * 923000111, ...). Comparing the trailing national digits keeps the lookup
 * usable without loosening it: nine digits plus the order number is still a
 * space nobody enumerates.
 */
function normalisePhone(value: string | null | undefined): string {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/**
 * GET /api/online/orders/:orderNumber?entitySlug=&email=|phone=
 * Public status lookup. The contact detail on the order must match, otherwise
 * the answer is an ordinary 404 - a 403 would confirm the number exists.
 */
const lookupOrder = asyncHandler(async (req, res) => {
  const query = parsedQuery<OrderLookupQuery>(res);
  const entity = await resolveEntityBySlug(query.entitySlug ?? entitySlugFrom(req));

  // Order numbers carry a slash ("WEB2026/000123"), so the shopper may paste it
  // raw across two path segments or send it percent-encoded in one.
  const orderNumber = req.params.serial
    ? `${req.params.orderNumber}/${req.params.serial}`
    : String(req.params.orderNumber);

  const order = await loadOrderByNumber(entity.id, orderNumber);

  const email = query.email?.trim().toLowerCase();
  const phone = query.phone ? normalisePhone(query.phone) : '';

  const emailMatches =
    Boolean(email) &&
    [order.guestEmail, order.customer?.email].some((v) => v?.trim().toLowerCase() === email);
  const phoneMatches =
    phone.length >= 6 &&
    [order.guestPhone, order.customer?.phone].some((v) => normalisePhone(v) === phone);

  if (!emailMatches && !phoneMatches) throw ApiError.notFound('Encomenda nao encontrada.');

  res.json({ data: toPublicOrderStatusDto(order, entity) });
});

router.get('/orders/:orderNumber', optionalAuth, validateQuery(orderLookupQuerySchema), lookupOrder);
router.get(
  '/orders/:orderNumber/:serial',
  optionalAuth,
  validateQuery(orderLookupQuerySchema),
  lookupOrder,
);

/**
 * POST /api/online/orders/:id/pay
 * Gateway callback / manual confirmation. Stubbed gateways answer 501; the
 * manual ones (transferencia bancaria, pagamento na entrega) can only be
 * confirmed by a member of staff holding online:order:write, because nothing
 * external vouches for them.
 */
router.post(
  '/orders/:id/pay',
  optionalAuth,
  validateBody(payOrderSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as PayOrderInput;

    const order = await prisma.onlineOrder.findUnique({
      where: { id: String(req.params.id) },
      select: onlineOrderSelect,
    });
    if (!order) throw ApiError.notFound('Encomenda nao encontrada.');

    // A manual gateway has no external witness, so no anonymous caller may move
    // its payment state in any direction - not to confirmed, not to failed.
    const adapter = adapterFor(input.gateway as PaymentGateway);
    if (adapter.manualConfirmation) {
      const auth = req.auth;
      const sameTenant =
        auth?.role === 'super_admin' ? req.entityId === order.entityId : auth?.entityId === order.entityId;
      if (!auth || !auth.permissions.includes('online:order:write') || !sameTenant) {
        throw ApiError.forbidden('A confirmacao deste pagamento tem de ser feita por um funcionario.');
      }
    }

    const entity = await resolveEntityById(order.entityId);
    const outcome = await applyPayment(entity, order, input, {
      userId: req.auth?.userId ?? null,
      userName: req.auth?.name ?? 'Loja Online',
    });

    await auditRequest(
      req,
      {
        entityId: order.entityId,
        action: 'online_order.payment',
        targetType: 'online_order',
        targetId: order.id,
        details: {
          orderNumber: order.orderNumber,
          gateway: adapter.gateway,
          status: outcome.status,
          saleId: outcome.saleId,
        },
      },
    );

    res.json({
      data: toOnlineOrderDto(outcome.order),
      paymentStatus: outcome.status,
      saleId: outcome.saleId,
    });
  }),
);

/* ========================================================================== */
/* Back office                                                                */
/* ========================================================================== */

router.use('/admin', requireAuth);

/** GET /api/online/admin/orders */
router.get(
  '/admin/orders',
  requirePermission('online:order:read'),
  validateQuery(adminOrderQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<AdminOrderQuery>(res);

    const where: Prisma.OnlineOrderWhereInput = { entityId };
    if (query.status) where.status = query.status;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    if (query.search) {
      const or: Prisma.OnlineOrderWhereInput[] = [];
      for (const term of searchTerms(query.search)) {
        or.push({ orderNumber: { contains: term } });
        or.push({ guestName: { contains: term } });
        or.push({ guestEmail: { contains: term } });
        or.push({ guestPhone: { contains: term } });
        or.push({ customer: { name: { contains: term } } });
      }
      where.OR = or;
    }

    const params = pageParams(query);
    const [rows, total] = await Promise.all([
      prisma.onlineOrder.findMany({
        where,
        select: onlineOrderSelect,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.onlineOrder.count({ where }),
    ]);

    const includeCost = canSeeCost(req);
    res.json(paginated(rows.map((row) => toOnlineOrderDto(row, { includeCost })), total, params));
  }),
);

/** GET /api/online/admin/orders/:id */
router.get(
  '/admin/orders/:id',
  requirePermission('online:order:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const order = await loadOrderById(entityId, String(req.params.id));
    res.json({ data: toOnlineOrderDto(order, { includeCost: canSeeCost(req) }) });
  }),
);

/**
 * PATCH /api/online/admin/orders/:id/status
 * pending -> processing -> (shipped | ready_for_pickup) -> delivered -> completed,
 * cancelled from anything not yet delivered. Cancelling a paid order puts the
 * stock back and voids the sale.
 */
router.patch(
  '/admin/orders/:id/status',
  requirePermission('online:order:write'),
  validateBody(updateStatusSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const input = req.body as UpdateStatusInput;

    const order = await loadOrderById(entityId, String(req.params.id));
    assertTransition(order.status, input.status, order.fulfilmentMethod as FulfilmentMethod);

    const entity = await resolveEntityById(entityId);
    const result = await changeStatus(entity, order, input.status, {
      userId: req.auth?.userId ?? null,
      userName: req.auth?.name ?? null,
    }, input.note);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.ONLINE_ORDER_UPDATE,
      targetType: 'online_order',
      targetId: order.id,
      details: {
        orderNumber: order.orderNumber,
        from: order.status,
        to: input.status,
        restocked: result.restocked,
      },
    });

    res.json({ data: toOnlineOrderDto(result.order, { includeCost: canSeeCost(req) }) });
  }),
);

/** PATCH /api/online/admin/orders/:id/tracking */
router.patch(
  '/admin/orders/:id/tracking',
  requirePermission('online:order:write'),
  validateBody(trackingSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const input = req.body as TrackingInput;

    const order = await loadOrderById(entityId, String(req.params.id));
    if (order.fulfilmentMethod !== 'delivery') {
      throw ApiError.conflict('So encomendas com entrega tem seguimento.');
    }

    await prisma.onlineOrder.update({
      where: { id: order.id },
      data: { carrier: input.carrier, trackingNumber: input.trackingNumber },
    });

    const updated = await loadOrderById(entityId, order.id);
    emitOrderUpdated(entityId, updated);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.ONLINE_ORDER_UPDATE,
      targetType: 'online_order',
      targetId: order.id,
      details: {
        orderNumber: order.orderNumber,
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
      },
    });

    res.json({ data: toOnlineOrderDto(updated, { includeCost: canSeeCost(req) }) });
  }),
);

/** GET /api/online/admin/orders/:id/packing-slip - HTML, styled for the print dialog. */
router.get(
  '/admin/orders/:id/packing-slip',
  requirePermission('online:order:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const order = await loadOrderById(entityId, String(req.params.id));
    const entity = await resolveEntityById(entityId);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(renderPackingSlip(entity, toOnlineOrderDto(order)));
  }),
);

/**
 * POST /api/online/admin/orders/:id/ready-for-pickup
 * BOPIS: the order is packed and waiting at the counter.
 */
router.post(
  '/admin/orders/:id/ready-for-pickup',
  requirePermission('online:order:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const order = await loadOrderById(entityId, String(req.params.id));

    if (order.fulfilmentMethod !== 'pickup') {
      throw ApiError.conflict('Esta encomenda e para entrega, nao para levantamento.');
    }
    assertTransition(order.status, 'ready_for_pickup', 'pickup');

    const entity = await resolveEntityById(entityId);
    const result = await changeStatus(entity, order, 'ready_for_pickup', {
      userId: req.auth?.userId ?? null,
      userName: req.auth?.name ?? null,
    });

    const customerName = order.customer?.name ?? order.guestName ?? 'Cliente';
    const notification = await prisma.notification.create({
      data: {
        entityId,
        level: 'info',
        titlePt: 'Encomenda pronta para levantamento',
        titleEn: 'Order ready for pickup',
        bodyPt: `${order.orderNumber} de ${customerName} esta pronta em ${order.pickupLocation?.name ?? 'loja'}.`,
        bodyEn: `${order.orderNumber} for ${customerName} is ready at ${order.pickupLocation?.name ?? 'store'}.`,
        link: `/loja-online/encomendas/${order.id}`,
      },
    });

    emitToEntity(entityId, SOCKET_EVENTS.NOTIFICATION, {
      id: notification.id,
      level: 'info',
      titlePt: notification.titlePt,
      titleEn: notification.titleEn,
      bodyPt: notification.bodyPt,
      bodyEn: notification.bodyEn,
      link: notification.link,
      createdAt: notification.createdAt.toISOString(),
    });

    await auditRequest(req, {
      action: AUDIT_ACTIONS.ONLINE_ORDER_UPDATE,
      targetType: 'online_order',
      targetId: order.id,
      details: { orderNumber: order.orderNumber, to: 'ready_for_pickup' },
    });

    res.json({ data: toOnlineOrderDto(result.order, { includeCost: canSeeCost(req) }) });
  }),
);

export default router;
