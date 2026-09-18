import { z } from 'zod';
import { ADJUSTMENT_REASONS, STOCK_MOVEMENT_TYPES } from '@pos/shared';

/**
 * Query strings arrive as text, so everything numeric/boolean/date is coerced
 * here rather than in the handlers.
 */

const optionalId = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t ? t : undefined;
  });

const optionalText = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t ? t : undefined;
  });

const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v === 'true' || v === '1' || v === 'sim';
    return false;
  });

const pageFields = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
};

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export const levelsQuerySchema = z.object({
  ...pageFields,
  locationId: optionalId,
  categoryId: optionalId,
  search: optionalText,
  lowStock: boolish,
  outOfStock: boolish,
});
export type LevelsQuery = z.infer<typeof levelsQuerySchema>;

export const movementsQuerySchema = z.object({
  ...pageFields,
  productId: optionalId,
  variantId: optionalId,
  locationId: optionalId,
  userId: optionalId,
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  reference: optionalText,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;

export const receiptsQuerySchema = z.object({
  ...pageFields,
  supplierId: optionalId,
  locationId: optionalId,
  purchaseOrderId: optionalId,
  search: optionalText,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ReceiptsQuery = z.infer<typeof receiptsQuerySchema>;

export const transfersQuerySchema = z.object({
  ...pageFields,
  status: z.enum(['draft', 'sent', 'received', 'cancelled']).optional(),
  fromLocationId: optionalId,
  toLocationId: optionalId,
});
export type TransfersQuery = z.infer<typeof transfersQuerySchema>;

export const stockTakesQuerySchema = z.object({
  ...pageFields,
  status: z.enum(['open', 'counting', 'review', 'approved', 'cancelled']).optional(),
  locationId: optionalId,
});
export type StockTakesQuery = z.infer<typeof stockTakesQuerySchema>;

export const lowStockQuerySchema = z.object({
  ...pageFields,
  locationId: optionalId,
  categoryId: optionalId,
  supplierId: optionalId,
});
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;

export const deadStockQuerySchema = z.object({
  ...pageFields,
  days: z.coerce.number().int().min(1).max(3650).optional(),
  categoryId: optionalId,
});
export type DeadStockQuery = z.infer<typeof deadStockQuerySchema>;

export const expiringQuerySchema = z.object({
  ...pageFields,
  days: z.coerce.number().int().min(0).max(3650).optional(),
  locationId: optionalId,
  includeExpired: boolish,
});
export type ExpiringQuery = z.infer<typeof expiringQuerySchema>;

export const valuationQuerySchema = z.object({
  locationId: optionalId,
});
export type ValuationQuery = z.infer<typeof valuationQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

const quantity = z.number().finite().positive().max(1_000_000);
const moneyMinor = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const receiptLineSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).nullish(),
  quantity,
  unitCostMinor: moneyMinor,
  expiryDate: z.coerce.date().nullish(),
  batchNumber: z.string().max(80).nullish(),
});

export const createReceiptSchema = z.object({
  supplierId: z.string().min(1).nullish(),
  locationId: z.string().min(1).nullish(),
  invoiceNumber: z.string().max(120).nullish(),
  purchaseOrderId: z.string().min(1).nullish(),
  note: z.string().max(2000).nullish(),
  lines: z.array(receiptLineSchema).min(1).max(500),
});
export type CreateReceiptBody = z.infer<typeof createReceiptSchema>;

const adjustmentItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).nullish(),
  locationId: z.string().min(1).nullish(),
  quantityDelta: z
    .number()
    .finite()
    .refine((v) => v !== 0, { message: 'A quantidade nao pode ser zero.' }),
  reason: z.enum(ADJUSTMENT_REASONS),
  note: z.string().max(500).nullish(),
});
export type AdjustmentItem = z.infer<typeof adjustmentItemSchema>;

const bulkAdjustmentSchema = z.object({
  items: z.array(adjustmentItemSchema).min(1).max(500),
  locationId: z.string().min(1).nullish(),
  note: z.string().max(500).nullish(),
  allowNegative: z.boolean().optional(),
});

const singleAdjustmentSchema = adjustmentItemSchema.extend({
  allowNegative: z.boolean().optional(),
});

export const adjustmentSchema = z.union([bulkAdjustmentSchema, singleAdjustmentSchema]);
export type AdjustmentBody = z.infer<typeof adjustmentSchema>;

export const createTransferSchema = z.object({
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  note: z.string().max(2000).nullish(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().min(1).nullish(),
        quantity,
      }),
    )
    .min(1)
    .max(500),
});
export type CreateTransferBody = z.infer<typeof createTransferSchema>;

export const receiveTransferSchema = z
  .object({
    note: z.string().max(2000).nullish(),
  })
  .optional()
  .default({});

export const createStockTakeSchema = z.object({
  locationId: z.string().min(1).nullish(),
  categoryId: z.string().min(1).nullish(),
  note: z.string().max(2000).nullish(),
  /** Leave out products that currently hold no stock at all. */
  onlyWithStock: z.boolean().optional(),
});
export type CreateStockTakeBody = z.infer<typeof createStockTakeSchema>;

export const stockTakeLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.string().min(1),
        countedQuantity: z.number().finite().min(0).max(1_000_000).nullable(),
        note: z.string().max(500).nullish(),
      }),
    )
    .min(1)
    .max(1000),
});
export type StockTakeLinesBody = z.infer<typeof stockTakeLinesSchema>;

export const cancelStockTakeSchema = z
  .object({ reason: z.string().max(500).nullish() })
  .optional()
  .default({});
