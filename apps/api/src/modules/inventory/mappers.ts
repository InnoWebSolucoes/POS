import type { AdjustmentReason, StockMovementDto } from '@pos/shared';
import { round3 } from '../../lib/inventory.js';

/* -------------------------------------------------------------------------- */
/* Shared shapes                                                               */
/* -------------------------------------------------------------------------- */

export interface LocationQuantity {
  locationId: string;
  locationName: string;
  quantity: number;
  reserved: number;
}

export interface StockLevelVariantRow {
  variantId: string;
  sku: string;
  options: Record<string, string>;
  quantity: number;
  reserved: number;
  minStockLevel: number;
  salePriceMinor: number;
  avgCostMinor?: number;
  stockValueMinor?: number;
  retailValueMinor: number;
  locations: LocationQuantity[];
  lowStock: boolean;
  outOfStock: boolean;
}

export interface StockLevelRow {
  productId: string;
  variantId: string | null;
  sku: string;
  barcode: string | null;
  name: string;
  nameEn: string | null;
  unit: string;
  type: string;
  categoryId: string | null;
  categoryName: string | null;
  trackStock: boolean;
  quantity: number;
  reserved: number;
  minStockLevel: number;
  maxStockLevel: number | null;
  salePriceMinor: number;
  avgCostMinor?: number;
  stockValueMinor?: number;
  retailValueMinor: number;
  lowStock: boolean;
  outOfStock: boolean;
  locations: LocationQuantity[];
  variants: StockLevelVariantRow[];
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

export function toNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function toMinorBigInt(value: number): bigint {
  return BigInt(Math.round(value));
}

/** JSON column -> object, never throwing on malformed rows. */
export function parseOptions(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* a malformed options blob must not break a stock listing */
  }
  return {};
}

export function variantLabel(sku: string, options: Record<string, string>): string {
  const parts = Object.values(options).filter(Boolean);
  return parts.length ? parts.join(' / ') : sku;
}

export interface CostSource {
  avgCostMinor: bigint | number;
  costPriceMinor: bigint | number | null;
}

/**
 * Unit cost used for valuation: the rolling weighted average, falling back to
 * the manually entered cost price (and, for a variant, to its parent product).
 */
export function unitCostOf(product: CostSource, variant?: CostSource | null): number {
  if (variant) {
    const own = toNumber(variant.avgCostMinor) || toNumber(variant.costPriceMinor);
    if (own) return own;
  }
  return toNumber(product.avgCostMinor) || toNumber(product.costPriceMinor);
}

export function valueAt(quantity: number, unitMinor: number): number {
  return Math.round(quantity * unitMinor);
}

/* -------------------------------------------------------------------------- */
/* Movements                                                                   */
/* -------------------------------------------------------------------------- */

export interface MovementRow {
  id: string;
  productId: string;
  variantId: string | null;
  type: string;
  quantity: number;
  balanceAfter: number;
  unitCostMinor: bigint | null;
  reason: string | null;
  reference: string | null;
  note: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: Date;
  product?: { namePt: string } | null;
}

export function toMovementDto(row: MovementRow, showCost: boolean): StockMovementDto {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product?.namePt ?? '',
    variantId: row.variantId,
    type: row.type,
    quantity: round3(row.quantity),
    balanceAfter: round3(row.balanceAfter),
    unitCostMinor: showCost && row.unitCostMinor !== null ? Number(row.unitCostMinor) : null,
    reason: (row.reason as AdjustmentReason | null) ?? null,
    reference: row.reference,
    note: row.note,
    userId: row.userId,
    userName: row.userName,
    createdAt: row.createdAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Receipts                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReceiptLineRow {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitCostMinor: bigint;
  batchNumber: string | null;
  expiryDate: Date | null;
  product?: { namePt: string; sku: string; unit: string } | null;
  variant?: { sku: string; options: string } | null;
}

export interface ReceiptRow {
  id: string;
  entityId: string;
  reference: string;
  invoiceNumber: string | null;
  note: string | null;
  totalCostMinor: bigint;
  createdAt: Date;
  locationId: string | null;
  supplierId: string | null;
  purchaseOrderId: string | null;
  userId: string | null;
  location?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;
  purchaseOrder?: { id: string; reference: string; status: string } | null;
  user?: { id: string; name: string } | null;
  lines?: ReceiptLineRow[];
  _count?: { lines: number };
}

export function toReceiptDto(row: ReceiptRow, showCost: boolean) {
  return {
    id: row.id,
    entityId: row.entityId,
    reference: row.reference,
    invoiceNumber: row.invoiceNumber,
    note: row.note,
    totalCostMinor: showCost ? Number(row.totalCostMinor) : null,
    locationId: row.locationId,
    locationName: row.location?.name ?? null,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    purchaseOrderId: row.purchaseOrderId,
    purchaseOrderReference: row.purchaseOrder?.reference ?? null,
    userId: row.userId,
    userName: row.user?.name ?? null,
    lineCount: row._count?.lines ?? row.lines?.length ?? 0,
    createdAt: row.createdAt.toISOString(),
    lines: (row.lines ?? []).map((line) => ({
      id: line.id,
      productId: line.productId,
      productName: line.product?.namePt ?? '',
      sku: line.product?.sku ?? '',
      unit: line.product?.unit ?? 'each',
      variantId: line.variantId,
      variantName: line.variant
        ? variantLabel(line.variant.sku, parseOptions(line.variant.options))
        : null,
      quantity: round3(line.quantity),
      unitCostMinor: showCost ? Number(line.unitCostMinor) : null,
      lineCostMinor: showCost ? valueAt(line.quantity, Number(line.unitCostMinor)) : null,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate ? line.expiryDate.toISOString() : null,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Transfers                                                                   */
/* -------------------------------------------------------------------------- */

export interface TransferLineRow {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  receivedQuantity: number;
  product?: { namePt: string; sku: string; unit: string } | null;
  variant?: { sku: string; options: string } | null;
}

export interface TransferRow {
  id: string;
  entityId: string;
  reference: string;
  status: string;
  note: string | null;
  fromLocationId: string;
  toLocationId: string;
  createdAt: Date;
  receivedAt: Date | null;
  fromLocation?: { id: string; name: string } | null;
  toLocation?: { id: string; name: string } | null;
  lines?: TransferLineRow[];
  _count?: { lines: number };
}

export function toTransferDto(row: TransferRow) {
  return {
    id: row.id,
    entityId: row.entityId,
    reference: row.reference,
    status: row.status,
    note: row.note,
    fromLocationId: row.fromLocationId,
    fromLocationName: row.fromLocation?.name ?? null,
    toLocationId: row.toLocationId,
    toLocationName: row.toLocation?.name ?? null,
    lineCount: row._count?.lines ?? row.lines?.length ?? 0,
    totalQuantity: round3((row.lines ?? []).reduce((sum, l) => sum + l.quantity, 0)),
    createdAt: row.createdAt.toISOString(),
    receivedAt: row.receivedAt ? row.receivedAt.toISOString() : null,
    lines: (row.lines ?? []).map((line) => ({
      id: line.id,
      productId: line.productId,
      productName: line.product?.namePt ?? '',
      sku: line.product?.sku ?? '',
      unit: line.product?.unit ?? 'each',
      variantId: line.variantId,
      variantName: line.variant
        ? variantLabel(line.variant.sku, parseOptions(line.variant.options))
        : null,
      quantity: round3(line.quantity),
      receivedQuantity: round3(line.receivedQuantity),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Stocktakes                                                                  */
/* -------------------------------------------------------------------------- */

export interface StockTakeLineRow {
  id: string;
  productId: string;
  variantId: string | null;
  expectedQuantity: number;
  countedQuantity: number | null;
  varianceValueMinor: bigint;
  note: string | null;
  countedAt: Date | null;
  product?: {
    namePt: string;
    sku: string;
    unit: string;
    barcode: string | null;
    avgCostMinor: bigint;
    costPriceMinor: bigint;
    categoryId: string | null;
  } | null;
  variant?: {
    sku: string;
    options: string;
    avgCostMinor: bigint;
    costPriceMinor: bigint | null;
  } | null;
}

export interface StockTakeRow {
  id: string;
  entityId: string;
  reference: string;
  status: string;
  note: string | null;
  locationId: string | null;
  userId: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  location?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
  lines?: StockTakeLineRow[];
  _count?: { lines: number };
}

export function toStockTakeLineDto(line: StockTakeLineRow, showCost: boolean) {
  const counted = line.countedQuantity === null ? null : round3(line.countedQuantity);
  const variance = counted === null ? null : round3(counted - line.expectedQuantity);
  const unitCost = line.product ? unitCostOf(line.product, line.variant) : 0;
  const varianceValueMinor = variance === null ? 0 : valueAt(variance, unitCost);

  return {
    id: line.id,
    productId: line.productId,
    productName: line.product?.namePt ?? '',
    sku: line.product?.sku ?? '',
    barcode: line.product?.barcode ?? null,
    unit: line.product?.unit ?? 'each',
    variantId: line.variantId,
    variantName: line.variant
      ? variantLabel(line.variant.sku, parseOptions(line.variant.options))
      : null,
    expectedQuantity: round3(line.expectedQuantity),
    countedQuantity: counted,
    variance,
    /** Only lines where the count disagrees with the system are worth flagging. */
    hasVariance: variance !== null && variance !== 0,
    varianceValueMinor: showCost ? varianceValueMinor : null,
    unitCostMinor: showCost ? unitCost : null,
    note: line.note,
    countedAt: line.countedAt ? line.countedAt.toISOString() : null,
  };
}

export function toStockTakeDto(row: StockTakeRow, showCost: boolean) {
  const lines = (row.lines ?? []).map((l) => toStockTakeLineDto(l, showCost));
  const counted = lines.filter((l) => l.countedQuantity !== null);
  const variances = lines.filter((l) => l.hasVariance);

  return {
    id: row.id,
    entityId: row.entityId,
    reference: row.reference,
    status: row.status,
    note: row.note,
    locationId: row.locationId,
    locationName: row.location?.name ?? null,
    userId: row.userId,
    userName: row.user?.name ?? null,
    approvedById: row.approvedById,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lineCount: row._count?.lines ?? lines.length,
    countedCount: counted.length,
    varianceCount: variances.length,
    varianceValueMinor: showCost
      ? variances.reduce((sum, l) => sum + (l.varianceValueMinor ?? 0), 0)
      : null,
    lines,
  };
}
