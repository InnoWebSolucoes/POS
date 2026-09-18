/**
 * The shapes returned by apps/api/src/modules/suppliers.
 *
 * They are not in @pos/shared, so they are mirrored here - deliberately narrow,
 * and with every cost field optional because the API strips cost figures for
 * roles without `product:cost`.
 */
import type { PurchaseOrderStatus, Unit } from '@pos/shared';

export interface SupplierDto {
  id: string;
  entityId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  nif: string | null;
  paymentTerms: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  productCount: number;
  lastPurchaseAt: string | null;
  openPurchaseOrders: number;
}

export interface SupplierInput {
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  nif: string | null;
  paymentTerms: string | null;
  notes: string | null;
  active: boolean;
}

export interface SupplierProductRow {
  id: string;
  sku: string;
  barcode: string | null;
  namePt: string;
  nameEn: string | null;
  unit: Unit;
  type: string;
  salePriceMinor: number;
  taxRateBps: number;
  stockQuantity: number;
  minStockLevel: number;
  maxStockLevel: number | null;
  trackStock: boolean;
  active: boolean;
  categoryId: string | null;
  categoryName: string | null;
  belowMinimum: boolean;
  /** Absent without `product:cost`. */
  costPriceMinor?: number;
  avgCostMinor?: number;
}

export interface PurchaseOrderLineDto {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  unit: Unit;
  variantId: string | null;
  variantSku: string | null;
  variantOptions: Record<string, string> | null;
  quantity: number;
  receivedQuantity: number;
  outstandingQuantity: number;
  unitCostMinor: number;
  lineTotalMinor: number;
}

export interface PurchaseOrderReceiptDto {
  id: string;
  reference: string;
  invoiceNumber: string | null;
  totalCostMinor: number;
  createdAt: string;
}

export interface PurchaseOrderDto {
  id: string;
  entityId: string;
  reference: string;
  status: PurchaseOrderStatus;
  supplierId: string | null;
  supplierName: string | null;
  expectedDate: string | null;
  sentAt: string | null;
  note: string | null;
  totalCostMinor: number;
  lineCount: number;
  /** Received share of the ordered quantity, in basis points. */
  receivedBps: number;
  createdAt: string;
  updatedAt: string;
  lines?: PurchaseOrderLineDto[];
  receipts?: PurchaseOrderReceiptDto[];
}

export interface PoLineInput {
  productId: string;
  variantId: string | null;
  quantity: number;
  unitCostMinor: number;
}

export interface PoInput {
  supplierId: string;
  expectedDate: string | null;
  note: string | null;
  lines: PoLineInput[];
}

export interface CostTrendPoint {
  receiptId: string;
  reference: string;
  date: string;
  quantity: number;
  unitCostMinor: number;
}

export interface CostTrendEntry {
  productId: string;
  sku: string;
  name: string;
  points: CostTrendPoint[];
  firstUnitCostMinor: number;
  lastUnitCostMinor: number;
  changeBps: number;
}

export interface SupplierPerformance {
  supplier: { id: string; name: string };
  months: number;
  since: string;
  purchaseOrders: {
    total: number;
    byStatus: Partial<Record<PurchaseOrderStatus, number>>;
    committedMinor: number;
  };
  leadTime: {
    avgDays: number | null;
    samples: number;
    onTimeBps: number;
    onTimeSamples: number;
  };
  fillRate: {
    orderedQuantity: number;
    receivedQuantity: number;
    fillRateBps: number;
  };
  spend: {
    totalSpendMinor: number;
    receiptCount: number;
  };
  costTrend: CostTrendEntry[];
}

export interface SkippedLowStockItem {
  productId: string;
  variantId: string | null;
  sku: string;
  name: string;
  reason: string;
}

export interface LowStockResult {
  orders: PurchaseOrderDto[];
  skipped: SkippedLowStockItem[];
}

/** The slice of a product this feature needs when building an order line. */
export interface ProductPick {
  id: string;
  sku: string;
  namePt: string;
  barcode: string | null;
  unit: Unit;
  stockQuantity: number;
  active: boolean;
  /** Absent without `product:cost`. */
  costPriceMinor?: number;
  avgCostMinor?: number;
}
