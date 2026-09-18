import type {
  CustomerDto,
  LoyaltyTxType,
  SaleChannel,
  SaleStatus,
  VipTier,
} from '@pos/shared';

/**
 * Response shapes served by apps/api/src/modules/customers/routes.ts that are
 * not part of the shared DTO contract. They live here rather than in
 * packages/shared because only the CRM screens consume them.
 */

export interface CustomerPurchase {
  id: string;
  receiptNumber: string;
  channel: SaleChannel;
  status: SaleStatus;
  /** completedAt when the sale closed, otherwise createdAt. */
  date: string;
  totalMinor: number;
  itemCount: number;
  /** Only present for callers holding product:cost - never assume it is there. */
  cogsMinor?: number;
}

export interface LoyaltyTransaction {
  id: string;
  type: LoyaltyTxType;
  /** Signed: positive credits the customer, negative debits them. */
  points: number;
  balanceAfter: number;
  saleId: string | null;
  note: string | null;
  createdAt: string;
}

/** GET /api/customers/:id */
export interface CustomerDetail extends CustomerDto {
  recentPurchases: CustomerPurchase[];
  loyaltyTransactions: LoyaltyTransaction[];
}

export interface TierConfigEntry {
  tier: VipTier;
  label: string;
  /** Lifetime spend, in minor units, required to reach the tier. */
  thresholdMinor: number;
  customerCount: number;
}

/** GET /api/customers/tiers */
export interface TierConfig {
  /** Minor units of spend that earn one point. */
  loyaltyEarnPerMinor: number;
  /** What one point is worth, in minor units. */
  loyaltyPointValueMinor: number;
  tiers: TierConfigEntry[];
}

export interface RetentionBucket {
  customers: number;
  orders: number;
  revenueMinor: number;
  averageOrderValueMinor: number;
}

/** GET /api/customers/reports/retention */
export interface RetentionReport {
  from: string;
  to: string;
  new: RetentionBucket;
  returning: RetentionBucket;
  anonymous: RetentionBucket;
  totals: {
    identifiedCustomers: number;
    orders: number;
    revenueMinor: number;
    averageOrderValueMinor: number;
    returningRateBps: number;
  };
}

export interface LoyaltyAdjustResult {
  customer: CustomerDto;
  transaction: LoyaltyTransaction;
}

export interface StoreCreditResult {
  customer: CustomerDto;
  previousMinor: number;
  amountMinor: number;
  storeCreditMinor: number;
  note: string | null;
}

/* -------------------------------------------------------------------------- */
/* Forms and list state                                                        */
/* -------------------------------------------------------------------------- */

export interface CustomerFormValues {
  name: string;
  phone: string;
  email: string;
  nif: string;
  address: string;
  notes: string;
  loyaltyCardNumber: string;
  active: boolean;
}

export const emptyCustomerForm = (): CustomerFormValues => ({
  name: '',
  phone: '',
  email: '',
  nif: '',
  address: '',
  notes: '',
  loyaltyCardNumber: '',
  active: true,
});

export const customerToForm = (customer: CustomerDto): CustomerFormValues => ({
  name: customer.name,
  phone: customer.phone ?? '',
  email: customer.email ?? '',
  nif: customer.nif ?? '',
  address: customer.address ?? '',
  notes: customer.notes ?? '',
  loyaltyCardNumber: customer.loyaltyCardNumber ?? '',
  active: customer.active,
});

/**
 * Empty strings are sent as-is: the API preprocesses "" into null, so clearing
 * a field in the form actually clears it on the server.
 */
export const formToPayload = (values: CustomerFormValues): Record<string, unknown> => ({
  name: values.name.trim(),
  phone: values.phone.trim(),
  email: values.email.trim(),
  nif: values.nif.trim(),
  address: values.address.trim(),
  notes: values.notes.trim(),
  loyaltyCardNumber: values.loyaltyCardNumber.trim(),
  active: values.active,
});

export type CustomerSort = 'name' | 'spend' | 'lastPurchase' | 'created';

export interface CustomerListParams {
  page: number;
  pageSize: number;
  search: string;
  tier: VipTier | 'all';
  active: 'all' | 'true' | 'false';
  sort: CustomerSort;
  order: 'asc' | 'desc';
}

export const defaultListParams = (): CustomerListParams => ({
  page: 1,
  pageSize: 20,
  search: '',
  tier: 'all',
  active: 'all',
  sort: 'spend',
  order: 'desc',
});
