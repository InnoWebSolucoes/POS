import { randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/http.js';
import {
  applyStockChange,
  defaultLocationId,
  resolveUnitCost,
  round3,
  type StockChangeResult,
} from '../../lib/inventory.js';
import type { AuthContext } from '../../lib/middleware.js';
import { prisma, TX_OPTIONS, type Tx } from '../../lib/prisma.js';
import { nextDocumentNumber } from '../../lib/sequence.js';
import { unitCostOf } from './mappers.js';
import { stockTakeLineInclude } from './queries.js';
import type {
  AdjustmentItem,
  CreateReceiptBody,
  CreateStockTakeBody,
  CreateTransferBody,
  StockTakeLinesBody,
} from './schemas.js';

/* -------------------------------------------------------------------------- */
/* Shared guards                                                               */
/* -------------------------------------------------------------------------- */

/** Validates a location belongs to the tenant, or falls back to the default. */
async function resolveLocation(
  tx: Tx,
  entityId: string,
  locationId?: string | null,
): Promise<string> {
  if (!locationId) return defaultLocationId(entityId, tx);
  const found = await tx.location.findFirst({
    where: { id: locationId, entityId },
    select: { id: true },
  });
  if (!found) throw ApiError.notFound('Localizacao nao encontrada.');
  return found.id;
}

interface LineRef {
  productId: string;
  variantId?: string | null;
}

/**
 * Guarantees every product/variant in a payload belongs to this tenant before
 * a single row is written. Multi-tenant safety lives here.
 */
async function assertLines(tx: Tx, entityId: string, lines: LineRef[]) {
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, entityId, deletedAt: null },
    select: { id: true, namePt: true, type: true, trackStock: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  for (const id of productIds) {
    if (!productById.has(id)) throw ApiError.notFound(`Produto ${id} nao encontrado.`);
  }

  const variantIds = [
    ...new Set(lines.map((l) => l.variantId).filter((v): v is string => Boolean(v))),
  ];
  const variants = variantIds.length
    ? await tx.productVariant.findMany({
        where: { id: { in: variantIds }, entityId, deletedAt: null },
        select: { id: true, productId: true },
      })
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));

  for (const line of lines) {
    if (!line.variantId) continue;
    const variant = variantById.get(line.variantId);
    if (!variant) throw ApiError.notFound(`Variante ${line.variantId} nao encontrada.`);
    if (variant.productId !== line.productId) {
      throw ApiError.badRequest('A variante nao pertence ao produto indicado.');
    }
  }

  return productById;
}

/* -------------------------------------------------------------------------- */
/* Receipts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Moves the matching purchase-order lines forward and recomputes the order
 * status. Receiving something that is not on the order is allowed - it simply
 * does not count towards the order.
 */
async function applyToPurchaseOrder(
  tx: Tx,
  entityId: string,
  purchaseOrderId: string,
  lines: Array<{ productId: string; variantId?: string | null; quantity: number }>,
): Promise<string> {
  const po = await tx.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, entityId },
    include: { lines: true },
  });
  if (!po) throw ApiError.notFound('Encomenda de compra nao encontrada.');
  if (po.status === 'cancelled') {
    throw ApiError.conflict('A encomenda de compra esta cancelada.');
  }

  const poLineByKey = new Map(
    po.lines.map((line) => [`${line.productId}:${line.variantId ?? ''}`, line]),
  );
  const increments = new Map<string, number>();
  for (const line of lines) {
    const poLine = poLineByKey.get(`${line.productId}:${line.variantId ?? ''}`);
    if (!poLine) continue;
    increments.set(poLine.id, round3((increments.get(poLine.id) ?? 0) + line.quantity));
  }

  for (const [id, quantity] of increments) {
    await tx.purchaseOrderLine.update({
      where: { id },
      data: { receivedQuantity: { increment: quantity } },
    });
  }

  const after = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId } });
  const allReceived =
    after.length > 0 && after.every((l) => l.receivedQuantity >= l.quantity - 0.0001);
  const anyReceived = after.some((l) => l.receivedQuantity > 0);
  const status = allReceived ? 'received' : anyReceived ? 'partially_received' : po.status;

  if (status !== po.status) {
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status } });
  }
  return status;
}

export interface ReceiptResult {
  receiptId: string;
  reference: string;
  totalCostMinor: number;
  lineCount: number;
  purchaseOrderStatus: string | null;
  changes: StockChangeResult[];
}

export async function createReceipt(
  entityId: string,
  auth: AuthContext,
  body: CreateReceiptBody,
): Promise<ReceiptResult> {
  return prisma.$transaction(async (tx) => {
    const locationId = await resolveLocation(tx, entityId, body.locationId);

    if (body.supplierId) {
      const supplier = await tx.supplier.findFirst({
        where: { id: body.supplierId, entityId, deletedAt: null },
        select: { id: true },
      });
      if (!supplier) throw ApiError.notFound('Fornecedor nao encontrado.');
    }

    await assertLines(tx, entityId, body.lines);

    const reference = await nextDocumentNumber(entityId, 'stock_receipt', { client: tx });
    const totalCostMinor = body.lines.reduce(
      (sum, line) => sum + Math.round(line.quantity * line.unitCostMinor),
      0,
    );

    const receipt = await tx.stockReceipt.create({
      data: {
        entityId,
        locationId,
        supplierId: body.supplierId ?? null,
        purchaseOrderId: body.purchaseOrderId ?? null,
        reference,
        invoiceNumber: body.invoiceNumber ?? null,
        note: body.note ?? null,
        totalCostMinor: BigInt(totalCostMinor),
        userId: auth.userId,
      },
      select: { id: true },
    });

    const changes: StockChangeResult[] = [];

    for (const line of body.lines) {
      const quantity = round3(line.quantity);
      const unitCostMinor = Math.round(line.unitCostMinor);

      await tx.stockReceiptLine.create({
        data: {
          receiptId: receipt.id,
          productId: line.productId,
          variantId: line.variantId ?? null,
          quantity,
          unitCostMinor: BigInt(unitCostMinor),
          batchNumber: line.batchNumber ?? null,
          expiryDate: line.expiryDate ?? null,
        },
      });

      // A batch per line is what makes FIFO costing and expiry tracking work.
      await tx.stockBatch.create({
        data: {
          productId: line.productId,
          variantId: line.variantId ?? null,
          locationId,
          quantityReceived: quantity,
          quantityRemaining: quantity,
          unitCostMinor: BigInt(unitCostMinor),
          batchNumber: line.batchNumber ?? null,
          expiryDate: line.expiryDate ?? null,
        },
      });

      // This is the call that rolls the weighted-average cost forward.
      changes.push(
        await applyStockChange(tx, {
          entityId,
          productId: line.productId,
          variantId: line.variantId ?? null,
          locationId,
          quantity,
          type: 'receipt',
          unitCostMinor,
          reference,
          note: body.invoiceNumber ? `Factura ${body.invoiceNumber}` : body.note ?? null,
          userId: auth.userId,
          userName: auth.name,
        }),
      );
    }

    const purchaseOrderStatus = body.purchaseOrderId
      ? await applyToPurchaseOrder(tx, entityId, body.purchaseOrderId, body.lines)
      : null;

    return {
      receiptId: receipt.id,
      reference,
      totalCostMinor,
      lineCount: body.lines.length,
      purchaseOrderStatus,
      changes,
    };
  }, TX_OPTIONS);
}

/* -------------------------------------------------------------------------- */
/* Adjustments                                                                 */
/* -------------------------------------------------------------------------- */

export interface AdjustmentResult {
  reference: string;
  changes: StockChangeResult[];
}

export async function createAdjustments(
  entityId: string,
  auth: AuthContext,
  items: AdjustmentItem[],
  options: { locationId?: string | null; note?: string | null; allowNegative?: boolean } = {},
): Promise<AdjustmentResult> {
  return prisma.$transaction(async (tx) => {
    await assertLines(tx, entityId, items);

    const reference = `AJU/${randomUUID().slice(0, 8).toUpperCase()}`;
    const locationCache = new Map<string, string>();

    const resolve = async (locationId?: string | null): Promise<string> => {
      const key = locationId ?? '';
      const cached = locationCache.get(key);
      if (cached) return cached;
      const resolved = await resolveLocation(tx, entityId, locationId);
      locationCache.set(key, resolved);
      return resolved;
    };

    const changes: StockChangeResult[] = [];

    for (const item of items) {
      const locationId = await resolve(item.locationId ?? options.locationId ?? null);
      const quantity = round3(item.quantityDelta);

      changes.push(
        await applyStockChange(tx, {
          entityId,
          productId: item.productId,
          variantId: item.variantId ?? null,
          locationId,
          quantity,
          type: 'adjustment',
          reason: item.reason,
          reference,
          note: item.note ?? options.note ?? null,
          userId: auth.userId,
          userName: auth.name,
          // Shrinkage cannot drive a balance below zero unless asked explicitly.
          preventNegative: quantity < 0 && options.allowNegative !== true,
        }),
      );
    }

    return { reference, changes };
  }, TX_OPTIONS);
}

/* -------------------------------------------------------------------------- */
/* Transfers                                                                   */
/* -------------------------------------------------------------------------- */

export interface TransferResult {
  transferId: string;
  reference: string;
  status: string;
  changes: StockChangeResult[];
}

export async function createTransfer(
  entityId: string,
  auth: AuthContext,
  body: CreateTransferBody,
): Promise<TransferResult> {
  if (body.fromLocationId === body.toLocationId) {
    throw ApiError.badRequest('A origem e o destino tem de ser localizacoes diferentes.');
  }

  return prisma.$transaction(async (tx) => {
    const fromLocationId = await resolveLocation(tx, entityId, body.fromLocationId);
    const toLocationId = await resolveLocation(tx, entityId, body.toLocationId);
    await assertLines(tx, entityId, body.lines);

    const reference = await nextDocumentNumber(entityId, 'stock_transfer', { client: tx });
    const transfer = await tx.stockTransfer.create({
      data: {
        entityId,
        fromLocationId,
        toLocationId,
        reference,
        // Stock leaves the source immediately; the destination confirms later.
        status: 'sent',
        note: body.note ?? null,
      },
      select: { id: true },
    });

    const changes: StockChangeResult[] = [];

    for (const line of body.lines) {
      const quantity = round3(line.quantity);

      await tx.stockTransferLine.create({
        data: {
          transferId: transfer.id,
          productId: line.productId,
          variantId: line.variantId ?? null,
          quantity,
        },
      });

      const unitCostMinor = await resolveUnitCost(tx, entityId, {
        productId: line.productId,
        variantId: line.variantId ?? null,
        quantity,
      });

      changes.push(
        await applyStockChange(tx, {
          entityId,
          productId: line.productId,
          variantId: line.variantId ?? null,
          locationId: fromLocationId,
          quantity: -quantity,
          type: 'transfer_out',
          unitCostMinor,
          reference,
          note: body.note ?? null,
          userId: auth.userId,
          userName: auth.name,
          preventNegative: true,
        }),
      );
    }

    return { transferId: transfer.id, reference, status: 'sent', changes };
  }, TX_OPTIONS);
}

export async function receiveTransfer(
  entityId: string,
  auth: AuthContext,
  id: string,
): Promise<TransferResult> {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({
      where: { id, entityId },
      include: { lines: true },
    });
    if (!transfer) throw ApiError.notFound('Transferencia nao encontrada.');
    if (transfer.status === 'received') {
      throw ApiError.conflict('Esta transferencia ja foi recebida.');
    }
    if (transfer.status !== 'sent') {
      throw ApiError.conflict('Apenas uma transferencia enviada pode ser recebida.');
    }

    // Reuse the cost that actually left the source, not today's average.
    const outMovements = await tx.stockMovement.findMany({
      where: { entityId, reference: transfer.reference, type: 'transfer_out' },
      select: { productId: true, variantId: true, unitCostMinor: true },
    });
    const costByKey = new Map<string, number | null>(
      outMovements.map((m) => [
        `${m.productId}:${m.variantId ?? ''}`,
        m.unitCostMinor === null ? null : Number(m.unitCostMinor),
      ]),
    );

    const changes: StockChangeResult[] = [];

    for (const line of transfer.lines) {
      const quantity = round3(line.quantity - line.receivedQuantity);
      if (quantity <= 0) continue;

      const key = `${line.productId}:${line.variantId ?? ''}`;
      const recorded = costByKey.get(key);
      const unitCostMinor =
        recorded !== undefined && recorded !== null
          ? recorded
          : await resolveUnitCost(tx, entityId, {
              productId: line.productId,
              variantId: line.variantId,
              quantity,
            });

      changes.push(
        await applyStockChange(tx, {
          entityId,
          productId: line.productId,
          variantId: line.variantId,
          locationId: transfer.toLocationId,
          quantity,
          type: 'transfer_in',
          unitCostMinor,
          reference: transfer.reference,
          userId: auth.userId,
          userName: auth.name,
        }),
      );

      await tx.stockTransferLine.update({
        where: { id: line.id },
        data: { receivedQuantity: round3(line.receivedQuantity + quantity) },
      });
    }

    await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: 'received', receivedAt: new Date() },
    });

    return { transferId: transfer.id, reference: transfer.reference, status: 'received', changes };
  }, TX_OPTIONS);
}

/* -------------------------------------------------------------------------- */
/* Stocktakes                                                                  */
/* -------------------------------------------------------------------------- */

export interface StockTakeCreateResult {
  stockTakeId: string;
  reference: string;
  lineCount: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function createStockTake(
  entityId: string,
  auth: AuthContext,
  body: CreateStockTakeBody,
): Promise<StockTakeCreateResult> {
  return prisma.$transaction(async (tx) => {
    let locationId: string | null = null;
    if (body.locationId) {
      locationId = await resolveLocation(tx, entityId, body.locationId);
    }

    if (body.categoryId) {
      const category = await tx.category.findFirst({
        where: { id: body.categoryId, entityId, deletedAt: null },
        select: { id: true },
      });
      if (!category) throw ApiError.notFound('Categoria nao encontrada.');
    }

    const products = await tx.product.findMany({
      where: {
        entityId,
        deletedAt: null,
        active: true,
        trackStock: true,
        type: { not: 'service' },
        ...(body.categoryId ? { categoryId: body.categoryId } : {}),
      },
      orderBy: [{ namePt: 'asc' }],
      select: {
        id: true,
        stockQuantity: true,
        variants: {
          where: { deletedAt: null, active: true },
          select: { id: true, stockQuantity: true },
        },
        inventoryLevels: {
          where: locationId ? { locationId } : {},
          select: { variantId: true, quantity: true },
        },
      },
    });

    const reference = await nextDocumentNumber(entityId, 'stock_take', { client: tx });
    const stockTake = await tx.stockTake.create({
      data: {
        entityId,
        locationId,
        reference,
        status: 'counting',
        note: body.note ?? null,
        userId: auth.userId,
      },
      select: { id: true },
    });

    const lines: Array<{
      stockTakeId: string;
      productId: string;
      variantId: string | null;
      expectedQuantity: number;
    }> = [];

    for (const product of products) {
      const atLocation = (variantId: string | null) =>
        round3(
          product.inventoryLevels
            .filter((l) => (l.variantId ?? null) === variantId)
            .reduce((sum, l) => sum + l.quantity, 0),
        );

      if (product.variants.length) {
        for (const variant of product.variants) {
          const expected = locationId ? atLocation(variant.id) : round3(variant.stockQuantity);
          if (body.onlyWithStock && expected === 0) continue;
          lines.push({
            stockTakeId: stockTake.id,
            productId: product.id,
            variantId: variant.id,
            expectedQuantity: expected,
          });
        }
        continue;
      }

      const expected = locationId ? atLocation(null) : round3(product.stockQuantity);
      if (body.onlyWithStock && expected === 0) continue;
      lines.push({
        stockTakeId: stockTake.id,
        productId: product.id,
        variantId: null,
        expectedQuantity: expected,
      });
    }

    for (const batch of chunk(lines, 500)) {
      await tx.stockTakeLine.createMany({ data: batch });
    }

    return { stockTakeId: stockTake.id, reference, lineCount: lines.length };
  }, TX_OPTIONS);
}

const EDITABLE_STOCKTAKE_STATUSES = ['open', 'counting', 'review'];

export async function updateStockTakeLines(
  entityId: string,
  id: string,
  body: StockTakeLinesBody,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const stockTake = await tx.stockTake.findFirst({
      where: { id, entityId },
      select: { id: true, status: true },
    });
    if (!stockTake) throw ApiError.notFound('Inventario nao encontrado.');
    if (!EDITABLE_STOCKTAKE_STATUSES.includes(stockTake.status)) {
      throw ApiError.conflict('Este inventario ja nao aceita contagens.');
    }

    const existing = await tx.stockTakeLine.findMany({
      where: { id: { in: body.lines.map((l) => l.id) }, stockTakeId: stockTake.id },
      include: stockTakeLineInclude,
    });
    const lineById = new Map(existing.map((line) => [line.id, line]));

    for (const input of body.lines) {
      const line = lineById.get(input.id);
      if (!line) throw ApiError.notFound(`Linha ${input.id} nao pertence a este inventario.`);

      const counted = input.countedQuantity === null ? null : round3(input.countedQuantity);
      const unitCost = unitCostOf(line.product, line.variant);
      const variance = counted === null ? 0 : round3(counted - line.expectedQuantity);

      await tx.stockTakeLine.update({
        where: { id: line.id },
        data: {
          countedQuantity: counted,
          note: input.note === undefined ? line.note : input.note ?? null,
          countedAt: counted === null ? null : new Date(),
          varianceValueMinor: BigInt(Math.round(variance * unitCost)),
        },
      });
    }

    if (stockTake.status === 'open') {
      await tx.stockTake.update({ where: { id: stockTake.id }, data: { status: 'counting' } });
    }

    return body.lines.length;
  }, TX_OPTIONS);
}

export interface StockTakeApprovalResult {
  reference: string;
  adjustedLines: number;
  varianceValueMinor: number;
  changes: StockChangeResult[];
}

export async function approveStockTake(
  entityId: string,
  auth: AuthContext,
  id: string,
): Promise<StockTakeApprovalResult> {
  return prisma.$transaction(async (tx) => {
    const stockTake = await tx.stockTake.findFirst({
      where: { id, entityId },
      include: { lines: { include: stockTakeLineInclude } },
    });
    if (!stockTake) throw ApiError.notFound('Inventario nao encontrado.');
    if (stockTake.status === 'approved') {
      throw ApiError.conflict('Este inventario ja foi aprovado.');
    }
    if (stockTake.status === 'cancelled') {
      throw ApiError.conflict('Este inventario foi cancelado.');
    }

    const changes: StockChangeResult[] = [];
    let varianceValueMinor = 0;

    for (const line of stockTake.lines) {
      if (line.countedQuantity === null) continue;
      const delta = round3(line.countedQuantity - line.expectedQuantity);
      if (delta === 0) continue;

      const unitCost = unitCostOf(line.product, line.variant);
      const lineValue = Math.round(delta * unitCost);
      varianceValueMinor += lineValue;

      changes.push(
        await applyStockChange(tx, {
          entityId,
          productId: line.productId,
          variantId: line.variantId,
          locationId: stockTake.locationId,
          quantity: delta,
          type: 'stocktake',
          reason: 'count_error',
          unitCostMinor: unitCost || null,
          reference: stockTake.reference,
          note: line.note,
          userId: auth.userId,
          userName: auth.name,
        }),
      );

      await tx.stockTakeLine.update({
        where: { id: line.id },
        data: { varianceValueMinor: BigInt(lineValue) },
      });
    }

    await tx.stockTake.update({
      where: { id: stockTake.id },
      data: { status: 'approved', approvedById: auth.userId, approvedAt: new Date() },
    });

    return {
      reference: stockTake.reference,
      adjustedLines: changes.length,
      varianceValueMinor,
      changes,
    };
  }, TX_OPTIONS);
}

export async function cancelStockTake(entityId: string, id: string, reason?: string | null) {
  const stockTake = await prisma.stockTake.findFirst({
    where: { id, entityId },
    select: { id: true, status: true, note: true, reference: true },
  });
  if (!stockTake) throw ApiError.notFound('Inventario nao encontrado.');
  if (stockTake.status === 'approved') {
    throw ApiError.conflict('Um inventario aprovado ja nao pode ser cancelado.');
  }
  if (stockTake.status === 'cancelled') {
    throw ApiError.conflict('Este inventario ja esta cancelado.');
  }

  await prisma.stockTake.update({
    where: { id: stockTake.id },
    data: {
      status: 'cancelled',
      note: reason ? `${stockTake.note ? `${stockTake.note} | ` : ''}${reason}` : stockTake.note,
    },
  });

  return stockTake.reference;
}
