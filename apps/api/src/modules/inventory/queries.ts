import type { Prisma } from '@prisma/client';
import { margin } from '@pos/shared';
import { pageParams, paginated } from '../../lib/http.js';
import { round3 } from '../../lib/inventory.js';
import { prisma } from '../../lib/prisma.js';
import {
  toMovementDto,
  toReceiptDto,
  toStockTakeDto,
  toTransferDto,
  parseOptions,
  unitCostOf,
  valueAt,
  variantLabel,
  toNumber,
  type LocationQuantity,
  type StockLevelRow,
  type StockLevelVariantRow,
} from './mappers.js';
import type {
  DeadStockQuery,
  ExpiringQuery,
  LevelsQuery,
  LowStockQuery,
  MovementsQuery,
  ReceiptsQuery,
  StockTakesQuery,
  TransfersQuery,
  ValuationQuery,
} from './schemas.js';

/** Upper bound for the in-memory passes (low stock, valuation, stock filters). */
const SCAN_LIMIT = 5000;

function dateRange(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = from;
  if (to) filter.lte = to;
  return filter;
}

/* -------------------------------------------------------------------------- */
/* GET /levels                                                                 */
/* -------------------------------------------------------------------------- */

function levelsWhere(entityId: string, q: LevelsQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    entityId,
    deletedAt: null,
    trackStock: true,
    type: { not: 'service' },
  };
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.search) {
    // SQLite has no case-insensitive `mode`, so this is a plain contains.
    where.OR = [
      { namePt: { contains: q.search } },
      { nameEn: { contains: q.search } },
      { sku: { contains: q.search } },
      { barcode: { contains: q.search } },
      { variants: { some: { sku: { contains: q.search }, deletedAt: null } } },
    ];
  }
  return where;
}

function levelsInclude(locationId?: string) {
  return {
    category: { select: { id: true, namePt: true } },
    variants: {
      where: { deletedAt: null },
      select: {
        id: true,
        sku: true,
        options: true,
        salePriceMinor: true,
        costPriceMinor: true,
        avgCostMinor: true,
        stockQuantity: true,
        minStockLevel: true,
      },
    },
    inventoryLevels: {
      where: locationId ? { locationId } : {},
      select: {
        locationId: true,
        variantId: true,
        quantity: true,
        reserved: true,
        location: { select: { id: true, name: true } },
      },
    },
  } satisfies Prisma.ProductInclude;
}

type LevelProduct = Prisma.ProductGetPayload<{ include: ReturnType<typeof levelsInclude> }>;

function rollUpLocations(
  levels: LevelProduct['inventoryLevels'],
  variantId: string | null,
): LocationQuantity[] {
  const byLocation = new Map<string, LocationQuantity>();
  for (const level of levels) {
    if ((level.variantId ?? null) !== variantId) continue;
    const bucket = byLocation.get(level.locationId) ?? {
      locationId: level.locationId,
      locationName: level.location?.name ?? '',
      quantity: 0,
      reserved: 0,
    };
    bucket.quantity = round3(bucket.quantity + level.quantity);
    bucket.reserved = round3(bucket.reserved + level.reserved);
    byLocation.set(level.locationId, bucket);
  }
  return [...byLocation.values()].sort((a, b) => a.locationName.localeCompare(b.locationName));
}

function buildLevelRow(
  product: LevelProduct,
  locationId: string | undefined,
  showCost: boolean,
): StockLevelRow {
  const scoped = product.inventoryLevels;
  const productCost = unitCostOf(product);
  const salePriceMinor = toNumber(product.salePriceMinor);

  const variants: StockLevelVariantRow[] = product.variants.map((variant) => {
    const locations = rollUpLocations(scoped, variant.id);
    const quantity = locationId
      ? round3(locations.reduce((sum, l) => sum + l.quantity, 0))
      : round3(variant.stockQuantity);
    const reserved = round3(locations.reduce((sum, l) => sum + l.reserved, 0));
    const cost = unitCostOf(product, variant);
    const price = toNumber(variant.salePriceMinor) || salePriceMinor;
    const options = parseOptions(variant.options);

    return {
      variantId: variant.id,
      sku: variant.sku,
      options,
      quantity,
      reserved,
      minStockLevel: round3(variant.minStockLevel),
      salePriceMinor: price,
      ...(showCost ? { avgCostMinor: cost, stockValueMinor: valueAt(quantity, cost) } : {}),
      retailValueMinor: valueAt(quantity, price),
      locations,
      lowStock: variant.minStockLevel > 0 && quantity <= variant.minStockLevel,
      outOfStock: quantity <= 0,
    };
  });

  const locations = mergeAllLocations(scoped);

  const quantity = locationId
    ? round3(locations.reduce((sum, l) => sum + l.quantity, 0))
    : round3(product.stockQuantity);
  const reserved = round3(locations.reduce((sum, l) => sum + l.reserved, 0));
  const retailValueMinor = variants.length
    ? variants.reduce((sum, v) => sum + v.retailValueMinor, 0)
    : valueAt(quantity, salePriceMinor);
  const stockValueMinor = variants.length
    ? variants.reduce((sum, v) => sum + (v.stockValueMinor ?? 0), 0)
    : valueAt(quantity, productCost);

  return {
    productId: product.id,
    variantId: null,
    sku: product.sku,
    barcode: product.barcode,
    name: product.namePt,
    nameEn: product.nameEn,
    unit: product.unit,
    type: product.type,
    categoryId: product.categoryId,
    categoryName: product.category?.namePt ?? null,
    trackStock: product.trackStock,
    quantity,
    reserved,
    minStockLevel: round3(product.minStockLevel),
    maxStockLevel: product.maxStockLevel === null ? null : round3(product.maxStockLevel),
    salePriceMinor,
    ...(showCost ? { avgCostMinor: productCost, stockValueMinor } : {}),
    retailValueMinor,
    lowStock: product.minStockLevel > 0 && quantity <= product.minStockLevel,
    outOfStock: quantity <= 0,
    locations,
    variants,
  };
}

/** Every location bucket for a product, variants folded into the same totals. */
function mergeAllLocations(levels: LevelProduct['inventoryLevels']): LocationQuantity[] {
  const byLocation = new Map<string, LocationQuantity>();
  for (const level of levels) {
    const bucket = byLocation.get(level.locationId) ?? {
      locationId: level.locationId,
      locationName: level.location?.name ?? '',
      quantity: 0,
      reserved: 0,
    };
    bucket.quantity = round3(bucket.quantity + level.quantity);
    bucket.reserved = round3(bucket.reserved + level.reserved);
    byLocation.set(level.locationId, bucket);
  }
  return [...byLocation.values()].sort((a, b) => a.locationName.localeCompare(b.locationName));
}

export async function listLevels(entityId: string, q: LevelsQuery, showCost: boolean) {
  const where = levelsWhere(entityId, q);
  const include = levelsInclude(q.locationId);
  const page = pageParams(q);

  // lowStock / outOfStock compare two columns, which Prisma cannot express
  // portably, so those two filters are resolved in memory over a bounded scan.
  if (q.lowStock || q.outOfStock) {
    const products = await prisma.product.findMany({
      where,
      include,
      orderBy: [{ namePt: 'asc' }],
      take: SCAN_LIMIT,
    });
    const rows = products
      .map((product) => buildLevelRow(product, q.locationId, showCost))
      .filter((row) => (q.lowStock && row.lowStock) || (q.outOfStock && row.outOfStock));
    return paginated(rows.slice(page.skip, page.skip + page.take), rows.length, page);
  }

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include,
      orderBy: [{ namePt: 'asc' }],
      skip: page.skip,
      take: page.take,
    }),
  ]);

  return paginated(
    products.map((product) => buildLevelRow(product, q.locationId, showCost)),
    total,
    page,
  );
}

/* -------------------------------------------------------------------------- */
/* GET /movements                                                              */
/* -------------------------------------------------------------------------- */

export async function listMovements(entityId: string, q: MovementsQuery, showCost: boolean) {
  const where: Prisma.StockMovementWhereInput = { entityId };
  if (q.productId) where.productId = q.productId;
  if (q.variantId) where.variantId = q.variantId;
  if (q.locationId) where.locationId = q.locationId;
  if (q.userId) where.userId = q.userId;
  if (q.type) where.type = q.type;
  if (q.reference) where.reference = { contains: q.reference };
  const createdAt = dateRange(q.from, q.to);
  if (createdAt) where.createdAt = createdAt;

  const page = pageParams(q);
  const [total, rows] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page.skip,
      take: page.take,
      include: { product: { select: { namePt: true } } },
    }),
  ]);

  return paginated(
    rows.map((row) => toMovementDto(row, showCost)),
    total,
    page,
  );
}

/* -------------------------------------------------------------------------- */
/* GET /receipts                                                               */
/* -------------------------------------------------------------------------- */

export async function listReceipts(entityId: string, q: ReceiptsQuery, showCost: boolean) {
  const where: Prisma.StockReceiptWhereInput = { entityId };
  if (q.supplierId) where.supplierId = q.supplierId;
  if (q.locationId) where.locationId = q.locationId;
  if (q.purchaseOrderId) where.purchaseOrderId = q.purchaseOrderId;
  if (q.search) {
    where.OR = [
      { reference: { contains: q.search } },
      { invoiceNumber: { contains: q.search } },
    ];
  }
  const createdAt = dateRange(q.from, q.to);
  if (createdAt) where.createdAt = createdAt;

  const page = pageParams(q);
  const [total, rows] = await Promise.all([
    prisma.stockReceipt.count({ where }),
    prisma.stockReceipt.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page.skip,
      take: page.take,
      include: {
        location: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, reference: true, status: true } },
        user: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  return paginated(
    rows.map((row) => toReceiptDto(row, showCost)),
    total,
    page,
  );
}

export async function getReceipt(entityId: string, id: string, showCost: boolean) {
  const row = await prisma.stockReceipt.findFirst({
    where: { id, entityId },
    include: {
      location: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, reference: true, status: true } },
      user: { select: { id: true, name: true } },
      lines: {
        include: {
          product: { select: { namePt: true, sku: true, unit: true } },
          variant: { select: { sku: true, options: true } },
        },
      },
    },
  });
  return row ? toReceiptDto(row, showCost) : null;
}

/* -------------------------------------------------------------------------- */
/* GET /transfers                                                              */
/* -------------------------------------------------------------------------- */

export async function listTransfers(entityId: string, q: TransfersQuery) {
  const where: Prisma.StockTransferWhereInput = { entityId };
  if (q.status) where.status = q.status;
  if (q.fromLocationId) where.fromLocationId = q.fromLocationId;
  if (q.toLocationId) where.toLocationId = q.toLocationId;

  const page = pageParams(q);
  const [total, rows] = await Promise.all([
    prisma.stockTransfer.count({ where }),
    prisma.stockTransfer.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page.skip,
      take: page.take,
      include: {
        fromLocation: { select: { id: true, name: true } },
        toLocation: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  return paginated(rows.map(toTransferDto), total, page);
}

export async function getTransfer(entityId: string, id: string) {
  const row = await prisma.stockTransfer.findFirst({
    where: { id, entityId },
    include: {
      fromLocation: { select: { id: true, name: true } },
      toLocation: { select: { id: true, name: true } },
      lines: {
        include: {
          product: { select: { namePt: true, sku: true, unit: true } },
          variant: { select: { sku: true, options: true } },
        },
      },
    },
  });
  return row ? toTransferDto(row) : null;
}

/* -------------------------------------------------------------------------- */
/* GET /stocktakes                                                             */
/* -------------------------------------------------------------------------- */

export async function listStockTakes(entityId: string, q: StockTakesQuery, showCost: boolean) {
  const where: Prisma.StockTakeWhereInput = { entityId };
  if (q.status) where.status = q.status;
  if (q.locationId) where.locationId = q.locationId;

  const page = pageParams(q);
  const [total, rows] = await Promise.all([
    prisma.stockTake.count({ where }),
    prisma.stockTake.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page.skip,
      take: page.take,
      include: {
        location: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  return paginated(
    rows.map((row) => toStockTakeDto(row, showCost)),
    total,
    page,
  );
}

export const stockTakeLineInclude = {
  product: {
    select: {
      namePt: true,
      sku: true,
      unit: true,
      barcode: true,
      avgCostMinor: true,
      costPriceMinor: true,
      categoryId: true,
    },
  },
  variant: {
    select: { sku: true, options: true, avgCostMinor: true, costPriceMinor: true },
  },
} satisfies Prisma.StockTakeLineInclude;

export async function getStockTake(entityId: string, id: string, showCost: boolean) {
  const row = await prisma.stockTake.findFirst({
    where: { id, entityId },
    include: {
      location: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      lines: { include: stockTakeLineInclude, orderBy: { id: 'asc' } },
    },
  });
  return row ? toStockTakeDto(row, showCost) : null;
}

/* -------------------------------------------------------------------------- */
/* GET /low-stock                                                              */
/* -------------------------------------------------------------------------- */

function reorderQuantity(quantity: number, minStockLevel: number, maxStockLevel: number | null) {
  const target = maxStockLevel !== null && maxStockLevel > 0 ? maxStockLevel : minStockLevel * 2;
  return round3(Math.max(0, target - quantity));
}

export async function listLowStock(entityId: string, q: LowStockQuery, showCost: boolean) {
  const where: Prisma.ProductWhereInput = {
    entityId,
    deletedAt: null,
    active: true,
    trackStock: true,
    type: { not: 'service' },
    minStockLevel: { gt: 0 },
  };
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.supplierId) where.supplierId = q.supplierId;

  const products = await prisma.product.findMany({
    where,
    take: SCAN_LIMIT,
    orderBy: [{ namePt: 'asc' }],
    include: {
      category: { select: { id: true, namePt: true } },
      supplier: { select: { id: true, name: true, phone: true, email: true } },
      variants: {
        where: { deletedAt: null, minStockLevel: { gt: 0 } },
        select: {
          id: true,
          sku: true,
          options: true,
          stockQuantity: true,
          minStockLevel: true,
          avgCostMinor: true,
          costPriceMinor: true,
        },
      },
      inventoryLevels: {
        where: q.locationId ? { locationId: q.locationId } : {},
        select: { locationId: true, variantId: true, quantity: true },
      },
    },
  });

  const rows = products
    .map((product) => {
      const quantity = q.locationId
        ? round3(product.inventoryLevels.reduce((sum, l) => sum + l.quantity, 0))
        : round3(product.stockQuantity);
      const cost = unitCostOf(product);

      const variants = product.variants
        .map((variant) => {
          const vQty = q.locationId
            ? round3(
                product.inventoryLevels
                  .filter((l) => l.variantId === variant.id)
                  .reduce((sum, l) => sum + l.quantity, 0),
              )
            : round3(variant.stockQuantity);
          return {
            variantId: variant.id,
            sku: variant.sku,
            variantName: variantLabel(variant.sku, parseOptions(variant.options)),
            quantity: vQty,
            minStockLevel: round3(variant.minStockLevel),
            suggestedReorderQuantity: reorderQuantity(vQty, variant.minStockLevel, null),
            lowStock: vQty <= variant.minStockLevel,
          };
        })
        .filter((v) => v.lowStock);

      return {
        productId: product.id,
        sku: product.sku,
        barcode: product.barcode,
        name: product.namePt,
        unit: product.unit,
        categoryId: product.categoryId,
        categoryName: product.category?.namePt ?? null,
        quantity,
        minStockLevel: round3(product.minStockLevel),
        maxStockLevel: product.maxStockLevel === null ? null : round3(product.maxStockLevel),
        suggestedReorderQuantity: reorderQuantity(
          quantity,
          product.minStockLevel,
          product.maxStockLevel,
        ),
        outOfStock: quantity <= 0,
        supplier: product.supplier
          ? {
              id: product.supplier.id,
              name: product.supplier.name,
              phone: product.supplier.phone,
              email: product.supplier.email,
            }
          : null,
        ...(showCost
          ? {
              avgCostMinor: cost,
              reorderCostMinor: valueAt(
                reorderQuantity(quantity, product.minStockLevel, product.maxStockLevel),
                cost,
              ),
            }
          : {}),
        variants,
        _low: quantity <= product.minStockLevel || variants.length > 0,
      };
    })
    .filter((row) => row._low)
    .map(({ _low, ...row }) => row)
    .sort((a, b) => a.quantity - a.minStockLevel - (b.quantity - b.minStockLevel));

  const page = pageParams(q);
  return paginated(rows.slice(page.skip, page.skip + page.take), rows.length, page);
}

/* -------------------------------------------------------------------------- */
/* GET /dead-stock                                                             */
/* -------------------------------------------------------------------------- */

export async function listDeadStock(entityId: string, q: DeadStockQuery, showCost: boolean) {
  const days = q.days ?? 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const sold = await prisma.saleLine.findMany({
    where: {
      productId: { not: null },
      sale: {
        entityId,
        createdAt: { gte: since },
        status: { in: ['completed', 'partially_refunded', 'refunded'] },
      },
    },
    select: { productId: true },
    distinct: ['productId'],
    take: 20_000,
  });
  const soldIds = sold.map((row) => row.productId).filter((id): id is string => Boolean(id));

  const where: Prisma.ProductWhereInput = {
    entityId,
    deletedAt: null,
    trackStock: true,
    type: { not: 'service' },
    stockQuantity: { gt: 0 },
    id: { notIn: soldIds },
  };
  if (q.categoryId) where.categoryId = q.categoryId;

  const page = pageParams(q);
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ stockQuantity: 'desc' }],
      skip: page.skip,
      take: page.take,
      include: {
        category: { select: { id: true, namePt: true } },
        supplier: { select: { id: true, name: true } },
      },
    }),
  ]);

  // One grouped query gives the last time each of these actually moved.
  const lastSale = await prisma.stockMovement.groupBy({
    by: ['productId'],
    where: { entityId, type: 'sale', productId: { in: products.map((p) => p.id) } },
    _max: { createdAt: true },
  });
  const lastSaleBy = new Map(lastSale.map((row) => [row.productId, row._max.createdAt ?? null]));

  const rows = products.map((product) => {
    const quantity = round3(product.stockQuantity);
    const cost = unitCostOf(product);
    const lastSoldAt = lastSaleBy.get(product.id) ?? null;
    return {
      productId: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.namePt,
      unit: product.unit,
      categoryId: product.categoryId,
      categoryName: product.category?.namePt ?? null,
      supplierId: product.supplierId,
      supplierName: product.supplier?.name ?? null,
      quantity,
      salePriceMinor: toNumber(product.salePriceMinor),
      retailValueMinor: valueAt(quantity, toNumber(product.salePriceMinor)),
      ...(showCost ? { avgCostMinor: cost, stockValueMinor: valueAt(quantity, cost) } : {}),
      lastSoldAt: lastSoldAt ? lastSoldAt.toISOString() : null,
      daysSinceLastSale: lastSoldAt
        ? Math.floor((Date.now() - lastSoldAt.getTime()) / 86_400_000)
        : null,
      createdAt: product.createdAt.toISOString(),
    };
  });

  return { ...paginated(rows, total, page), days, since: since.toISOString() };
}

/* -------------------------------------------------------------------------- */
/* GET /expiring                                                               */
/* -------------------------------------------------------------------------- */

export async function listExpiring(entityId: string, q: ExpiringQuery, showCost: boolean) {
  const days = q.days ?? 30;
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const where: Prisma.StockBatchWhereInput = {
    quantityRemaining: { gt: 0 },
    expiryDate: q.includeExpired === false ? { gte: now, lte: until } : { not: null, lte: until },
    product: { entityId, deletedAt: null },
  };
  if (q.locationId) where.locationId = q.locationId;

  const page = pageParams(q);
  const [total, batches, locations] = await Promise.all([
    prisma.stockBatch.count({ where }),
    prisma.stockBatch.findMany({
      where,
      orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
      skip: page.skip,
      take: page.take,
      include: {
        product: { select: { id: true, namePt: true, sku: true, unit: true, barcode: true } },
        variant: { select: { id: true, sku: true, options: true } },
      },
    }),
    prisma.location.findMany({ where: { entityId }, select: { id: true, name: true } }),
  ]);
  const locationName = new Map(locations.map((l) => [l.id, l.name]));

  const rows = batches.map((batch) => {
    const quantity = round3(batch.quantityRemaining);
    const cost = Number(batch.unitCostMinor);
    const expiry = batch.expiryDate;
    const daysToExpiry = expiry
      ? Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000)
      : null;
    return {
      batchId: batch.id,
      productId: batch.productId,
      productName: batch.product?.namePt ?? '',
      sku: batch.product?.sku ?? '',
      barcode: batch.product?.barcode ?? null,
      unit: batch.product?.unit ?? 'each',
      variantId: batch.variantId,
      variantName: batch.variant
        ? variantLabel(batch.variant.sku, parseOptions(batch.variant.options))
        : null,
      locationId: batch.locationId,
      locationName: batch.locationId ? locationName.get(batch.locationId) ?? null : null,
      batchNumber: batch.batchNumber,
      quantityReceived: round3(batch.quantityReceived),
      quantityRemaining: quantity,
      expiryDate: expiry ? expiry.toISOString() : null,
      daysToExpiry,
      expired: daysToExpiry !== null && daysToExpiry < 0,
      receivedAt: batch.receivedAt.toISOString(),
      ...(showCost ? { unitCostMinor: cost, stockValueMinor: valueAt(quantity, cost) } : {}),
    };
  });

  return { ...paginated(rows, total, page), days, until: until.toISOString() };
}

/* -------------------------------------------------------------------------- */
/* GET /valuation                                                              */
/* -------------------------------------------------------------------------- */

export async function stockValuation(entityId: string, q: ValuationQuery) {
  const products = await prisma.product.findMany({
    where: { entityId, deletedAt: null, trackStock: true, type: { not: 'service' } },
    take: 20_000,
    include: {
      category: { select: { id: true, namePt: true } },
      variants: {
        where: { deletedAt: null },
        select: {
          id: true,
          stockQuantity: true,
          salePriceMinor: true,
          avgCostMinor: true,
          costPriceMinor: true,
        },
      },
      inventoryLevels: {
        where: q.locationId ? { locationId: q.locationId } : {},
        select: { variantId: true, quantity: true },
      },
    },
  });

  interface Bucket {
    categoryId: string | null;
    categoryName: string | null;
    productCount: number;
    unitCount: number;
    costValueMinor: number;
    retailValueMinor: number;
  }
  const buckets = new Map<string, Bucket>();
  let totalCostMinor = 0;
  let totalRetailMinor = 0;
  let unitCount = 0;

  for (const product of products) {
    const salePriceMinor = toNumber(product.salePriceMinor);
    let productQty = 0;
    let costValue = 0;
    let retailValue = 0;

    if (product.variants.length) {
      for (const variant of product.variants) {
        const qty = q.locationId
          ? round3(
              product.inventoryLevels
                .filter((l) => l.variantId === variant.id)
                .reduce((sum, l) => sum + l.quantity, 0),
            )
          : round3(variant.stockQuantity);
        const cost = unitCostOf(product, variant);
        const price = toNumber(variant.salePriceMinor) || salePriceMinor;
        productQty += qty;
        costValue += valueAt(qty, cost);
        retailValue += valueAt(qty, price);
      }
    } else {
      const qty = q.locationId
        ? round3(product.inventoryLevels.reduce((sum, l) => sum + l.quantity, 0))
        : round3(product.stockQuantity);
      const cost = unitCostOf(product);
      productQty = qty;
      costValue = valueAt(qty, cost);
      retailValue = valueAt(qty, salePriceMinor);
    }

    const key = product.categoryId ?? '';
    const bucket = buckets.get(key) ?? {
      categoryId: product.categoryId,
      categoryName: product.category?.namePt ?? null,
      productCount: 0,
      unitCount: 0,
      costValueMinor: 0,
      retailValueMinor: 0,
    };
    bucket.productCount += 1;
    bucket.unitCount = round3(bucket.unitCount + productQty);
    bucket.costValueMinor += costValue;
    bucket.retailValueMinor += retailValue;
    buckets.set(key, bucket);

    totalCostMinor += costValue;
    totalRetailMinor += retailValue;
    unitCount = round3(unitCount + productQty);
  }

  const totals = margin(totalRetailMinor, totalCostMinor);

  return {
    locationId: q.locationId ?? null,
    generatedAt: new Date().toISOString(),
    productCount: products.length,
    unitCount,
    totalCostMinor,
    totalRetailMinor,
    potentialProfitMinor: totals.profitMinor,
    marginBps: totals.marginBps,
    categories: [...buckets.values()]
      .map((bucket) => {
        const m = margin(bucket.retailValueMinor, bucket.costValueMinor);
        return {
          categoryId: bucket.categoryId,
          categoryName: bucket.categoryName,
          productCount: bucket.productCount,
          unitCount: bucket.unitCount,
          costValueMinor: bucket.costValueMinor,
          retailValueMinor: bucket.retailValueMinor,
          potentialProfitMinor: m.profitMinor,
          marginBps: m.marginBps,
        };
      })
      .sort((a, b) => b.costValueMinor - a.costValueMinor),
  };
}
