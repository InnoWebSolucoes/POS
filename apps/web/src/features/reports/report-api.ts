import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { SaleChannel } from '@pos/shared';

import type { DateRange } from '@/components/ui';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

/**
 * One filter language for every reporting screen, matching
 * `reportFiltersSchema` in apps/api/src/modules/reports/schemas.ts.
 *
 * Cost-bearing fields (cogsMinor, profitMinor, marginBps, ...) are declared
 * OPTIONAL on purpose: the API deletes them from the payload for a caller
 * without `report:financial` rather than zeroing them, so every screen has to
 * cope with them being absent.
 */

export type Granularity = 'hour' | 'day' | 'week' | 'month';
export const GRANULARITIES: Granularity[] = ['hour', 'day', 'week', 'month'];
export const GRANULARITY_LABELS: Record<Granularity, string> = {
  hour: 'Hora',
  day: 'Dia',
  week: 'Semana',
  month: 'Mes',
};

export type ProductSort = 'revenue' | 'profit' | 'margin' | 'quantity';

export const WEEKDAYS_PT = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
export const WEEKDAYS_SHORT_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

export interface ReportFilterState {
  range: DateRange;
  locationId?: string;
  userId?: string;
  categoryId?: string;
  channel?: SaleChannel;
}

/** The query string every reporting endpoint accepts. */
export function filterQuery(filters: ReportFilterState): Record<string, unknown> {
  return {
    from: filters.range.from,
    to: filters.range.to,
    locationId: filters.locationId || undefined,
    userId: filters.userId || undefined,
    categoryId: filters.categoryId || undefined,
    channel: filters.channel || undefined,
  };
}

/** Sensible bucket size for a window, so a year does not render 365 ticks. */
export function defaultGranularity(range: DateRange): Granularity {
  const from = new Date(`${range.from}T00:00:00`).getTime();
  const to = new Date(`${range.to}T23:59:59`).getTime();
  const days = Math.max(1, Math.round((to - from) / 86_400_000));
  if (days <= 2) return 'hour';
  if (days <= 62) return 'day';
  if (days <= 365) return 'week';
  return 'month';
}

/* -------------------------------------------------------------------------- */
/* Response shapes                                                             */
/* -------------------------------------------------------------------------- */

export interface ReportMeta {
  from: string;
  to: string;
  truncated: boolean;
  salesConsidered: number;
  maxRows: number;
}

export interface ReportSummary {
  revenueMinor: number;
  discountMinor: number;
  refundMinor: number;
  taxMinor: number;
  transactionCount: number;
  averageTicketMinor: number;
  itemsSold: number;
  /** Absent without report:financial. */
  cogsMinor?: number;
  grossProfitMinor?: number;
  grossMarginBps?: number;
}

export interface DashboardReport extends ReportSummary {
  previous: ReportSummary;
  meta: ReportMeta & { previousFrom: string; previousTo: string };
}

export interface SeriesPoint {
  bucket: string;
  revenueMinor: number;
  transactions: number;
  cogsMinor?: number;
  profitMinor?: number;
}

export interface BreakdownRow {
  id: string;
  label: string;
  revenueMinor: number;
  quantity: number;
  share: number;
  cogsMinor?: number;
  profitMinor?: number;
  marginBps?: number;
}

export interface StaffRow extends BreakdownRow {
  transactions: number;
  averageTicketMinor: number;
  itemsSold: number;
  tipsMinor: number;
}

export interface PaymentRow extends BreakdownRow {
  method: string;
  transactions: number;
  refundMinor: number;
}

export interface DayOfWeekRow {
  dayOfWeek: number;
  label: string;
  revenueMinor: number;
  transactions: number;
  itemsSold: number;
  averageTicketMinor: number;
  share: number;
  cogsMinor?: number;
  profitMinor?: number;
  marginBps?: number;
}

export interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  revenueMinor: number;
  transactions: number;
}

export interface ValuationRow {
  id: string;
  label: string;
  productCount: number;
  quantity: number;
  retailValueMinor: number;
  marginBps: number;
  share: number;
  costValueMinor?: number;
  potentialProfitMinor?: number;
}

export interface ValuationReport {
  rows: ValuationRow[];
  total: {
    productCount: number;
    quantity: number;
    retailValueMinor: number;
    marginBps: number;
    costValueMinor?: number;
    potentialProfitMinor?: number;
  };
  truncated: boolean;
}

export interface DeadStockRow {
  productId: string;
  sku: string;
  name: string;
  categoryName: string;
  quantity: number;
  retailValueMinor: number;
  lastSoldAt: string | null;
  daysSinceSale: number | null;
  unitCostMinor?: number;
  tiedUpCapitalMinor?: number;
}

export interface DeadStockReport {
  rows: DeadStockRow[];
  totalTiedUpMinor: number;
  days: number;
  truncated: boolean;
}

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
  repeatRateBps: number;
  summary: ReportSummary;
  meta: ReportMeta;
}

export interface ProfitAndLossReport {
  summary: ReportSummary;
  series: SeriesPoint[];
  byCategory: BreakdownRow[];
  byProduct: BreakdownRow[];
  byStaff: StaffRow[];
  byPaymentMethod: PaymentRow[];
  hourlyHeatmap: HeatmapCell[];
  losses: { discountsMinor: number; refundsMinor: number; wasteMinor: number };
  meta: ReportMeta & { wasteTruncated: boolean };
}

interface Envelope<T> {
  data: T;
  meta: ReportMeta;
}

export interface PageEnvelope<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                       */
/* -------------------------------------------------------------------------- */

export function useDashboardReport(
  filters: ReportFilterState,
  enabled = true,
): UseQueryResult<DashboardReport> {
  const query = filterQuery(filters);
  return useQuery({
    queryKey: qk.reports('dashboard', query),
    queryFn: () => api.get<DashboardReport>('/api/reports/dashboard', query),
    enabled,
  });
}

export function useSalesSeries(
  filters: ReportFilterState,
  granularity: Granularity,
  enabled = true,
): UseQueryResult<{ granularity: Granularity; data: SeriesPoint[]; meta: ReportMeta }> {
  const query = { ...filterQuery(filters), granularity };
  return useQuery({
    queryKey: qk.reports('sales-series', query),
    queryFn: () =>
      api.get<{ granularity: Granularity; data: SeriesPoint[]; meta: ReportMeta }>(
        '/api/reports/sales/series',
        query,
      ),
    enabled,
  });
}

export function useSalesByCategory(
  filters: ReportFilterState,
  enabled = true,
): UseQueryResult<Envelope<BreakdownRow[]>> {
  const query = filterQuery(filters);
  return useQuery({
    queryKey: qk.reports('sales-by-category', query),
    queryFn: () => api.get<Envelope<BreakdownRow[]>>('/api/reports/sales/by-category', query),
    enabled,
  });
}

export function useSalesByProduct(
  filters: ReportFilterState,
  options: { limit?: number; sort?: ProductSort } = {},
  enabled = true,
): UseQueryResult<Envelope<BreakdownRow[]> & { sort: ProductSort; limit: number }> {
  const query = { ...filterQuery(filters), limit: options.limit ?? 50, sort: options.sort ?? 'revenue' };
  return useQuery({
    queryKey: qk.reports('sales-by-product', query),
    queryFn: () =>
      api.get<Envelope<BreakdownRow[]> & { sort: ProductSort; limit: number }>(
        '/api/reports/sales/by-product',
        query,
      ),
    enabled,
  });
}

export function useSalesByStaff(
  filters: ReportFilterState,
  enabled = true,
): UseQueryResult<Envelope<StaffRow[]>> {
  const query = filterQuery(filters);
  return useQuery({
    queryKey: qk.reports('sales-by-staff', query),
    queryFn: () => api.get<Envelope<StaffRow[]>>('/api/reports/sales/by-staff', query),
    enabled,
  });
}

export function useSalesByPaymentMethod(
  filters: ReportFilterState,
  enabled = true,
): UseQueryResult<Envelope<PaymentRow[]>> {
  const query = filterQuery(filters);
  return useQuery({
    queryKey: qk.reports('sales-by-payment', query),
    queryFn: () => api.get<Envelope<PaymentRow[]>>('/api/reports/sales/by-payment-method', query),
    enabled,
  });
}

export function useSalesHeatmap(
  filters: ReportFilterState,
  enabled = true,
): UseQueryResult<Envelope<HeatmapCell[]>> {
  const query = filterQuery(filters);
  return useQuery({
    queryKey: qk.reports('sales-heatmap', query),
    queryFn: () => api.get<Envelope<HeatmapCell[]>>('/api/reports/sales/heatmap', query),
    enabled,
  });
}

export function useSalesByDayOfWeek(
  filters: ReportFilterState,
  enabled = true,
): UseQueryResult<Envelope<DayOfWeekRow[]>> {
  const query = filterQuery(filters);
  return useQuery({
    queryKey: qk.reports('sales-by-dow', query),
    queryFn: () => api.get<Envelope<DayOfWeekRow[]>>('/api/reports/sales/by-day-of-week', query),
    enabled,
  });
}

export function useProfitAndLoss(
  filters: ReportFilterState,
  granularity: Granularity,
  enabled = true,
): UseQueryResult<ProfitAndLossReport> {
  const query = { ...filterQuery(filters), granularity };
  return useQuery({
    queryKey: qk.reports('profit-loss', query),
    queryFn: () => api.get<ProfitAndLossReport>('/api/reports/profit-loss', query),
    enabled,
  });
}

export function useInventoryValuation(
  filters: ReportFilterState,
  enabled = true,
): UseQueryResult<ValuationReport> {
  const query = filterQuery(filters);
  return useQuery({
    queryKey: qk.reports('inventory-valuation', query),
    queryFn: () => api.get<ValuationReport>('/api/reports/inventory/valuation', query),
    enabled,
  });
}

export function useReportDeadStock(
  filters: ReportFilterState,
  days = 90,
  enabled = true,
): UseQueryResult<DeadStockReport> {
  const query = { ...filterQuery(filters), days, limit: 100 };
  return useQuery({
    queryKey: qk.reports('dead-stock', query),
    queryFn: () => api.get<DeadStockReport>('/api/reports/inventory/dead-stock', query),
    enabled,
  });
}

export function useTopCustomers(
  filters: ReportFilterState,
  limit = 25,
  enabled = true,
): UseQueryResult<Envelope<TopCustomerRow[]>> {
  const query = { ...filterQuery(filters), limit };
  return useQuery({
    queryKey: qk.reports('top-customers', query),
    queryFn: () => api.get<Envelope<TopCustomerRow[]>>('/api/reports/customers/top', query),
    enabled,
  });
}

export function useCustomerRetention(
  filters: ReportFilterState,
  enabled = true,
): UseQueryResult<RetentionReport> {
  const query = filterQuery(filters);
  return useQuery({
    queryKey: qk.reports('retention', query),
    queryFn: () => api.get<RetentionReport>('/api/reports/customers/retention', query),
    enabled,
  });
}

/* -------------------------------------------------------------------------- */
/* Expiring stock (inventory module, not reports)                              */
/* -------------------------------------------------------------------------- */

export interface ExpiringRow {
  batchId: string;
  productId: string;
  productName: string;
  sku: string;
  variantName: string | null;
  locationName: string | null;
  batchNumber: string | null;
  quantityRemaining: number;
  expiryDate: string | null;
  daysToExpiry: number | null;
  expired: boolean;
  unitCostMinor?: number;
  stockValueMinor?: number;
}

export function useExpiringStock(
  days = 30,
  enabled = true,
): UseQueryResult<PageEnvelope<ExpiringRow> & { days: number; until: string }> {
  const query = { days, pageSize: 50 };
  return useQuery({
    queryKey: qk.inventory(['expiring', query]),
    queryFn: () =>
      api.get<PageEnvelope<ExpiringRow> & { days: number; until: string }>(
        '/api/inventory/expiring',
        query,
      ),
    enabled,
  });
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                     */
/* -------------------------------------------------------------------------- */

export type ExportReport =
  | 'sales'
  | 'products'
  | 'categories'
  | 'staff'
  | 'payments'
  | 'profit-loss'
  | 'inventory'
  | 'movements'
  | 'customers';

export interface ExportOptions {
  granularity?: Granularity;
  sort?: ProductSort;
  limit?: number;
  days?: number;
}

/** GET /api/reports/export/:report - the server names the file. */
export async function downloadReport(
  report: ExportReport,
  format: 'csv' | 'pdf',
  filters: ReportFilterState,
  options: ExportOptions = {},
): Promise<void> {
  await api.download(
    `/api/reports/export/${report}`,
    { ...filterQuery(filters), ...options, format },
    `${report}.${format}`,
  );
}
