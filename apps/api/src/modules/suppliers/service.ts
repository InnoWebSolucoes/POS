import type { Prisma } from '@prisma/client';
import { roundHalfUp, type PurchaseOrderStatus } from '@pos/shared';

import { ApiError } from '../../lib/http.js';
import { round3 } from '../../lib/inventory.js';
import { prisma, TX_OPTIONS, type Tx } from '../../lib/prisma.js';
import { nextDocumentNumber } from '../../lib/sequence.js';
import {
  lineTotalMinor,
  toPurchaseOrderDto,
  toSupplierDto,
  type PurchaseOrderDto,
  type SupplierDto,
  type SupplierStats,
} from './mappers.js';
import type {
  LowStockPoInput,
  PoCreateInput,
  PoLineInput,
  PoUpdateInput,
  SupplierCreateInput,
  SupplierUpdateInput,
} from './schemas.js';

/** Statuses whose lines still count as "on order". */
const OPEN_PO_STATUSES: PurchaseOrderStatus[] = ['sent', 'partially_received'];
/** Statuses that have actually been placed with the supplier. */
const PLACED_PO_STATUSES: PurchaseOrderStatus[] = ['sent', 'partially_received', 'received'];

const SUPPLIER_SELECT = {
  id: true,
  entityId: true,
  name: true,
  contactName: true,
  phone: true,
  email: true,
  address: true,
  nif: true,
  paymentTerms: true,
  notes: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PO_LINE_INCLUDE = {
  product: { select: { sku: true, namePt: true, unit: true } },
  variant: { select: { sku: true, options: true } },
} as const;

/* -------------------------------------------------------------------------- */
/* Supplier statistics                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Product counts, last purchase date and open-order counts for a batch of
 * suppliers, resolved with three aggregate queries rather than N+1 lookups.
 */
async function statsForSuppliers(
  entityId: string,
  supplierIds: string[],
): Promise<Map<string, SupplierStats>> {
  const stats = new Map<string, SupplierStats>();
  if (supplierIds.length === 0) return stats;

  for (const id of supplierIds) {
    stats.set(id, { productCount: 0, lastPurchaseAt: null, openPurchaseOrders: 0 });
  }

  const [products, receipts, openOrders, sentOrders] = await Promise.all([
    prisma.product.groupBy({
      by: ['supplierId'],
      where: { entityId, deletedAt: null, supplierId: { in: supplierIds } },
      _count: { _all: true },
    }),
    prisma.stockReceipt.groupBy({
      by: ['supplierId'],
      where: { entityId, supplierId: { in: supplierIds } },
      _max: { createdAt: true },
    }),
    prisma.purchaseOrder.groupBy({
      by: ['supplierId'],
      where: { entityId, supplierId: { in: supplierIds }, status: { in: OPEN_PO_STATUSES } },
      _count: { _all: true },
    }),
    prisma.purchaseOrder.groupBy({
      by: ['supplierId'],
      where: { entityId, supplierId: { in: supplierIds }, sentAt: { not: null } },
      _max: { sentAt: true },
    }),
  ]);

  for (const row of products) {
    if (!row.supplierId) continue;
    const entry = stats.get(row.supplierId);
    if (entry) entry.productCount = row._count._all;
  }
  for (const row of receipts) {
    if (!row.supplierId) continue;
    const entry = stats.get(row.supplierId);
    if (entry) entry.lastPurchaseAt = row._max.createdAt ?? null;
  }
  for (const row of openOrders) {
    if (!row.supplierId) continue;
    const entry = stats.get(row.supplierId);
    if (entry) entry.openPurchaseOrders = row._count._all;
  }
  // No goods receipt yet? Fall back to the day the last order went out.
  for (const row of sentOrders) {
    if (!row.supplierId) continue;
    const entry = stats.get(row.supplierId);
    if (entry && !entry.lastPurchaseAt) entry.lastPurchaseAt = row._max.sentAt ?? null;
  }

  return stats;
}

/* -------------------------------------------------------------------------- */
/* Suppliers                                                                   */
/* -------------------------------------------------------------------------- */

export function supplierSearchWhere(entityId: string, search?: string, active?: boolean) {
  const where: Prisma.SupplierWhereInput = { entityId, deletedAt: null };
  if (active !== undefined) where.active = active;
  if (search) {
    // SQLite has no case-insensitive filter mode; `contains` is as far as we go.
    where.OR = [
      { name: { contains: search } },
      { contactName: { contains: search } },
      { phone: { contains: search } },
      { email: { contains: search } },
      { nif: { contains: search } },
    ];
  }
  return where;
}

export async function listSuppliers(
  entityId: string,
  where: Prisma.SupplierWhereInput,
  skip: number,
  take: number,
): Promise<{ data: SupplierDto[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      select: SUPPLIER_SELECT,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      skip,
      take,
    }),
    prisma.supplier.count({ where }),
  ]);

  const stats = await statsForSuppliers(
    entityId,
    rows.map((r) => r.id),
  );
  return { data: rows.map((row) => toSupplierDto(row, stats.get(row.id) ?? {})), total };
}

export async function findSupplierOrThrow(entityId: string, id: string) {
  const row = await prisma.supplier.findFirst({
    where: { id, entityId, deletedAt: null },
    select: SUPPLIER_SELECT,
  });
  if (!row) throw ApiError.notFound('Fornecedor nao encontrado.');
  return row;
}

export async function getSupplier(entityId: string, id: string): Promise<SupplierDto> {
  const row = await findSupplierOrThrow(entityId, id);
  const stats = await statsForSuppliers(entityId, [id]);
  return toSupplierDto(row, stats.get(id) ?? {});
}

export async function createSupplier(
  entityId: string,
  input: SupplierCreateInput,
): Promise<SupplierDto> {
  const duplicate = await prisma.supplier.findFirst({
    where: { entityId, deletedAt: null, name: input.name },
    select: { id: true },
  });
  if (duplicate) throw ApiError.conflict('Ja existe um fornecedor com esse nome.');

  const row = await prisma.supplier.create({
    data: {
      entityId,
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      nif: input.nif ?? null,
      paymentTerms: input.paymentTerms ?? null,
      notes: input.notes ?? null,
      active: input.active ?? true,
    },
    select: SUPPLIER_SELECT,
  });
  return toSupplierDto(row);
}

export async function updateSupplier(
  entityId: string,
  id: string,
  input: SupplierUpdateInput,
): Promise<SupplierDto> {
  await findSupplierOrThrow(entityId, id);

  if (input.name !== undefined) {
    const duplicate = await prisma.supplier.findFirst({
      where: { entityId, deletedAt: null, name: input.name, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) throw ApiError.conflict('Ja existe um fornecedor com esse nome.');
  }

  const data: Prisma.SupplierUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.contactName !== undefined) data.contactName = input.contactName;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.email !== undefined) data.email = input.email;
  if (input.address !== undefined) data.address = input.address;
  if (input.nif !== undefined) data.nif = input.nif;
  if (input.paymentTerms !== undefined) data.paymentTerms = input.paymentTerms;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.active !== undefined) data.active = input.active;

  const row = await prisma.supplier.update({ where: { id }, data, select: SUPPLIER_SELECT });
  const stats = await statsForSuppliers(entityId, [id]);
  return toSupplierDto(row, stats.get(id) ?? {});
}

/**
 * Soft delete. Refused while orders are still in flight, otherwise the goods
 * receipt that closes them would land on a supplier nobody can see.
 */
export async function softDeleteSupplier(entityId: string, id: string): Promise<void> {
  await findSupplierOrThrow(entityId, id);

  const open = await prisma.purchaseOrder.count({
    where: { entityId, supplierId: id, status: { in: OPEN_PO_STATUSES } },
  });
  if (open > 0) {
    throw ApiError.conflict(
      `Nao e possivel remover: ${open} encomenda(s) ainda por receber. Cancele-as primeiro.`,
    );
  }

  await prisma.supplier.update({
    where: { id },
    data: { deletedAt: new Date(), active: false },
  });
}

/* -------------------------------------------------------------------------- */
/* Supplier catalogue                                                          */
/* -------------------------------------------------------------------------- */

export async function listSupplierProducts(
  entityId: string,
  supplierId: string,
  options: { search?: string; active?: boolean; skip: number; take: number; withCost: boolean },
) {
  await findSupplierOrThrow(entityId, supplierId);

  const where: Prisma.ProductWhereInput = { entityId, supplierId, deletedAt: null };
  if (options.active !== undefined) where.active = options.active;
  if (options.search) {
    where.OR = [
      { namePt: { contains: options.search } },
      { nameEn: { contains: options.search } },
      { sku: { contains: options.search } },
      { barcode: { contains: options.search } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        barcode: true,
        namePt: true,
        nameEn: true,
        unit: true,
        type: true,
        salePriceMinor: true,
        costPriceMinor: true,
        avgCostMinor: true,
        taxRateBps: true,
        stockQuantity: true,
        minStockLevel: true,
        maxStockLevel: true,
        trackStock: true,
        active: true,
        categoryId: true,
        category: { select: { id: true, namePt: true } },
      },
      orderBy: [{ active: 'desc' }, { namePt: 'asc' }],
      skip: options.skip,
      take: options.take,
    }),
    prisma.product.count({ where }),
  ]);

  const data = rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    namePt: row.namePt,
    nameEn: row.nameEn,
    unit: row.unit,
    type: row.type,
    salePriceMinor: Number(row.salePriceMinor),
    taxRateBps: row.taxRateBps,
    stockQuantity: round3(row.stockQuantity),
    minStockLevel: round3(row.minStockLevel),
    maxStockLevel: row.maxStockLevel == null ? null : round3(row.maxStockLevel),
    trackStock: row.trackStock,
    active: row.active,
    categoryId: row.categoryId,
    categoryName: row.category?.namePt ?? null,
    belowMinimum: row.minStockLevel > 0 && row.stockQuantity <= row.minStockLevel,
    // Cost figures are stripped for roles without `product:cost`.
    ...(options.withCost
      ? {
          costPriceMinor: Number(row.costPriceMinor),
          avgCostMinor: Number(row.avgCostMinor),
        }
      : {}),
  }));

  return { data, total };
}

/* -------------------------------------------------------------------------- */
/* Supplier performance                                                        */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

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
  /** Positive means the unit cost went up since the oldest of the six. */
  changeBps: number;
}

export async function supplierPerformance(entityId: string, supplierId: string, months: number) {
  const supplier = await findSupplierOrThrow(entityId, supplierId);

  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const [orders, spend, receiptLines] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { entityId, supplierId, createdAt: { gte: since } },
      select: {
        id: true,
        status: true,
        sentAt: true,
        expectedDate: true,
        createdAt: true,
        totalCostMinor: true,
        lines: { select: { quantity: true, receivedQuantity: true } },
        receipts: { select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: 1 },
      },
      take: 2000,
    }),
    prisma.stockReceipt.aggregate({
      where: { entityId, supplierId, createdAt: { gte: since } },
      _sum: { totalCostMinor: true },
      _count: { _all: true },
    }),
    prisma.stockReceiptLine.findMany({
      where: { receipt: { entityId, supplierId } },
      select: {
        productId: true,
        quantity: true,
        unitCostMinor: true,
        receipt: { select: { id: true, reference: true, createdAt: true } },
        product: { select: { sku: true, namePt: true } },
      },
      orderBy: { receipt: { createdAt: 'desc' } },
      take: 1500,
    }),
  ]);

  /* Lead time: days from "sent" to the first goods receipt against the order. */
  let leadTimeTotal = 0;
  let leadTimeSamples = 0;
  let onTime = 0;
  let onTimeSamples = 0;
  const byStatus: Record<string, number> = {};
  let committedMinor = 0;

  for (const order of orders) {
    byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
    if (order.status !== 'cancelled') committedMinor += Number(order.totalCostMinor);

    const firstReceipt = order.receipts[0];
    if (order.sentAt && firstReceipt) {
      const days = (firstReceipt.createdAt.getTime() - order.sentAt.getTime()) / DAY_MS;
      if (days >= 0) {
        leadTimeTotal += days;
        leadTimeSamples += 1;
      }
      if (order.expectedDate) {
        onTimeSamples += 1;
        if (firstReceipt.createdAt.getTime() <= order.expectedDate.getTime() + DAY_MS) onTime += 1;
      }
    }
  }

  /* Fill rate across the lines of orders that were actually placed. */
  let orderedQuantity = 0;
  let receivedQuantity = 0;
  for (const order of orders) {
    if (!PLACED_PO_STATUSES.includes(order.status as PurchaseOrderStatus)) continue;
    for (const line of order.lines) {
      orderedQuantity += line.quantity;
      receivedQuantity += Math.min(line.receivedQuantity, line.quantity);
    }
  }

  /* Unit-cost trend: the last six receipts per product, oldest first. */
  const grouped = new Map<string, CostTrendEntry>();
  for (const line of receiptLines) {
    let entry = grouped.get(line.productId);
    if (!entry) {
      entry = {
        productId: line.productId,
        sku: line.product?.sku ?? '',
        name: line.product?.namePt ?? '',
        points: [],
        firstUnitCostMinor: 0,
        lastUnitCostMinor: 0,
        changeBps: 0,
      };
      grouped.set(line.productId, entry);
    }
    if (entry.points.length >= 6) continue;
    entry.points.push({
      receiptId: line.receipt.id,
      reference: line.receipt.reference,
      date: line.receipt.createdAt.toISOString(),
      quantity: round3(line.quantity),
      unitCostMinor: Number(line.unitCostMinor),
    });
  }

  const costTrend: CostTrendEntry[] = [];
  for (const entry of grouped.values()) {
    entry.points.reverse(); // chronological
    const first = entry.points[0]?.unitCostMinor ?? 0;
    const last = entry.points[entry.points.length - 1]?.unitCostMinor ?? 0;
    entry.firstUnitCostMinor = first;
    entry.lastUnitCostMinor = last;
    entry.changeBps = first > 0 ? roundHalfUp(((last - first) / first) * 10_000) : 0;
    costTrend.push(entry);
  }
  costTrend.sort((a, b) => b.changeBps - a.changeBps);

  return {
    supplier: { id: supplier.id, name: supplier.name },
    months,
    since: since.toISOString(),
    purchaseOrders: {
      total: orders.length,
      byStatus,
      committedMinor,
    },
    leadTime: {
      avgDays: leadTimeSamples > 0 ? Math.round((leadTimeTotal / leadTimeSamples) * 10) / 10 : null,
      samples: leadTimeSamples,
      onTimeBps: onTimeSamples > 0 ? roundHalfUp((onTime / onTimeSamples) * 10_000) : 0,
      onTimeSamples,
    },
    fillRate: {
      orderedQuantity: round3(orderedQuantity),
      receivedQuantity: round3(receivedQuantity),
      fillRateBps: orderedQuantity > 0 ? roundHalfUp((receivedQuantity / orderedQuantity) * 10_000) : 0,
    },
    spend: {
      totalSpendMinor: Number(spend._sum.totalCostMinor ?? 0n),
      receiptCount: spend._count._all,
    },
    costTrend: costTrend.slice(0, 100),
  };
}

/* -------------------------------------------------------------------------- */
/* Purchase orders                                                             */
/* -------------------------------------------------------------------------- */

export function poListWhere(
  entityId: string,
  query: { status?: string; supplierId?: string; from?: Date; to?: Date; search?: string },
) {
  const where: Prisma.PurchaseOrderWhereInput = { entityId };
  if (query.status) where.status = query.status;
  if (query.supplierId) where.supplierId = query.supplierId;
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  if (query.search) {
    where.OR = [
      { reference: { contains: query.search } },
      { note: { contains: query.search } },
      { supplier: { name: { contains: query.search } } },
    ];
  }
  return where;
}

export async function listPurchaseOrders(
  where: Prisma.PurchaseOrderWhereInput,
  skip: number,
  take: number,
): Promise<{ data: PurchaseOrderDto[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { name: true } },
        lines: { select: { id: true, productId: true, variantId: true, quantity: true, receivedQuantity: true, unitCostMinor: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return { data: rows.map((row) => toPurchaseOrderDto(row)), total };
}

export async function getPurchaseOrder(entityId: string, id: string): Promise<PurchaseOrderDto> {
  const row = await loadPurchaseOrder(entityId, id);
  return toPurchaseOrderDto(row, { withLines: true });
}

export async function loadPurchaseOrder(entityId: string, id: string) {
  const row = await prisma.purchaseOrder.findFirst({
    where: { id, entityId },
    include: {
      supplier: true,
      lines: { include: PO_LINE_INCLUDE, orderBy: { id: 'asc' } },
      receipts: {
        select: {
          id: true,
          reference: true,
          invoiceNumber: true,
          totalCostMinor: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!row) throw ApiError.notFound('Encomenda nao encontrada.');
  return row;
}

/**
 * Checks that every referenced product (and variant) belongs to this tenant and
 * normalises quantities to three decimals.
 */
async function normaliseLines(
  client: Tx,
  entityId: string,
  lines: PoLineInput[],
): Promise<Array<{ productId: string; variantId: string | null; quantity: number; unitCostMinor: number }>> {
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const variantIds = [...new Set(lines.map((l) => l.variantId).filter((v): v is string => !!v))];

  const [products, variants] = await Promise.all([
    client.product.findMany({
      where: { id: { in: productIds }, entityId, deletedAt: null },
      select: { id: true },
    }),
    variantIds.length
      ? client.productVariant.findMany({
          where: { id: { in: variantIds }, entityId, deletedAt: null },
          select: { id: true, productId: true },
        })
      : Promise.resolve([] as Array<{ id: string; productId: string }>),
  ]);

  const knownProducts = new Set(products.map((p) => p.id));
  const variantOwner = new Map(variants.map((v) => [v.id, v.productId]));

  return lines.map((line, index) => {
    if (!knownProducts.has(line.productId)) {
      throw ApiError.unprocessable(`Produto nao encontrado na linha ${index + 1}.`);
    }
    if (line.variantId) {
      const owner = variantOwner.get(line.variantId);
      if (!owner) throw ApiError.unprocessable(`Variante nao encontrada na linha ${index + 1}.`);
      if (owner !== line.productId) {
        throw ApiError.unprocessable(`A variante nao pertence ao produto na linha ${index + 1}.`);
      }
    }
    const quantity = round3(line.quantity);
    if (quantity <= 0) {
      throw ApiError.unprocessable(`A quantidade tem de ser maior que zero na linha ${index + 1}.`);
    }
    return {
      productId: line.productId,
      variantId: line.variantId ?? null,
      quantity,
      unitCostMinor: Math.round(line.unitCostMinor),
    };
  });
}

function totalFor(lines: Array<{ quantity: number; unitCostMinor: number }>): number {
  return lines.reduce((sum, l) => sum + lineTotalMinor(l.quantity, l.unitCostMinor), 0);
}

async function assertSupplier(client: Tx, entityId: string, supplierId: string): Promise<void> {
  const supplier = await client.supplier.findFirst({
    where: { id: supplierId, entityId, deletedAt: null },
    select: { id: true },
  });
  if (!supplier) throw ApiError.unprocessable('Fornecedor nao encontrado.');
}

export async function createPurchaseOrder(
  entityId: string,
  input: PoCreateInput,
): Promise<PurchaseOrderDto> {
  const created = await prisma.$transaction(async (tx) => {
    await assertSupplier(tx, entityId, input.supplierId);
    const lines = await normaliseLines(tx, entityId, input.lines);
    const reference = await nextDocumentNumber(entityId, 'purchase_order', { client: tx });

    return tx.purchaseOrder.create({
      data: {
        entityId,
        supplierId: input.supplierId,
        reference,
        status: 'draft',
        expectedDate: input.expectedDate ?? null,
        note: input.note ?? null,
        totalCostMinor: BigInt(Math.round(totalFor(lines))),
        lines: {
          create: lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            quantity: l.quantity,
            unitCostMinor: BigInt(Math.round(l.unitCostMinor)),
          })),
        },
      },
      select: { id: true },
    });
  }, TX_OPTIONS);

  return getPurchaseOrder(entityId, created.id);
}

export async function updatePurchaseOrder(
  entityId: string,
  id: string,
  input: PoUpdateInput,
): Promise<PurchaseOrderDto> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.purchaseOrder.findFirst({
      where: { id, entityId },
      select: { id: true, status: true },
    });
    if (!existing) throw ApiError.notFound('Encomenda nao encontrada.');
    if (existing.status !== 'draft') {
      throw ApiError.conflict('So e possivel editar encomendas em rascunho.');
    }

    if (input.supplierId) await assertSupplier(tx, entityId, input.supplierId);

    const data: Prisma.PurchaseOrderUpdateInput = {};
    if (input.supplierId !== undefined) data.supplier = { connect: { id: input.supplierId } };
    if (input.expectedDate !== undefined) data.expectedDate = input.expectedDate ?? null;
    if (input.note !== undefined) data.note = input.note;

    if (input.lines) {
      const lines = await normaliseLines(tx, entityId, input.lines);
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      for (const line of lines) {
        await tx.purchaseOrderLine.create({
          data: {
            purchaseOrderId: id,
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
            unitCostMinor: BigInt(Math.round(line.unitCostMinor)),
          },
        });
      }
      data.totalCostMinor = BigInt(Math.round(totalFor(lines)));
    }

    await tx.purchaseOrder.update({ where: { id }, data });
  }, TX_OPTIONS);

  return getPurchaseOrder(entityId, id);
}

export async function sendPurchaseOrder(entityId: string, id: string): Promise<PurchaseOrderDto> {
  const existing = await prisma.purchaseOrder.findFirst({
    where: { id, entityId },
    select: { id: true, status: true, supplierId: true, _count: { select: { lines: true } } },
  });
  if (!existing) throw ApiError.notFound('Encomenda nao encontrada.');
  if (existing.status !== 'draft') {
    throw ApiError.conflict('Apenas uma encomenda em rascunho pode ser enviada.');
  }
  if (existing._count.lines === 0) {
    throw ApiError.unprocessable('A encomenda nao tem linhas.');
  }
  if (!existing.supplierId) {
    throw ApiError.unprocessable('A encomenda nao tem fornecedor.');
  }

  await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'sent', sentAt: new Date() },
  });
  return getPurchaseOrder(entityId, id);
}

export async function cancelPurchaseOrder(
  entityId: string,
  id: string,
  reason: string | null,
): Promise<PurchaseOrderDto> {
  const existing = await prisma.purchaseOrder.findFirst({
    where: { id, entityId },
    select: { id: true, status: true, note: true },
  });
  if (!existing) throw ApiError.notFound('Encomenda nao encontrada.');
  if (existing.status === 'cancelled') throw ApiError.conflict('A encomenda ja esta cancelada.');
  if (existing.status === 'received') {
    throw ApiError.conflict('Nao e possivel cancelar uma encomenda ja recebida.');
  }

  const note = reason
    ? `${existing.note ? `${existing.note}\n` : ''}Cancelada: ${reason}`
    : existing.note;

  await prisma.purchaseOrder.update({ where: { id }, data: { status: 'cancelled', note } });
  return getPurchaseOrder(entityId, id);
}

/* -------------------------------------------------------------------------- */
/* Low-stock replenishment                                                     */
/* -------------------------------------------------------------------------- */

export interface SkippedLowStockItem {
  productId: string;
  variantId: string | null;
  sku: string;
  name: string;
  reason: string;
}

interface Candidate {
  supplierId: string;
  productId: string;
  variantId: string | null;
  sku: string;
  name: string;
  quantity: number;
  unitCostMinor: number;
}

/**
 * Reorder quantity: top the product back up to its maximum, or to twice the
 * minimum when no maximum is configured.
 */
export function suggestedReorderQuantity(
  current: number,
  minStockLevel: number,
  maxStockLevel: number | null | undefined,
): number {
  const target = maxStockLevel != null && maxStockLevel > minStockLevel ? maxStockLevel : minStockLevel * 2;
  const gap = round3(target - current);
  if (gap > 0) return gap;
  return round3(Math.max(minStockLevel, 1));
}

function pickCost(...candidates: Array<bigint | number | null | undefined>): number {
  for (const value of candidates) {
    const n = Number(value ?? 0);
    if (n > 0) return Math.round(n);
  }
  return 0;
}

export async function buildLowStockOrders(
  entityId: string,
  input: LowStockPoInput,
): Promise<{ orders: PurchaseOrderDto[]; skipped: SkippedLowStockItem[] }> {
  const supplierFilter = input.supplierId ?? null;
  const locationId = input.locationId ?? null;

  if (supplierFilter) await assertSupplier(prisma, entityId, supplierFilter);
  if (locationId) {
    const location = await prisma.location.findFirst({
      where: { id: locationId, entityId },
      select: { id: true },
    });
    if (!location) throw ApiError.unprocessable('Localizacao nao encontrada.');
  }

  const productWhere: Prisma.ProductWhereInput = {
    entityId,
    deletedAt: null,
    active: true,
    trackStock: true,
    type: { in: ['standard', 'weighted'] },
    minStockLevel: { gt: 0 },
  };
  if (supplierFilter) productWhere.supplierId = supplierFilter;

  const [products, variants, withVariants] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      select: {
        id: true,
        sku: true,
        namePt: true,
        supplierId: true,
        stockQuantity: true,
        minStockLevel: true,
        maxStockLevel: true,
        avgCostMinor: true,
        costPriceMinor: true,
      },
      take: 5000,
    }),
    prisma.productVariant.findMany({
      where: {
        entityId,
        deletedAt: null,
        active: true,
        minStockLevel: { gt: 0 },
        product: {
          entityId,
          deletedAt: null,
          active: true,
          trackStock: true,
          ...(supplierFilter ? { supplierId: supplierFilter } : {}),
        },
      },
      select: {
        id: true,
        sku: true,
        productId: true,
        stockQuantity: true,
        minStockLevel: true,
        avgCostMinor: true,
        costPriceMinor: true,
        product: {
          select: {
            namePt: true,
            supplierId: true,
            maxStockLevel: true,
            avgCostMinor: true,
            costPriceMinor: true,
          },
        },
      },
      take: 5000,
    }),
    prisma.productVariant.findMany({
      where: { entityId, deletedAt: null, active: true },
      select: { productId: true },
      distinct: ['productId'],
      take: 5000,
    }),
  ]);

  const hasVariants = new Set(withVariants.map((v) => v.productId));

  // Per-location balances win over the denormalised entity-wide rollup.
  const levels = new Map<string, number>();
  if (locationId) {
    const productIds = [
      ...new Set([...products.map((p) => p.id), ...variants.map((v) => v.productId)]),
    ];
    if (productIds.length) {
      const rows = await prisma.inventoryLevel.findMany({
        where: { locationId, productId: { in: productIds } },
        select: { productId: true, variantKey: true, quantity: true },
      });
      for (const row of rows) levels.set(`${row.productId}:${row.variantKey}`, row.quantity);
    }
  }

  const quantityOf = (productId: string, variantId: string | null, fallback: number): number => {
    if (!locationId) return fallback;
    return levels.get(`${productId}:${variantId ?? ''}`) ?? 0;
  };

  const candidates: Candidate[] = [];
  const skipped: SkippedLowStockItem[] = [];

  for (const product of products) {
    // A product with variants holds its stock on the variants, not on itself.
    if (hasVariants.has(product.id)) continue;
    const current = quantityOf(product.id, null, product.stockQuantity);
    if (current > product.minStockLevel) continue;

    if (!product.supplierId) {
      skipped.push({
        productId: product.id,
        variantId: null,
        sku: product.sku,
        name: product.namePt,
        reason: 'Produto sem fornecedor associado.',
      });
      continue;
    }
    if (supplierFilter && product.supplierId !== supplierFilter) continue;

    candidates.push({
      supplierId: product.supplierId,
      productId: product.id,
      variantId: null,
      sku: product.sku,
      name: product.namePt,
      quantity: suggestedReorderQuantity(current, product.minStockLevel, product.maxStockLevel),
      unitCostMinor: pickCost(product.avgCostMinor, product.costPriceMinor),
    });
  }

  for (const variant of variants) {
    const current = quantityOf(variant.productId, variant.id, variant.stockQuantity);
    if (current > variant.minStockLevel) continue;

    const supplierId = variant.product.supplierId;
    if (!supplierId) {
      skipped.push({
        productId: variant.productId,
        variantId: variant.id,
        sku: variant.sku,
        name: variant.product.namePt,
        reason: 'Produto sem fornecedor associado.',
      });
      continue;
    }
    if (supplierFilter && supplierId !== supplierFilter) continue;

    candidates.push({
      supplierId,
      productId: variant.productId,
      variantId: variant.id,
      sku: variant.sku,
      name: variant.product.namePt,
      quantity: suggestedReorderQuantity(current, variant.minStockLevel, variant.product.maxStockLevel),
      unitCostMinor: pickCost(
        variant.avgCostMinor,
        variant.costPriceMinor,
        variant.product.avgCostMinor,
        variant.product.costPriceMinor,
      ),
    });
  }

  if (candidates.length === 0) return { orders: [], skipped };

  const bySupplier = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const bucket = bySupplier.get(candidate.supplierId);
    if (bucket) bucket.push(candidate);
    else bySupplier.set(candidate.supplierId, [candidate]);
  }

  const createdIds = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const [supplierId, lines] of bySupplier) {
      const reference = await nextDocumentNumber(entityId, 'purchase_order', { client: tx });
      const created = await tx.purchaseOrder.create({
        data: {
          entityId,
          supplierId,
          reference,
          status: 'draft',
          note: 'Gerada automaticamente a partir dos minimos de stock.',
          totalCostMinor: BigInt(Math.round(totalFor(lines))),
          lines: {
            create: lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              quantity: l.quantity,
              unitCostMinor: BigInt(Math.round(l.unitCostMinor)),
            })),
          },
        },
        select: { id: true },
      });
      ids.push(created.id);
    }
    return ids;
  }, TX_OPTIONS);

  const orders: PurchaseOrderDto[] = [];
  for (const id of createdIds) orders.push(await getPurchaseOrder(entityId, id));
  return { orders, skipped };
}

/* -------------------------------------------------------------------------- */
/* PDF support                                                                 */
/* -------------------------------------------------------------------------- */

/** Entity header block for printed documents. */
export async function getEntityHeader(entityId: string) {
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, deletedAt: null },
    select: {
      name: true,
      nif: true,
      address: true,
      phone: true,
      email: true,
      currency: true,
    },
  });
  if (!entity) throw ApiError.notFound('Entidade nao encontrada.');
  return entity;
}
