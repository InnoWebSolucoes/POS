import { Router } from 'express';
import { AUDIT_ACTIONS, auditRequest } from '../../lib/audit.js';
import {
  ApiError,
  asyncHandler,
  parsedQuery,
  validateBody,
  validateQuery,
} from '../../lib/http.js';
import { publishStockChanges } from '../../lib/inventory.js';
import {
  canSeeCost,
  requireAuth,
  requireAuthContext,
  requireEntity,
  requirePermission,
} from '../../lib/middleware.js';
import {
  getReceipt,
  getStockTake,
  getTransfer,
  listDeadStock,
  listExpiring,
  listLevels,
  listLowStock,
  listMovements,
  listReceipts,
  listStockTakes,
  listTransfers,
  stockValuation,
} from './queries.js';
import {
  approveStockTake,
  cancelStockTake,
  createAdjustments,
  createReceipt,
  createStockTake,
  createTransfer,
  receiveTransfer,
  updateStockTakeLines,
} from './service.js';
import {
  adjustmentSchema,
  cancelStockTakeSchema,
  createReceiptSchema,
  createStockTakeSchema,
  createTransferSchema,
  deadStockQuerySchema,
  expiringQuerySchema,
  levelsQuerySchema,
  lowStockQuerySchema,
  movementsQuerySchema,
  receiptsQuerySchema,
  receiveTransferSchema,
  stockTakeLinesSchema,
  stockTakesQuerySchema,
  transfersQuerySchema,
  valuationQuerySchema,
  type AdjustmentBody,
  type CreateReceiptBody,
  type CreateStockTakeBody,
  type CreateTransferBody,
  type DeadStockQuery,
  type ExpiringQuery,
  type LevelsQuery,
  type LowStockQuery,
  type MovementsQuery,
  type ReceiptsQuery,
  type StockTakeLinesBody,
  type StockTakesQuery,
  type TransfersQuery,
  type ValuationQuery,
} from './schemas.js';

const router = Router();

/* -------------------------------------------------------------------------- */
/* Stock levels and the ledger                                                 */
/* -------------------------------------------------------------------------- */

router.get(
  '/levels',
  requireAuth,
  requirePermission('inventory:read'),
  validateQuery(levelsQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<LevelsQuery>(res);
    res.json(await listLevels(entityId, query, canSeeCost(req)));
  }),
);

router.get(
  '/movements',
  requireAuth,
  requirePermission('inventory:read'),
  validateQuery(movementsQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<MovementsQuery>(res);
    res.json(await listMovements(entityId, query, canSeeCost(req)));
  }),
);

/* -------------------------------------------------------------------------- */
/* Goods receipts                                                              */
/* -------------------------------------------------------------------------- */

router.post(
  '/receipts',
  requireAuth,
  requirePermission('inventory:receive'),
  validateBody(createReceiptSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const body = req.body as CreateReceiptBody;

    const result = await createReceipt(entityId, auth, body);

    // Never inside the transaction: these announce quantities to the floor.
    await publishStockChanges(entityId, result.changes);
    await auditRequest(req, {
      action: AUDIT_ACTIONS.STOCK_RECEIPT,
      targetType: 'stock_receipt',
      targetId: result.receiptId,
      details: {
        reference: result.reference,
        lineCount: result.lineCount,
        totalCostMinor: result.totalCostMinor,
        supplierId: body.supplierId ?? null,
        purchaseOrderId: body.purchaseOrderId ?? null,
        purchaseOrderStatus: result.purchaseOrderStatus,
      },
    });

    const receipt = await getReceipt(entityId, result.receiptId, canSeeCost(req));
    res.status(201).json({
      ...receipt,
      purchaseOrderStatus: result.purchaseOrderStatus,
    });
  }),
);

router.get(
  '/receipts',
  requireAuth,
  requirePermission('inventory:read'),
  validateQuery(receiptsQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<ReceiptsQuery>(res);
    res.json(await listReceipts(entityId, query, canSeeCost(req)));
  }),
);

router.get(
  '/receipts/:id',
  requireAuth,
  requirePermission('inventory:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const receipt = await getReceipt(entityId, req.params.id!, canSeeCost(req));
    if (!receipt) throw ApiError.notFound('Entrada de stock nao encontrada.');
    res.json(receipt);
  }),
);

/* -------------------------------------------------------------------------- */
/* Adjustments                                                                 */
/* -------------------------------------------------------------------------- */

router.post(
  '/adjustments',
  requireAuth,
  requirePermission('inventory:adjust'),
  validateBody(adjustmentSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const body = req.body as AdjustmentBody;

    const bulk = 'items' in body;
    const items = bulk ? body.items : [body];
    const options = bulk
      ? { locationId: body.locationId, note: body.note, allowNegative: body.allowNegative }
      : { allowNegative: body.allowNegative };

    const result = await createAdjustments(entityId, auth, items, options);

    await publishStockChanges(entityId, result.changes);
    await auditRequest(req, {
      action: AUDIT_ACTIONS.STOCK_ADJUST,
      targetType: 'stock_adjustment',
      targetId: result.reference,
      details: {
        reference: result.reference,
        items: items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          quantityDelta: item.quantityDelta,
          reason: item.reason,
        })),
      },
    });

    res.status(201).json({
      reference: result.reference,
      count: result.changes.length,
      changes: result.changes.map((change) => ({
        productId: change.productId,
        variantId: change.variantId,
        productName: change.productName,
        balanceAfter: change.balanceAfter,
        locationBalance: change.locationBalance,
        belowMinimum: change.belowMinimum,
        minStockLevel: change.minStockLevel,
      })),
    });
  }),
);

/* -------------------------------------------------------------------------- */
/* Transfers between locations                                                 */
/* -------------------------------------------------------------------------- */

router.post(
  '/transfers',
  requireAuth,
  requirePermission('inventory:transfer'),
  validateBody(createTransferSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const body = req.body as CreateTransferBody;

    const result = await createTransfer(entityId, auth, body);

    await publishStockChanges(entityId, result.changes);
    await auditRequest(req, {
      action: AUDIT_ACTIONS.STOCK_TRANSFER,
      targetType: 'stock_transfer',
      targetId: result.transferId,
      details: {
        reference: result.reference,
        direction: 'out',
        fromLocationId: body.fromLocationId,
        toLocationId: body.toLocationId,
        lineCount: body.lines.length,
      },
    });

    res.status(201).json(await getTransfer(entityId, result.transferId));
  }),
);

router.post(
  '/transfers/:id/receive',
  requireAuth,
  requirePermission('inventory:transfer'),
  validateBody(receiveTransferSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);

    const result = await receiveTransfer(entityId, auth, req.params.id!);

    await publishStockChanges(entityId, result.changes);
    await auditRequest(req, {
      action: AUDIT_ACTIONS.STOCK_TRANSFER,
      targetType: 'stock_transfer',
      targetId: result.transferId,
      details: { reference: result.reference, direction: 'in' },
    });

    res.json(await getTransfer(entityId, result.transferId));
  }),
);

router.get(
  '/transfers',
  requireAuth,
  requirePermission('inventory:read'),
  validateQuery(transfersQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    res.json(await listTransfers(entityId, parsedQuery<TransfersQuery>(res)));
  }),
);

router.get(
  '/transfers/:id',
  requireAuth,
  requirePermission('inventory:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const transfer = await getTransfer(entityId, req.params.id!);
    if (!transfer) throw ApiError.notFound('Transferencia nao encontrada.');
    res.json(transfer);
  }),
);

/* -------------------------------------------------------------------------- */
/* Stocktakes                                                                  */
/* -------------------------------------------------------------------------- */

router.post(
  '/stocktakes',
  requireAuth,
  requirePermission('inventory:stocktake'),
  validateBody(createStockTakeSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const body = req.body as CreateStockTakeBody;

    const result = await createStockTake(entityId, auth, body);
    res.status(201).json(await getStockTake(entityId, result.stockTakeId, canSeeCost(req)));
  }),
);

router.get(
  '/stocktakes',
  requireAuth,
  requirePermission('inventory:read'),
  validateQuery(stockTakesQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<StockTakesQuery>(res);
    res.json(await listStockTakes(entityId, query, canSeeCost(req)));
  }),
);

router.get(
  '/stocktakes/:id',
  requireAuth,
  requirePermission('inventory:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const stockTake = await getStockTake(entityId, req.params.id!, canSeeCost(req));
    if (!stockTake) throw ApiError.notFound('Inventario nao encontrado.');
    res.json(stockTake);
  }),
);

router.patch(
  '/stocktakes/:id/lines',
  requireAuth,
  requirePermission('inventory:stocktake'),
  validateBody(stockTakeLinesSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as StockTakeLinesBody;

    await updateStockTakeLines(entityId, req.params.id!, body);
    res.json(await getStockTake(entityId, req.params.id!, canSeeCost(req)));
  }),
);

router.post(
  '/stocktakes/:id/approve',
  requireAuth,
  requirePermission('inventory:stocktake'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);

    const result = await approveStockTake(entityId, auth, req.params.id!);

    await publishStockChanges(entityId, result.changes);
    await auditRequest(req, {
      action: AUDIT_ACTIONS.STOCKTAKE_APPROVE,
      targetType: 'stock_take',
      targetId: req.params.id!,
      details: {
        reference: result.reference,
        adjustedLines: result.adjustedLines,
        varianceValueMinor: result.varianceValueMinor,
      },
    });

    res.json(await getStockTake(entityId, req.params.id!, canSeeCost(req)));
  }),
);

router.post(
  '/stocktakes/:id/cancel',
  requireAuth,
  requirePermission('inventory:stocktake'),
  validateBody(cancelStockTakeSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as { reason?: string | null };

    await cancelStockTake(entityId, req.params.id!, body?.reason ?? null);
    res.json(await getStockTake(entityId, req.params.id!, canSeeCost(req)));
  }),
);

/* -------------------------------------------------------------------------- */
/* Insight                                                                     */
/* -------------------------------------------------------------------------- */

router.get(
  '/low-stock',
  requireAuth,
  requirePermission('inventory:read'),
  validateQuery(lowStockQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<LowStockQuery>(res);
    res.json(await listLowStock(entityId, query, canSeeCost(req)));
  }),
);

router.get(
  '/dead-stock',
  requireAuth,
  requirePermission('inventory:read'),
  validateQuery(deadStockQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<DeadStockQuery>(res);
    res.json(await listDeadStock(entityId, query, canSeeCost(req)));
  }),
);

router.get(
  '/expiring',
  requireAuth,
  requirePermission('inventory:read'),
  validateQuery(expiringQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<ExpiringQuery>(res);
    res.json(await listExpiring(entityId, query, canSeeCost(req)));
  }),
);

router.get(
  '/valuation',
  requireAuth,
  // Valuation is pure cost data, so it rides on the financial report permission.
  requirePermission('report:financial'),
  validateQuery(valuationQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    res.json(await stockValuation(entityId, parsedQuery<ValuationQuery>(res)));
  }),
);

export default router;
