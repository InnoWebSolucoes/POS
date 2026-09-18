import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import { SOCKET_EVENTS } from '@pos/shared';
import { AUDIT_ACTIONS, auditRequest } from '../../lib/audit.js';
import { ApiError, asyncHandler, pageParams, paginated, validateBody, validateQuery, parsedQuery } from '../../lib/http.js';
import { publishStockChanges } from '../../lib/inventory.js';
import { canSeeCost, requireAuth, requireAuthContext, requireEntity, requirePermission } from '../../lib/middleware.js';
import { prisma } from '../../lib/prisma.js';
import { emitToEntity } from '../../lib/realtime.js';
import { getSettings } from '../../lib/settings.js';
import {
  refundInclude,
  saleInclude,
  saleListInclude,
  toHeldSaleDto,
  toRefundDto,
  toSaleDetailDto,
  toSaleDto,
} from './mappers.js';
import { renderReceipt, whatsappLink } from './receipt.js';
import {
  checkout,
  createRefund,
  holdSale,
  loadReceiptEntity,
  loadSale,
  loadSaleByReceipt,
  voidSale,
  type ActorContext,
} from './service.js';
import {
  createRefundSchema,
  createSaleSchema,
  holdSaleSchema,
  receiptTextQuerySchema,
  refundListQuerySchema,
  saleListQuerySchema,
  sendReceiptSchema,
  voidSaleSchema,
  type CreateRefundInput,
  type CreateSaleInput,
  type HoldSaleInput,
  type ReceiptTextQuery,
  type RefundListQuery,
  type SaleListQuery,
  type SendReceiptInput,
  type VoidSaleInput,
} from './schemas.js';

const router = Router();

router.use(requireAuth);

function actor(req: Request): ActorContext {
  const auth = requireAuthContext(req);
  return {
    entityId: requireEntity(req),
    userId: auth.userId,
    userName: auth.name,
    locationId: auth.locationId,
    canDiscount: auth.permissions.includes('sale:discount'),
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseFrom(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(DATE_ONLY.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseTo(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(DATE_ONLY.test(value) ? `${value}T23:59:59.999` : value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  const gte = parseFrom(from);
  const lte = parseTo(to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/* -------------------------------------------------------------------------- */
/* Checkout                                                                    */
/* -------------------------------------------------------------------------- */

router.post(
  '/',
  requirePermission('sale:create'),
  validateBody(createSaleSchema),
  asyncHandler(async (req, res) => {
    const ctx = actor(req);
    const input = req.body as CreateSaleInput;

    const result = await checkout(ctx, input);
    const sale = await loadSale(ctx.entityId, result.saleId);
    const includeCost = canSeeCost(req);

    if (result.created) {
      // Never from inside the transaction: a rolled-back sale must not be able
      // to announce stock that never moved.
      await publishStockChanges(ctx.entityId, result.stockChanges);
      emitToEntity(ctx.entityId, SOCKET_EVENTS.SALE_COMPLETED, toSaleDto(sale, false));
      if (result.orderId) {
        emitToEntity(ctx.entityId, SOCKET_EVENTS.ORDER_UPDATED, {
          id: result.orderId,
          status: 'paid',
          saleId: sale.id,
        });
      }
      if (result.tableId) {
        emitToEntity(ctx.entityId, SOCKET_EVENTS.TABLE_UPDATED, {
          id: result.tableId,
          status: 'available',
          activeOrderId: null,
        });
      }
      await auditRequest(req, {
        action: AUDIT_ACTIONS.SALE_CREATE,
        targetType: 'sale',
        targetId: sale.id,
        details: {
          receiptNumber: sale.receiptNumber,
          channel: sale.channel,
          totalMinor: Number(sale.totalMinor),
          lineCount: sale.lines.length,
          customerId: sale.customerId,
          promotionCode: sale.promotionCode,
          paymentMethods: sale.payments.map((p) => p.method),
        },
      });
      if (Number(sale.discountMinor) > 0) {
        await auditRequest(req, {
          action: AUDIT_ACTIONS.DISCOUNT_APPLY,
          targetType: 'sale',
          targetId: sale.id,
          details: {
            receiptNumber: sale.receiptNumber,
            discountMinor: Number(sale.discountMinor),
            promotionCode: sale.promotionCode,
          },
        });
      }
    }

    res.status(result.created ? 201 : 200).json(toSaleDetailDto(sale, includeCost));
  }),
);

/* -------------------------------------------------------------------------- */
/* Held sales (park & recall)                                                  */
/* -------------------------------------------------------------------------- */

router.post(
  '/hold',
  requirePermission('sale:hold'),
  validateBody(holdSaleSchema),
  asyncHandler(async (req, res) => {
    const ctx = actor(req);
    const input = req.body as HoldSaleInput;

    const saleId = await holdSale(ctx, input);
    const sale = await loadSale(ctx.entityId, saleId);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.SALE_HOLD,
      targetType: 'sale',
      targetId: sale.id,
      details: { label: sale.holdLabel, lineCount: sale.lines.length, totalMinor: Number(sale.totalMinor) },
    });

    res.status(201).json(toSaleDetailDto(sale, canSeeCost(req)));
  }),
);

router.get(
  '/held',
  requirePermission('sale:hold'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const held = await prisma.sale.findMany({
      where: { entityId, status: 'held' },
      include: saleListInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(held.map(toHeldSaleDto));
  }),
);

router.get(
  '/held/:id',
  requirePermission('sale:hold'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const sale = await prisma.sale.findFirst({
      where: { id: req.params.id, entityId, status: 'held' },
      include: saleInclude,
    });
    if (!sale) throw ApiError.notFound('Venda suspensa nao encontrada.');
    res.json(toSaleDetailDto(sale, canSeeCost(req)));
  }),
);

router.delete(
  '/held/:id',
  requirePermission('sale:hold'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const sale = await prisma.sale.findFirst({
      where: { id: req.params.id, entityId, status: 'held' },
      select: { id: true, holdLabel: true },
    });
    if (!sale) throw ApiError.notFound('Venda suspensa nao encontrada.');

    await prisma.sale.delete({ where: { id: sale.id } });
    await auditRequest(req, {
      action: AUDIT_ACTIONS.SALE_HOLD,
      targetType: 'sale',
      targetId: sale.id,
      details: { discarded: true, label: sale.holdLabel },
    });

    res.json({ deleted: true, id: sale.id });
  }),
);

/* -------------------------------------------------------------------------- */
/* Refunds                                                                     */
/* -------------------------------------------------------------------------- */

router.post(
  '/refunds',
  requirePermission('sale:refund'),
  validateBody(createRefundSchema),
  asyncHandler(async (req, res) => {
    const ctx = actor(req);
    const input = req.body as CreateRefundInput;

    const result = await createRefund(ctx, input);
    await publishStockChanges(ctx.entityId, result.stockChanges);

    const refund = await prisma.refund.findFirst({
      where: { id: result.refundId, entityId: ctx.entityId },
      include: refundInclude,
    });
    if (!refund) throw ApiError.notFound('Devolucao nao encontrada.');

    await auditRequest(req, {
      action: AUDIT_ACTIONS.SALE_REFUND,
      targetType: 'refund',
      targetId: refund.id,
      details: {
        reference: refund.reference,
        saleId: result.saleId,
        totalMinor: result.totalMinor,
        method: refund.method,
        saleStatus: result.saleStatus,
        lineCount: refund.lines.length,
      },
    });

    res.status(201).json(toRefundDto(refund, canSeeCost(req)));
  }),
);

router.get(
  '/refunds',
  requirePermission('sale:read'),
  validateQuery(refundListQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<RefundListQuery>(res);
    const params = pageParams(query);

    const createdAt = dateRange(query.from, query.to);
    const where: Prisma.RefundWhereInput = {
      entityId,
      ...(createdAt ? { createdAt } : {}),
      ...(query.saleId ? { saleId: query.saleId } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.search ? { reference: { contains: query.search } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        include: refundInclude,
        orderBy: { createdAt: query.order },
        skip: params.skip,
        take: params.take,
      }),
      prisma.refund.count({ where }),
    ]);

    const includeCost = canSeeCost(req);
    res.json(paginated(rows.map((row) => toRefundDto(row, includeCost)), total, params));
  }),
);

router.get(
  '/refunds/:id',
  requirePermission('sale:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const refund = await prisma.refund.findFirst({
      where: { id: req.params.id, entityId },
      include: refundInclude,
    });
    if (!refund) throw ApiError.notFound('Devolucao nao encontrada.');
    res.json(toRefundDto(refund, canSeeCost(req)));
  }),
);

/* -------------------------------------------------------------------------- */
/* Receipt lookup by the human-facing number                                   */
/* -------------------------------------------------------------------------- */

/** Receipt numbers contain a slash (FR2026/000123); accept it encoded or split. */
router.get(
  '/receipt/:prefix/:number',
  requirePermission('sale:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const sale = await loadSaleByReceipt(entityId, `${req.params.prefix}/${req.params.number}`);
    res.json(toSaleDetailDto(sale, canSeeCost(req)));
  }),
);

router.get(
  '/receipt/:receiptNumber',
  requirePermission('sale:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const sale = await loadSaleByReceipt(entityId, req.params.receiptNumber);
    res.json(toSaleDetailDto(sale, canSeeCost(req)));
  }),
);

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

router.get(
  '/',
  requirePermission('sale:read'),
  validateQuery(saleListQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<SaleListQuery>(res);
    const params = pageParams(query);

    const createdAt = dateRange(query.from, query.to);
    const where: Prisma.SaleWhereInput = {
      entityId,
      // Parked carts and drafts are not sales history; they have their own list.
      ...(query.status ? { status: query.status } : { status: { notIn: ['held', 'draft'] } }),
      ...(createdAt ? { createdAt } : {}),
      ...(query.cashierId ? { cashierId: query.cashierId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.paymentMethod ? { payments: { some: { method: query.paymentMethod } } } : {}),
      ...(query.search ? { receiptNumber: { contains: query.search } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: saleListInclude,
        orderBy: { createdAt: query.order },
        skip: params.skip,
        take: params.take,
      }),
      prisma.sale.count({ where }),
    ]);

    const includeCost = canSeeCost(req);
    res.json(paginated(rows.map((row) => toSaleDto(row, includeCost)), total, params));
  }),
);

/* -------------------------------------------------------------------------- */
/* Single sale                                                                 */
/* -------------------------------------------------------------------------- */

router.get(
  '/:id',
  requirePermission('sale:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const sale = await loadSale(entityId, req.params.id);
    res.json(toSaleDetailDto(sale, canSeeCost(req)));
  }),
);

router.get(
  '/:id/receipt-text',
  requirePermission('sale:read'),
  validateQuery(receiptTextQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<ReceiptTextQuery>(res);

    const [sale, entity, settings] = await Promise.all([
      loadSale(entityId, req.params.id),
      loadReceiptEntity(entityId),
      getSettings(entityId),
    ]);

    const text = renderReceipt({ entity, sale, settings });

    if (query.format === 'text') {
      res.type('text/plain; charset=utf-8').send(text);
      return;
    }
    res.json({ receiptNumber: sale.receiptNumber, text });
  }),
);

router.post(
  '/:id/void',
  requirePermission('sale:void'),
  validateBody(voidSaleSchema),
  asyncHandler(async (req, res) => {
    const ctx = actor(req);
    const body = req.body as VoidSaleInput;

    const result = await voidSale(ctx, req.params.id, body.reason ?? null);
    await publishStockChanges(ctx.entityId, result.stockChanges);

    const sale = await loadSale(ctx.entityId, result.saleId);
    await auditRequest(req, {
      action: AUDIT_ACTIONS.SALE_VOID,
      targetType: 'sale',
      targetId: sale.id,
      details: {
        receiptNumber: sale.receiptNumber,
        totalMinor: Number(sale.totalMinor),
        reason: body.reason ?? null,
      },
    });

    emitToEntity(ctx.entityId, SOCKET_EVENTS.SALE_COMPLETED, toSaleDto(sale, false));
    res.json(toSaleDetailDto(sale, canSeeCost(req)));
  }),
);

router.post(
  '/:id/send-receipt',
  requirePermission('sale:read'),
  validateBody(sendReceiptSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as SendReceiptInput;

    const [sale, entity, settings] = await Promise.all([
      loadSale(entityId, req.params.id),
      loadReceiptEntity(entityId),
      getSettings(entityId),
    ]);

    const email = body.email ? String(body.email) : null;
    const phone = body.phone ?? null;

    const updated = await prisma.sale.update({
      where: { id: sale.id },
      data: {
        receiptEmail: email ?? sale.receiptEmail,
        receiptPhone: phone ?? sale.receiptPhone,
        receiptSentAt: new Date(),
      },
      include: saleInclude,
    });

    const text = renderReceipt({ entity, sale: updated, settings });

    // This deployment has no mail transport wired up. Rather than pretend the
    // message left the building, the rendered receipt is handed back so the
    // client can share it (WhatsApp, print, copy) and the address is recorded.
    res.json({
      emailQueued: false,
      whatsappUrl: whatsappLink(phone ?? updated.receiptPhone, text),
      receiptText: text,
      recordedEmail: updated.receiptEmail,
      recordedPhone: updated.receiptPhone,
      sentAt: updated.receiptSentAt ? updated.receiptSentAt.toISOString() : null,
      message:
        'Nao existe servidor de email nesta instalacao: o recibo foi gerado e registado, use a ligacao WhatsApp ou o texto devolvido para o entregar ao cliente.',
    });
  }),
);

export default router;
