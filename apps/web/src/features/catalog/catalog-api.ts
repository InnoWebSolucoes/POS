import { api } from '@/lib/api';
import { qk, queryClient } from '@/lib/query';
import type {
  CategoryDto,
  ModifierDto,
  ModifierGroupDto,
  ModifierGroupType,
  Paginated,
  PrepStation,
  ProductDto,
  ProductType,
  ProductVariantDto,
  RecipeComponentDto,
  Unit,
} from '@pos/shared';

/**
 * Every catalogue call in one place, typed against what the API really returns
 * (apps/api/src/modules/products and .../categories). Money is always minor
 * units, tax and wastage always basis points.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** ProductDto plus the columns only the editor round-trips (mappers.ts). */
export interface ProductFull extends ProductDto {
  altBarcodes: string[];
  /** Only present when the caller holds product:cost. */
  avgCostMinor?: number;
  maxStockLevel: number | null;
  quickGridOrder: number;
  publishOnline: boolean;
  onlineSlug: string | null;
  weightGrams: number | null;
}

export interface ProductImagePayload {
  url: string;
  alt?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
}

export interface RecipeComponentPayload {
  componentProductId: string;
  quantity: number;
  unit?: Unit;
  wastagePercentBps?: number;
}

export interface ProductWritePayload {
  sku?: string;
  barcode?: string | null;
  altBarcodes?: string[];
  namePt: string;
  nameEn?: string | null;
  descriptionPt?: string | null;
  descriptionEn?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  type?: ProductType;
  unit?: Unit;
  salePriceMinor: number;
  costPriceMinor?: number;
  taxRateBps?: number;
  trackStock?: boolean;
  minStockLevel?: number;
  maxStockLevel?: number | null;
  tileColor?: string | null;
  showInQuickGrid?: boolean;
  isMenuItem?: boolean;
  prepStation?: PrepStation | null;
  available?: boolean;
  publishOnline?: boolean;
  onlineSlug?: string | null;
  weightGrams?: number | null;
  active?: boolean;
  images?: ProductImagePayload[];
  components?: RecipeComponentPayload[];
  modifierGroupIds?: string[];
}

export interface ProductListParams {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  type?: ProductType;
  supplierId?: string;
  active?: boolean;
  lowStock?: boolean;
  sort?: 'name' | 'price' | 'stock' | 'created';
  order?: 'asc' | 'desc';
}

export interface BulkPatch {
  categoryId?: string | null;
  taxRateBps?: number;
  active?: boolean;
  supplierId?: string | null;
  showInQuickGrid?: boolean;
  available?: boolean;
}

export interface VariantAxis {
  name: string;
  values: string[];
}

export interface VariantMatrixResult {
  created: ProductVariantDto[];
  skipped: Array<Record<string, string>>;
}

export interface VariantPatch {
  sku?: string;
  barcode?: string | null;
  salePriceMinor?: number | null;
  costPriceMinor?: number | null;
  active?: boolean;
}

export interface RecipeResponse {
  productId: string;
  components: RecipeComponentDto[];
}

export interface TaxRateOption {
  id: string;
  namePt: string;
  rateBps: number;
  isDefault: boolean;
  productCount: number;
}

export interface TaxRatesResponse {
  defaultTaxRateBps: number;
  rates: TaxRateOption[];
}

/** Only the fields the catalogue needs from a supplier. */
export interface SupplierOption {
  id: string;
  name: string;
  active: boolean;
}

export interface CategoryWritePayload {
  namePt: string;
  nameEn?: string | null;
  parentId?: string | null;
  color?: string | null;
  sortOrder?: number;
  active?: boolean;
}

export interface ReorderItem {
  id: string;
  sortOrder: number;
  parentId?: string | null;
}

export interface ModifierGroupPayload {
  namePt: string;
  nameEn?: string | null;
  type?: ModifierGroupType;
  minSelect?: number;
  maxSelect?: number;
  sortOrder?: number;
}

export interface ModifierPayload {
  namePt: string;
  nameEn?: string | null;
  priceDeltaMinor?: number;
  sortOrder?: number;
  available?: boolean;
}

export interface UploadedImage {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

/* -------------------------------------------------------------------------- */
/* Calls                                                                       */
/* -------------------------------------------------------------------------- */

/** Drops the keys the API would reject as empty strings. */
function listQuery(params: ProductListParams): Record<string, unknown> {
  const query: Record<string, unknown> = { page: params.page, pageSize: params.pageSize };
  if (params.search) query.search = params.search;
  if (params.categoryId) query.categoryId = params.categoryId;
  if (params.type) query.type = params.type;
  if (params.supplierId) query.supplierId = params.supplierId;
  if (params.active !== undefined) query.active = params.active;
  if (params.lowStock) query.lowStock = true;
  if (params.sort) query.sort = params.sort;
  if (params.order) query.order = params.order;
  return query;
}

export const catalogApi = {
  listProducts: (params: ProductListParams) =>
    api.get<Paginated<ProductFull>>('/api/products', listQuery(params)),

  getProduct: (id: string) => api.get<ProductFull>(`/api/products/${id}`),

  createProduct: (body: ProductWritePayload) => api.post<ProductFull>('/api/products', body),

  updateProduct: (id: string, body: Partial<ProductWritePayload>) =>
    api.patch<ProductFull>(`/api/products/${id}`, body),

  deleteProduct: (id: string) => api.delete<{ ok: boolean }>(`/api/products/${id}`),

  bulkEdit: (ids: string[], patch: BulkPatch) =>
    api.post<{ updated: number }>('/api/products/bulk', { ids, patch }),

  variantMatrix: (id: string, axes: VariantAxis[], basePriceMinor?: number, baseCostMinor?: number) =>
    api.post<VariantMatrixResult>(`/api/products/${id}/variants/matrix`, {
      axes,
      ...(basePriceMinor !== undefined ? { basePriceMinor } : {}),
      ...(baseCostMinor !== undefined ? { baseCostMinor } : {}),
    }),

  updateVariant: (variantId: string, patch: VariantPatch) =>
    api.patch<ProductVariantDto>(`/api/products/variants/${variantId}`, patch),

  deleteVariant: (variantId: string) =>
    api.delete<{ ok: boolean }>(`/api/products/variants/${variantId}`),

  getRecipe: (id: string) => api.get<RecipeResponse>(`/api/products/${id}/recipe`),

  putRecipe: (id: string, components: RecipeComponentPayload[]) =>
    api.put<RecipeResponse>(`/api/products/${id}/recipe`, { components }),

  attachModifierGroup: (productId: string, groupId: string, sortOrder?: number) =>
    api.post<{ sortOrder: number; group: ModifierGroupDto }>(
      `/api/products/${productId}/attach-modifier-group`,
      { groupId, ...(sortOrder !== undefined ? { sortOrder } : {}) },
    ),

  detachModifierGroup: (productId: string, groupId: string) =>
    api.delete<{ ok: boolean }>(`/api/products/${productId}/modifier-groups/${groupId}`),

  /* Categories */

  listCategories: (tree: boolean) =>
    api.get<{ data: CategoryDto[] }>('/api/categories', { tree, includeInactive: true }),

  createCategory: (body: CategoryWritePayload) => api.post<CategoryDto>('/api/categories', body),

  updateCategory: (id: string, body: Partial<CategoryWritePayload>) =>
    api.patch<CategoryDto>(`/api/categories/${id}`, body),

  deleteCategory: (id: string) =>
    api.delete<{ id: string; deleted: boolean; productsDetached: number }>(`/api/categories/${id}`),

  reorderCategories: (items: ReorderItem[]) =>
    api.post<{ data: CategoryDto[] }>('/api/categories/reorder', { items }),

  /* Modifier groups */

  listModifierGroups: () => api.get<ModifierGroupDto[]>('/api/products/modifier-groups'),

  createModifierGroup: (body: ModifierGroupPayload) =>
    api.post<ModifierGroupDto>('/api/products/modifier-groups', body),

  updateModifierGroup: (id: string, body: Partial<ModifierGroupPayload>) =>
    api.patch<ModifierGroupDto>(`/api/products/modifier-groups/${id}`, body),

  deleteModifierGroup: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/products/modifier-groups/${id}`),

  addModifier: (groupId: string, body: ModifierPayload) =>
    api.post<ModifierDto>(`/api/products/modifier-groups/${groupId}/modifiers`, body),

  updateModifier: (modifierId: string, body: Partial<ModifierPayload>) =>
    api.patch<ModifierDto>(`/api/products/modifiers/${modifierId}`, body),

  deleteModifier: (modifierId: string) =>
    api.delete<{ ok: boolean }>(`/api/products/modifiers/${modifierId}`),

  /* Supporting data */

  listSuppliers: () =>
    api.get<Paginated<SupplierOption>>('/api/suppliers', { pageSize: 200, active: true }),

  taxRates: () => api.get<TaxRatesResponse>('/api/settings/tax-rates'),

  uploadImages: (files: File[]) =>
    api.upload<{ files: UploadedImage[] }>('/api/uploads/images', files, 'files'),
};

/* -------------------------------------------------------------------------- */
/* Invalidation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * qk.products(params) is ['products', params]; slicing off the params leaves the
 * shared prefix, so one call invalidates every filter combination on every
 * screen instead of only the one this component happens to be showing.
 */
const productsRoot = (): readonly unknown[] => qk.products().slice(0, 1);
const categoriesRoot = (): readonly unknown[] => qk.categories().slice(0, 1);

/** Key for the modifier-group list, derived from qk so nothing goes ad hoc. */
export const modifierGroupsKey = qk.products({ resource: 'modifier-groups' });

export function invalidateProducts(productId?: string): void {
  void queryClient.invalidateQueries({ queryKey: productsRoot() });
  void queryClient.invalidateQueries({ queryKey: qk.menu() });
  void queryClient.invalidateQueries({ queryKey: qk.lowStock() });
  if (productId) void queryClient.invalidateQueries({ queryKey: qk.product(productId) });
}

export function invalidateCategories(): void {
  void queryClient.invalidateQueries({ queryKey: categoriesRoot() });
  void queryClient.invalidateQueries({ queryKey: qk.menu() });
}

export function invalidateModifierGroups(): void {
  void queryClient.invalidateQueries({ queryKey: modifierGroupsKey });
  void queryClient.invalidateQueries({ queryKey: productsRoot() });
  void queryClient.invalidateQueries({ queryKey: qk.menu() });
}
