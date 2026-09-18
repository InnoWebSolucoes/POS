import type {
  ModifierDto,
  ModifierGroupDto,
  PrepStation,
  ProductDto,
  ProductImageDto,
  ProductType,
  ProductVariantDto,
  RecipeComponentDto,
  Unit,
} from '@pos/shared';
import { minorToNumber, parseOptions, parseStringArray } from './helpers.js';

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                  */
/*                                                                             */
/* Declared structurally rather than pulled from the generated Prisma types so  */
/* the mappers accept any query whose selection is a superset of what they      */
/* actually read.                                                              */
/* -------------------------------------------------------------------------- */

export interface ImageRow {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface VariantRow {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  options: string;
  salePriceMinor: bigint | number | null;
  costPriceMinor: bigint | number | null;
  stockQuantity: number;
  active: boolean;
}

export interface ModifierRow {
  id: string;
  groupId: string;
  namePt: string;
  nameEn: string | null;
  priceDeltaMinor: bigint | number;
  sortOrder: number;
  available: boolean;
  linkedProductId: string | null;
}

export interface ModifierGroupRow {
  id: string;
  entityId: string;
  namePt: string;
  nameEn: string | null;
  type: string;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  modifiers?: ModifierRow[];
}

export interface RecipeComponentRow {
  id: string;
  componentProductId: string;
  quantity: number;
  unit: string;
  wastagePercentBps: number;
  componentProduct?: { namePt: string } | null;
}

export interface ProductCategoryRow {
  id: string;
  namePt: string;
  nameEn: string | null;
  color: string | null;
}

export interface ProductRow {
  id: string;
  entityId: string;
  sku: string;
  barcode: string | null;
  altBarcodes: string;
  namePt: string;
  nameEn: string | null;
  descriptionPt: string | null;
  descriptionEn: string | null;
  categoryId: string | null;
  supplierId: string | null;
  type: string;
  unit: string;
  salePriceMinor: bigint | number;
  costPriceMinor: bigint | number;
  avgCostMinor: bigint | number;
  taxRateBps: number;
  trackStock: boolean;
  stockQuantity: number;
  minStockLevel: number;
  maxStockLevel: number | null;
  tileColor: string | null;
  showInQuickGrid: boolean;
  quickGridOrder: number;
  isMenuItem: boolean;
  prepStation: string | null;
  available: boolean;
  publishOnline: boolean;
  onlineSlug: string | null;
  weightGrams: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: ProductCategoryRow | null;
  images?: ImageRow[];
  variants?: VariantRow[];
  recipeOf?: RecipeComponentRow[];
  modifierGroups?: Array<{ sortOrder: number; group: ModifierGroupRow }>;
}

/**
 * ProductDto plus the columns the catalogue editor round-trips. A superset of
 * the shared DTO, so anything typed against ProductDto keeps working.
 */
export interface ProductDtoFull extends ProductDto {
  altBarcodes: string[];
  /** Only present when the caller holds product:cost. */
  avgCostMinor?: number;
  maxStockLevel: number | null;
  quickGridOrder: number;
  publishOnline: boolean;
  onlineSlug: string | null;
  weightGrams: number | null;
}

export interface MapOptions {
  /** False for cashiers: no costPriceMinor, no avgCostMinor, ever. */
  includeCost: boolean;
}

/* -------------------------------------------------------------------------- */
/* Mappers                                                                     */
/* -------------------------------------------------------------------------- */

export function toProductImageDto(row: ImageRow): ProductImageDto {
  return {
    id: row.id,
    url: row.url,
    alt: row.alt,
    sortOrder: row.sortOrder,
    isPrimary: row.isPrimary,
  };
}

export function toProductVariantDto(row: VariantRow, options: MapOptions): ProductVariantDto {
  const cost =
    options.includeCost && row.costPriceMinor !== null && row.costPriceMinor !== undefined
      ? Number(row.costPriceMinor)
      : null;

  return {
    id: row.id,
    productId: row.productId,
    sku: row.sku,
    barcode: row.barcode,
    options: parseOptions(row.options),
    salePriceMinor:
      row.salePriceMinor === null || row.salePriceMinor === undefined
        ? null
        : Number(row.salePriceMinor),
    costPriceMinor: cost,
    stockQuantity: row.stockQuantity,
    active: row.active,
  };
}

export function toRecipeComponentDto(row: RecipeComponentRow): RecipeComponentDto {
  return {
    id: row.id,
    componentProductId: row.componentProductId,
    componentName: row.componentProduct?.namePt ?? '',
    quantity: row.quantity,
    unit: row.unit as Unit,
    wastagePercentBps: row.wastagePercentBps,
  };
}

export function toModifierDto(row: ModifierRow): ModifierDto {
  return {
    id: row.id,
    groupId: row.groupId,
    namePt: row.namePt,
    nameEn: row.nameEn,
    priceDeltaMinor: minorToNumber(row.priceDeltaMinor),
    sortOrder: row.sortOrder,
    available: row.available,
    linkedProductId: row.linkedProductId,
  };
}

export function toModifierGroupDto(row: ModifierGroupRow): ModifierGroupDto {
  const groupType = row.type as ModifierGroupDto['type'];
  return {
    id: row.id,
    entityId: row.entityId,
    namePt: row.namePt,
    nameEn: row.nameEn,
    type: groupType,
    minSelect: row.minSelect,
    maxSelect: row.maxSelect,
    sortOrder: row.sortOrder,
    modifiers: [...(row.modifiers ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toModifierDto),
  };
}

/** Primary image first, then by sortOrder - the order the UI renders them in. */
export function sortImages(images: ImageRow[]): ImageRow[] {
  return [...images].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  );
}

/**
 * The one place a Product row becomes a ProductDto. Relations that were not
 * loaded stay undefined rather than being invented as empty arrays, so the
 * client can tell "no variants" from "variants not requested".
 */
export function toProductDto(product: ProductRow, options: MapOptions): ProductDtoFull {
  const images = sortImages(product.images ?? []).map(toProductImageDto);

  const dto: ProductDtoFull = {
    id: product.id,
    entityId: product.entityId,
    sku: product.sku,
    barcode: product.barcode,
    namePt: product.namePt,
    nameEn: product.nameEn,
    descriptionPt: product.descriptionPt,
    descriptionEn: product.descriptionEn,
    categoryId: product.categoryId,
    category: product.category
      ? {
          id: product.category.id,
          namePt: product.category.namePt,
          nameEn: product.category.nameEn,
          color: product.category.color,
        }
      : null,
    type: product.type as ProductType,
    unit: product.unit as Unit,
    salePriceMinor: minorToNumber(product.salePriceMinor),
    taxRateBps: product.taxRateBps,
    supplierId: product.supplierId,
    minStockLevel: product.minStockLevel,
    stockQuantity: product.stockQuantity,
    trackStock: product.trackStock,
    images,
    imageUrl: images[0]?.url ?? null,
    tileColor: product.tileColor,
    showInQuickGrid: product.showInQuickGrid,
    prepStation: (product.prepStation as PrepStation | null) ?? null,
    isMenuItem: product.isMenuItem,
    available: product.available,
    active: product.active,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    altBarcodes: parseStringArray(product.altBarcodes),
    maxStockLevel: product.maxStockLevel,
    quickGridOrder: product.quickGridOrder,
    publishOnline: product.publishOnline,
    onlineSlug: product.onlineSlug,
    weightGrams: product.weightGrams,
  };

  if (options.includeCost) {
    dto.costPriceMinor = minorToNumber(product.costPriceMinor);
    dto.avgCostMinor = minorToNumber(product.avgCostMinor);
  }

  if (product.variants) {
    dto.variants = product.variants.map((variant) => toProductVariantDto(variant, options));
  }
  if (product.recipeOf) {
    dto.components = product.recipeOf.map(toRecipeComponentDto);
  }
  if (product.modifierGroups) {
    dto.modifierGroups = [...product.modifierGroups]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((link) => toModifierGroupDto(link.group));
  }

  return dto;
}
