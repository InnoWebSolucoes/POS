import type {
  CustomerDto,
  LoyaltyTxType,
  SaleChannel,
  SaleStatus,
  VipTier,
} from '@pos/shared';

/**
 * Structural shapes rather than Prisma payload generics, so a `select` that
 * happens to return exactly these columns maps without any casting.
 */
export interface CustomerRecord {
  id: string;
  entityId: string;
  name: string;
  phone: string | null;
  email: string | null;
  nif: string | null;
  address: string | null;
  loyaltyCardNumber: string | null;
  points: number;
  tier: string;
  lifetimeSpendMinor: bigint | number;
  storeCreditMinor: bigint | number;
  orderCount: number;
  lastPurchaseAt: Date | null;
  notes: string | null;
  active: boolean;
  createdAt: Date;
}

export function toCustomerDto(row: CustomerRecord): CustomerDto {
  return {
    id: row.id,
    entityId: row.entityId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    nif: row.nif,
    address: row.address,
    loyaltyCardNumber: row.loyaltyCardNumber,
    points: row.points,
    tier: (row.tier || 'none') as VipTier,
    lifetimeSpendMinor: Number(row.lifetimeSpendMinor),
    storeCreditMinor: Number(row.storeCreditMinor),
    orderCount: row.orderCount,
    lastPurchaseAt: row.lastPurchaseAt ? row.lastPurchaseAt.toISOString() : null,
    notes: row.notes,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The columns a CustomerDto actually needs - keeps the lookup payload small. */
export const CUSTOMER_SELECT = {
  id: true,
  entityId: true,
  name: true,
  phone: true,
  email: true,
  nif: true,
  address: true,
  loyaltyCardNumber: true,
  points: true,
  tier: true,
  lifetimeSpendMinor: true,
  storeCreditMinor: true,
  orderCount: true,
  lastPurchaseAt: true,
  notes: true,
  active: true,
  createdAt: true,
} as const;

/* -------------------------------------------------------------------------- */
/* Purchase history                                                            */
/* -------------------------------------------------------------------------- */

/** A trimmed SaleDto: everything a CRM screen shows, nothing it does not. */
export interface CustomerPurchaseSummary {
  id: string;
  receiptNumber: string;
  channel: SaleChannel;
  status: SaleStatus;
  /** ISO timestamp - completedAt when the sale closed, otherwise createdAt. */
  date: string;
  totalMinor: number;
  itemCount: number;
  /** Only ever present for callers holding `product:cost`. */
  cogsMinor?: number;
}

export interface SaleSummaryRecord {
  id: string;
  receiptNumber: string;
  channel: string;
  status: string;
  totalMinor: bigint | number;
  cogsMinor: bigint | number;
  createdAt: Date;
  completedAt: Date | null;
  _count: { lines: number };
}

export const SALE_SUMMARY_SELECT = {
  id: true,
  receiptNumber: true,
  channel: true,
  status: true,
  totalMinor: true,
  cogsMinor: true,
  createdAt: true,
  completedAt: true,
  _count: { select: { lines: true } },
} as const;

export function toPurchaseSummary(
  row: SaleSummaryRecord,
  includeCost: boolean,
): CustomerPurchaseSummary {
  const summary: CustomerPurchaseSummary = {
    id: row.id,
    receiptNumber: row.receiptNumber,
    channel: row.channel as SaleChannel,
    status: row.status as SaleStatus,
    date: (row.completedAt ?? row.createdAt).toISOString(),
    totalMinor: Number(row.totalMinor),
    itemCount: row._count.lines,
  };
  if (includeCost) summary.cogsMinor = Number(row.cogsMinor);
  return summary;
}

/* -------------------------------------------------------------------------- */
/* Loyalty ledger                                                              */
/* -------------------------------------------------------------------------- */

export interface LoyaltyTransactionDto {
  id: string;
  type: LoyaltyTxType;
  points: number;
  balanceAfter: number;
  saleId: string | null;
  note: string | null;
  createdAt: string;
}

export interface LoyaltyTransactionRecord {
  id: string;
  type: string;
  points: number;
  balanceAfter: number;
  saleId: string | null;
  note: string | null;
  createdAt: Date;
}

export function toLoyaltyTransactionDto(row: LoyaltyTransactionRecord): LoyaltyTransactionDto {
  return {
    id: row.id,
    type: row.type as LoyaltyTxType,
    points: row.points,
    balanceAfter: row.balanceAfter,
    saleId: row.saleId,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
