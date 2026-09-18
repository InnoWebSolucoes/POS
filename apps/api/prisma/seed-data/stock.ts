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
 *
 * Movements may be handed over in any order - they are replayed strictly by
 * createdAt at flush time, so balanceAfter reads correctly when someone opens the
 * movement history of a product.
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

export async function inChunks<T>(
  rows: T[],
  write: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await write(rows.slice(i, i + CHUNK));
  }
}

export class SeedLedger {
  private readonly pending: SeedMovement[] = [];

  constructor(private readonly entityId: string) {}

  move(input: SeedMovement): void {
    this.pending.push(input);
  }

  get movementCount(): number {
    return this.pending.length;
  }

  /** Replays the ledger and writes movements, levels and rollups. */
  async flush(client: PrismaClient): Promise<{ movements: number; levels: number }> {
    const ordered = [...this.pending].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const levels = new Map<string, LevelState>();
    const productQty = new Map<string, number>();
    const variantQty = new Map<string, number>();
    const productAvgCost = new Map<string, number>();
    const variantAvgCost = new Map<string, number>();
    const rows: Prisma.StockMovementCreateManyInput[] = [];

    for (const input of ordered) {
      const variantId = input.variantId ?? null;
      const variantKey = variantId ?? '';
      const levelKey = `${input.productId}|${variantKey}|${input.locationId}`;

      const level: LevelState = levels.get(levelKey) ?? {
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
        productAvgCost.set(input.productId, level.avgCostMinor);
        if (variantId) variantAvgCost.set(variantId, level.avgCostMinor);
      }

      level.quantity = round3(previousQty + input.quantity);
      levels.set(levelKey, level);

      const productBalance = round3((productQty.get(input.productId) ?? 0) + input.quantity);
      productQty.set(input.productId, productBalance);

      let balanceAfter = productBalance;
      if (variantId) {
        balanceAfter = round3((variantQty.get(variantId) ?? 0) + input.quantity);
        variantQty.set(variantId, balanceAfter);
      }

      rows.push({
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
    }

    await inChunks(rows, (batch) => client.stockMovement.createMany({ data: batch }));

    const levelRows: Prisma.InventoryLevelCreateManyInput[] = [...levels.values()].map((level) => ({
      id: id(),
      productId: level.productId,
      variantId: level.variantId,
      variantKey: level.variantKey,
      locationId: level.locationId,
      quantity: round3(level.quantity),
      reserved: 0,
      avgCostMinor: money(level.avgCostMinor),
    }));
    await inChunks(levelRows, (batch) => client.inventoryLevel.createMany({ data: batch }));

    for (const [productId, quantity] of productQty) {
      const avgCost = productAvgCost.get(productId);
      await client.product.update({
        where: { id: productId },
        data: {
          stockQuantity: round3(quantity),
          ...(avgCost ? { avgCostMinor: money(avgCost) } : {}),
        },
      });
    }

    for (const [variantId, quantity] of variantQty) {
      const avgCost = variantAvgCost.get(variantId);
      await client.productVariant.update({
        where: { id: variantId },
        data: {
          stockQuantity: round3(quantity),
          ...(avgCost ? { avgCostMinor: money(avgCost) } : {}),
        },
      });
    }

    return { movements: rows.length, levels: levelRows.length };
  }
}
