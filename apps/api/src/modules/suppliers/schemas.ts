import { z } from 'zod';
import { PO_STATUSES } from '@pos/shared';

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

const trimmed = (max: number) => z.string().trim().max(max);

/** Optional free text where '' and null both mean "no value". */
export const nullableText = (max: number) =>
  z.union([trimmed(max), z.null()]).transform((v) => (v == null || v === '' ? null : v));

export const nullableEmail = z
  .union([z.literal(''), z.null(), z.string().trim().email('Email invalido.').max(200)])
  .transform((v) => (v == null || v === '' ? null : v));

/** Query strings arrive as text; accept both the string and the real boolean. */
const booleanish = z.union([
  z.boolean(),
  z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1'),
]);

/** z.null() comes first so an explicit null is never coerced into the epoch. */
const nullableDate = z.union([z.null(), z.coerce.date()]);

const id = z.string().trim().min(1);

/* -------------------------------------------------------------------------- */
/* Suppliers                                                                   */
/* -------------------------------------------------------------------------- */

export const supplierCreateSchema = z.object({
  name: trimmed(200).min(1, 'Nome obrigatorio.'),
  contactName: nullableText(200).optional(),
  phone: nullableText(60).optional(),
  email: nullableEmail.optional(),
  address: nullableText(500).optional(),
  nif: nullableText(60).optional(),
  paymentTerms: nullableText(200).optional(),
  notes: nullableText(2000).optional(),
  active: z.boolean().optional(),
});

export const supplierUpdateSchema = supplierCreateSchema.partial();

export const supplierListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  search: trimmed(200).optional(),
  active: booleanish.optional(),
});

export const supplierProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  search: trimmed(200).optional(),
  active: booleanish.optional(),
});

export const performanceQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(60).optional(),
});

/* -------------------------------------------------------------------------- */
/* Purchase orders                                                             */
/* -------------------------------------------------------------------------- */

export const poLineSchema = z.object({
  productId: id,
  variantId: z.union([z.null(), id]).optional(),
  quantity: z.number().positive('A quantidade tem de ser maior que zero.').max(1_000_000),
  unitCostMinor: z
    .number()
    .int('O custo unitario tem de ser um inteiro em centimos.')
    .min(0)
    .max(Number.MAX_SAFE_INTEGER),
});

export const poCreateSchema = z.object({
  supplierId: id,
  expectedDate: nullableDate.optional(),
  note: nullableText(2000).optional(),
  lines: z.array(poLineSchema).min(1, 'Adicione pelo menos uma linha.').max(500),
});

export const poUpdateSchema = z.object({
  supplierId: id.optional(),
  expectedDate: nullableDate.optional(),
  note: nullableText(2000).optional(),
  lines: z.array(poLineSchema).min(1, 'Adicione pelo menos uma linha.').max(500).optional(),
});

export const poListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  search: trimmed(200).optional(),
  status: z.enum(PO_STATUSES).optional(),
  supplierId: id.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const lowStockPoSchema = z.object({
  supplierId: z.union([z.null(), id]).optional(),
  locationId: z.union([z.null(), id]).optional(),
});

export const poCancelSchema = z.object({
  reason: nullableText(500).optional(),
});

/* -------------------------------------------------------------------------- */

export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
export type SupplierProductsQuery = z.infer<typeof supplierProductsQuerySchema>;
export type PerformanceQuery = z.infer<typeof performanceQuerySchema>;
export type PoLineInput = z.infer<typeof poLineSchema>;
export type PoCreateInput = z.infer<typeof poCreateSchema>;
export type PoUpdateInput = z.infer<typeof poUpdateSchema>;
export type PoListQuery = z.infer<typeof poListQuerySchema>;
export type LowStockPoInput = z.infer<typeof lowStockPoSchema>;
export type PoCancelInput = z.infer<typeof poCancelSchema>;
