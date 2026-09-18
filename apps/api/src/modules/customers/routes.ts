import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { VIP_TIERS, type VipTier } from '@pos/shared';

import { auditRequest } from '../../lib/audit.js';
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
  requireAuth,
  requireAuthContext,
  requireEntity,
  requirePermission,
} from '../../lib/middleware.js';
import { prisma, TX_OPTIONS } from '../../lib/prisma.js';
import { getSettings } from '../../lib/settings.js';

import {
  CUSTOMER_SELECT,
  SALE_SUMMARY_SELECT,
  toCustomerDto,
  toLoyaltyTransactionDto,
  toPurchaseSummary,
} from './mappers.js';
import {
  adjustPointsSchema,
  createCustomerQuerySchema,
  createCustomerSchema,
  listCustomersQuerySchema,
  lookupQuerySchema,
  purchasesQuerySchema,
  redeemPointsSchema,
  retentionQuerySchema,
  storeCreditSchema,
  topCustomersQuerySchema,
  updateCustomerSchema,
  type AdjustPointsInput,
  type CreateCustomerInput,
  type CreateCustomerQuery,
  type ListCustomersQuery,
  type LookupQuery,
  type PurchasesQuery,
  type RedeemPointsInput,
  type RetentionQuery,
  type StoreCreditInput,
  type TopCustomersQuery,
  type UpdateCustomerInput,
} from './schemas.js';
import {
  assertContactAvailable,
  CUSTOMER_AUDIT_ACTIONS,
  generateLoyaltyCardNumber,
  HISTORY_SALE_STATUSES,
  moveStoreCredit,
  normaliseThresholds,
  parseWindow,
  pointsToMinor,
  postLoyaltyTransaction,
  REVENUE_SALE_STATUSES,
  TIER_LABELS,
} from './service.js';

const router = Router();

const LOYALTY_SELECT = {
  id: true,
  type: true,
  points: true,
  balanceAfter: true,
  saleId: true,
  note: true,
  createdAt: true,
} as const;

/** Reads a customer inside the caller's tenant or throws a 404 in Portuguese. */
async function findCustomerOr404(entityId: string, id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, entityId, deletedAt: null },
    select: CUSTOMER_SELECT,
  });
  if (!customer) throw ApiError.notFound('Cliente nao encontrado.');
  return customer;
}

/* ========================================================================== */
/* Listing                                                                     */
/* ========================================================================== */

router.get(
  '/',
  requireAuth,
  requirePermission('customer:read'),
  validateQuery(listCustomersQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<ListCustomersQuery>(res);
    const params = pageParams(query);

    const where: Prisma.CustomerWhereInput = { entityId, deletedAt: null };
    if (query.tier) where.tier = query.tier;
    if (query.active !== undefined) where.active = query.active;
    if (query.search) {
      // SQLite LIKE is already case-insensitive for ASCII and PostgreSQL is not;
      // `mode` is unsupported on SQLite so it is deliberately not passed.
      where.OR = [
        { name: { contains: query.search } },
        { phone: { contains: query.search } },
        { email: { contains: query.search } },
        { loyaltyCardNumber: { contains: query.search } },
      ];
    }

    const sort = query.sort ?? 'created';
    const direction = query.order ?? (sort === 'name' ? 'asc' : 'desc');
    const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
      sort === 'name'
        ? [{ name: direction }]
        : sort === 'spend'
          ? [{ lifetimeSpendMinor: direction }, { name: 'asc' }]
          : sort === 'lastPurchase'
            ? [{ lastPurchaseAt: direction }, { name: 'asc' }]
            : [{ createdAt: direction }, { name: 'asc' }];

    const [rows, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy,
        skip: params.skip,
        take: params.take,
        select: CUSTOMER_SELECT,
      }),
      prisma.customer.count({ where }),
    ]);

    res.json(paginated(rows.map(toCustomerDto), total, params));
  }),
);

/* ========================================================================== */
/* Register lookup                                                             */
/* ========================================================================== */

router.get(
  '/lookup',
  requireAuth,
  requirePermission('customer:read'),
  validateQuery(lookupQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<LookupQuery>(res);
    const take = query.limit ?? 10;
    const term = query.q.trim();

    const base: Prisma.CustomerWhereInput = { entityId, deletedAt: null, active: true };

    // A scanned card or a typed phone number must win instantly, before any
    // fuzzy name matching drags the right customer down the list.
    const exact = await prisma.customer.findMany({
      where: {
        ...base,
        OR: [
          { loyaltyCardNumber: term },
          { phone: term },
          { email: term.toLowerCase() },
        ],
      },
      take,
      orderBy: [{ lastPurchaseAt: 'desc' }, { name: 'asc' }],
      select: CUSTOMER_SELECT,
    });

    if (exact.length > 0) {
      res.json({ data: exact.map(toCustomerDto), match: 'exact', query: term });
      return;
    }

    const byName = await prisma.customer.findMany({
      where: { ...base, name: { contains: term } },
      take,
      orderBy: [{ lastPurchaseAt: 'desc' }, { name: 'asc' }],
      select: CUSTOMER_SELECT,
    });

    res.json({ data: byName.map(toCustomerDto), match: 'name', query: term });
  }),
);

/* ========================================================================== */
/* Tier configuration                                                          */
/* ========================================================================== */

router.get(
  '/tiers',
  requireAuth,
  requirePermission('customer:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const settings = await getSettings(entityId);
    const thresholds = normaliseThresholds(settings.vipThresholds);

    const grouped = await prisma.customer.groupBy({
      by: ['tier'],
      where: { entityId, deletedAt: null },
      _count: { _all: true },
    });
    const counts = new Map<string, number>(grouped.map((row) => [row.tier, row._count._all]));

    res.json({
      loyaltyEarnPerMinor: settings.loyaltyEarnPerMinor,
      loyaltyPointValueMinor: settings.loyaltyPointValueMinor,
      tiers: VIP_TIERS.map((tier) => ({
        tier,
        label: TIER_LABELS[tier],
        thresholdMinor: tier === 'none' ? 0 : thresholds[tier],
        customerCount: counts.get(tier) ?? 0,
      })),
    });
  }),
);

/* ========================================================================== */
/* Reports                                                                     */
/* ========================================================================== */

router.get(
  '/reports/top',
  requireAuth,
  requirePermission('report:read'),
  validateQuery(topCustomersQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<TopCustomersQuery>(res);
    const window = parseWindow(query.from, query.to);
    const limit = query.limit ?? 20;

    const grouped = await prisma.sale.groupBy({
      by: ['customerId'],
      where: {
        entityId,
        status: { in: [...REVENUE_SALE_STATUSES] },
        customerId: { not: null },
        createdAt: { gte: window.from, lte: window.to },
      },
      _sum: { totalMinor: true },
      _count: { _all: true },
      orderBy: { _sum: { totalMinor: 'desc' } },
      take: limit,
    });

    const ids = grouped
      .map((row) => row.customerId)
      .filter((id): id is string => typeof id === 'string');

    // Deleted customers keep their sales history, so the tenant filter is the
    // only one applied here - otherwise the report would silently lose revenue.
    const customers = ids.length
      ? await prisma.customer.findMany({
          where: { entityId, id: { in: ids } },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            tier: true,
            points: true,
            lastPurchaseAt: true,
            deletedAt: true,
          },
        })
      : [];
    const byId = new Map(customers.map((customer) => [customer.id, customer]));

    const data = grouped
      .filter((row) => typeof row.customerId === 'string')
      .map((row) => {
        const customer = byId.get(row.customerId as string);
        const totalSpendMinor = Number(row._sum.totalMinor ?? 0n);
        const orderCount = row._count._all;
        return {
          customerId: row.customerId as string,
          name: customer?.name ?? 'Cliente removido',
          phone: customer?.phone ?? null,
          email: customer?.email ?? null,
          tier: ((customer?.tier as VipTier | undefined) ?? 'none') satisfies VipTier,
          points: customer?.points ?? 0,
          lastPurchaseAt: customer?.lastPurchaseAt
            ? customer.lastPurchaseAt.toISOString()
            : null,
          deleted: Boolean(customer?.deletedAt),
          totalSpendMinor,
          orderCount,
          averageOrderValueMinor: orderCount > 0 ? Math.round(totalSpendMinor / orderCount) : 0,
        };
      });

    res.json({
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      limit,
      data,
    });
  }),
);

router.get(
  '/reports/retention',
  requireAuth,
  requirePermission('report:read'),
  validateQuery(retentionQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<RetentionQuery>(res);
    const window = parseWindow(query.from, query.to);
    const statuses = [...REVENUE_SALE_STATUSES];

    const inWindow = await prisma.sale.groupBy({
      by: ['customerId'],
      where: {
        entityId,
        status: { in: statuses },
        customerId: { not: null },
        createdAt: { gte: window.from, lte: window.to },
      },
      _sum: { totalMinor: true },
      _count: { _all: true },
    });

    const ids = inWindow
      .map((row) => row.customerId)
      .filter((id): id is string => typeof id === 'string');

    // "Returning" means the customer already bought something before the window
    // opened - one query, then a set membership test per customer.
    const earlier = ids.length
      ? await prisma.sale.groupBy({
          by: ['customerId'],
          where: {
            entityId,
            status: { in: statuses },
            customerId: { in: ids },
            createdAt: { lt: window.from },
          },
        })
      : [];
    const returningIds = new Set(
      earlier.map((row) => row.customerId).filter((id): id is string => typeof id === 'string'),
    );

    const bucket = () => ({ customers: 0, orders: 0, revenueMinor: 0 });
    const newCustomers = bucket();
    const returning = bucket();

    for (const row of inWindow) {
      if (typeof row.customerId !== 'string') continue;
      const target = returningIds.has(row.customerId) ? returning : newCustomers;
      target.customers += 1;
      target.orders += row._count._all;
      target.revenueMinor += Number(row._sum.totalMinor ?? 0n);
    }

    // Walk-in sales carry no customer, so they belong to neither bucket but do
    // belong to the overall average order value.
    const anonymous = await prisma.sale.aggregate({
      where: {
        entityId,
        status: { in: statuses },
        customerId: null,
        createdAt: { gte: window.from, lte: window.to },
      },
      _sum: { totalMinor: true },
      _count: { _all: true },
    });

    const anonymousOrders = anonymous._count._all;
    const anonymousRevenueMinor = Number(anonymous._sum.totalMinor ?? 0n);

    const totalOrders = newCustomers.orders + returning.orders + anonymousOrders;
    const totalRevenueMinor =
      newCustomers.revenueMinor + returning.revenueMinor + anonymousRevenueMinor;
    const identifiedCustomers = newCustomers.customers + returning.customers;

    const aov = (revenueMinor: number, orders: number) =>
      orders > 0 ? Math.round(revenueMinor / orders) : 0;

    res.json({
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      new: { ...newCustomers, averageOrderValueMinor: aov(newCustomers.revenueMinor, newCustomers.orders) },
      returning: {
        ...returning,
        averageOrderValueMinor: aov(returning.revenueMinor, returning.orders),
      },
      anonymous: {
        customers: 0,
        orders: anonymousOrders,
        revenueMinor: anonymousRevenueMinor,
        averageOrderValueMinor: aov(anonymousRevenueMinor, anonymousOrders),
      },
      totals: {
        identifiedCustomers,
        orders: totalOrders,
        revenueMinor: totalRevenueMinor,
        averageOrderValueMinor: aov(totalRevenueMinor, totalOrders),
        returningRateBps:
          identifiedCustomers > 0
            ? Math.round((returning.customers / identifiedCustomers) * 10_000)
            : 0,
      },
    });
  }),
);

/* ========================================================================== */
/* Create                                                                      */
/* ========================================================================== */

router.post(
  '/',
  requireAuth,
  requirePermission('customer:write'),
  validateQuery(createCustomerQuerySchema),
  validateBody(createCustomerSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<CreateCustomerQuery>(res);
    const body = req.body as CreateCustomerInput;

    await assertContactAvailable(entityId, {
      phone: body.phone ?? null,
      email: body.email ?? null,
      loyaltyCardNumber: body.loyaltyCardNumber ?? null,
    });

    // The card number is reserved before the insert on purpose: a burnt
    // sequence number costs nothing, a card number handed to two people does.
    let loyaltyCardNumber = body.loyaltyCardNumber ?? null;
    if (!loyaltyCardNumber && query.withCard) {
      loyaltyCardNumber = await generateLoyaltyCardNumber(entityId);
    }

    const created = await prisma.customer.create({
      data: {
        entityId,
        name: body.name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        nif: body.nif ?? null,
        address: body.address ?? null,
        notes: body.notes ?? null,
        loyaltyCardNumber,
        active: body.active ?? true,
      },
      select: CUSTOMER_SELECT,
    });

    await auditRequest(req, {
      action: CUSTOMER_AUDIT_ACTIONS.CREATE,
      targetType: 'customer',
      targetId: created.id,
      details: { name: created.name, withCard: Boolean(loyaltyCardNumber) },
    });

    res.status(201).json(toCustomerDto(created));
  }),
);

/* ========================================================================== */
/* Detail / update / delete                                                    */
/* ========================================================================== */

router.get(
  '/:id',
  requireAuth,
  requirePermission('customer:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const customer = await findCustomerOr404(entityId, req.params.id);

    const [purchases, ledger] = await Promise.all([
      prisma.sale.findMany({
        where: {
          entityId,
          customerId: customer.id,
          status: { in: [...HISTORY_SALE_STATUSES] },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: SALE_SUMMARY_SELECT,
      }),
      prisma.loyaltyTransaction.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: LOYALTY_SELECT,
      }),
    ]);

    const includeCost = canSeeCost(req);

    res.json({
      ...toCustomerDto(customer),
      recentPurchases: purchases.map((sale) => toPurchaseSummary(sale, includeCost)),
      loyaltyTransactions: ledger.map(toLoyaltyTransactionDto),
    });
  }),
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('customer:write'),
  validateBody(updateCustomerSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as UpdateCustomerInput;
    const existing = await findCustomerOr404(entityId, req.params.id);

    await assertContactAvailable(
      entityId,
      {
        phone: body.phone === undefined ? null : body.phone,
        email: body.email === undefined ? null : body.email,
        loyaltyCardNumber:
          body.loyaltyCardNumber === undefined ? null : body.loyaltyCardNumber,
      },
      existing.id,
    );

    const data: Prisma.CustomerUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.email !== undefined) data.email = body.email;
    if (body.nif !== undefined) data.nif = body.nif;
    if (body.address !== undefined) data.address = body.address;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.loyaltyCardNumber !== undefined) data.loyaltyCardNumber = body.loyaltyCardNumber;
    if (body.active !== undefined) data.active = body.active;

    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data,
      select: CUSTOMER_SELECT,
    });

    await auditRequest(req, {
      action: CUSTOMER_AUDIT_ACTIONS.UPDATE,
      targetType: 'customer',
      targetId: updated.id,
      details: { changed: Object.keys(data) },
    });

    res.json(toCustomerDto(updated));
  }),
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('customer:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const existing = await findCustomerOr404(entityId, req.params.id);

    // Soft delete only: sales, loyalty ledger and invoices all point here.
    await prisma.customer.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), active: false },
    });

    await auditRequest(req, {
      action: CUSTOMER_AUDIT_ACTIONS.DELETE,
      targetType: 'customer',
      targetId: existing.id,
      details: { name: existing.name },
    });

    res.json({ id: existing.id, deleted: true });
  }),
);

/* ========================================================================== */
/* Purchase history                                                            */
/* ========================================================================== */

router.get(
  '/:id/purchases',
  requireAuth,
  requirePermission('customer:read'),
  validateQuery(purchasesQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const customer = await findCustomerOr404(entityId, req.params.id);
    const params = pageParams(parsedQuery<PurchasesQuery>(res));

    const where: Prisma.SaleWhereInput = {
      entityId,
      customerId: customer.id,
      status: { in: [...HISTORY_SALE_STATUSES] },
    };

    const [rows, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
        select: SALE_SUMMARY_SELECT,
      }),
      prisma.sale.count({ where }),
    ]);

    const includeCost = canSeeCost(req);
    res.json(
      paginated(
        rows.map((sale) => toPurchaseSummary(sale, includeCost)),
        total,
        params,
      ),
    );
  }),
);

/* ========================================================================== */
/* Loyalty                                                                     */
/* ========================================================================== */

router.post(
  '/:id/loyalty/adjust',
  requireAuth,
  requirePermission('loyalty:manage'),
  validateBody(adjustPointsSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const body = req.body as AdjustPointsInput;
    const customerId = req.params.id;

    const result = await prisma.$transaction(async (tx) => {
      const posted = await postLoyaltyTransaction({
        entityId,
        customerId,
        type: 'adjust',
        points: body.points,
        note: body.note ?? null,
        client: tx,
      });

      const customer = await tx.customer.findFirstOrThrow({
        where: { id: customerId, entityId },
        select: CUSTOMER_SELECT,
      });
      const transaction = await tx.loyaltyTransaction.findFirstOrThrow({
        where: { id: posted.transactionId },
        select: LOYALTY_SELECT,
      });

      return { customer, transaction };
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: CUSTOMER_AUDIT_ACTIONS.LOYALTY_ADJUST,
      targetType: 'customer',
      targetId: customerId,
      details: {
        points: body.points,
        balanceAfter: result.transaction.balanceAfter,
        note: body.note ?? null,
        by: auth.name,
      },
    });

    res.status(201).json({
      customer: toCustomerDto(result.customer),
      transaction: toLoyaltyTransactionDto(result.transaction),
    });
  }),
);

router.post(
  '/:id/loyalty/redeem',
  requireAuth,
  requirePermission('customer:read'),
  validateBody(redeemPointsSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as RedeemPointsInput;
    const customer = await findCustomerOr404(entityId, req.params.id);

    const settings = await getSettings(entityId);
    const pointValueMinor = Math.max(0, Math.round(settings.loyaltyPointValueMinor));

    if (pointValueMinor <= 0) {
      throw ApiError.unprocessable('O resgate de pontos esta desactivado nesta entidade.');
    }
    if (body.points > customer.points) {
      throw ApiError.unprocessable(
        'Pontos insuficientes. Saldo disponivel: ' + String(customer.points) + ' pontos.',
      );
    }

    // QUOTE ONLY. Nothing is written here: the sales module debits the points
    // inside the checkout transaction, so an abandoned sale cannot burn them.
    res.json({
      committed: false,
      customerId: customer.id,
      pointsRequested: body.points,
      pointsAvailable: customer.points,
      pointsRemainingIfRedeemed: customer.points - body.points,
      pointValueMinor,
      discountMinor: pointsToMinor(body.points, pointValueMinor),
      message:
        'Simulacao apenas. Os pontos so sao debitados quando a venda for finalizada, enviando loyaltyPointsRedeemed no checkout.',
    });
  }),
);

/* ========================================================================== */
/* Store credit                                                                */
/* ========================================================================== */

router.post(
  '/:id/store-credit',
  requireAuth,
  requirePermission('loyalty:manage'),
  validateBody(storeCreditSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const body = req.body as StoreCreditInput;
    const customerId = req.params.id;

    const result = await prisma.$transaction(async (tx) => {
      const moved = await moveStoreCredit({
        entityId,
        customerId,
        amountMinor: body.amountMinor,
        client: tx,
      });
      const customer = await tx.customer.findFirstOrThrow({
        where: { id: customerId, entityId },
        select: CUSTOMER_SELECT,
      });
      return { ...moved, customer };
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: CUSTOMER_AUDIT_ACTIONS.STORE_CREDIT,
      targetType: 'customer',
      targetId: customerId,
      details: {
        amountMinor: body.amountMinor,
        previousMinor: result.previousMinor,
        balanceMinor: result.balanceMinor,
        note: body.note ?? null,
        by: auth.name,
      },
    });

    res.status(201).json({
      customer: toCustomerDto(result.customer),
      previousMinor: result.previousMinor,
      amountMinor: body.amountMinor,
      storeCreditMinor: result.balanceMinor,
      note: body.note ?? null,
    });
  }),
);

export default router;
