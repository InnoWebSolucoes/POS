import { allocate, margin, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@pos/shared';

import { ApiError } from '../../lib/http.js';
import { round3 } from '../../lib/inventory.js';
import type { Tx } from '../../lib/prisma.js';

import type { Granularity, ProductSort, ReportFiltersQuery } from './schemas.js';

/* -------------------------------------------------------------------------- */
/* Limits                                                                      */
/* -------------------------------------------------------------------------- */

/** Hard ceiling on the sales pulled into memory for one report. */
export const MAX_SALE_ROWS = 20_000;
/** Ceiling on secondary detail queries (movements, products, waste). */
export const MAX_DETAIL_ROWS = 5_000;
/** A chart with more points than this is unreadable anyway. */
export const MAX_SERIES_BUCKETS = 2_000;

/**
 * Statuses that represent money that actually changed hands. A fully refunded
 * sale still belongs here: its gross is recorded and the Refund rows take it
 * back out again, which is the only way a refund inside the window nets to zero
 * instead of to minus the whole ticket.
 */
export const COUNTED_SALE_STATUSES = ['completed', 'partially_refunded', 'refunded'] as const;

/** Adjustment reasons that are a loss rather than a correction. */
export const WASTE_REASONS = ['damage', 'theft', 'expiry'] as const;

export const WEEKDAY_LABELS_PT = [
  'Domingo',
  'Segunda',
  'Terca',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sabado',
] as const;

/* -------------------------------------------------------------------------- */
/* Window                                                                      */
/* -------------------------------------------------------------------------- */

export interface ReportWindow {
  from: Date;
  to: Date;
}

/** Defaults to the last 30 days. A date-only `to` means the END of that day. */
export function resolveWindow(filters: ReportFiltersQuery, defaultDays = 30): ReportWindow {
  const to = filters.to ? new Date(filters.to) : new Date();
  if (filters.to && !filters.to.includes('T')) to.setHours(23, 59, 59, 999);

  const from = filters.from
    ? new Date(filters.from)
    : new Date(to.getTime() - defaultDays * 86_400_000);
  if (filters.from && !filters.from.includes('T')) from.setHours(0, 0, 0, 0);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw ApiError.badRequest('Intervalo de datas invalido.');
  }
  if (from.getTime() > to.getTime()) {
    throw ApiError.badRequest('A data inicial e posterior a data final.');
  }
  return { from, to };
}

/** The window of equal length immediately before this one. */
export function previousWindow(window: ReportWindow): ReportWindow {
  const span = Math.max(1, window.to.getTime() - window.from.getTime());
  return {
    from: new Date(window.from.getTime() - span),
    to: new Date(window.from.getTime() - 1),
  };
}

export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* -------------------------------------------------------------------------- */
/* Dataset                                                                     */
/* -------------------------------------------------------------------------- */

export interface DatasetLine {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unitCostMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  cogsMinor: number;
}

export interface DatasetPayment {
  method: string;
  label: string | null;
  amountMinor: number;
}

export interface DatasetSale {
  id: string;
  at: Date;
  channel: string;
  status: string;
  locationId: string | null;
  cashierId: string | null;
  cashierName: string | null;
  customerId: string | null;
  tipMinor: number;
  serviceChargeMinor: number;
  lines: DatasetLine[];
  payments: DatasetPayment[];
  revenueMinor: number;
  cogsMinor: number;
  taxMinor: number;
  discountMinor: number;
  itemsSold: number;
}

export interface DatasetRefundLine {
  saleLineId: string;
  productId: string | null;
  name: string;
  quantity: number;
  amountMinor: number;
  taxMinor: number;
  cogsMinor: number;
}

export interface DatasetRefund {
  id: string;
  at: Date;
  saleId: string;
  method: string;
  locationId: string | null;
  cashierId: string | null;
  cashierName: string | null;
  customerId: string | null;
  channel: string;
  /** Payments of the ORIGINAL sale, so an "original" refund can be attributed. */
  salePayments: DatasetPayment[];
  lines: DatasetRefundLine[];
  totalMinor: number;
  taxMinor: number;
  cogsMinor: number;
}

export interface ProductMeta {
  id: string;
  name: string;
  sku: string | null;
  categoryId: string | null;
  categoryName: string;
}

export interface SalesDataset {
  window: ReportWindow;
  filters: ReportFiltersQuery;
  sales: DatasetSale[];
  refunds: DatasetRefund[];
  products: Map<string, ProductMeta>;
  /** True when a product/category filter narrowed the lines considered. */
  lineFiltered: boolean;
  truncated: boolean;
  salesConsidered: number;
  maxRows: number;
}

export const UNCATEGORISED_ID = 'sem-categoria';
export const UNCATEGORISED_LABEL = 'Sem categoria';
export const UNKNOWN_STAFF_ID = 'sem-operador';
export const UNKNOWN_STAFF_LABEL = 'Sem operador';

function num(value: bigint | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'bigint' ? Number(value) : value;
}

/**
 * ONE pass over the database per report: the sales (with their lines and
 * payments), the refunds that landed in the window, and the product metadata
 * both of them reference. Every aggregation below is a pure function over the
 * result, which is what keeps the CSV and the screen in perfect agreement.
 */
export async function loadSalesDataset(
  db: Tx,
  entityId: string,
  filters: ReportFiltersQuery,
  options: { window?: ReportWindow; maxRows?: number } = {},
): Promise<SalesDataset> {
  const window = options.window ?? resolveWindow(filters);
  const maxRows = options.maxRows ?? MAX_SALE_ROWS;

  const scope = {
    entityId,
    status: { in: [...COUNTED_SALE_STATUSES] },
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    ...(filters.userId ? { cashierId: filters.userId } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
  };

  const lineScope = filters.productId
    ? { productId: filters.productId }
    : filters.categoryId
      ? { product: { categoryId: filters.categoryId } }
      : null;

  const [saleRows, refundRows] = await Promise.all([
    db.sale.findMany({
      where: {
        ...scope,
        createdAt: { gte: window.from, lte: window.to },
        ...(lineScope ? { lines: { some: lineScope } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: maxRows + 1,
      select: {
        id: true,
        createdAt: true,
        channel: true,
        status: true,
        locationId: true,
        cashierId: true,
        cashierName: true,
        customerId: true,
        tipMinor: true,
        serviceChargeMinor: true,
        lines: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            productId: true,
            name: true,
            quantity: true,
            unitCostMinor: true,
            discountMinor: true,
            netMinor: true,
            taxMinor: true,
            totalMinor: true,
          },
        },
        payments: {
          select: { method: true, label: true, amountMinor: true, status: true },
        },
      },
    }),
    db.refund.findMany({
      where: { entityId, createdAt: { gte: window.from, lte: window.to }, sale: scope },
      orderBy: { createdAt: 'asc' },
      take: maxRows + 1,
      select: {
        id: true,
        createdAt: true,
        saleId: true,
        method: true,
        totalMinor: true,
        taxMinor: true,
        cogsMinor: true,
        sale: {
          select: {
            locationId: true,
            cashierId: true,
            cashierName: true,
            customerId: true,
            channel: true,
            payments: { select: { method: true, label: true, amountMinor: true, status: true } },
          },
        },
        lines: {
          select: {
            quantity: true,
            amountMinor: true,
            saleLine: {
              select: {
                id: true,
                productId: true,
                name: true,
                quantity: true,
                unitCostMinor: true,
                taxMinor: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const truncated = saleRows.length > maxRows || refundRows.length > maxRows;
  const slicedSales = saleRows.slice(0, maxRows);
  const slicedRefunds = refundRows.slice(0, maxRows);

  // Product metadata for everything either side references.
  const productIds = new Set<string>();
  for (const sale of slicedSales) {
    for (const line of sale.lines) if (line.productId) productIds.add(line.productId);
  }
  for (const refund of slicedRefunds) {
    for (const line of refund.lines) {
      if (line.saleLine?.productId) productIds.add(line.saleLine.productId);
    }
  }

  const products = await loadProductMeta(db, entityId, [...productIds]);

  const keepProduct = (productId: string | null): boolean => {
    if (!lineScope) return true;
    if (filters.productId) return productId === filters.productId;
    if (!productId) return false;
    return products.get(productId)?.categoryId === filters.categoryId;
  };

  const sales: DatasetSale[] = [];
  for (const row of slicedSales) {
    const lines: DatasetLine[] = [];
    for (const line of row.lines) {
      if (!keepProduct(line.productId)) continue;
      const quantity = round3(line.quantity);
      const unitCostMinor = num(line.unitCostMinor);
      lines.push({
        id: line.id,
        productId: line.productId,
        name: line.name,
        quantity,
        unitCostMinor,
        discountMinor: num(line.discountMinor),
        netMinor: num(line.netMinor),
        taxMinor: num(line.taxMinor),
        totalMinor: num(line.totalMinor),
        cogsMinor: Math.round(unitCostMinor * quantity),
      });
    }
    if (!lines.length) continue;

    sales.push({
      id: row.id,
      at: row.createdAt,
      channel: row.channel,
      status: row.status,
      locationId: row.locationId,
      cashierId: row.cashierId,
      cashierName: row.cashierName,
      customerId: row.customerId,
      tipMinor: num(row.tipMinor),
      serviceChargeMinor: num(row.serviceChargeMinor),
      lines,
      payments: row.payments
        .filter((p) => p.status === 'confirmed')
        .map((p) => ({ method: p.method, label: p.label, amountMinor: num(p.amountMinor) })),
      revenueMinor: lines.reduce((s, l) => s + l.totalMinor, 0),
      cogsMinor: lines.reduce((s, l) => s + l.cogsMinor, 0),
      taxMinor: lines.reduce((s, l) => s + l.taxMinor, 0),
      discountMinor: lines.reduce((s, l) => s + l.discountMinor, 0),
      itemsSold: round3(lines.reduce((s, l) => s + l.quantity, 0)),
    });
  }

  const refunds: DatasetRefund[] = [];
  for (const row of slicedRefunds) {
    const lines: DatasetRefundLine[] = [];
    for (const line of row.lines) {
      const saleLine = line.saleLine;
      if (!saleLine) continue;
      if (!keepProduct(saleLine.productId)) continue;
      const quantity = round3(line.quantity);
      const soldQty = saleLine.quantity || 0;
      const share = soldQty > 0 ? quantity / soldQty : 0;
      lines.push({
        saleLineId: saleLine.id,
        productId: saleLine.productId,
        name: saleLine.name,
        quantity,
        amountMinor: num(line.amountMinor),
        taxMinor: Math.round(num(saleLine.taxMinor) * share),
        cogsMinor: Math.round(num(saleLine.unitCostMinor) * quantity),
      });
    }
    if (!lines.length) continue;

    refunds.push({
      id: row.id,
      at: row.createdAt,
      saleId: row.saleId,
      method: row.method,
      locationId: row.sale?.locationId ?? null,
      cashierId: row.sale?.cashierId ?? null,
      cashierName: row.sale?.cashierName ?? null,
      customerId: row.sale?.customerId ?? null,
      channel: row.sale?.channel ?? 'pos',
      salePayments: (row.sale?.payments ?? [])
        .filter((p) => p.status === 'confirmed')
        .map((p) => ({ method: p.method, label: p.label, amountMinor: num(p.amountMinor) })),
      lines,
      totalMinor: lines.reduce((s, l) => s + l.amountMinor, 0),
      taxMinor: lines.reduce((s, l) => s + l.taxMinor, 0),
      cogsMinor: lines.reduce((s, l) => s + l.cogsMinor, 0),
    });
  }

  return {
    window,
    filters,
    sales,
    refunds,
    products,
    lineFiltered: Boolean(lineScope),
    truncated,
    salesConsidered: sales.length,
    maxRows,
  };
}

export async function loadProductMeta(
  db: Tx,
  entityId: string,
  ids: string[],
): Promise<Map<string, ProductMeta>> {
  const map = new Map<string, ProductMeta>();
  if (!ids.length) return map;

  // Chunked so SQLite never meets an IN list longer than it can bind.
  const CHUNK = 400;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = await db.product.findMany({
      where: { entityId, id: { in: ids.slice(i, i + CHUNK) } },
      select: {
        id: true,
        namePt: true,
        sku: true,
        categoryId: true,
        category: { select: { id: true, namePt: true } },
      },
    });
    for (const row of rows) {
      map.set(row.id, {
        id: row.id,
        name: row.namePt,
        sku: row.sku,
        categoryId: row.categoryId,
        categoryName: row.category?.namePt ?? UNCATEGORISED_LABEL,
      });
    }
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                     */
/* -------------------------------------------------------------------------- */

export interface ReportSummary {
  revenueMinor: number;
  cogsMinor: number;
  grossProfitMinor: number;
  grossMarginBps: number;
  discountMinor: number;
  refundMinor: number;
  taxMinor: number;
  transactionCount: number;
  averageTicketMinor: number;
  itemsSold: number;
}

export function summarise(dataset: SalesDataset): ReportSummary {
  let grossRevenue = 0;
  let grossCogs = 0;
  let tax = 0;
  let discount = 0;
  let items = 0;

  for (const sale of dataset.sales) {
    grossRevenue += sale.revenueMinor;
    grossCogs += sale.cogsMinor;
    tax += sale.taxMinor;
    discount += sale.discountMinor;
    items += sale.itemsSold;
  }

  let refundMinor = 0;
  let refundCogs = 0;
  let refundTax = 0;
  let refundItems = 0;
  for (const refund of dataset.refunds) {
    refundMinor += refund.totalMinor;
    refundCogs += refund.cogsMinor;
    refundTax += refund.taxMinor;
    for (const line of refund.lines) refundItems += line.quantity;
  }

  const revenueMinor = grossRevenue - refundMinor;
  const cogsMinor = grossCogs - refundCogs;
  const { profitMinor, marginBps } = margin(revenueMinor, cogsMinor);
  const transactionCount = dataset.sales.length;

  return {
    revenueMinor,
    cogsMinor,
    grossProfitMinor: profitMinor,
    grossMarginBps: marginBps,
    discountMinor: discount,
    refundMinor,
    taxMinor: tax - refundTax,
    transactionCount,
    averageTicketMinor: transactionCount ? Math.round(revenueMinor / transactionCount) : 0,
    itemsSold: round3(items - refundItems),
  };
}

/* -------------------------------------------------------------------------- */
/* Time series                                                                 */
/* -------------------------------------------------------------------------- */

function startOfBucket(date: Date, granularity: Granularity): Date {
  const d = new Date(date.getTime());
  switch (granularity) {
    case 'hour':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
    case 'week': {
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      // ISO weeks start on Monday.
      const offset = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - offset);
      return start;
    }
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case 'day':
    default:
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
}

function advanceBucket(date: Date, granularity: Granularity): Date {
  const d = new Date(date.getTime());
  switch (granularity) {
    case 'hour':
      d.setHours(d.getHours() + 1);
      return d;
    case 'week':
      d.setDate(d.getDate() + 7);
      return d;
    case 'month':
      d.setMonth(d.getMonth() + 1);
      return d;
    case 'day':
    default:
      d.setDate(d.getDate() + 1);
      return d;
  }
}

export function bucketKey(date: Date, granularity: Granularity): string {
  const start = startOfBucket(date, granularity);
  if (granularity === 'month') {
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'hour') {
    return `${isoDay(start)}T${String(start.getHours()).padStart(2, '0')}:00`;
  }
  return isoDay(start);
}

export interface SeriesPoint {
  bucket: string;
  revenueMinor: number;
  cogsMinor: number;
  profitMinor: number;
  transactions: number;
}

/**
 * Bucketing happens in JavaScript, never in SQL: the same code has to produce
 * the same chart on SQLite (dev) and PostgreSQL (production).
 */
export function buildSeries(dataset: SalesDataset, granularity: Granularity): SeriesPoint[] {
  const buckets = new Map<string, { revenueMinor: number; cogsMinor: number; transactions: number }>();

  const touch = (key: string) => {
    let entry = buckets.get(key);
    if (!entry) {
      entry = { revenueMinor: 0, cogsMinor: 0, transactions: 0 };
      buckets.set(key, entry);
    }
    return entry;
  };

  for (const sale of dataset.sales) {
    const entry = touch(bucketKey(sale.at, granularity));
    entry.revenueMinor += sale.revenueMinor;
    entry.cogsMinor += sale.cogsMinor;
    entry.transactions += 1;
  }
  for (const refund of dataset.refunds) {
    const entry = touch(bucketKey(refund.at, granularity));
    entry.revenueMinor -= refund.totalMinor;
    entry.cogsMinor -= refund.cogsMinor;
  }

  // Zero-fill so the chart has no gaps.
  const points: SeriesPoint[] = [];
  let cursor = startOfBucket(dataset.window.from, granularity);
  const end = dataset.window.to.getTime();
  let guard = 0;
  while (cursor.getTime() <= end && guard < MAX_SERIES_BUCKETS) {
    const key = bucketKey(cursor, granularity);
    const entry = buckets.get(key) ?? { revenueMinor: 0, cogsMinor: 0, transactions: 0 };
    points.push({
      bucket: key,
      revenueMinor: entry.revenueMinor,
      cogsMinor: entry.cogsMinor,
      profitMinor: entry.revenueMinor - entry.cogsMinor,
      transactions: entry.transactions,
    });
    buckets.delete(key);
    cursor = advanceBucket(cursor, granularity);
    guard += 1;
  }

  // Anything left over (refunds dated outside the fill range) is appended so no
  // money silently disappears from the chart.
  for (const [key, entry] of buckets) {
    points.push({
      bucket: key,
      revenueMinor: entry.revenueMinor,
      cogsMinor: entry.cogsMinor,
      profitMinor: entry.revenueMinor - entry.cogsMinor,
      transactions: entry.transactions,
    });
  }
  points.sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0));
  return points;
}

/* -------------------------------------------------------------------------- */
/* Breakdowns                                                                  */
/* -------------------------------------------------------------------------- */

export interface BreakdownRowFull {
  id: string;
  label: string;
  revenueMinor: number;
  cogsMinor: number;
  profitMinor: number;
  marginBps: number;
  quantity: number;
  share: number;
}

interface Bucket {
  id: string;
  label: string;
  revenueMinor: number;
  cogsMinor: number;
  quantity: number;
  transactions: number;
  extra: number;
}

function bucketMap() {
  const map = new Map<string, Bucket>();
  const get = (id: string, label: string): Bucket => {
    let entry = map.get(id);
    if (!entry) {
      entry = { id, label, revenueMinor: 0, cogsMinor: 0, quantity: 0, transactions: 0, extra: 0 };
      map.set(id, entry);
    }
    return entry;
  };
  return { map, get };
}

function finishRows(buckets: Map<string, Bucket>): BreakdownRowFull[] {
  const total = [...buckets.values()].reduce((s, b) => s + b.revenueMinor, 0);
  return [...buckets.values()]
    .map((b) => {
      const { profitMinor, marginBps } = margin(b.revenueMinor, b.cogsMinor);
      return {
        id: b.id,
        label: b.label,
        revenueMinor: b.revenueMinor,
        cogsMinor: b.cogsMinor,
        profitMinor,
        marginBps,
        quantity: round3(b.quantity),
        share: total !== 0 ? b.revenueMinor / total : 0,
      };
    })
    .sort((a, b) => b.revenueMinor - a.revenueMinor);
}

export function breakdownByCategory(dataset: SalesDataset): BreakdownRowFull[] {
  const { map, get } = bucketMap();
  const keyOf = (productId: string | null) => {
    const meta = productId ? dataset.products.get(productId) : undefined;
    const id = meta?.categoryId ?? UNCATEGORISED_ID;
    return { id, label: meta?.categoryId ? meta.categoryName : UNCATEGORISED_LABEL };
  };

  for (const sale of dataset.sales) {
    for (const line of sale.lines) {
      const { id, label } = keyOf(line.productId);
      const entry = get(id, label);
      entry.revenueMinor += line.totalMinor;
      entry.cogsMinor += line.cogsMinor;
      entry.quantity += line.quantity;
    }
  }
  for (const refund of dataset.refunds) {
    for (const line of refund.lines) {
      const { id, label } = keyOf(line.productId);
      const entry = get(id, label);
      entry.revenueMinor -= line.amountMinor;
      entry.cogsMinor -= line.cogsMinor;
      entry.quantity -= line.quantity;
    }
  }
  return finishRows(map);
}

export function breakdownByProduct(
  dataset: SalesDataset,
  options: { limit?: number; sort?: ProductSort } = {},
): BreakdownRowFull[] {
  const { map, get } = bucketMap();

  for (const sale of dataset.sales) {
    for (const line of sale.lines) {
      const meta = line.productId ? dataset.products.get(line.productId) : undefined;
      const entry = get(line.productId ?? `ad-hoc:${line.name}`, meta?.name ?? line.name);
      entry.revenueMinor += line.totalMinor;
      entry.cogsMinor += line.cogsMinor;
      entry.quantity += line.quantity;
    }
  }
  for (const refund of dataset.refunds) {
    for (const line of refund.lines) {
      const meta = line.productId ? dataset.products.get(line.productId) : undefined;
      const entry = get(line.productId ?? `ad-hoc:${line.name}`, meta?.name ?? line.name);
      entry.revenueMinor -= line.amountMinor;
      entry.cogsMinor -= line.cogsMinor;
      entry.quantity -= line.quantity;
    }
  }

  const rows = finishRows(map);
  const sort = options.sort ?? 'revenue';
  rows.sort((a, b) => {
    switch (sort) {
      case 'profit':
        return b.profitMinor - a.profitMinor;
      case 'margin':
        return b.marginBps - a.marginBps;
      case 'quantity':
        return b.quantity - a.quantity;
      case 'revenue':
      default:
        return b.revenueMinor - a.revenueMinor;
    }
  });
  return options.limit ? rows.slice(0, options.limit) : rows;
}

export interface StaffRow extends BreakdownRowFull {
  transactions: number;
  averageTicketMinor: number;
  itemsSold: number;
  tipsMinor: number;
}

export function breakdownByStaff(dataset: SalesDataset): StaffRow[] {
  const { map, get } = bucketMap();

  for (const sale of dataset.sales) {
    const entry = get(sale.cashierId ?? UNKNOWN_STAFF_ID, sale.cashierName ?? UNKNOWN_STAFF_LABEL);
    entry.revenueMinor += sale.revenueMinor;
    entry.cogsMinor += sale.cogsMinor;
    entry.quantity += sale.itemsSold;
    entry.transactions += 1;
    entry.extra += sale.tipMinor;
  }
  for (const refund of dataset.refunds) {
    const entry = get(
      refund.cashierId ?? UNKNOWN_STAFF_ID,
      refund.cashierName ?? UNKNOWN_STAFF_LABEL,
    );
    entry.revenueMinor -= refund.totalMinor;
    entry.cogsMinor -= refund.cogsMinor;
    for (const line of refund.lines) entry.quantity -= line.quantity;
  }

  const base = finishRows(map);
  return base.map((row) => {
    const bucket = map.get(row.id)!;
    return {
      ...row,
      transactions: bucket.transactions,
      averageTicketMinor: bucket.transactions
        ? Math.round(row.revenueMinor / bucket.transactions)
        : 0,
      itemsSold: row.quantity,
      tipsMinor: bucket.extra,
    };
  });
}

export interface PaymentRow extends BreakdownRowFull {
  method: string;
  transactions: number;
  refundMinor: number;
}

function paymentLabel(method: string, label: string | null): string {
  const known = PAYMENT_METHOD_LABELS[method as PaymentMethod];
  if (known) return method === 'custom' && label ? label : known.pt;
  return label ?? method;
}

export function breakdownByPaymentMethod(dataset: SalesDataset): PaymentRow[] {
  const { map, get } = bucketMap();

  for (const sale of dataset.sales) {
    for (const payment of sale.payments) {
      const entry = get(payment.method, paymentLabel(payment.method, payment.label));
      entry.revenueMinor += payment.amountMinor;
      entry.transactions += 1;
      entry.quantity += 1;
    }
  }

  // A refund has to come back out of the tender it went in through. "original"
  // is spread across the sale's own payments largest-remainder-first.
  for (const refund of dataset.refunds) {
    if (refund.method === 'cash' || refund.method === 'store_credit') {
      const entry = get(refund.method, paymentLabel(refund.method, null));
      entry.revenueMinor -= refund.totalMinor;
      entry.extra += refund.totalMinor;
      continue;
    }
    const payments = refund.salePayments;
    if (!payments.length) {
      const entry = get('custom', paymentLabel('custom', null));
      entry.revenueMinor -= refund.totalMinor;
      entry.extra += refund.totalMinor;
      continue;
    }
    const spread = allocate(
      refund.totalMinor,
      payments.map((p) => p.amountMinor),
    );
    payments.forEach((payment, index) => {
      const entry = get(payment.method, paymentLabel(payment.method, payment.label));
      const amount = spread[index] ?? 0;
      entry.revenueMinor -= amount;
      entry.extra += amount;
    });
  }

  const rows = finishRows(map);
  return rows.map((row) => {
    const bucket = map.get(row.id)!;
    return {
      ...row,
      // Payment tenders carry no cost of their own.
      cogsMinor: 0,
      profitMinor: 0,
      marginBps: 0,
      method: row.id,
      transactions: bucket.transactions,
      refundMinor: bucket.extra,
    };
  });
}

export interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  revenueMinor: number;
  transactions: number;
}

/** All 168 cells, zero-filled: this drives the staffing heatmap. */
export function buildHeatmap(dataset: SalesDataset): HeatmapCell[] {
  const grid: HeatmapCell[] = [];
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      grid.push({ dayOfWeek: day, hour, revenueMinor: 0, transactions: 0 });
    }
  }
  const at = (day: number, hour: number) => grid[day * 24 + hour]!;

  for (const sale of dataset.sales) {
    const cell = at(sale.at.getDay(), sale.at.getHours());
    cell.revenueMinor += sale.revenueMinor;
    cell.transactions += 1;
  }
  for (const refund of dataset.refunds) {
    at(refund.at.getDay(), refund.at.getHours()).revenueMinor -= refund.totalMinor;
  }
  return grid;
}

export interface DayOfWeekRow {
  dayOfWeek: number;
  label: string;
  revenueMinor: number;
  cogsMinor: number;
  profitMinor: number;
  marginBps: number;
  transactions: number;
  itemsSold: number;
  averageTicketMinor: number;
  share: number;
}

export function breakdownByDayOfWeek(dataset: SalesDataset): DayOfWeekRow[] {
  const rows = WEEKDAY_LABELS_PT.map((label, dayOfWeek) => ({
    dayOfWeek,
    label,
    revenueMinor: 0,
    cogsMinor: 0,
    transactions: 0,
    itemsSold: 0,
  }));

  for (const sale of dataset.sales) {
    const row = rows[sale.at.getDay()]!;
    row.revenueMinor += sale.revenueMinor;
    row.cogsMinor += sale.cogsMinor;
    row.transactions += 1;
    row.itemsSold += sale.itemsSold;
  }
  for (const refund of dataset.refunds) {
    const row = rows[refund.at.getDay()]!;
    row.revenueMinor -= refund.totalMinor;
    row.cogsMinor -= refund.cogsMinor;
    for (const line of refund.lines) row.itemsSold -= line.quantity;
  }

  const total = rows.reduce((s, r) => s + r.revenueMinor, 0);
  return rows.map((row) => {
    const { profitMinor, marginBps } = margin(row.revenueMinor, row.cogsMinor);
    return {
      ...row,
      itemsSold: round3(row.itemsSold),
      profitMinor,
      marginBps,
      averageTicketMinor: row.transactions ? Math.round(row.revenueMinor / row.transactions) : 0,
      share: total !== 0 ? row.revenueMinor / total : 0,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Waste                                                                       */
/* -------------------------------------------------------------------------- */

export interface WasteRow {
  id: string;
  at: string;
  productId: string;
  productName: string;
  type: string;
  reason: string | null;
  quantity: number;
  unitCostMinor: number;
  valueMinor: number;
}

export interface WasteReport {
  rows: WasteRow[];
  totalMinor: number;
  truncated: boolean;
}

export async function loadWaste(
  db: Tx,
  entityId: string,
  window: ReportWindow,
  filters: ReportFiltersQuery,
  limit = MAX_DETAIL_ROWS,
): Promise<WasteReport> {
  const rows = await db.stockMovement.findMany({
    where: {
      entityId,
      createdAt: { gte: window.from, lte: window.to },
      OR: [{ type: 'waste' }, { type: 'adjustment', reason: { in: [...WASTE_REASONS] } }],
      ...(filters.locationId ? { locationId: filters.locationId } : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      createdAt: true,
      productId: true,
      type: true,
      reason: true,
      quantity: true,
      unitCostMinor: true,
      product: { select: { namePt: true, avgCostMinor: true, costPriceMinor: true } },
    },
  });

  const truncated = rows.length > limit;
  const out: WasteRow[] = [];
  let totalMinor = 0;

  for (const row of rows.slice(0, limit)) {
    // Only stock LEAVING is a loss; a correction upwards is not waste.
    const quantity = round3(Math.max(0, -row.quantity));
    if (quantity <= 0) continue;
    const unitCostMinor =
      num(row.unitCostMinor) || num(row.product?.avgCostMinor) || num(row.product?.costPriceMinor);
    const valueMinor = Math.round(unitCostMinor * quantity);
    totalMinor += valueMinor;
    out.push({
      id: row.id,
      at: row.createdAt.toISOString(),
      productId: row.productId,
      productName: row.product?.namePt ?? 'Produto removido',
      type: row.type,
      reason: row.reason,
      quantity,
      unitCostMinor,
      valueMinor,
    });
  }

  return { rows: out, totalMinor, truncated };
}

/* -------------------------------------------------------------------------- */
/* Inventory                                                                   */
/* -------------------------------------------------------------------------- */

export interface ValuationRow {
  id: string;
  label: string;
  productCount: number;
  quantity: number;
  costValueMinor: number;
  retailValueMinor: number;
  potentialProfitMinor: number;
  marginBps: number;
  share: number;
}

export interface ValuationReport {
  rows: ValuationRow[];
  total: {
    productCount: number;
    quantity: number;
    costValueMinor: number;
    retailValueMinor: number;
    potentialProfitMinor: number;
    marginBps: number;
  };
  truncated: boolean;
}

export async function inventoryValuation(
  db: Tx,
  entityId: string,
  filters: ReportFiltersQuery,
  options: { includeZero?: boolean; limit?: number } = {},
): Promise<ValuationReport> {
  const limit = options.limit ?? MAX_DETAIL_ROWS;

  const products = await db.product.findMany({
    where: {
      entityId,
      deletedAt: null,
      trackStock: true,
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.productId ? { id: filters.productId } : {}),
    },
    orderBy: { namePt: 'asc' },
    take: limit + 1,
    select: {
      id: true,
      namePt: true,
      categoryId: true,
      stockQuantity: true,
      salePriceMinor: true,
      costPriceMinor: true,
      avgCostMinor: true,
      category: { select: { id: true, namePt: true } },
      inventoryLevels: filters.locationId
        ? { where: { locationId: filters.locationId }, select: { quantity: true, avgCostMinor: true } }
        : { select: { quantity: true, avgCostMinor: true } },
    },
  });

  const truncated = products.length > limit;
  const buckets = new Map<string, ValuationRow>();
  const total = {
    productCount: 0,
    quantity: 0,
    costValueMinor: 0,
    retailValueMinor: 0,
    potentialProfitMinor: 0,
    marginBps: 0,
  };

  for (const product of products.slice(0, limit)) {
    const quantity = filters.locationId
      ? round3(product.inventoryLevels.reduce((s, l) => s + l.quantity, 0))
      : round3(product.stockQuantity);
    if (!options.includeZero && quantity === 0) continue;

    const unitCost =
      num(product.avgCostMinor) || num(product.costPriceMinor) || 0;
    const costValueMinor = Math.round(unitCost * quantity);
    const retailValueMinor = Math.round(num(product.salePriceMinor) * quantity);

    const id = product.categoryId ?? UNCATEGORISED_ID;
    let row = buckets.get(id);
    if (!row) {
      row = {
        id,
        label: product.category?.namePt ?? UNCATEGORISED_LABEL,
        productCount: 0,
        quantity: 0,
        costValueMinor: 0,
        retailValueMinor: 0,
        potentialProfitMinor: 0,
        marginBps: 0,
        share: 0,
      };
      buckets.set(id, row);
    }
    row.productCount += 1;
    row.quantity = round3(row.quantity + quantity);
    row.costValueMinor += costValueMinor;
    row.retailValueMinor += retailValueMinor;

    total.productCount += 1;
    total.quantity = round3(total.quantity + quantity);
    total.costValueMinor += costValueMinor;
    total.retailValueMinor += retailValueMinor;
  }

  const rows = [...buckets.values()].map((row) => {
    const { profitMinor, marginBps } = margin(row.retailValueMinor, row.costValueMinor);
    return {
      ...row,
      potentialProfitMinor: profitMinor,
      marginBps,
      share: total.costValueMinor !== 0 ? row.costValueMinor / total.costValueMinor : 0,
    };
  });
  rows.sort((a, b) => b.costValueMinor - a.costValueMinor);

  const grand = margin(total.retailValueMinor, total.costValueMinor);
  total.potentialProfitMinor = grand.profitMinor;
  total.marginBps = grand.marginBps;

  return { rows, total, truncated };
}

export interface MovementRow {
  id: string;
  productId: string;
  productName: string;
  variantId: string | null;
  type: string;
  quantity: number;
  balanceAfter: number;
  unitCostMinor: number | null;
  valueMinor: number;
  reason: string | null;
  reference: string | null;
  note: string | null;
  locationId: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
}

export async function stockMovementsReport(
  db: Tx,
  entityId: string,
  filters: ReportFiltersQuery,
  options: { type?: string; reason?: string; skip?: number; take?: number } = {},
): Promise<{ rows: MovementRow[]; total: number }> {
  const window = resolveWindow(filters);
  const where = {
    entityId,
    createdAt: { gte: window.from, lte: window.to },
    ...(options.type ? { type: options.type } : {}),
    ...(options.reason ? { reason: options.reason } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}),
  };

  const [rows, total] = await Promise.all([
    db.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: options.skip ?? 0,
      take: Math.min(options.take ?? 50, MAX_DETAIL_ROWS),
      select: {
        id: true,
        productId: true,
        variantId: true,
        locationId: true,
        type: true,
        quantity: true,
        balanceAfter: true,
        unitCostMinor: true,
        reason: true,
        reference: true,
        note: true,
        userId: true,
        userName: true,
        createdAt: true,
        product: { select: { namePt: true, avgCostMinor: true } },
      },
    }),
    db.stockMovement.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((row) => {
      const unitCostMinor = row.unitCostMinor == null ? null : num(row.unitCostMinor);
      const cost = unitCostMinor ?? num(row.product?.avgCostMinor);
      return {
        id: row.id,
        productId: row.productId,
        productName: row.product?.namePt ?? 'Produto removido',
        variantId: row.variantId,
        type: row.type,
        quantity: round3(row.quantity),
        balanceAfter: round3(row.balanceAfter),
        unitCostMinor,
        valueMinor: Math.round(cost * row.quantity),
        reason: row.reason,
        reference: row.reference,
        note: row.note,
        locationId: row.locationId,
        userId: row.userId,
        userName: row.userName,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  };
}

export interface DeadStockRow {
  productId: string;
  sku: string;
  name: string;
  categoryName: string;
  quantity: number;
  unitCostMinor: number;
  tiedUpCapitalMinor: number;
  retailValueMinor: number;
  lastSoldAt: string | null;
  daysSinceSale: number | null;
}

export interface DeadStockReport {
  rows: DeadStockRow[];
  totalTiedUpMinor: number;
  days: number;
  truncated: boolean;
}

/** Stock on hand that sold nothing at all inside the window. */
export async function deadStock(
  db: Tx,
  entityId: string,
  filters: ReportFiltersQuery,
  options: { days: number; limit: number },
): Promise<DeadStockReport> {
  const to = filters.to ? resolveWindow(filters).to : new Date();
  const from = new Date(to.getTime() - options.days * 86_400_000);

  const [soldRows, products, lastSold] = await Promise.all([
    db.saleLine.findMany({
      where: {
        productId: { not: null },
        sale: {
          entityId,
          status: { in: [...COUNTED_SALE_STATUSES] },
          createdAt: { gte: from, lte: to },
          ...(filters.locationId ? { locationId: filters.locationId } : {}),
          ...(filters.channel ? { channel: filters.channel } : {}),
        },
      },
      select: { productId: true },
      distinct: ['productId'],
      take: MAX_SALE_ROWS,
    }),
    db.product.findMany({
      where: {
        entityId,
        deletedAt: null,
        trackStock: true,
        stockQuantity: { gt: 0 },
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.productId ? { id: filters.productId } : {}),
      },
      orderBy: { namePt: 'asc' },
      take: MAX_DETAIL_ROWS + 1,
      select: {
        id: true,
        sku: true,
        namePt: true,
        stockQuantity: true,
        salePriceMinor: true,
        costPriceMinor: true,
        avgCostMinor: true,
        category: { select: { namePt: true } },
      },
    }),
    db.stockMovement.groupBy({
      by: ['productId'],
      where: { entityId, type: 'sale' },
      _max: { createdAt: true },
    }),
  ]);

  const truncated = products.length > MAX_DETAIL_ROWS;
  const sold = new Set(soldRows.map((row) => row.productId).filter((id): id is string => !!id));
  const lastSoldAt = new Map<string, Date>();
  for (const row of lastSold) {
    if (row._max.createdAt) lastSoldAt.set(row.productId, row._max.createdAt);
  }

  const rows: DeadStockRow[] = [];
  let totalTiedUpMinor = 0;

  for (const product of products.slice(0, MAX_DETAIL_ROWS)) {
    if (sold.has(product.id)) continue;
    const quantity = round3(product.stockQuantity);
    if (quantity <= 0) continue;

    const unitCostMinor = num(product.avgCostMinor) || num(product.costPriceMinor);
    const tiedUpCapitalMinor = Math.round(unitCostMinor * quantity);
    const last = lastSoldAt.get(product.id) ?? null;
    totalTiedUpMinor += tiedUpCapitalMinor;

    rows.push({
      productId: product.id,
      sku: product.sku,
      name: product.namePt,
      categoryName: product.category?.namePt ?? UNCATEGORISED_LABEL,
      quantity,
      unitCostMinor,
      tiedUpCapitalMinor,
      retailValueMinor: Math.round(num(product.salePriceMinor) * quantity),
      lastSoldAt: last ? last.toISOString() : null,
      daysSinceSale: last ? Math.floor((to.getTime() - last.getTime()) / 86_400_000) : null,
    });
  }

  rows.sort((a, b) => b.tiedUpCapitalMinor - a.tiedUpCapitalMinor);
  return {
    rows: rows.slice(0, options.limit),
    totalTiedUpMinor,
    days: options.days,
    truncated,
  };
}

/* -------------------------------------------------------------------------- */
/* Customers                                                                   */
/* -------------------------------------------------------------------------- */

export interface TopCustomerRow {
  customerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  tier: string;
  spendMinor: number;
  orderCount: number;
  averageOrderMinor: number;
  itemsBought: number;
  lastPurchaseAt: string | null;
  share: number;
}

export async function topCustomers(
  db: Tx,
  entityId: string,
  dataset: SalesDataset,
  limit: number,
): Promise<TopCustomerRow[]> {
  const buckets = new Map<
    string,
    { spendMinor: number; orderCount: number; items: number; last: Date | null }
  >();

  const touch = (id: string) => {
    let entry = buckets.get(id);
    if (!entry) {
      entry = { spendMinor: 0, orderCount: 0, items: 0, last: null };
      buckets.set(id, entry);
    }
    return entry;
  };

  for (const sale of dataset.sales) {
    if (!sale.customerId) continue;
    const entry = touch(sale.customerId);
    entry.spendMinor += sale.revenueMinor;
    entry.orderCount += 1;
    entry.items += sale.itemsSold;
    if (!entry.last || sale.at > entry.last) entry.last = sale.at;
  }
  for (const refund of dataset.refunds) {
    if (!refund.customerId) continue;
    const entry = touch(refund.customerId);
    entry.spendMinor -= refund.totalMinor;
    for (const line of refund.lines) entry.items -= line.quantity;
  }

  const ranked = [...buckets.entries()]
    .sort((a, b) => b[1].spendMinor - a[1].spendMinor)
    .slice(0, limit);
  if (!ranked.length) return [];

  const customers = await db.customer.findMany({
    where: { entityId, id: { in: ranked.map(([id]) => id) } },
    select: { id: true, name: true, phone: true, email: true, tier: true },
  });
  const byId = new Map(customers.map((c) => [c.id, c]));
  const total = [...buckets.values()].reduce((s, b) => s + b.spendMinor, 0);

  return ranked.map(([id, entry]) => {
    const customer = byId.get(id);
    return {
      customerId: id,
      name: customer?.name ?? 'Cliente removido',
      phone: customer?.phone ?? null,
      email: customer?.email ?? null,
      tier: customer?.tier ?? 'none',
      spendMinor: entry.spendMinor,
      orderCount: entry.orderCount,
      averageOrderMinor: entry.orderCount ? Math.round(entry.spendMinor / entry.orderCount) : 0,
      itemsBought: round3(entry.items),
      lastPurchaseAt: entry.last ? entry.last.toISOString() : null,
      share: total !== 0 ? entry.spendMinor / total : 0,
    };
  });
}

export interface RetentionReport {
  newCustomers: number;
  returningCustomers: number;
  newRevenueMinor: number;
  returningRevenueMinor: number;
  newTransactions: number;
  returningTransactions: number;
  guestTransactions: number;
  guestRevenueMinor: number;
  identifiedTransactions: number;
  /** Share of identified customers that had bought before, in basis points. */
  repeatRateBps: number;
}

export async function customerRetention(
  db: Tx,
  entityId: string,
  dataset: SalesDataset,
): Promise<RetentionReport> {
  // First-ever purchase per customer decides "new" vs "returning".
  const firstPurchase = await db.sale.groupBy({
    by: ['customerId'],
    where: {
      entityId,
      status: { in: [...COUNTED_SALE_STATUSES] },
      customerId: { not: null },
    },
    _min: { createdAt: true },
  });
  const firstById = new Map<string, Date>();
  for (const row of firstPurchase) {
    if (row.customerId && row._min.createdAt) firstById.set(row.customerId, row._min.createdAt);
  }

  const report: RetentionReport = {
    newCustomers: 0,
    returningCustomers: 0,
    newRevenueMinor: 0,
    returningRevenueMinor: 0,
    newTransactions: 0,
    returningTransactions: 0,
    guestTransactions: 0,
    guestRevenueMinor: 0,
    identifiedTransactions: 0,
    repeatRateBps: 0,
  };

  const seenNew = new Set<string>();
  const seenReturning = new Set<string>();
  const from = dataset.window.from.getTime();

  for (const sale of dataset.sales) {
    if (!sale.customerId) {
      report.guestTransactions += 1;
      report.guestRevenueMinor += sale.revenueMinor;
      continue;
    }
    report.identifiedTransactions += 1;
    const first = firstById.get(sale.customerId);
    const isNew = !first || first.getTime() >= from;
    if (isNew) {
      seenNew.add(sale.customerId);
      report.newTransactions += 1;
      report.newRevenueMinor += sale.revenueMinor;
    } else {
      seenReturning.add(sale.customerId);
      report.returningTransactions += 1;
      report.returningRevenueMinor += sale.revenueMinor;
    }
  }

  for (const refund of dataset.refunds) {
    if (!refund.customerId) {
      report.guestRevenueMinor -= refund.totalMinor;
      continue;
    }
    const first = firstById.get(refund.customerId);
    if (!first || first.getTime() >= from) report.newRevenueMinor -= refund.totalMinor;
    else report.returningRevenueMinor -= refund.totalMinor;
  }

  report.newCustomers = seenNew.size;
  report.returningCustomers = seenReturning.size;
  const identified = seenNew.size + seenReturning.size;
  report.repeatRateBps = identified ? Math.round((seenReturning.size / identified) * 10_000) : 0;
  return report;
}

/* -------------------------------------------------------------------------- */
/* Dashboard & P&L                                                             */
/* -------------------------------------------------------------------------- */

export interface ReportMeta {
  from: string;
  to: string;
  truncated: boolean;
  salesConsidered: number;
  maxRows: number;
}

export function metaOf(dataset: SalesDataset): ReportMeta {
  return {
    from: dataset.window.from.toISOString(),
    to: dataset.window.to.toISOString(),
    truncated: dataset.truncated,
    salesConsidered: dataset.salesConsidered,
    maxRows: dataset.maxRows,
  };
}

export interface DashboardReport extends ReportSummary {
  previous: ReportSummary;
  meta: ReportMeta & { previousFrom: string; previousTo: string };
}

export async function dashboard(
  db: Tx,
  entityId: string,
  filters: ReportFiltersQuery,
): Promise<DashboardReport> {
  const window = resolveWindow(filters);
  const prev = previousWindow(window);

  const [current, previous] = await Promise.all([
    loadSalesDataset(db, entityId, filters, { window }),
    loadSalesDataset(db, entityId, filters, { window: prev }),
  ]);

  return {
    ...summarise(current),
    previous: summarise(previous),
    meta: {
      ...metaOf(current),
      previousFrom: prev.from.toISOString(),
      previousTo: prev.to.toISOString(),
    },
  };
}

export interface ProfitAndLossResult {
  summary: ReportSummary;
  series: SeriesPoint[];
  byCategory: BreakdownRowFull[];
  byProduct: BreakdownRowFull[];
  byStaff: StaffRow[];
  byPaymentMethod: PaymentRow[];
  hourlyHeatmap: HeatmapCell[];
  losses: { discountsMinor: number; refundsMinor: number; wasteMinor: number };
  meta: ReportMeta & { wasteTruncated: boolean };
}

export async function profitAndLoss(
  db: Tx,
  entityId: string,
  filters: ReportFiltersQuery,
  options: { granularity: Granularity; productLimit?: number },
): Promise<ProfitAndLossResult> {
  const dataset = await loadSalesDataset(db, entityId, filters);
  const waste = await loadWaste(db, entityId, dataset.window, filters);
  const summary = summarise(dataset);

  return {
    summary,
    series: buildSeries(dataset, options.granularity),
    byCategory: breakdownByCategory(dataset),
    byProduct: breakdownByProduct(dataset, { limit: options.productLimit ?? 200 }),
    byStaff: breakdownByStaff(dataset),
    byPaymentMethod: breakdownByPaymentMethod(dataset),
    hourlyHeatmap: buildHeatmap(dataset),
    losses: {
      discountsMinor: summary.discountMinor,
      refundsMinor: summary.refundMinor,
      wasteMinor: waste.totalMinor,
    },
    meta: { ...metaOf(dataset), wasteTruncated: waste.truncated },
  };
}

/* -------------------------------------------------------------------------- */
/* Cost gating                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A cashier-level caller must never see cost, COGS or margin. Rather than
 * zeroing the numbers (which would read as "we sell at cost"), the fields are
 * removed outright.
 */
export const DEFAULT_COST_KEYS = [
  'cogsMinor',
  'profitMinor',
  'marginBps',
  'grossProfitMinor',
  'grossMarginBps',
  'unitCostMinor',
  'tiedUpCapitalMinor',
  'costValueMinor',
  'potentialProfitMinor',
  'valueMinor',
];

export function stripFinancial<T extends object>(
  row: T,
  keys: string[] = DEFAULT_COST_KEYS,
): Partial<T> {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy as Partial<T>;
}

export function stripFinancialRows<T extends object>(
  rows: readonly T[],
  keys?: string[],
): Array<Partial<T>> {
  return rows.map((row) => stripFinancial(row, keys));
}
