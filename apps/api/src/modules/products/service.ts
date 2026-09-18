import { Prisma } from '@prisma/client';
import {
  DEFAULT_EMBEDDED_RULES,
  generateInternalBarcode,
  normalizeBarcode,
  parseScan,
  type EmbeddedBarcodeRule,
  type ModifierGroupDto,
  type PrepStation,
  type ProductType,
  type ProductVariantDto,
  type ScanResult,
  type Unit,
} from '@pos/shared';
import { ApiError } from '../../lib/http.js';
import { round3 } from '../../lib/inventory.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { nextSequence } from '../../lib/sequence.js';
import { getSettings } from '../../lib/settings.js';
import { minorToNumber, skuSegment, uniqueStrings } from './helpers.js';
import {
  toModifierGroupDto,
  toProductDto,
  toProductVariantDto,
  type ProductDtoFull,
} from './mappers.js';

/* -------------------------------------------------------------------------- */
/* Selections                                                                  */
/* -------------------------------------------------------------------------- */

/** Everything the catalogue editor needs for one product. */
export const PRODUCT_INCLUDE = {
  category: { select: { id: true, namePt: true, nameEn: true, color: true } },
  images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
  variants: { where: { deletedAt: null }, orderBy: { sku: 'asc' } },
  recipeOf: {
    include: { componentProduct: { select: { namePt: true } } },
  },
  modifierGroups: {
    orderBy: { sortOrder: 'asc' },
    include: { group: { include: { modifiers: { orderBy: { sortOrder: 'asc' } } } } },
  },
} satisfies Prisma.ProductInclude;

/** The lighter shape used by the paginated list. */
export const PRODUCT_LIST_INCLUDE = {
  category: { select: { id: true, namePt: true, nameEn: true, color: true } },
  images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
} satisfies Prisma.ProductInclude;

/** The register hot path: only what a cart line needs. */
export const LOOKUP_SELECT = {
  id: true,
  entityId: true,
  sku: true,
  barcode: true,
  namePt: true,
  nameEn: true,
  categoryId: true,
  type: true,
  unit: true,
  salePriceMinor: true,
  costPriceMinor: true,
  taxRateBps: true,
  trackStock: true,
  stockQuantity: true,
  available: true,
  active: true,
  tileColor: true,
  prepStation: true,
  isMenuItem: true,
  images: { select: { url: true }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
} satisfies Prisma.ProductSelect;

const VARIANT_WITH_PRODUCT_SELECT = {
  id: true,
  productId: true,
  sku: true,
  barcode: true,
  options: true,
  salePriceMinor: true,
  costPriceMinor: true,
  stockQuantity: true,
  active: true,
  product: { select: LOOKUP_SELECT },
} satisfies Prisma.ProductVariantSelect;

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

export async function loadProductDto(
  entityId: string,
  productId: string,
  includeCost: boolean,
  client: Tx = prisma,
): Promise<ProductDtoFull> {
  const product = await client.product.findFirst({
    where: { id: productId, entityId, deletedAt: null },
    include: PRODUCT_INCLUDE,
  });
  if (!product) throw ApiError.notFound('Produto nao encontrado.');
  return toProductDto(product, { includeCost });
}

export async function requireProduct(
  entityId: string,
  productId: string,
  client: Tx = prisma,
): Promise<{ id: string }> {
  const product = await client.product.findFirst({
    where: { id: productId, entityId, deletedAt: null },
    select: { id: true },
  });
  if (!product) throw ApiError.notFound('Produto nao encontrado.');
  return product;
}

export interface EntityDefaults {
  defaultTaxRateBps: number;
  skuPrefix: string;
}

export async function loadEntityDefaults(entityId: string): Promise<EntityDefaults> {
  const entity = await prisma.entity.findFirst({
    where: { id: entityId },
    select: { slug: true, name: true, defaultTaxRateBps: true },
  });
  if (!entity) throw ApiError.notFound('Entidade nao encontrada.');
  const prefix = skuSegment(entity.slug || entity.name).slice(0, 3);
  return {
    defaultTaxRateBps: entity.defaultTaxRateBps,
    skuPrefix: prefix.length > 0 ? prefix : 'PRD',
  };
}

/* -------------------------------------------------------------------------- */
/* Generators                                                                  */
/*                                                                             */
/* Deliberately run OUTSIDE the transaction that creates the row: a sequence is */
/* a counter, and burning a number on a failed write is far cheaper than an     */
/* aborted transaction caused by the create-then-increment race inside it.      */
/* -------------------------------------------------------------------------- */

export async function generateSku(entityId: string, prefix: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const seq = await nextSequence(entityId, 'internal_barcode', { scope: 'sku' });
    const sku = `${prefix}-${String(seq).padStart(5, '0')}`;
    const clash = await prisma.product.findFirst({ where: { entityId, sku }, select: { id: true } });
    if (!clash) return sku;
  }
  throw ApiError.conflict('Nao foi possivel gerar um SKU unico.');
}

export async function generateBarcode(entityId: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const seq = await nextSequence(entityId, 'internal_barcode');
    const barcode = generateInternalBarcode(seq);
    const productClash = await prisma.product.findFirst({
      where: { entityId, barcode },
      select: { id: true },
    });
    if (productClash) continue;
    const variantClash = await prisma.productVariant.findFirst({
      where: { entityId, barcode },
      select: { id: true },
    });
    if (!variantClash) return barcode;
  }
  throw ApiError.conflict('Nao foi possivel gerar um codigo de barras interno unico.');
}

/* -------------------------------------------------------------------------- */
/* Referential checks                                                          */
/* -------------------------------------------------------------------------- */

export async function assertCategory(entityId: string, categoryId: string | null | undefined): Promise<void> {
  if (!categoryId) return;
  const category = await prisma.category.findFirst({
    where: { id: categoryId, entityId, deletedAt: null },
    select: { id: true },
  });
  if (!category) {
    throw ApiError.unprocessable('Categoria nao encontrada.', { categoryId: ['Categoria invalida.'] });
  }
}

export async function assertSupplier(entityId: string, supplierId: string | null | undefined): Promise<void> {
  if (!supplierId) return;
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, entityId, deletedAt: null },
    select: { id: true },
  });
  if (!supplier) {
    throw ApiError.unprocessable('Fornecedor nao encontrado.', { supplierId: ['Fornecedor invalido.'] });
  }
}

/** A location from another tenant must never receive an InventoryLevel row. */
export async function assertLocation(entityId: string, locationId: string | null | undefined): Promise<void> {
  if (!locationId) return;
  const location = await prisma.location.findFirst({
    where: { id: locationId, entityId },
    select: { id: true },
  });
  if (!location) {
    throw ApiError.unprocessable('Localizacao nao encontrada.', { locationId: ['Localizacao invalida.'] });
  }
}

export async function assertModifierGroups(entityId: string, groupIds: string[]): Promise<void> {
  if (groupIds.length === 0) return;
  const found = await prisma.modifierGroup.findMany({
    where: { entityId, id: { in: groupIds } },
    select: { id: true },
  });
  if (found.length !== new Set(groupIds).size) {
    throw ApiError.unprocessable('Um ou mais grupos de modificadores nao existem.', {
      modifierGroupIds: ['Grupo invalido.'],
    });
  }
}

export interface ComponentInput {
  componentProductId: string;
  quantity: number;
  unit?: Unit;
  wastagePercentBps?: number;
}

/** Components must exist in the tenant, be listed once, and not be the parent. */
export async function assertComponentProducts(
  entityId: string,
  components: ComponentInput[],
  parentProductId: string | null,
): Promise<void> {
  if (components.length === 0) return;

  const ids = components.map((component) => component.componentProductId);
  if (new Set(ids).size !== ids.length) {
    throw ApiError.unprocessable('Cada componente so pode aparecer uma vez na receita.', {
      components: ['Componente repetido.'],
    });
  }
  if (parentProductId && ids.includes(parentProductId)) {
    throw ApiError.unprocessable('Um produto nao pode ser componente de si proprio.', {
      components: ['Auto-referencia na receita.'],
    });
  }

  const found = await prisma.product.findMany({
    where: { entityId, deletedAt: null, id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw ApiError.unprocessable('Um ou mais componentes nao existem nesta entidade.', {
      components: ['Componente invalido.'],
    });
  }
}

/**
 * Walks the whole bill-of-materials graph with the proposed edges swapped in.
 * A hamburger may contain a patty, but the patty may never (however deeply)
 * contain the hamburger - selling one would recurse forever in consumeForSale.
 */
export async function assertNoRecipeCycle(
  entityId: string,
  parentProductId: string,
  componentIds: string[],
): Promise<void> {
  if (componentIds.includes(parentProductId)) {
    throw ApiError.unprocessable('Um produto nao pode ser componente de si proprio.', {
      components: ['Auto-referencia na receita.'],
    });
  }
  if (componentIds.length === 0) return;

  const edges = await prisma.recipeComponent.findMany({
    where: { parentProduct: { entityId, deletedAt: null } },
    select: { parentProductId: true, componentProductId: true },
  });

  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    // The parent is about to be rewritten, so ignore its current edges.
    if (edge.parentProductId === parentProductId) continue;
    const list = graph.get(edge.parentProductId) ?? [];
    list.push(edge.componentProductId);
    graph.set(edge.parentProductId, list);
  }
  graph.set(parentProductId, [...componentIds]);

  const visiting = new Set<string>();
  const done = new Set<string>();

  const walk = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (done.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) {
      if (walk(next)) return true;
    }
    visiting.delete(node);
    done.add(node);
    return false;
  };

  if (walk(parentProductId)) {
    throw ApiError.unprocessable(
      'Ciclo detectado na receita: um dos componentes depende deste produto.',
      { components: ['Ciclo na lista de materiais.'] },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Low stock                                                                   */
/*                                                                             */
/* Neither SQLite nor Prisma can compare two columns in a WHERE clause without  */
/* raw SQL, so the comparison happens in memory over a narrow projection.       */
/* -------------------------------------------------------------------------- */

export async function lowStockProductIds(
  entityId: string,
  where: Prisma.ProductWhereInput,
): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { ...where, entityId, deletedAt: null, trackStock: true, minStockLevel: { gt: 0 } },
    select: { id: true, stockQuantity: true, minStockLevel: true },
    take: 10_000,
  });
  return rows.filter((row) => row.stockQuantity <= row.minStockLevel).map((row) => row.id);
}

/* -------------------------------------------------------------------------- */
/* Category tree                                                               */
/* -------------------------------------------------------------------------- */

/** The category itself plus every descendant, so a parent filter includes children. */
export async function categoryWithDescendants(entityId: string, categoryId: string): Promise<string[]> {
  const rows = await prisma.category.findMany({
    where: { entityId, deletedAt: null },
    select: { id: true, parentId: true },
  });

  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const list = children.get(row.parentId) ?? [];
    list.push(row.id);
    children.set(row.parentId, list);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const queue: string[] = [categoryId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    out.push(current);
    for (const child of children.get(current) ?? []) queue.push(child);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Lookup (register hot path)                                                  */
/* -------------------------------------------------------------------------- */

export interface LookupProduct {
  id: string;
  entityId: string;
  sku: string;
  barcode: string | null;
  namePt: string;
  nameEn: string | null;
  categoryId: string | null;
  type: ProductType;
  unit: Unit;
  salePriceMinor: number;
  costPriceMinor?: number;
  taxRateBps: number;
  trackStock: boolean;
  stockQuantity: number;
  available: boolean;
  active: boolean;
  imageUrl: string | null;
  tileColor: string | null;
  prepStation: PrepStation | null;
  isMenuItem: boolean;
  modifierGroups?: ModifierGroupDto[];
}

export interface LookupResult {
  found: boolean;
  product?: LookupProduct;
  variant?: ProductVariantDto;
  /** Weight decoded from a scale barcode, in the product unit. */
  quantity?: number;
  /** Price decoded from a scale barcode, in minor units. */
  priceMinor?: number;
  scan: ScanResult;
}

interface LookupRow {
  id: string;
  entityId: string;
  sku: string;
  barcode: string | null;
  namePt: string;
  nameEn: string | null;
  categoryId: string | null;
  type: string;
  unit: string;
  salePriceMinor: bigint | number;
  costPriceMinor: bigint | number;
  taxRateBps: number;
  trackStock: boolean;
  stockQuantity: number;
  available: boolean;
  active: boolean;
  tileColor: string | null;
  prepStation: string | null;
  isMenuItem: boolean;
  images?: Array<{ url: string }>;
}

function toLookupProduct(row: LookupRow, includeCost: boolean): LookupProduct {
  const product: LookupProduct = {
    id: row.id,
    entityId: row.entityId,
    sku: row.sku,
    barcode: row.barcode,
    namePt: row.namePt,
    nameEn: row.nameEn,
    categoryId: row.categoryId,
    type: row.type as ProductType,
    unit: row.unit as Unit,
    salePriceMinor: minorToNumber(row.salePriceMinor),
    taxRateBps: row.taxRateBps,
    trackStock: row.trackStock,
    stockQuantity: row.stockQuantity,
    available: row.available,
    active: row.active,
    imageUrl: row.images?.[0]?.url ?? null,
    tileColor: row.tileColor,
    prepStation: (row.prepStation as PrepStation | null) ?? null,
    isMenuItem: row.isMenuItem,
  };
  if (includeCost) product.costPriceMinor = minorToNumber(row.costPriceMinor);
  return product;
}

/** Restaurant items need their modifier groups to build a line; retail does not. */
async function attachModifierGroups(product: LookupProduct): Promise<LookupProduct> {
  if (!product.isMenuItem) return product;
  const links = await prisma.productModifierGroup.findMany({
    where: { productId: product.id },
    orderBy: { sortOrder: 'asc' },
    include: { group: { include: { modifiers: { orderBy: { sortOrder: 'asc' } } } } },
  });
  product.modifierGroups = links.map((link) => toModifierGroupDto(link.group));
  return product;
}

function embeddedRules(rules: EmbeddedBarcodeRule[] | undefined): EmbeddedBarcodeRule[] {
  return Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_EMBEDDED_RULES;
}

/**
 * Resolves a scanned string to a cart line.
 *
 * Order matters: scale barcodes first (they carry the weight or the price),
 * then the manufacturer barcode, alternates, variant barcodes and finally SKUs.
 */
export async function lookupByCode(
  entityId: string,
  code: string,
  includeCost: boolean,
): Promise<LookupResult> {
  const settings = await getSettings(entityId);
  const scan = parseScan(code, embeddedRules(settings.embeddedBarcodeRules));

  if (scan.kind === 'embedded') {
    const candidates = uniqueStrings([scan.itemCode, scan.itemCodePadded]);
    const row = await prisma.product.findFirst({
      where: {
        entityId,
        deletedAt: null,
        OR: [{ sku: { in: candidates } }, { barcode: { in: candidates } }],
      },
      select: LOOKUP_SELECT,
    });

    if (row) {
      const result: LookupResult = {
        found: true,
        product: await attachModifierGroups(toLookupProduct(row, includeCost)),
        scan,
      };
      if (scan.quantity !== undefined) result.quantity = round3(scan.quantity);
      if (scan.priceMinor !== undefined) result.priceMinor = scan.priceMinor;
      return result;
    }
    // An internal EAN-13 starts with 29, which the default price rule also
    // claims. Fall through and try the whole code as an ordinary barcode.
  }

  const key = normalizeBarcode(scan.code);
  const keys = uniqueStrings([key, key.toUpperCase()]);
  const base = { entityId, deletedAt: null } as const;

  let row = await prisma.product.findFirst({
    where: { ...base, barcode: { in: keys } },
    select: LOOKUP_SELECT,
  });

  if (!row) {
    // altBarcodes is a JSON array string; matching the quoted form stops
    // "123" from matching "91234".
    row = await prisma.product.findFirst({
      where: { ...base, OR: keys.map((value) => ({ altBarcodes: { contains: JSON.stringify(value) } })) },
      select: LOOKUP_SELECT,
    });
  }

  if (!row) {
    const variant = await prisma.productVariant.findFirst({
      where: { entityId, deletedAt: null, barcode: { in: keys }, product: { deletedAt: null } },
      select: VARIANT_WITH_PRODUCT_SELECT,
    });
    if (variant) {
      return {
        found: true,
        product: await attachModifierGroups(toLookupProduct(variant.product, includeCost)),
        variant: toProductVariantDto(variant, { includeCost }),
        scan,
      };
    }
  }

  if (!row) {
    row = await prisma.product.findFirst({
      where: { ...base, sku: { in: keys } },
      select: LOOKUP_SELECT,
    });
  }

  if (!row) {
    const variant = await prisma.productVariant.findFirst({
      where: { entityId, deletedAt: null, sku: { in: keys }, product: { deletedAt: null } },
      select: VARIANT_WITH_PRODUCT_SELECT,
    });
    if (variant) {
      return {
        found: true,
        product: await attachModifierGroups(toLookupProduct(variant.product, includeCost)),
        variant: toProductVariantDto(variant, { includeCost }),
        scan,
      };
    }
  }

  if (!row) return { found: false, scan };

  return {
    found: true,
    product: await attachModifierGroups(toLookupProduct(row, includeCost)),
    scan,
  };
}

/* -------------------------------------------------------------------------- */
/* Restaurant menu grid                                                        */
/* -------------------------------------------------------------------------- */

export interface MenuItem {
  id: string;
  sku: string;
  namePt: string;
  nameEn: string | null;
  salePriceMinor: number;
  taxRateBps: number;
  unit: Unit;
  type: ProductType;
  tileColor: string | null;
  imageUrl: string | null;
  prepStation: PrepStation | null;
  available: boolean;
  trackStock: boolean;
  stockQuantity: number;
  modifierGroups: ModifierGroupDto[];
}

export interface MenuCategory {
  id: string | null;
  namePt: string;
  nameEn: string | null;
  color: string | null;
  sortOrder: number;
  items: MenuItem[];
}

/** Categories with their menu items, shaped so the UI can render tiles directly. */
export async function buildMenu(entityId: string, includeUnavailable: boolean): Promise<MenuCategory[]> {
  const products = await prisma.product.findMany({
    where: {
      entityId,
      deletedAt: null,
      active: true,
      isMenuItem: true,
      ...(includeUnavailable ? {} : { available: true }),
    },
    orderBy: [{ quickGridOrder: 'asc' }, { namePt: 'asc' }],
    include: {
      category: { select: { id: true, namePt: true, nameEn: true, color: true, sortOrder: true } },
      images: { select: { url: true }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
      modifierGroups: {
        orderBy: { sortOrder: 'asc' },
        include: { group: { include: { modifiers: { orderBy: { sortOrder: 'asc' } } } } },
      },
    },
  });

  const buckets = new Map<string, MenuCategory>();

  for (const product of products) {
    const key = product.category?.id ?? '';
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = product.category
        ? {
            id: product.category.id,
            namePt: product.category.namePt,
            nameEn: product.category.nameEn,
            color: product.category.color,
            sortOrder: product.category.sortOrder,
            items: [],
          }
        : {
            id: null,
            namePt: 'Sem categoria',
            nameEn: 'Uncategorised',
            color: null,
            sortOrder: Number.MAX_SAFE_INTEGER,
            items: [],
          };
      buckets.set(key, bucket);
    }

    bucket.items.push({
      id: product.id,
      sku: product.sku,
      namePt: product.namePt,
      nameEn: product.nameEn,
      salePriceMinor: minorToNumber(product.salePriceMinor),
      taxRateBps: product.taxRateBps,
      unit: product.unit as Unit,
      type: product.type as ProductType,
      tileColor: product.tileColor,
      imageUrl: product.images[0]?.url ?? null,
      prepStation: (product.prepStation as PrepStation | null) ?? null,
      available: product.available,
      trackStock: product.trackStock,
      stockQuantity: product.stockQuantity,
      modifierGroups: product.modifierGroups.map((link) => toModifierGroupDto(link.group)),
    });
  }

  return [...buckets.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.namePt.localeCompare(b.namePt),
  );
}
