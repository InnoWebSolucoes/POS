import type { Prisma, PrismaClient } from '@prisma/client';
import {
  RETURN_REASONS,
  suggestTenders,
  type LineDiscount,
  type LineInput,
  type PaymentMethod,
  type Unit,
  type VipTier,
} from '@pos/shared';
import {
  addMinutes,
  atTime,
  computeSeedSale,
  daysAgo,
  documentNumber,
  id,
  money,
  round3,
  type SeedSaleTotals,
} from './helpers.js';
import type { Rng } from './rng.js';
import type { SeedLedger } from './stock.js';
import type { SeededUser } from './users.js';

/**
 * Ninety days of trading for Supermercado Kalunga.
 *
 * The history is planned in memory FIRST so the opening stock can be worked out
 * backwards: a product's initial balance is whatever it must have been for the
 * ledger to arrive at today's shelf quantity after every sale and refund. That
 * is what keeps StockMovement, InventoryLevel and Product.stockQuantity telling
 * the same story.
 */

export interface SalesProduct {
  id: string;
  name: string;
  sku: string;
  unit: Unit;
  priceMinor: number;
  costMinor: number;
  taxRateBps: number;
  weighted: boolean;
  pop: number;
  categoryKey: string;
}

export interface SalesCustomer {
  id: string;
  name: string;
  loyalty: boolean;
}

interface PlannedLine {
  product: SalesProduct;
  quantity: number;
  discount: LineDiscount | null;
}

interface PlannedPayment {
  method: PaymentMethod;
  amountMinor: number;
  tenderedMinor: number | null;
  changeMinor: number | null;
  reference: string | null;
}

export interface PlannedSale {
  id: string;
  date: Date;
  status: 'completed' | 'held';
  holdLabel: string | null;
  cashier: SeededUser;
  customer: SalesCustomer | null;
  lines: PlannedLine[];
  totals: SeedSaleTotals;
  orderDiscount: LineDiscount | null;
  promotionCode: string | null;
  cogsMinor: number;
  payments: PlannedPayment[];
  lineIds: string[];
  receiptNumber: string;
}

export interface PlannedRefundLine {
  lineIndex: number;
  quantity: number;
  amountMinor: number;
  taxMinor: number;
  cogsMinor: number;
  reason: string;
  restocked: boolean;
}

export interface PlannedRefund {
  id: string;
  sale: PlannedSale;
  date: Date;
  reference: string;
  method: 'original' | 'store_credit' | 'cash';
  lines: PlannedRefundLine[];
  totalMinor: number;
  taxMinor: number;
  cogsMinor: number;
  user: SeededUser;
  fullyRefunded: boolean;
}

export interface SalesPlan {
  sales: PlannedSale[];
  refunds: PlannedRefund[];
  /** Net units that left the shelf, per product id. */
  soldByProduct: Map<string, number>;
  receiptCounters: Map<number, number>;
  refundCounters: Map<number, number>;
}

/** Busier at lunch and again on the way home from work. */
const HOUR_WEIGHTS: Array<[number, number]> = [
  [8, 2],
  [9, 3],
  [10, 4],
  [11, 5],
  [12, 8],
  [13, 9],
  [14, 6],
  [15, 4],
  [16, 5],
  [17, 7],
  [18, 9],
  [19, 8],
  [20, 5],
  [21, 2],
];

/** Sunday .. Saturday. Friday and Saturday carry the week. */
const WEEKDAY_FACTOR = [0.5, 0.8, 0.85, 0.9, 1.0, 1.5, 1.8];

const LINE_COUNT_WEIGHTS = [15, 20, 20, 15, 12, 8, 6, 4];

const PAYMENT_WEIGHTS: Array<[PaymentMethod, number]> = [
  ['cash', 50],
  ['multicaixa_express', 22],
  ['card', 16],
  ['mobile_money', 7],
  ['bank_transfer', 5],
];

const HOLD_LABELS = [
  'Cliente de casaco azul',
  'Senhora com carrinho cheio',
  'Cliente foi buscar cartao',
];

export interface PlanOptions {
  rng: Rng;
  now: Date;
  days: number;
  /** Average baskets on an ordinary weekday. */
  baseSalesPerDay: number;
  products: SalesProduct[];
  customers: SalesCustomer[];
  cashiers: Array<{ user: SeededUser; weight: number }>;
  /** Devolucoes need a supervisor, not whoever happened to be on the till. */
  refundUser: SeededUser;
  pricingMode: 'inclusive' | 'exclusive';
  /** Coupon applied to baskets containing this category. */
  couponCode: string;
  couponCategory: string;
  couponBps: number;
}

export function planSales(options: PlanOptions): SalesPlan {
  const { rng, now, days, products, customers, cashiers, pricingMode } = options;
  const sales: PlannedSale[] = [];

  for (let dayOffset = days; dayOffset >= 0; dayOffset -= 1) {
    const day = daysAgo(dayOffset, now);
    const factor = WEEKDAY_FACTOR[day.getDay()] as number;
    const target = options.baseSalesPerDay * factor;
    let count = Math.floor(target) + (rng.chance(target - Math.floor(target)) ? 1 : 0);
    if (dayOffset === 0) count = Math.max(1, Math.round(count / 2)); // today is still in progress

    for (let i = 0; i < count; i += 1) {
      const hour = HOUR_WEIGHTS[rng.weightedIndex(HOUR_WEIGHTS.map(([, w]) => w))]?.[0] ?? 12;
      const date = atTime(day, hour, rng.int(0, 59), rng.int(0, 59));
      if (date.getTime() > now.getTime()) continue;
      sales.push(buildSale(options, date, products, customers, cashiers, pricingMode));
    }
  }

  sales.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Two parked baskets so the "recuperar venda" screen is not empty.
  for (let i = 0; i < 2; i += 1) {
    const held = buildSale(
      options,
      addMinutes(now, -(20 + i * 35)),
      products,
      customers,
      cashiers,
      pricingMode,
    );
    held.status = 'held';
    held.holdLabel = HOLD_LABELS[i] as string;
    held.payments = [];
    held.customer = null;
    sales.push(held);
  }

  const receiptCounters = new Map<number, number>();
  for (const sale of sales) {
    const year = sale.date.getFullYear();
    const next = (receiptCounters.get(year) ?? 0) + 1;
    receiptCounters.set(year, next);
    sale.receiptNumber = documentNumber('FR', year, next);
  }

  const refunds = planRefunds(options, sales).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const refundCounters = new Map<number, number>();
  for (const refund of refunds) {
    const year = refund.date.getFullYear();
    const next = (refundCounters.get(year) ?? 0) + 1;
    refundCounters.set(year, next);
    refund.reference = documentNumber('NC', year, next);
  }

  const soldByProduct = new Map<string, number>();
  for (const sale of sales) {
    if (sale.status !== 'completed') continue;
    for (const line of sale.lines) {
      soldByProduct.set(
        line.product.id,
        round3((soldByProduct.get(line.product.id) ?? 0) + line.quantity),
      );
    }
  }
  for (const refund of refunds) {
    for (const line of refund.lines) {
      if (!line.restocked) continue;
      const product = (refund.sale.lines[line.lineIndex] as PlannedLine).product;
      soldByProduct.set(product.id, round3((soldByProduct.get(product.id) ?? 0) - line.quantity));
    }
  }

  return { sales, refunds, soldByProduct, receiptCounters, refundCounters };
}

function buildSale(
  options: PlanOptions,
  date: Date,
  products: SalesProduct[],
  customers: SalesCustomer[],
  cashiers: Array<{ user: SeededUser; weight: number }>,
  pricingMode: 'inclusive' | 'exclusive',
): PlannedSale {
  const { rng } = options;
  const lineCount = rng.weightedIndex(LINE_COUNT_WEIGHTS) + 1;

  const chosen: SalesProduct[] = [];
  let guard = 0;
  while (chosen.length < lineCount && guard < lineCount * 12) {
    guard += 1;
    const candidate = rng.pickWeighted(products, (p) => p.pop);
    if (chosen.some((p) => p.id === candidate.id)) continue;
    chosen.push(candidate);
  }

  const lines: PlannedLine[] = chosen.map((product) => ({
    product,
    quantity: product.weighted
      ? rng.float(0.2, product.priceMinor > 400_000 ? 1.8 : 3.2, 3)
      : rng.weightedIndex([55, 25, 12, 8]) + 1,
    discount: rng.chance(0.06)
      ? { type: 'percentage', value: rng.pick([500, 1000, 1500]) }
      : null,
  }));

  const lineInputs: LineInput[] = lines.map((line) => ({
    unitPriceMinor: line.product.priceMinor,
    quantity: line.quantity,
    taxRateBps: line.product.taxRateBps,
    pricingMode,
    discount: line.discount,
  }));

  const hasCouponCategory = lines.some((l) => l.product.categoryKey === options.couponCategory);
  const useCoupon = hasCouponCategory && rng.chance(0.08);
  const orderDiscount: LineDiscount | null = useCoupon
    ? { type: 'percentage', value: options.couponBps }
    : rng.chance(0.04)
      ? { type: 'fixed', value: 50_000 }
      : null;

  const totals = computeSeedSale(lineInputs, orderDiscount);
  const cogsMinor = lines.reduce(
    (sum, line) => sum + Math.round(line.product.costMinor * line.quantity),
    0,
  );

  const customer = customers.length > 0 && rng.chance(0.45) ? rng.pick(customers) : null;
  const cashier = rng.pickWeighted(cashiers, (c) => c.weight).user;

  return {
    id: id(),
    date,
    status: 'completed',
    holdLabel: null,
    cashier,
    customer,
    lines,
    totals,
    orderDiscount,
    promotionCode: useCoupon ? options.couponCode : null,
    cogsMinor,
    payments: buildPayments(options.rng, totals.totalMinor),
    lineIds: lines.map(() => id()),
    receiptNumber: '',
  };
}

function buildPayments(rng: Rng, totalMinor: number): PlannedPayment[] {
  const primary = PAYMENT_WEIGHTS[rng.weightedIndex(PAYMENT_WEIGHTS.map(([, w]) => w))]?.[0] ?? 'cash';

  // One basket in twelve is settled with two tenders.
  if (totalMinor > 200_000 && rng.chance(0.08)) {
    const firstAmount = Math.round(totalMinor / 2);
    const second = PAYMENT_WEIGHTS[rng.weightedIndex(PAYMENT_WEIGHTS.map(([, w]) => w))]?.[0] ?? 'card';
    return [
      payment(rng, primary, firstAmount),
      payment(rng, second === primary ? 'cash' : second, totalMinor - firstAmount),
    ];
  }
  return [payment(rng, primary, totalMinor)];
}

function payment(rng: Rng, method: PaymentMethod, amountMinor: number): PlannedPayment {
  if (method === 'cash') {
    const options = suggestTenders(amountMinor, 'AOA');
    const tendered = options[rng.weightedIndex(options.map((_, i) => (i === 0 ? 30 : 20)))] ?? amountMinor;
    return {
      method,
      amountMinor,
      tenderedMinor: tendered,
      changeMinor: Math.max(0, tendered - amountMinor),
      reference: null,
    };
  }
  return {
    method,
    amountMinor,
    tenderedMinor: null,
    changeMinor: null,
    reference:
      method === 'multicaixa_express'
        ? `MCX${rng.int(100000, 999999)}`
        : method === 'card'
          ? `AUT${rng.int(100000, 999999)}`
          : method === 'mobile_money'
            ? `MM${rng.int(1000000, 9999999)}`
            : `TRF${rng.int(10000, 99999)}`,
  };
}

function planRefunds(options: PlanOptions, sales: PlannedSale[]): PlannedRefund[] {
  const { rng, now } = options;
  const eligible = sales.filter(
    (sale) =>
      sale.status === 'completed' &&
      sale.date.getTime() < now.getTime() - 2 * 86_400_000 &&
      sale.date.getTime() > now.getTime() - 60 * 86_400_000,
  );

  const picked = rng.sample(eligible, Math.min(10, eligible.length));
  const refunds: PlannedRefund[] = [];

  for (const sale of picked) {
    const lineIndexes = rng.sample(
      sale.lines.map((_, i) => i),
      rng.int(1, Math.min(2, sale.lines.length)),
    );

    const lines: PlannedRefundLine[] = lineIndexes.map((lineIndex) => {
      const line = sale.lines[lineIndex] as PlannedLine;
      const computed = sale.totals.lines[lineIndex] as SeedSaleTotals['lines'][number];
      const full = line.product.weighted ? true : rng.chance(0.6);
      const quantity = full ? line.quantity : Math.max(1, Math.floor(line.quantity / 2));
      const share = quantity / line.quantity;

      return {
        lineIndex,
        quantity: round3(quantity),
        amountMinor: Math.round(computed.grossMinor * share),
        taxMinor: Math.round(computed.taxMinor * share),
        cogsMinor: Math.round(line.product.costMinor * quantity),
        reason: rng.pick(RETURN_REASONS),
        restocked: rng.chance(0.8),
      };
    });

    const fullyRefunded = sale.lines.every((line, index) => {
      const refundLine = lines.find((l) => l.lineIndex === index);
      return refundLine ? line.quantity - refundLine.quantity <= 0.001 : false;
    });

    // Never let a devolucao land in the future.
    const refundDate = new Date(
      Math.min(addMinutes(sale.date, rng.int(60 * 24, 60 * 24 * 5)).getTime(), now.getTime() - 3_600_000),
    );

    refunds.push({
      id: id(),
      sale,
      date: refundDate,
      reference: '',
      method: rng.chance(0.25) ? 'store_credit' : 'original',
      lines,
      totalMinor: lines.reduce((s, l) => s + l.amountMinor, 0),
      taxMinor: lines.reduce((s, l) => s + l.taxMinor, 0),
      cogsMinor: lines.reduce((s, l) => s + l.cogsMinor, 0),
      user: options.refundUser,
      fullyRefunded,
    });
  }

  // A store-credit refund needs a customer on the sale; downgrade the others.
  for (const refund of refunds) {
    if (refund.method === 'store_credit' && !refund.sale.customer) refund.method = 'cash';
  }
  return refunds;
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

export interface WriteSalesOptions {
  client: PrismaClient;
  entityId: string;
  locationId: string;
  ledger: SeedLedger;
  plan: SalesPlan;
  /** Centimos of spend that earn one loyalty point. */
  loyaltyEarnPerMinor: number;
  vipThresholds: Record<Exclude<VipTier, 'none'>, number>;
}

export interface SalesWriteResult {
  sales: number;
  saleLines: number;
  payments: number;
  refunds: number;
  loyaltyTransactions: number;
}

export async function writeSales(options: WriteSalesOptions): Promise<SalesWriteResult> {
  const { client, entityId, locationId, ledger, plan } = options;

  const saleRows: Prisma.SaleCreateManyInput[] = [];
  const lineRows: Prisma.SaleLineCreateManyInput[] = [];
  const paymentRows: Prisma.PaymentCreateManyInput[] = [];
  const loyaltyRows: Prisma.LoyaltyTransactionCreateManyInput[] = [];

  const refundsBySale = new Map<string, PlannedRefund[]>();
  for (const refund of plan.refunds) {
    const list = refundsBySale.get(refund.sale.id) ?? [];
    list.push(refund);
    refundsBySale.set(refund.sale.id, list);
  }

  const points = new Map<string, number>();
  const spend = new Map<string, number>();
  const orders = new Map<string, number>();
  const lastPurchase = new Map<string, Date>();
  const storeCredit = new Map<string, number>();

  for (const sale of plan.sales) {
    const refunds = refundsBySale.get(sale.id) ?? [];
    const status =
      sale.status === 'held'
        ? 'held'
        : refunds.length === 0
          ? 'completed'
          : refunds.some((r) => r.fullyRefunded)
            ? 'refunded'
            : 'partially_refunded';

    saleRows.push({
      id: sale.id,
      entityId,
      locationId,
      receiptNumber: sale.receiptNumber,
      channel: 'pos',
      status,
      cashierId: sale.cashier.id,
      cashierName: sale.cashier.name,
      customerId: sale.customer?.id ?? null,
      subtotalMinor: money(sale.totals.subtotalMinor),
      discountMinor: money(sale.totals.discountMinor),
      netMinor: money(sale.totals.netMinor),
      taxMinor: money(sale.totals.taxMinor),
      totalMinor: money(sale.totals.totalMinor),
      changeMinor: money(sale.payments.reduce((s, p) => s + (p.changeMinor ?? 0), 0)),
      cogsMinor: money(sale.cogsMinor),
      taxBreakdown: JSON.stringify(sale.totals.taxBreakdown),
      orderDiscountType: sale.orderDiscount?.type ?? null,
      orderDiscountValue: sale.orderDiscount?.value ?? null,
      promotionCode: sale.promotionCode,
      holdLabel: sale.holdLabel,
      createdAt: sale.date,
      completedAt: sale.status === 'held' ? null : sale.date,
    });

    const refundedQuantities = new Map<number, number>();
    for (const refund of refunds) {
      for (const line of refund.lines) {
        refundedQuantities.set(
          line.lineIndex,
          round3((refundedQuantities.get(line.lineIndex) ?? 0) + line.quantity),
        );
      }
    }

    sale.lines.forEach((line, index) => {
      const computed = sale.totals.lines[index] as SeedSaleTotals['lines'][number];
      lineRows.push({
        id: sale.lineIds[index] as string,
        saleId: sale.id,
        productId: line.product.id,
        name: line.product.name,
        sku: line.product.sku,
        unit: line.product.unit,
        quantity: round3(line.quantity),
        unitPriceMinor: money(line.product.priceMinor),
        unitCostMinor: money(line.product.costMinor),
        discountMinor: money(computed.discountMinor),
        taxRateBps: line.product.taxRateBps,
        netMinor: money(computed.netMinor),
        taxMinor: money(computed.taxMinor),
        totalMinor: money(computed.grossMinor),
        refundedQuantity: refundedQuantities.get(index) ?? 0,
        sortOrder: index,
      });
    });

    for (const p of sale.payments) {
      paymentRows.push({
        id: id(),
        saleId: sale.id,
        method: p.method,
        amountMinor: money(p.amountMinor),
        tenderedMinor: p.tenderedMinor != null ? money(p.tenderedMinor) : null,
        changeMinor: p.changeMinor != null ? money(p.changeMinor) : null,
        reference: p.reference,
        status:
          status === 'refunded'
            ? 'refunded'
            : status === 'partially_refunded'
              ? 'partially_refunded'
              : 'confirmed',
        createdAt: sale.date,
      });
    }

    if (sale.status !== 'completed') continue;

    // Stock leaves the shelf at the moment of sale.
    for (const line of sale.lines) {
      ledger.move({
        productId: line.product.id,
        locationId,
        quantity: -line.quantity,
        type: 'sale',
        unitCostMinor: line.product.costMinor,
        reference: sale.receiptNumber,
        userId: sale.cashier.id,
        userName: sale.cashier.name,
        createdAt: sale.date,
      });
    }

    if (sale.customer) {
      const customerId = sale.customer.id;
      const earned = Math.floor(sale.totals.totalMinor / Math.max(1, options.loyaltyEarnPerMinor));
      spend.set(customerId, (spend.get(customerId) ?? 0) + sale.totals.totalMinor);
      orders.set(customerId, (orders.get(customerId) ?? 0) + 1);
      const previous = lastPurchase.get(customerId);
      if (!previous || previous < sale.date) lastPurchase.set(customerId, sale.date);

      if (sale.customer.loyalty && earned > 0) {
        const balance = (points.get(customerId) ?? 0) + earned;
        points.set(customerId, balance);
        loyaltyRows.push({
          id: id(),
          customerId,
          type: 'earn',
          points: earned,
          balanceAfter: balance,
          saleId: sale.id,
          note: `Venda ${sale.receiptNumber}`,
          createdAt: sale.date,
        });
      }
    }
  }

  await createManyChunked(saleRows, (batch) => client.sale.createMany({ data: batch }));
  await createManyChunked(lineRows, (batch) => client.saleLine.createMany({ data: batch }));
  await createManyChunked(paymentRows, (batch) => client.payment.createMany({ data: batch }));

  /* -- Refunds ------------------------------------------------------------- */
  const refundRows: Prisma.RefundCreateManyInput[] = [];
  const refundLineRows: Prisma.RefundLineCreateManyInput[] = [];

  for (const refund of plan.refunds) {
    refundRows.push({
      id: refund.id,
      entityId,
      saleId: refund.sale.id,
      reference: refund.reference,
      totalMinor: money(refund.totalMinor),
      taxMinor: money(refund.taxMinor),
      cogsMinor: money(refund.cogsMinor),
      method: refund.method,
      note: null,
      userId: refund.user.id,
      userName: refund.user.name,
      createdAt: refund.date,
    });

    for (const line of refund.lines) {
      const saleLine = refund.sale.lines[line.lineIndex] as PlannedLine;
      refundLineRows.push({
        id: id(),
        refundId: refund.id,
        saleLineId: refund.sale.lineIds[line.lineIndex] as string,
        quantity: line.quantity,
        amountMinor: money(line.amountMinor),
        reason: line.reason,
        restocked: line.restocked,
      });

      if (line.restocked) {
        ledger.move({
          productId: saleLine.product.id,
          locationId,
          quantity: line.quantity,
          type: 'refund',
          unitCostMinor: saleLine.product.costMinor,
          reference: refund.reference,
          note: `Devolucao ${refund.reference} da venda ${refund.sale.receiptNumber}`,
          userId: refund.user.id,
          userName: refund.user.name,
          createdAt: refund.date,
        });
      }
    }

    if (refund.method === 'store_credit' && refund.sale.customer) {
      const customerId = refund.sale.customer.id;
      storeCredit.set(customerId, (storeCredit.get(customerId) ?? 0) + refund.totalMinor);
    }
    if (refund.sale.customer) {
      const customerId = refund.sale.customer.id;
      spend.set(customerId, Math.max(0, (spend.get(customerId) ?? 0) - refund.totalMinor));
    }
  }

  await createManyChunked(refundRows, (batch) => client.refund.createMany({ data: batch }));
  await createManyChunked(refundLineRows, (batch) => client.refundLine.createMany({ data: batch }));
  await createManyChunked(loyaltyRows, (batch) =>
    client.loyaltyTransaction.createMany({ data: batch }),
  );

  /* -- Customer rollups ----------------------------------------------------- */
  const customerIds = new Set<string>([...spend.keys(), ...points.keys(), ...storeCredit.keys()]);
  for (const customerId of customerIds) {
    const existing = await client.customer.findUnique({
      where: { id: customerId },
      select: { lifetimeSpendMinor: true, points: true, orderCount: true },
    });
    const lifetime = Number(existing?.lifetimeSpendMinor ?? 0n) + (spend.get(customerId) ?? 0);
    await client.customer.update({
      where: { id: customerId },
      data: {
        lifetimeSpendMinor: money(lifetime),
        points: (existing?.points ?? 0) + (points.get(customerId) ?? 0),
        orderCount: (existing?.orderCount ?? 0) + (orders.get(customerId) ?? 0),
        lastPurchaseAt: lastPurchase.get(customerId) ?? null,
        storeCreditMinor: money(storeCredit.get(customerId) ?? 0),
        tier: tierFor(lifetime, options.vipThresholds),
      },
    });
  }

  return {
    sales: saleRows.length,
    saleLines: lineRows.length,
    payments: paymentRows.length,
    refunds: refundRows.length,
    loyaltyTransactions: loyaltyRows.length,
  };
}

export function tierFor(
  lifetimeMinor: number,
  thresholds: Record<Exclude<VipTier, 'none'>, number>,
): VipTier {
  if (lifetimeMinor >= thresholds.gold) return 'gold';
  if (lifetimeMinor >= thresholds.silver) return 'silver';
  if (lifetimeMinor >= thresholds.bronze) return 'bronze';
  return 'none';
}

async function createManyChunked<T>(
  rows: T[],
  write: (batch: T[]) => Promise<unknown>,
  size = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await write(rows.slice(i, i + size));
  }
}
