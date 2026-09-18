/**
 * The exact shapes apps/api/src/modules/inventory returns.
 *
 * They live here rather than in @pos/shared because the API maps them in its
 * own module (mappers.ts) and @pos/shared only carries StockMovementDto. Every
 * money field is MINOR units and is null/absent for roles without product:cost.
 */
import type { AdjustmentReason, PurchaseOrderStatus, Unit } from '@pos/shared';

/* -------------------------------------------------------------------------- */
/* Levels                                                                      */
/* -------------------------------------------------------------------------- */

export interface LocationQuantityDto {
  locationId: string;
  locationName: string;
  quantity: number;
  reserved: number;
}

export interface StockLevelVariantDto {
  variantId: string;
  sku: string;
  options: Record<string, string>;
  quantity: number;
  reserved: number;
  minStockLevel: number;
  salePriceMinor: number;
  /** Absent without product:cost. */
  avgCostMinor?: number;
  stockValueMinor?: number;
  retailValueMinor: number;
  locations: LocationQuantityDto[];
  lowStock: boolean;
  outOfStock: boolean;
}

export interface StockLevelDto {
  productId: string;
  variantId: string | null;
  sku: string;
  barcode: string | null;
  name: string;
  nameEn: string | null;
  unit: Unit;
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
  locations: LocationQuantityDto[];
  variants: StockLevelVariantDto[];
}

/* -------------------------------------------------------------------------- */
/* Receipts                                                                    */
/* -------------------------------------------------------------------------- */

export interface StockReceiptLineDto {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: Unit;
  variantId: string | null;
  variantName: string | null;
  quantity: number;
  unitCostMinor: number | null;
  lineCostMinor: number | null;
  batchNumber: string | null;
  expiryDate: string | null;
}

export interface StockReceiptDto {
  id: string;
  entityId: string;
  reference: string;
  invoiceNumber: string | null;
  note: string | null;
  totalCostMinor: number | null;
  locationId: string | null;
  locationName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  purchaseOrderId: string | null;
  purchaseOrderReference: string | null;
  userId: string | null;
  userName: string | null;
  lineCount: number;
  createdAt: string;
  lines: StockReceiptLineDto[];
  /** Only on the POST response. */
  purchaseOrderStatus?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Adjustments                                                                 */
/* -------------------------------------------------------------------------- */

export interface AdjustmentChangeDto {
  productId: string;
  variantId: string | null;
  productName: string;
  balanceAfter: number;
  locationBalance: number;
  belowMinimum: boolean;
  minStockLevel: number;
}

export interface AdjustmentResponse {
  reference: string;
  count: number;
  changes: AdjustmentChangeDto[];
}

/* -------------------------------------------------------------------------- */
/* Transfers                                                                   */
/* -------------------------------------------------------------------------- */

export type TransferStatus = 'draft' | 'sent' | 'received' | 'cancelled';

export interface StockTransferLineDto {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: Unit;
  variantId: string | null;
  variantName: string | null;
  quantity: number;
  receivedQuantity: number;
}

export interface StockTransferDto {
  id: string;
  entityId: string;
  reference: string;
  status: TransferStatus;
  note: string | null;
  fromLocationId: string;
  fromLocationName: string | null;
  toLocationId: string;
  toLocationName: string | null;
  lineCount: number;
  totalQuantity: number;
  createdAt: string;
  receivedAt: string | null;
  lines: StockTransferLineDto[];
}

/* -------------------------------------------------------------------------- */
/* Stocktakes                                                                  */
/* -------------------------------------------------------------------------- */

export type StockTakeStatusValue = 'open' | 'counting' | 'review' | 'approved' | 'cancelled';

export interface StockTakeLineDto {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  barcode: string | null;
  unit: Unit;
  variantId: string | null;
  variantName: string | null;
  expectedQuantity: number;
  countedQuantity: number | null;
  variance: number | null;
  hasVariance: boolean;
  varianceValueMinor: number | null;
  unitCostMinor: number | null;
  note: string | null;
  countedAt: string | null;
}

export interface StockTakeDto {
  id: string;
  entityId: string;
  reference: string;
  status: StockTakeStatusValue;
  note: string | null;
  locationId: string | null;
  locationName: string | null;
  userId: string | null;
  userName: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  countedCount: number;
  varianceCount: number;
  varianceValueMinor: number | null;
  lines: StockTakeLineDto[];
}

/* -------------------------------------------------------------------------- */
/* Insight reports                                                             */
/* -------------------------------------------------------------------------- */

export interface LowStockVariantDto {
  variantId: string;
  sku: string;
  variantName: string;
  quantity: number;
  minStockLevel: number;
  suggestedReorderQuantity: number;
  lowStock: boolean;
}

export interface LowStockRowDto {
  productId: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: Unit;
  categoryId: string | null;
  categoryName: string | null;
  quantity: number;
  minStockLevel: number;
  maxStockLevel: number | null;
  suggestedReorderQuantity: number;
  outOfStock: boolean;
  supplier: { id: string; name: string; phone: string | null; email: string | null } | null;
  avgCostMinor?: number;
  reorderCostMinor?: number;
  variants: LowStockVariantDto[];
}

export interface DeadStockRowDto {
  productId: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: Unit;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  quantity: number;
  salePriceMinor: number;
  retailValueMinor: number;
  avgCostMinor?: number;
  stockValueMinor?: number;
  lastSoldAt: string | null;
  daysSinceLastSale: number | null;
  createdAt: string;
}

export interface ExpiringRowDto {
  batchId: string;
  productId: string;
  productName: string;
  sku: string;
  barcode: string | null;
  unit: Unit;
  variantId: string | null;
  variantName: string | null;
  locationId: string | null;
  locationName: string | null;
  batchNumber: string | null;
  quantityReceived: number;
  quantityRemaining: number;
  expiryDate: string | null;
  daysToExpiry: number | null;
  expired: boolean;
  receivedAt: string;
  unitCostMinor?: number;
  stockValueMinor?: number;
}

export interface ValuationDto {
  locationId: string | null;
  generatedAt: string;
  productCount: number;
  unitCount: number;
  totalCostMinor: number;
  totalRetailMinor: number;
  potentialProfitMinor: number;
  marginBps: number;
  categories: Array<{
    categoryId: string | null;
    categoryName: string | null;
    productCount: number;
    unitCount: number;
    costValueMinor: number;
    retailValueMinor: number;
    potentialProfitMinor: number;
    marginBps: number;
  }>;
}

/** The paginated envelopes that carry extra fields alongside `data`. */
export interface DeadStockPage {
  data: DeadStockRowDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  days: number;
  since: string;
}

export interface ExpiringPage {
  data: ExpiringRowDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  days: number;
  until: string;
}

/* -------------------------------------------------------------------------- */
/* Neighbouring modules this area reads                                        */
/* -------------------------------------------------------------------------- */

export interface SupplierOptionDto {
  id: string;
  name: string;
  active: boolean;
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
  receivedBps: number;
  createdAt: string;
  updatedAt: string;
  lines?: PurchaseOrderLineDto[];
}

export interface UserOptionDto {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

/** The register lookup, reused by every scan-driven screen here. */
export interface LookupProductDto {
  id: string;
  sku: string;
  barcode: string | null;
  namePt: string;
  nameEn: string | null;
  categoryId: string | null;
  type: string;
  unit: Unit;
  salePriceMinor: number;
  /** Absent without product:cost. */
  costPriceMinor?: number;
  trackStock: boolean;
  stockQuantity: number;
  active: boolean;
}

export interface LookupResultDto {
  found: boolean;
  product?: LookupProductDto;
  variant?: {
    id: string;
    sku: string;
    options: Record<string, string>;
    salePriceMinor: number | null;
    costPriceMinor?: number | null;
    stockQuantity: number;
  };
  quantity?: number;
  priceMinor?: number;
}

/* -------------------------------------------------------------------------- */
/* Labels (pt-PT, without accents, like the rest of the codebase)              */
/* -------------------------------------------------------------------------- */

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  receipt: 'Entrada',
  sale: 'Venda',
  refund: 'Devolucao',
  adjustment: 'Ajuste',
  transfer_in: 'Transferencia entrada',
  transfer_out: 'Transferencia saida',
  stocktake: 'Inventario',
  composite_consumption: 'Consumo de receita',
  waste: 'Quebra',
  initial: 'Stock inicial',
};

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviada',
  received: 'Recebida',
  cancelled: 'Cancelada',
};

export const STOCKTAKE_STATUS_LABELS: Record<StockTakeStatusValue, string> = {
  open: 'Aberto',
  counting: 'Em contagem',
  review: 'Em revisao',
  approved: 'Aprovado',
  cancelled: 'Cancelado',
};

export type { AdjustmentReason };
