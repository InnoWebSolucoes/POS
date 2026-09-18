import { Router } from 'express';

import { auditRequest } from '../../lib/audit.js';
import { asyncHandler, pageParams, paginated, parsedQuery } from '../../lib/http.js';
import { validateBody, validateQuery } from '../../lib/http.js';
import {
  canSeeCost,
  requireAuth,
  requireEntity,
  requirePermission,
} from '../../lib/middleware.js';

import { streamPurchaseOrderPdf } from './pdf.js';
import {
  lowStockPoSchema,
  performanceQuerySchema,
  poCancelSchema,
  poCreateSchema,
  poListQuerySchema,
  poUpdateSchema,
  supplierCreateSchema,
  supplierListQuerySchema,
  supplierProductsQuerySchema,
  supplierUpdateSchema,
  type LowStockPoInput,
  type PerformanceQuery,
  type PoCancelInput,
  type PoCreateInput,
  type PoListQuery,
  type PoUpdateInput,
  type SupplierCreateInput,
  type SupplierListQuery,
  type SupplierProductsQuery,
  type SupplierUpdateInput,
} from './schemas.js';
import {
  buildLowStockOrders,
  cancelPurchaseOrder,
  createPurchaseOrder,
  createSupplier,
  getEntityHeader,
  getPurchaseOrder,
  getSupplier,
  listPurchaseOrders,
  listSupplierProducts,
  listSuppliers,
  loadPurchaseOrder,
  poListWhere,
  sendPurchaseOrder,
  softDeleteSupplier,
  supplierPerformance,
  supplierSearchWhere,
  updatePurchaseOrder,
  updateSupplier,
} from './service.js';

/** This module owns no entries in the shared AUDIT_ACTIONS table. */
const AUDIT = {
  SUPPLIER_CREATE: 'supplier.create',
  SUPPLIER_UPDATE: 'supplier.update',
  SUPPLIER_DELETE: 'supplier.delete',
  PO_CREATE: 'purchase_order.create',
  PO_AUTO_CREATE: 'purchase_order.auto_low_stock',
  PO_UPDATE: 'purchase_order.update',
  PO_SEND: 'purchase_order.send',
  PO_CANCEL: 'purchase_order.cancel',
} as const;

const router = Router();

/* ========================================================================== */
/* Purchase orders                                                            */
/* Registered before /:id so "purchase-orders" is never read as a supplier id.*/
/* ========================================================================== */

router.get(
  '/purchase-orders',
  requireAuth,
  requirePermission('po:read'),
  validateQuery(poListQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<PoListQuery>(res);
    const params = pageParams(query);
    const where = poListWhere(entityId, query);
    const { data, total } = await listPurchaseOrders(where, params.skip, params.take);
    res.json(paginated(data, total, params));
  }),
);

router.post(
  '/purchase-orders',
  requireAuth,
  requirePermission('po:write'),
  validateBody(poCreateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const order = await createPurchaseOrder(entityId, req.body as PoCreateInput);

    await auditRequest(req, {
      action: AUDIT.PO_CREATE,
      targetType: 'purchase_order',
      targetId: order.id,
      details: {
        reference: order.reference,
        supplierId: order.supplierId,
        lineCount: order.lineCount,
        totalCostMinor: order.totalCostMinor,
      },
    });

    res.status(201).json(order);
  }),
);

/**
 * Builds one draft order per supplier from everything sitting at or below its
 * minimum. Products without a supplier cannot be grouped, so they come back in
 * `skipped` instead of silently disappearing.
 */
router.post(
  '/purchase-orders/from-low-stock',
  requireAuth,
  requirePermission('po:write'),
  validateBody(lowStockPoSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const { orders, skipped } = await buildLowStockOrders(entityId, req.body as LowStockPoInput);

    if (orders.length > 0) {
      await auditRequest(req, {
        action: AUDIT.PO_AUTO_CREATE,
        targetType: 'purchase_order',
        targetId: orders[0]!.id,
        details: {
          created: orders.map((o) => ({ id: o.id, reference: o.reference, supplierId: o.supplierId })),
          skipped: skipped.length,
        },
      });
    }

    res.status(orders.length > 0 ? 201 : 200).json({ orders, skipped });
  }),
);

router.get(
  '/purchase-orders/:id',
  requireAuth,
  requirePermission('po:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    res.json(await getPurchaseOrder(entityId, req.params.id!));
  }),
);

router.patch(
  '/purchase-orders/:id',
  requireAuth,
  requirePermission('po:write'),
  validateBody(poUpdateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const order = await updatePurchaseOrder(entityId, req.params.id!, req.body as PoUpdateInput);

    await auditRequest(req, {
      action: AUDIT.PO_UPDATE,
      targetType: 'purchase_order',
      targetId: order.id,
      details: { reference: order.reference, totalCostMinor: order.totalCostMinor },
    });

    res.json(order);
  }),
);

router.post(
  '/purchase-orders/:id/send',
  requireAuth,
  requirePermission('po:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const order = await sendPurchaseOrder(entityId, req.params.id!);

    await auditRequest(req, {
      action: AUDIT.PO_SEND,
      targetType: 'purchase_order',
      targetId: order.id,
      details: { reference: order.reference, sentAt: order.sentAt },
    });

    res.json(order);
  }),
);

router.post(
  '/purchase-orders/:id/cancel',
  requireAuth,
  requirePermission('po:write'),
  validateBody(poCancelSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const { reason } = req.body as PoCancelInput;
    const order = await cancelPurchaseOrder(entityId, req.params.id!, reason ?? null);

    await auditRequest(req, {
      action: AUDIT.PO_CANCEL,
      targetType: 'purchase_order',
      targetId: order.id,
      details: { reference: order.reference, reason: reason ?? null },
    });

    res.json(order);
  }),
);

router.get(
  '/purchase-orders/:id/pdf',
  requireAuth,
  requirePermission('po:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const [entity, order] = await Promise.all([
      getEntityHeader(entityId),
      loadPurchaseOrder(entityId, req.params.id!),
    ]);

    streamPurchaseOrderPdf(res, entity, order);
  }),
);

/* ========================================================================== */
/* Suppliers                                                                  */
/* ========================================================================== */

router.get(
  '/',
  requireAuth,
  requirePermission('supplier:read'),
  validateQuery(supplierListQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<SupplierListQuery>(res);
    const params = pageParams(query);
    const where = supplierSearchWhere(entityId, query.search, query.active);
    const { data, total } = await listSuppliers(entityId, where, params.skip, params.take);
    res.json(paginated(data, total, params));
  }),
);

router.post(
  '/',
  requireAuth,
  requirePermission('supplier:write'),
  validateBody(supplierCreateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const supplier = await createSupplier(entityId, req.body as SupplierCreateInput);

    await auditRequest(req, {
      action: AUDIT.SUPPLIER_CREATE,
      targetType: 'supplier',
      targetId: supplier.id,
      details: { name: supplier.name },
    });

    res.status(201).json(supplier);
  }),
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('supplier:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    res.json(await getSupplier(entityId, req.params.id!));
  }),
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('supplier:write'),
  validateBody(supplierUpdateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const supplier = await updateSupplier(entityId, req.params.id!, req.body as SupplierUpdateInput);

    await auditRequest(req, {
      action: AUDIT.SUPPLIER_UPDATE,
      targetType: 'supplier',
      targetId: supplier.id,
      details: { changed: Object.keys(req.body as Record<string, unknown>) },
    });

    res.json(supplier);
  }),
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('supplier:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const id = req.params.id!;
    await softDeleteSupplier(entityId, id);

    await auditRequest(req, {
      action: AUDIT.SUPPLIER_DELETE,
      targetType: 'supplier',
      targetId: id,
    });

    res.status(204).send();
  }),
);

router.get(
  '/:id/products',
  requireAuth,
  requirePermission('supplier:read'),
  validateQuery(supplierProductsQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<SupplierProductsQuery>(res);
    const params = pageParams(query);

    const { data, total } = await listSupplierProducts(entityId, req.params.id!, {
      search: query.search,
      active: query.active,
      skip: params.skip,
      take: params.take,
      // Cashiers and waiters never see cost prices or margins.
      withCost: canSeeCost(req),
    });

    res.json(paginated(data, total, params));
  }),
);

router.get(
  '/:id/performance',
  requireAuth,
  requirePermission('report:financial'),
  validateQuery(performanceQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<PerformanceQuery>(res);
    res.json(await supplierPerformance(entityId, req.params.id!, query.months ?? 12));
  }),
);

export default router;
