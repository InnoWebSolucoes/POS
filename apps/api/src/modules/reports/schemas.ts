import { z } from 'zod';
import { ADJUSTMENT_REASONS, SALE_CHANNELS, STOCK_MOVEMENT_TYPES } from '@pos/shared';

/**
 * Every reporting endpoint speaks the same filter language - the `ReportFilters`
 * shape from @pos/shared. Dates arrive as ISO strings ("2026-09-01" or a full
 * timestamp); `to` is treated as INCLUSIVE, i.e. the end of that day.
 */

const isoDate = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Data invalida.' });

const id = z.string().trim().min(1);

export const reportFiltersSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** Accepted (and ignored) so a super admin can scope via the query string. */
  entityId: id.optional(),
  locationId: id.optional(),
  userId: id.optional(),
  categoryId: id.optional(),
  productId: id.optional(),
  channel: z.enum(SALE_CHANNELS).optional(),
});

export type ReportFiltersQuery = z.infer<typeof reportFiltersSchema>;

export const GRANULARITIES = ['hour', 'day', 'week', 'month'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const seriesQuerySchema = reportFiltersSchema.extend({
  granularity: z.enum(GRANULARITIES).default('day'),
});
export type SeriesQuery = z.infer<typeof seriesQuerySchema>;

export const PRODUCT_SORTS = ['revenue', 'profit', 'margin', 'quantity'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const byProductQuerySchema = reportFiltersSchema.extend({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  sort: z.enum(PRODUCT_SORTS).default('revenue'),
});
export type ByProductQuery = z.infer<typeof byProductQuerySchema>;

export const valuationQuerySchema = reportFiltersSchema.extend({
  includeZero: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1'),
});
export type ValuationQuery = z.infer<typeof valuationQuerySchema>;

export const movementsQuerySchema = reportFiltersSchema.extend({
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  reason: z.enum(ADJUSTMENT_REASONS).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;

export const deadStockQuerySchema = reportFiltersSchema.extend({
  days: z.coerce.number().int().min(1).max(730).default(90),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
export type DeadStockQuery = z.infer<typeof deadStockQuerySchema>;

export const topCustomersQuerySchema = reportFiltersSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(25),
});
export type TopCustomersQuery = z.infer<typeof topCustomersQuerySchema>;

export const EXPORT_REPORTS = [
  'sales',
  'products',
  'categories',
  'staff',
  'payments',
  'profit-loss',
  'inventory',
  'movements',
  'customers',
] as const;
export type ExportReport = (typeof EXPORT_REPORTS)[number];

export const EXPORT_FORMATS = ['csv', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const exportParamsSchema = z.object({
  report: z.enum(EXPORT_REPORTS),
});

export const exportQuerySchema = reportFiltersSchema.extend({
  format: z.enum(EXPORT_FORMATS).default('csv'),
  granularity: z.enum(GRANULARITIES).default('day'),
  sort: z.enum(PRODUCT_SORTS).default('revenue'),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
  days: z.coerce.number().int().min(1).max(730).default(90),
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  reason: z.enum(ADJUSTMENT_REASONS).optional(),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
