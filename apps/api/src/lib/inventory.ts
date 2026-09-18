import { SOCKET_EVENTS, weightedAverageCost, type StockMovementType } from '@pos/shared';
import { prisma, type Tx } from './prisma.js';
import { ApiError } from './http.js';
import { emitInventoryUpdate, emitToEntity } from './realtime.js';

/**
 * The single place where stock quantities change.
 *
 * Everything that moves stock - a sale, a refund, a goods receipt, a stocktake,
 * a recipe consuming its ingredients - funnels through `applyStockChange` so
 * that the StockMovement ledger is always a complete account of how a product
 * arrived at its current quantity.
 */

export interface StockChangeInput {
  entityId: string;
  productId: string;
  variantId?: string | null;
  locationId?: string | null;
  /** Signed: negative removes stock. */
  quantity: number;
  type: StockMovementType;
  unitCostMinor?: number | null;
  reason?: string | null;
  reference?: string | null;
  note?: string | null;
  userId?: string | null;
  userName?: string | null;
  /** Reject the change if it would push the balance below zero. */
  preventNegative?: boolean;
}

export interface StockChangeResult {
  productId: string;
  variantId: string | null;
  /** Entity-wide balance after the change. */
  balanceAfter: number;
  locationBalance: number;
  belowMinimum: boolean;
  minStockLevel: number;
  productName: string;
}

/** Resolves the location to use when the caller did not specify one. */
export async function defaultLocationId(entityId: string, client: Tx = prisma): Promise<string> {
  const location =
    (await client.location.findFirst({
      where: { entityId, isDefault: true, active: true },
      select: { id: true },
    })) ??
    (await client.location.findFirst({
      where: { entityId, active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }));

  if (!location) {
    throw ApiError.badRequest('A entidade nao tem nenhuma localizacao activa.');
  }
  return location.id;
}

export async function applyStockChange(
  tx: Tx,
  input: StockChangeInput,
): Promise<StockChangeResult> {
  const {
    entityId,
    productId,
    variantId = null,
    quantity,
    type,
    unitCostMinor = null,
    reason = null,
    reference = null,
    note = null,
    userId = null,
    userName = null,
    preventNegative = false,
  } = input;

  const locationId = input.locationId ?? (await defaultLocationId(entityId, tx));
  const variantKey = variantId ?? '';

  const product = await tx.product.findFirst({
    where: { id: productId, entityId },
    select: {
      id: true,
      namePt: true,
      trackStock: true,
      stockQuantity: true,
      minStockLevel: true,
      avgCostMinor: true,
      available: true,
    },
  });
  if (!product) throw ApiError.notFound(`Produto ${productId} nao encontrado.`);

  // Services and untracked products still get a ledger entry of zero effect
  // only when explicitly asked; normally we short-circuit.
  if (!product.trackStock) {
    return {
      productId,
      variantId,
      balanceAfter: product.stockQuantity,
      locationBalance: 0,
      belowMinimum: false,
      minStockLevel: product.minStockLevel,
      productName: product.namePt,
    };
  }

  const existing = await tx.inventoryLevel.findUnique({
    where: { productId_variantKey_locationId: { productId, variantKey, locationId } },
  });

  const previousQty = existing?.quantity ?? 0;
  const nextQty = round3(previousQty + quantity);

  if (preventNegative && nextQty < 0) {
    throw ApiError.conflict(
      `Stock insuficiente para "${product.namePt}": disponivel ${previousQty}, pedido ${Math.abs(quantity)}.`,
    );
  }

  // Weighted-average cost only moves when stock comes IN with a known cost.
  let avgCostMinor = Number(existing?.avgCostMinor ?? product.avgCostMinor ?? 0);
  if (quantity > 0 && unitCostMinor != null && unitCostMinor > 0) {
    avgCostMinor = weightedAverageCost(Math.max(previousQty, 0), avgCostMinor, quantity, unitCostMinor);
  }

  if (existing) {
    await tx.inventoryLevel.update({
      where: { id: existing.id },
      data: { quantity: nextQty, avgCostMinor: BigInt(avgCostMinor) },
    });
  } else {
    await tx.inventoryLevel.create({
      data: {
        productId,
        variantId,
        variantKey,
        locationId,
        quantity: nextQty,
        avgCostMinor: BigInt(avgCostMinor),
      },
    });
  }

  // Keep the denormalised rollups in step with the ledger.
  const updatedProduct = await tx.product.update({
    where: { id: productId },
    data: {
      stockQuantity: { increment: quantity },
      ...(quantity > 0 && unitCostMinor != null && unitCostMinor > 0
        ? { avgCostMinor: BigInt(avgCostMinor) }
        : {}),
    },
    select: { stockQuantity: true, minStockLevel: true, namePt: true },
  });

  let variantBalance: number | null = null;
  if (variantId) {
    const updatedVariant = await tx.productVariant.update({
      where: { id: variantId },
      data: {
        stockQuantity: { increment: quantity },
        ...(quantity > 0 && unitCostMinor != null && unitCostMinor > 0
          ? { avgCostMinor: BigInt(avgCostMinor) }
          : {}),
      },
      select: { stockQuantity: true },
    });
    variantBalance = round3(updatedVariant.stockQuantity);
  }

  const balanceAfter = variantBalance ?? round3(updatedProduct.stockQuantity);

  await tx.stockMovement.create({
    data: {
      entityId,
      productId,
      variantId,
      locationId,
      type,
      quantity,
      balanceAfter,
      unitCostMinor: unitCostMinor != null ? BigInt(Math.round(unitCostMinor)) : null,
      reason,
      reference,
      note,
      userId,
      userName,
    },
  });

  const minStockLevel = updatedProduct.minStockLevel;
  const belowMinimum = minStockLevel > 0 && balanceAfter <= minStockLevel && quantity < 0;

  return {
    productId,
    variantId,
    balanceAfter,
    locationBalance: nextQty,
    belowMinimum,
    minStockLevel,
    productName: updatedProduct.namePt,
  };
}

/* -------------------------------------------------------------------------- */
/* Costing                                                                     */
/* -------------------------------------------------------------------------- */

export interface CostLookup {
  productId: string;
  variantId?: string | null;
  quantity: number;
}

/**
 * Unit cost used for COGS. Weighted average is the default; FIFO walks the
 * remaining stock batches oldest-first and falls back to the average when the
 * batches run out (which happens with opening balances).
 */
export async function resolveUnitCost(
  tx: Tx,
  entityId: string,
  item: CostLookup,
  method: 'weighted_average' | 'fifo' = 'weighted_average',
): Promise<number> {
  if (method === 'fifo') {
    const batches = await tx.stockBatch.findMany({
      where: {
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantityRemaining: { gt: 0 },
      },
      orderBy: { receivedAt: 'asc' },
      take: 50,
    });

    let remaining = item.quantity;
    let total = 0;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.quantityRemaining);
      total += take * Number(batch.unitCostMinor);
      remaining -= take;
    }
    if (remaining <= 0 && item.quantity > 0) {
      return Math.round(total / item.quantity);
    }
    // Not enough batch cover - fall through to the average.
  }

  if (item.variantId) {
    const variant = await tx.productVariant.findUnique({
      where: { id: item.variantId },
      select: { avgCostMinor: true, costPriceMinor: true, product: { select: { avgCostMinor: true, costPriceMinor: true } } },
    });
    if (variant) {
      return Number(
        variant.avgCostMinor || variant.costPriceMinor || variant.product.avgCostMinor || variant.product.costPriceMinor || 0n,
      );
    }
  }

  const product = await tx.product.findFirst({
    where: { id: item.productId, entityId },
    select: { avgCostMinor: true, costPriceMinor: true },
  });
  return Number(product?.avgCostMinor || product?.costPriceMinor || 0n);
}

/** Draws down FIFO batches so remaining quantities stay honest. */
export async function consumeBatches(
  tx: Tx,
  productId: string,
  variantId: string | null,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) return;
  const batches = await tx.stockBatch.findMany({
    where: { productId, variantId, quantityRemaining: { gt: 0 } },
    orderBy: { receivedAt: 'asc' },
    take: 50,
  });

  let remaining = quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.quantityRemaining);
    await tx.stockBatch.update({
      where: { id: batch.id },
      data: { quantityRemaining: round3(batch.quantityRemaining - take) },
    });
    remaining -= take;
  }
}

/* -------------------------------------------------------------------------- */
/* Selling                                                                     */
/* -------------------------------------------------------------------------- */

export interface SaleConsumptionItem {
  productId: string;
  variantId?: string | null;
  quantity: number;
  locationId?: string | null;
}

export interface SaleConsumptionResult {
  /** Cost of goods for the whole set of items. */
  cogsMinor: number;
  /** Per-input-item unit cost, in the order the items were supplied. */
  unitCosts: number[];
  changes: StockChangeResult[];
}

/**
 * Deducts stock for a completed sale.
 *
 * A composite product (a burger) does not hold stock itself - selling one
 * consumes its recipe components instead, and its cost is the sum of what it
 * consumed. That is why this returns the unit costs rather than reading them
 * off the product row.
 */
export async function consumeForSale(
  tx: Tx,
  entityId: string,
  items: SaleConsumptionItem[],
  context: {
    reference: string;
    userId?: string | null;
    userName?: string | null;
    costingMethod?: 'weighted_average' | 'fifo';
    preventNegative?: boolean;
  },
): Promise<SaleConsumptionResult> {
  const method = context.costingMethod ?? 'weighted_average';
  const changes: StockChangeResult[] = [];
  const unitCosts: number[] = [];
  let cogsMinor = 0;

  for (const item of items) {
    const product = await tx.product.findFirst({
      where: { id: item.productId, entityId },
      select: { id: true, type: true, trackStock: true, namePt: true },
    });
    if (!product) throw ApiError.notFound(`Produto ${item.productId} nao encontrado.`);

    if (product.type === 'service') {
      const unitCost = await resolveUnitCost(tx, entityId, item, method);
      unitCosts.push(unitCost);
      cogsMinor += Math.round(unitCost * item.quantity);
      continue;
    }

    if (product.type === 'composite') {
      const components = await tx.recipeComponent.findMany({
        where: { parentProductId: product.id },
      });

      let compositeUnitCost = 0;
      for (const component of components) {
        const wastageFactor = 1 + component.wastagePercentBps / 10_000;
        const consumed = round3(component.quantity * item.quantity * wastageFactor);
        const componentCost = await resolveUnitCost(
          tx,
          entityId,
          { productId: component.componentProductId, quantity: consumed },
          method,
        );
        compositeUnitCost += componentCost * component.quantity * wastageFactor;

        const change = await applyStockChange(tx, {
          entityId,
          productId: component.componentProductId,
          locationId: item.locationId ?? null,
          quantity: -consumed,
          type: 'composite_consumption',
          unitCostMinor: componentCost,
          reference: context.reference,
          note: `Consumido por ${product.namePt}`,
          userId: context.userId ?? null,
          userName: context.userName ?? null,
          preventNegative: false,
        });
        changes.push(change);
        if (method === 'fifo') {
          await consumeBatches(tx, component.componentProductId, null, consumed);
        }
      }

      const unitCost = Math.round(compositeUnitCost);
      unitCosts.push(unitCost);
      cogsMinor += Math.round(unitCost * item.quantity);
      continue;
    }

    const unitCost = await resolveUnitCost(tx, entityId, item, method);
    unitCosts.push(unitCost);
    cogsMinor += Math.round(unitCost * item.quantity);

    if (!product.trackStock) continue;

    const change = await applyStockChange(tx, {
      entityId,
      productId: item.productId,
      variantId: item.variantId ?? null,
      locationId: item.locationId ?? null,
      quantity: -item.quantity,
      type: 'sale',
      unitCostMinor: unitCost,
      reference: context.reference,
      userId: context.userId ?? null,
      userName: context.userName ?? null,
      preventNegative: context.preventNegative ?? false,
    });
    changes.push(change);

    if (method === 'fifo') {
      await consumeBatches(tx, item.productId, item.variantId ?? null, item.quantity);
    }
  }

  return { cogsMinor, unitCosts, changes };
}

/* -------------------------------------------------------------------------- */
/* Post-commit side effects                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Broadcasts stock changes and raises low-stock alerts.
 *
 * Deliberately called AFTER the transaction commits: emitting from inside a
 * transaction would announce quantities that could still be rolled back, and
 * the storefront would show stock that never existed.
 */
export async function publishStockChanges(
  entityId: string,
  changes: StockChangeResult[],
): Promise<void> {
  const seen = new Set<string>();

  for (const change of changes) {
    const key = `${change.productId}:${change.variantId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    emitInventoryUpdate(entityId, {
      productId: change.productId,
      variantId: change.variantId,
      stockQuantity: change.balanceAfter,
      available: change.balanceAfter > 0,
    });
  }

  const lowStock = changes.filter((c) => c.belowMinimum);
  if (lowStock.length === 0) return;

  const settings = await prisma.setting.findUnique({
    where: { entityId_key: { entityId, key: 'lowStockAlertsEnabled' } },
  });
  if (settings && settings.value === 'false') return;

  for (const change of lowStock) {
    const notification = await prisma.notification.create({
      data: {
        entityId,
        level: 'warning',
        titlePt: 'Stock baixo',
        titleEn: 'Low stock',
        bodyPt: `${change.productName}: restam ${formatQty(change.balanceAfter)} (minimo ${formatQty(change.minStockLevel)}).`,
        bodyEn: `${change.productName}: ${formatQty(change.balanceAfter)} left (minimum ${formatQty(change.minStockLevel)}).`,
        link: `/inventory/products/${change.productId}`,
      },
    });

    emitToEntity(entityId, SOCKET_EVENTS.LOW_STOCK, {
      id: notification.id,
      productId: change.productId,
      productName: change.productName,
      stockQuantity: change.balanceAfter,
      minStockLevel: change.minStockLevel,
    });
  }
}

/* -------------------------------------------------------------------------- */

/** Weights come in as 1.35 kg; three decimals is the practical limit. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '');
}
