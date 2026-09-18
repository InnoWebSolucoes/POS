import { roundHalfUp, type PurchaseOrderStatus, type Unit } from '@pos/shared';
import { round3 } from '../../lib/inventory.js';

/* -------------------------------------------------------------------------- */
/* DTOs                                                                        */
/* -------------------------------------------------------------------------- */

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
  /** Catalogue products currently pointing at this supplier. */
  productCount: number;
  /** Date of the most recent goods receipt (falls back to the last PO sent). */
  lastPurchaseAt: string | null;
  /** Purchase orders still in flight (sent / partially received). */
  openPurchaseOrders: number;
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
  /** How much of the ordered quantity has already arrived, in basis points. */
  receivedBps: number;
  createdAt: string;
  updatedAt: string;
  lines?: PurchaseOrderLineDto[];
  receipts?: PurchaseOrderReceiptDto[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** ProductVariant.options is a JSON string column. */
export function parseOptions(raw: string | null | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) out[k] = String(v);
    return out;
  } catch {
    return null;
  }
}

/** Integer minor units for a line: an integer price times a fractional quantity. */
export function lineTotalMinor(quantity: number, unitCostMinor: number): number {
  return roundHalfUp(unitCostMinor * quantity);
}

/* -------------------------------------------------------------------------- */
/* Row shapes (structural, so the mappers stay independent of Prisma payloads) */
/* -------------------------------------------------------------------------- */

export interface SupplierRow {
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
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierStats {
  productCount?: number;
  lastPurchaseAt?: Date | null;
  openPurchaseOrders?: number;
}

export function toSupplierDto(row: SupplierRow, stats: SupplierStats = {}): SupplierDto {
  return {
    id: row.id,
    entityId: row.entityId,
    name: row.name,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    nif: row.nif,
    paymentTerms: row.paymentTerms,
    notes: row.notes,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    productCount: stats.productCount ?? 0,
    lastPurchaseAt: iso(stats.lastPurchaseAt ?? null),
    openPurchaseOrders: stats.openPurchaseOrders ?? 0,
  };
}

export interface PoLineRow {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  receivedQuantity: number;
  unitCostMinor: bigint;
  product?: { sku: string; namePt: string; unit: string } | null;
  variant?: { sku: string; options: string } | null;
}

export function toPurchaseOrderLineDto(row: PoLineRow): PurchaseOrderLineDto {
  const unitCostMinor = Number(row.unitCostMinor);
  return {
    id: row.id,
    productId: row.productId,
    productSku: row.product?.sku ?? '',
    productName: row.product?.namePt ?? '',
    unit: (row.product?.unit ?? 'each') as Unit,
    variantId: row.variantId,
    variantSku: row.variant?.sku ?? null,
    variantOptions: parseOptions(row.variant?.options),
    quantity: round3(row.quantity),
    receivedQuantity: round3(row.receivedQuantity),
    outstandingQuantity: round3(Math.max(0, row.quantity - row.receivedQuantity)),
    unitCostMinor,
    lineTotalMinor: lineTotalMinor(row.quantity, unitCostMinor),
  };
}

export interface PoRow {
  id: string;
  entityId: string;
  reference: string;
  status: string;
  supplierId: string | null;
  expectedDate: Date | null;
  sentAt: Date | null;
  note: string | null;
  totalCostMinor: bigint;
  createdAt: Date;
  updatedAt: Date;
  supplier?: { name: string } | null;
  lines?: PoLineRow[];
  receipts?: Array<{
    id: string;
    reference: string;
    invoiceNumber: string | null;
    totalCostMinor: bigint;
    createdAt: Date;
  }>;
}

export function toPurchaseOrderDto(row: PoRow, options: { withLines?: boolean } = {}): PurchaseOrderDto {
  const lines = row.lines ?? [];
  const ordered = lines.reduce((sum, l) => sum + l.quantity, 0);
  const received = lines.reduce((sum, l) => sum + l.receivedQuantity, 0);

  const dto: PurchaseOrderDto = {
    id: row.id,
    entityId: row.entityId,
    reference: row.reference,
    status: row.status as PurchaseOrderStatus,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    expectedDate: iso(row.expectedDate),
    sentAt: iso(row.sentAt),
    note: row.note,
    totalCostMinor: Number(row.totalCostMinor),
    lineCount: lines.length,
    receivedBps: ordered > 0 ? roundHalfUp((received / ordered) * 10_000) : 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (options.withLines) {
    dto.lines = lines.map(toPurchaseOrderLineDto);
    if (row.receipts) {
      dto.receipts = row.receipts.map((r) => ({
        id: r.id,
        reference: r.reference,
        invoiceNumber: r.invoiceNumber,
        totalCostMinor: Number(r.totalCostMinor),
        createdAt: r.createdAt.toISOString(),
      }));
    }
  }

  return dto;
}
