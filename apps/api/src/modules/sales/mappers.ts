import type {
  CartModifier,
  HeldSaleDto,
  PaymentDto,
  SaleChannel,
  SaleDto,
  SaleLineDto,
  SaleStatus,
  Unit,
} from '@pos/shared';

/**
 * Row shapes are described structurally rather than with Prisma payload
 * generics so that a query may select more (or fewer optional relations) than a
 * given mapper needs without the types fighting each other.
 */

export interface SaleLineRow {
  id: string;
  productId: string | null;
  variantId: string | null;
  name: string;
  sku: string | null;
  unit: string;
  quantity: number;
  unitPriceMinor: bigint;
  unitCostMinor: bigint;
  discountMinor: bigint;
  taxRateBps: number;
  netMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  modifiers: string;
  note: string | null;
  refundedQuantity: number;
  sortOrder: number;
}

export interface PaymentRow {
  id: string;
  method: string;
  label: string | null;
  amountMinor: bigint;
  tenderedMinor: bigint | null;
  changeMinor: bigint | null;
  reference: string | null;
  status: string;
  createdAt: Date;
}

export interface RefundLineRow {
  id: string;
  saleLineId: string;
  quantity: number;
  amountMinor: bigint;
  reason: string;
  restocked: boolean;
  saleLine?: { id: string; name: string; sku: string | null; unit: string; productId: string | null } | null;
}

export interface RefundRow {
  id: string;
  entityId: string;
  saleId: string;
  reference: string;
  totalMinor: bigint;
  taxMinor: bigint;
  cogsMinor: bigint;
  method: string;
  note: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: Date;
  lines?: RefundLineRow[];
  sale?: { id: string; receiptNumber: string; customerId: string | null } | null;
}

export interface SaleRow {
  id: string;
  entityId: string;
  locationId: string | null;
  receiptNumber: string;
  channel: string;
  status: string;
  cashierId: string | null;
  cashierName: string | null;
  customerId: string | null;
  orderId: string | null;
  subtotalMinor: bigint;
  discountMinor: bigint;
  netMinor: bigint;
  taxMinor: bigint;
  tipMinor: bigint;
  totalMinor: bigint;
  changeMinor: bigint;
  cogsMinor: bigint;
  taxBreakdown: string;
  orderDiscountType: string | null;
  orderDiscountValue: number | null;
  promotionCode: string | null;
  holdLabel: string | null;
  receiptEmail: string | null;
  receiptPhone: string | null;
  receiptSentAt: Date | null;
  note: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  completedAt: Date | null;
  lines?: SaleLineRow[];
  payments?: PaymentRow[];
  refunds?: RefundRow[];
  customer?: { id: string; name: string } | null;
  cashier?: { id: string; name: string } | null;
}

export interface RefundLineDto {
  id: string;
  saleLineId: string;
  productId: string | null;
  name: string | null;
  sku: string | null;
  quantity: number;
  amountMinor: number;
  reason: string;
  restocked: boolean;
}

export interface RefundDto {
  id: string;
  entityId: string;
  saleId: string;
  receiptNumber: string | null;
  reference: string;
  totalMinor: number;
  taxMinor: number;
  cogsMinor?: number;
  method: string;
  note: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
  lines: RefundLineDto[];
}

export type SaleDetailDto = SaleDto & { refunds: RefundDto[] };

/** Prisma include used everywhere a full sale is loaded. */
export const saleInclude = {
  lines: { orderBy: { sortOrder: 'asc' as const } },
  payments: { orderBy: { createdAt: 'asc' as const } },
  refunds: { include: { lines: true }, orderBy: { createdAt: 'desc' as const } },
  cashier: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
};

/** Lighter include for list endpoints - a history row never shows refund lines. */
export const saleListInclude = {
  lines: { orderBy: { sortOrder: 'asc' as const } },
  payments: { orderBy: { createdAt: 'asc' as const } },
  customer: { select: { id: true, name: true } },
};

export const refundInclude = {
  lines: {
    include: {
      saleLine: { select: { id: true, name: true, sku: true, unit: true, productId: true } },
    },
  },
  sale: { select: { id: true, receiptNumber: true, customerId: true } },
};

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function toCartModifiers(raw: string | null | undefined): CartModifier[] {
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
    .map((m) => ({
      modifierId: String(m.modifierId ?? ''),
      name: String(m.name ?? ''),
      priceDeltaMinor: Number(m.priceDeltaMinor ?? 0),
    }));
}

export interface TaxBreakdownRow {
  rateBps: number;
  netMinor: number;
  taxMinor: number;
}

export function toTaxBreakdown(raw: string | null | undefined): TaxBreakdownRow[] {
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .map((r) => ({
      rateBps: Number(r.rateBps ?? 0),
      netMinor: Number(r.netMinor ?? 0),
      taxMinor: Number(r.taxMinor ?? 0),
    }));
}

export function toSaleLineDto(line: SaleLineRow, includeCost: boolean): SaleLineDto {
  return {
    id: line.id,
    productId: line.productId,
    variantId: line.variantId,
    name: line.name,
    sku: line.sku,
    unit: line.unit as Unit,
    quantity: line.quantity,
    unitPriceMinor: Number(line.unitPriceMinor),
    ...(includeCost ? { unitCostMinor: Number(line.unitCostMinor) } : {}),
    discountMinor: Number(line.discountMinor),
    taxRateBps: line.taxRateBps,
    netMinor: Number(line.netMinor),
    taxMinor: Number(line.taxMinor),
    totalMinor: Number(line.totalMinor),
    modifiers: toCartModifiers(line.modifiers),
    note: line.note,
    refundedQuantity: line.refundedQuantity,
  };
}

export function toPaymentDto(payment: PaymentRow): PaymentDto {
  return {
    id: payment.id,
    method: payment.method as PaymentDto['method'],
    label: payment.label,
    amountMinor: Number(payment.amountMinor),
    tenderedMinor: payment.tenderedMinor == null ? null : Number(payment.tenderedMinor),
    changeMinor: payment.changeMinor == null ? null : Number(payment.changeMinor),
    reference: payment.reference,
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
  };
}

export function toRefundDto(refund: RefundRow, includeCost: boolean): RefundDto {
  return {
    id: refund.id,
    entityId: refund.entityId,
    saleId: refund.saleId,
    receiptNumber: refund.sale?.receiptNumber ?? null,
    reference: refund.reference,
    totalMinor: Number(refund.totalMinor),
    taxMinor: Number(refund.taxMinor),
    ...(includeCost ? { cogsMinor: Number(refund.cogsMinor) } : {}),
    method: refund.method,
    note: refund.note,
    userId: refund.userId,
    userName: refund.userName,
    createdAt: refund.createdAt.toISOString(),
    lines: (refund.lines ?? []).map((line) => ({
      id: line.id,
      saleLineId: line.saleLineId,
      productId: line.saleLine?.productId ?? null,
      name: line.saleLine?.name ?? null,
      sku: line.saleLine?.sku ?? null,
      quantity: line.quantity,
      amountMinor: Number(line.amountMinor),
      reason: line.reason,
      restocked: line.restocked,
    })),
  };
}

export function toSaleDto(sale: SaleRow, includeCost: boolean): SaleDto {
  return {
    id: sale.id,
    entityId: sale.entityId,
    locationId: sale.locationId,
    receiptNumber: sale.receiptNumber,
    channel: sale.channel as SaleChannel,
    status: sale.status as SaleStatus,
    cashierId: sale.cashierId,
    cashierName: sale.cashierName ?? sale.cashier?.name ?? null,
    customerId: sale.customerId,
    customerName: sale.customer?.name ?? null,
    subtotalMinor: Number(sale.subtotalMinor),
    discountMinor: Number(sale.discountMinor),
    netMinor: Number(sale.netMinor),
    taxMinor: Number(sale.taxMinor),
    tipMinor: Number(sale.tipMinor),
    totalMinor: Number(sale.totalMinor),
    changeMinor: Number(sale.changeMinor),
    ...(includeCost ? { cogsMinor: Number(sale.cogsMinor) } : {}),
    lines: (sale.lines ?? []).map((line) => toSaleLineDto(line, includeCost)),
    payments: (sale.payments ?? []).map(toPaymentDto),
    taxBreakdown: toTaxBreakdown(sale.taxBreakdown),
    note: sale.note,
    createdAt: sale.createdAt.toISOString(),
    completedAt: sale.completedAt ? sale.completedAt.toISOString() : null,
  };
}

export function toSaleDetailDto(sale: SaleRow, includeCost: boolean): SaleDetailDto {
  return {
    ...toSaleDto(sale, includeCost),
    refunds: (sale.refunds ?? []).map((refund) => toRefundDto(refund, includeCost)),
  };
}

export function toHeldSaleDto(sale: SaleRow): HeldSaleDto {
  return {
    id: sale.id,
    label: sale.holdLabel ?? 'Venda suspensa',
    lineCount: sale.lines?.length ?? 0,
    totalMinor: Number(sale.totalMinor),
    cashierName: sale.cashierName ?? sale.cashier?.name ?? null,
    customerName: sale.customer?.name ?? null,
    createdAt: sale.createdAt.toISOString(),
  };
}
