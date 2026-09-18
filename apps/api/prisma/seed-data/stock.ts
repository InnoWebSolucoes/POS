import type { Prisma, PrismaClient } from '@prisma/client';
import { weightedAverageCost, type StockMovementType } from '@pos/shared';
import { id, money, round3 } from './helpers.js';

/**
 * An in-memory mirror of lib/inventory.applyStockChange().
 *
 * The seed is the one place allowed to write InventoryLevel, Product.stockQuantity
 * and the StockMovement ledger directly - lib/inventory is request-scoped and far
 * too chatty for a few thousand rows. The rules it enforces are reproduced here
 * exactly, so the three stay consistent:
 *
 *   * InventoryLevel is one row per (product, variantKey, location)
 *   * variantKey mirrors variantId with "" instead of NULL
 *   * Product.stockQuantity is the entity-wide rollup across every location and
 *     every variant; ProductVariant.stockQuantity is the per-variant rollup
 *   * StockMovement.balanceAfter is the variant balance when the movement names a
 *     variant, otherwise the product balance
 */

export interface SeedMovement {
  productId: string;
  variantId?: string | null;
  locationId: string;
  quantity: number;
  type: StockMovementType;
  unitCostMinor?: number | null;
  reason?: string | null;
  reference?: string | null;
  note?: string | null;
  userId?: string | null;
  userName?: string | null;
  createdAt: Date;
}

interface LevelState {
  productId: string;
  variantId: string | null;
  variantKey: string;
  locationId: string;
  quantity: number;
  avgCostMinor: number;
}

const CHUNK = 200;

async function inChunks<T>(rows: T[], write: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await write(rows.slice(i, i + CHUNK));
  }
}

export class SeedLedger {
  private readonly levels = new Map<string, LevelState>();
  private readonly productQty = new Map<string, number>();
  private readonly variantQty = new Map<string, number>();
  private readonly productAvgCost = new Map<string, number>();
  private readonly variantAvgCost = new Map<string, number>();
  private readonly movements: Prisma.StockMovementCreateManyInput[] = [];

  constructor(private readonly entityId: string) {}

  /** Entity-wide balance, exactly what a report or the product list shows. */
  balance(productId: string): number {
    return round3(this.productQty.get(productId) ?? 0);
  }

  locationBalance(productId: string, locationId: string, variantId: string | null = null): number {
    return round3(this.levels.get(this.key(productId, variantId, locationId))?.quantity ?? 0);
  }

  private key(productId: string, variantId: string | null, locationId: string): string {
    return `${productId}|${variantId ?? ''}|${locationId}`;
  }

  move(input: SeedMovement): number {
    const variantId = input.variantId ?? null;
    const variantKey = variantId ?? '';
    const levelKey = this.key(input.productId, variantId, input.locationId);

    const level: LevelState = this.levels.get(levelKey) ?? {
      productId: input.productId,
      variantId,
      variantKey,
      locationId: input.locationId,
      quantity: 0,
      avgCostMinor: 0,
    };

    const previousQty = level.quantity;
    const unitCost = input.unitCostMinor ?? null;

    // Weighted-average cost only moves when stock comes IN with a known cost.
    if (input.quantity > 0 && unitCost != null && unitCost > 0) {
      level.avgCostMinor = weightedAverageCost(
        Math.max(previousQty, 0),
        level.avgCostMinor,
        input.quantity,
        unitCost,
      );
      this.productAvgCost.set(input.productId, level.avgCostMinor);
      if (variantId) this.variantAvgCost.set(variantId, level.avgCostMinor);
    }

    level.quantity = round3(previousQty + input.quantity);
    this.levels.set(levelKey, level);

    const productBalance = round3((this.productQty.get(input.productId) ?? 0) + input.quantity);
    this.productQty.set(input.productId, productBalance);

    let balanceAfter = productBalance;
    if (variantId) {
      balanceAfter = round3((this.variantQty.get(variantId) ?? 0) + input.quantity);
      this.variantQty.set(variantId, balanceAfter);
    }

    this.movements.push({
      id: id(),
      entityId: this.entityId,
      productId: input.productId,
      variantId,
      locationId: input.locationId,
      type: input.type,
      quantity: round3(input.quantity),
      balanceAfter,
      unitCostMinor: unitCost != null ? money(unitCost) : null,
      reason: input.reason ?? null,
      reference: input.reference ?? null,
      note: input.note ?? null,
      userId: input.userId ?? null,
      userName: input.userName ?? null,
      createdAt: input.createdAt,
    });

    return balanceAfter;
  }

  get movementCount(): number {
    return this.movements.length;
  }

  get levelCount(): number {
    return this.levels.size;
  }

  /** Writes the ledger, the levels and the denormalised rollups in one go. */
  async flush(client: PrismaClient): Promise<void> {
    const ordered = [...this.movements].sort(
      (a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime(),
    );
    await inChunks(ordered, (batch) => client.stockMovement.createMany({ data: batch }));

    const levels: Prisma.InventoryLevelCreateManyInput[] = [...this.levels.values()].map((level) => ({
      id: id(),
      productId: level.productId,
      variantId: level.variantId,
      variantKey: level.variantKey,
      locationId: level.locationId,
      quantity: round3(level.quantity),
      reserved: 0,
      avgCostMinor: money(level.avgCostMinor),
    }));
    await inChunks(levels, (batch) => client.inventoryLevel.createMany({ data: batch }));

    for (const [productId, quantity] of this.productQty) {
      const avgCost = this.productAvgCost.get(productId);
      await client.product.update({
        where: { id: productId },
        data: {
          stockQuantity: round3(quantity),
          ...(avgCost ? { avgCostMinor: money(avgCost) } : {}),
        },
      });
    }

    for (const [variantId, quantity] of this.variantQty) {
      const avgCost = this.variantAvgCost.get(variantId);
      await client.productVariant.update({
        where: { id: variantId },
        data: {
          stockQuantity: round3(quantity),
          ...(avgCost ? { avgCostMinor: money(avgCost) } : {}),
        },
      });
    }
  }
}

export { inChunks };
