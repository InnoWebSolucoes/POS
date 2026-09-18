import { z } from 'zod';
import { MODIFIER_GROUP_TYPES, PREP_STATIONS, PRODUCT_TYPES, UNITS } from '@pos/shared';

/**
 * Every write into the catalogue goes through one of these. Cross-field rules
 * that need the merged (existing + patch) values live in helpers.ts instead,
 * so POST and PATCH enforce exactly the same thing.
 */

/** Money is always an integer in minor units. */
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
/** Basis points: 1400 = 14%. */
const bps = z.number().int().min(0).max(1_000_000);
const quantity = z.number().finite().min(0);

/** Query strings arrive as text; "1"/"true"/"yes"/"on" all mean true. */
const boolish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
  );

const id = z.string().trim().min(1);

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  search: z.string().trim().optional(),
  categoryId: id.optional(),
  type: z.enum(PRODUCT_TYPES).optional(),
  supplierId: id.optional(),
  active: boolish.optional(),
  lowStock: boolish.optional(),
  quickGrid: boolish.optional(),
  menu: boolish.optional(),
  online: boolish.optional(),
  sort: z.enum(['name', 'price', 'stock', 'created']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const lookupQuerySchema = z.object({
  code: z.string().trim().min(1, 'Codigo em falta.'),
});
export type LookupQuery = z.infer<typeof lookupQuerySchema>;

export const menuQuerySchema = z.object({
  /** Include items flagged unavailable (86-ed) so staff can turn them back on. */
  includeUnavailable: boolish.optional(),
});
export type MenuQuery = z.infer<typeof menuQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Product bodies                                                              */
/* -------------------------------------------------------------------------- */

export const imageInputSchema = z.object({
  url: z.string().trim().min(1),
  alt: z.string().trim().nullish(),
  sortOrder: z.number().int().min(0).optional(),
  isPrimary: z.boolean().optional(),
});

export const variantInputSchema = z.object({
  sku: z.string().trim().min(1).optional(),
  barcode: z.string().trim().nullish(),
  options: z.record(z.string()).optional(),
  salePriceMinor: money.nullish(),
  costPriceMinor: money.nullish(),
  minStockLevel: quantity.optional(),
  imageUrl: z.string().trim().nullish(),
  active: z.boolean().optional(),
  /** Opening balance, booked through the stock ledger as type "initial". */
  initialStock: z.number().finite().optional(),
});

export const componentInputSchema = z.object({
  componentProductId: id,
  quantity: z.number().finite().positive(),
  unit: z.enum(UNITS).optional(),
  wastagePercentBps: z.number().int().min(0).max(10_000).optional(),
});

const productBase = {
  sku: z.string().trim().min(1).max(64).optional(),
  barcode: z.string().trim().max(64).nullish(),
  altBarcodes: z.array(z.string().trim().min(1)).max(20).optional(),
  namePt: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).nullish(),
  descriptionPt: z.string().trim().max(2000).nullish(),
  descriptionEn: z.string().trim().max(2000).nullish(),
  categoryId: id.nullish(),
  supplierId: id.nullish(),
  type: z.enum(PRODUCT_TYPES).optional(),
  unit: z.enum(UNITS).optional(),
  salePriceMinor: money,
  costPriceMinor: money.optional(),
  taxRateBps: bps.optional(),
  trackStock: z.boolean().optional(),
  minStockLevel: quantity.optional(),
  maxStockLevel: quantity.nullish(),
  tileColor: z.string().trim().max(32).nullish(),
  showInQuickGrid: z.boolean().optional(),
  quickGridOrder: z.number().int().min(0).optional(),
  isMenuItem: z.boolean().optional(),
  prepStation: z.enum(PREP_STATIONS).nullish(),
  available: z.boolean().optional(),
  publishOnline: z.boolean().optional(),
  onlineSlug: z.string().trim().max(200).nullish(),
  weightGrams: z.number().int().min(0).nullish(),
  active: z.boolean().optional(),
  images: z.array(imageInputSchema).max(12).optional(),
  components: z.array(componentInputSchema).max(60).optional(),
  modifierGroupIds: z.array(id).max(30).optional(),
};

export const createProductSchema = z.object({
  ...productBase,
  variants: z.array(variantInputSchema).max(200).optional(),
  initialStock: z
    .object({
      quantity: z.number().finite(),
      unitCostMinor: money.optional(),
      locationId: id.nullish(),
      note: z.string().trim().max(200).nullish(),
    })
    .optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  ...productBase,
  namePt: z.string().trim().min(1).max(200).optional(),
  salePriceMinor: money.optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const bulkEditSchema = z.object({
  ids: z.array(id).min(1).max(500),
  patch: z
    .object({
      categoryId: id.nullish(),
      taxRateBps: bps.optional(),
      active: z.boolean().optional(),
      supplierId: id.nullish(),
      showInQuickGrid: z.boolean().optional(),
      available: z.boolean().optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, 'Nada para alterar.'),
});
export type BulkEditInput = z.infer<typeof bulkEditSchema>;

/* -------------------------------------------------------------------------- */
/* Variants                                                                    */
/* -------------------------------------------------------------------------- */

export const variantMatrixSchema = z.object({
  axes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        values: z.array(z.string().trim().min(1).max(60)).min(1).max(60),
      }),
    )
    .min(1)
    .max(4),
  basePriceMinor: money.nullish(),
  baseCostMinor: money.nullish(),
});
export type VariantMatrixInput = z.infer<typeof variantMatrixSchema>;

export const updateVariantSchema = z.object({
  sku: z.string().trim().min(1).max(64).optional(),
  barcode: z.string().trim().max(64).nullish(),
  options: z.record(z.string()).optional(),
  salePriceMinor: money.nullish(),
  costPriceMinor: money.nullish(),
  minStockLevel: quantity.optional(),
  imageUrl: z.string().trim().nullish(),
  active: z.boolean().optional(),
});
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

/* -------------------------------------------------------------------------- */
/* Recipe                                                                      */
/* -------------------------------------------------------------------------- */

export const recipeSchema = z.object({
  components: z.array(componentInputSchema).max(60),
});
export type RecipeInput = z.infer<typeof recipeSchema>;

/* -------------------------------------------------------------------------- */
/* Modifiers                                                                   */
/* -------------------------------------------------------------------------- */

export const modifierInputSchema = z.object({
  namePt: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().max(120).nullish(),
  priceDeltaMinor: z.number().int().optional(),
  sortOrder: z.number().int().min(0).optional(),
  available: z.boolean().optional(),
  linkedProductId: id.nullish(),
});
export type ModifierInput = z.infer<typeof modifierInputSchema>;

export const createModifierGroupSchema = z.object({
  namePt: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().max(120).nullish(),
  type: z.enum(MODIFIER_GROUP_TYPES).optional(),
  minSelect: z.number().int().min(0).max(50).optional(),
  maxSelect: z.number().int().min(0).max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
  modifiers: z.array(modifierInputSchema).max(60).optional(),
});
export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;

export const updateModifierGroupSchema = createModifierGroupSchema.partial();
export type UpdateModifierGroupInput = z.infer<typeof updateModifierGroupSchema>;

export const updateModifierSchema = modifierInputSchema.partial();
export type UpdateModifierInput = z.infer<typeof updateModifierSchema>;

export const attachModifierGroupSchema = z.object({
  groupId: id,
  sortOrder: z.number().int().min(0).optional(),
});
export type AttachModifierGroupInput = z.infer<typeof attachModifierGroupSchema>;
