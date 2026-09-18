import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { EntitySettings } from '@pos/shared';

import { prisma, type Tx } from '../../lib/prisma.js';
import { setSettings } from '../../lib/settings.js';

import {
  settingsPatchSchema,
  taxRateSchema,
  type ImportPayload,
  type ImportProduct,
  type TaxRateInput,
} from './schemas.js';

/* -------------------------------------------------------------------------- */
/* Tax rate catalogue                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The named tax catalogue lives in the same key/value settings table as
 * EntitySettings, under a key the shared EntitySettings type does not declare.
 * Everything is written through setSettings() so the serialisation stays
 * identical to every other setting.
 */
export const TAX_RATES_KEY = 'taxRates';

export interface TaxRate {
  id: string;
  namePt: string;
  rateBps: number;
}

export const DEFAULT_TAX_RATES: TaxRate[] = [
  { id: 'iva14', namePt: 'IVA 14%', rateBps: 1400 },
  { id: 'exempt', namePt: 'Isento', rateBps: 0 },
];

const taxRatesArraySchema = z.array(taxRateSchema);

export async function readTaxRates(entityId: string, client: Tx = prisma): Promise<TaxRate[]> {
  const row = await client.setting.findUnique({
    where: { entityId_key: { entityId, key: TAX_RATES_KEY } },
  });
  if (!row) return DEFAULT_TAX_RATES.map((rate) => ({ ...rate }));

  let raw: unknown;
  try {
    raw = JSON.parse(row.value);
  } catch {
    return DEFAULT_TAX_RATES.map((rate) => ({ ...rate }));
  }

  const parsed = taxRatesArraySchema.safeParse(raw);
  // A hand-edited or legacy row must never break the product editor.
  if (!parsed.success || parsed.data.length === 0) {
    return DEFAULT_TAX_RATES.map((rate) => ({ ...rate }));
  }
  return parsed.data;
}

export async function writeTaxRates(
  entityId: string,
  rates: TaxRateInput[],
  client: Tx = prisma,
): Promise<void> {
  // taxRates is not part of the EntitySettings union, hence the cast; the row
  // format (one JSON-encoded value per key) is exactly the same.
  await setSettings(
    entityId,
    { [TAX_RATES_KEY]: rates } as unknown as Partial<EntitySettings>,
    client,
  );
}

/** How many live products sit on each tax rate, keyed by rate in basis points. */
export async function productCountsByTaxRate(entityId: string): Promise<Map<number, number>> {
  const groups = await prisma.product.groupBy({
    by: ['taxRateBps'],
    where: { entityId, deletedAt: null },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.taxRateBps, group._count._all]));
}

/* -------------------------------------------------------------------------- */
/* Settings diff                                                               */
/* -------------------------------------------------------------------------- */

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!deepEqual(left[key], right[key])) return false;
  }
  return true;
}

export interface SettingsDiff {
  changedKeys: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/** Only the keys the patch actually moved - the audit entry stays readable. */
export function diffSettings(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): SettingsDiff {
  const diff: SettingsDiff = { changedKeys: [], before: {}, after: {} };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (deepEqual(before[key], value)) continue;
    diff.changedKeys.push(key);
    diff.before[key] = before[key] ?? null;
    diff.after[key] = value;
  }

  return diff;
}

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

export const EXPORT_FORMAT = 'pos.entity.export';
export const EXPORT_VERSION = 1;

/** Page size for the streamed product export. */
export const EXPORT_PRODUCT_CHUNK = 200;

export async function exportEntityRecord(entityId: string) {
  const entity = await prisma.entity.findFirst({ where: { id: entityId, deletedAt: null } });
  if (!entity) return null;
  return {
    id: entity.id,
    name: entity.name,
    slug: entity.slug,
    mode: entity.mode,
    nif: entity.nif,
    address: entity.address,
    phone: entity.phone,
    email: entity.email,
    logoUrl: entity.logoUrl,
    accentColor: entity.accentColor,
    currency: entity.currency,
    locale: entity.locale,
    pricingMode: entity.pricingMode,
    costingMethod: entity.costingMethod,
    defaultTaxRateBps: entity.defaultTaxRateBps,
  };
}

export async function exportLocations(entityId: string) {
  const rows = await prisma.location.findMany({
    where: { entityId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    isDefault: row.isDefault,
    active: row.active,
  }));
}

export async function exportCategories(entityId: string) {
  const rows = await prisma.category.findMany({
    where: { entityId, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { namePt: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    parentId: row.parentId,
    namePt: row.namePt,
    nameEn: row.nameEn,
    color: row.color,
    iconUrl: row.iconUrl,
    sortOrder: row.sortOrder,
    active: row.active,
  }));
}

export async function exportSuppliers(entityId: string) {
  const rows = await prisma.supplier.findMany({
    where: { entityId, deletedAt: null },
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    nif: row.nif,
    paymentTerms: row.paymentTerms,
    notes: row.notes,
    active: row.active,
  }));
}

/** One page of products, with images, variants and recipe components. */
export async function exportProductPage(entityId: string, skip: number, take: number) {
  const rows = await prisma.product.findMany({
    where: { entityId, deletedAt: null },
    orderBy: { sku: 'asc' },
    skip,
    take,
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      variants: { where: { deletedAt: null }, orderBy: { sku: 'asc' } },
      recipeOf: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    altBarcodes: parseJsonArray(row.altBarcodes),
    namePt: row.namePt,
    nameEn: row.nameEn,
    descriptionPt: row.descriptionPt,
    descriptionEn: row.descriptionEn,
    categoryId: row.categoryId,
    supplierId: row.supplierId,
    type: row.type,
    unit: row.unit,
    salePriceMinor: Number(row.salePriceMinor),
    costPriceMinor: Number(row.costPriceMinor),
    taxRateBps: row.taxRateBps,
    trackStock: row.trackStock,
    /** Informational only - an import never writes stock directly. */
    stockQuantity: row.stockQuantity,
    minStockLevel: row.minStockLevel,
    maxStockLevel: row.maxStockLevel,
    tileColor: row.tileColor,
    showInQuickGrid: row.showInQuickGrid,
    quickGridOrder: row.quickGridOrder,
    isMenuItem: row.isMenuItem,
    prepStation: row.prepStation,
    available: row.available,
    publishOnline: row.publishOnline,
    onlineSlug: row.onlineSlug,
    weightGrams: row.weightGrams,
    active: row.active,
    images: row.images.map((image) => ({
      url: image.url,
      alt: image.alt,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
    })),
    variants: row.variants.map((variant) => ({
      sku: variant.sku,
      barcode: variant.barcode,
      options: parseJsonObject(variant.options),
      salePriceMinor: variant.salePriceMinor === null ? null : Number(variant.salePriceMinor),
      costPriceMinor: variant.costPriceMinor === null ? null : Number(variant.costPriceMinor),
      stockQuantity: variant.stockQuantity,
      minStockLevel: variant.minStockLevel,
      imageUrl: variant.imageUrl,
      active: variant.active,
    })),
    components: row.recipeOf.map((component) => ({
      componentProductId: component.componentProductId,
      quantity: component.quantity,
      unit: component.unit,
      wastagePercentBps: component.wastagePercentBps,
    })),
  }));
}

export async function countExportableProducts(entityId: string): Promise<number> {
  return prisma.product.count({ where: { entityId, deletedAt: null } });
}

/** Customers without the storefront password hash - credentials never leave. */
export async function exportCustomers(entityId: string) {
  const rows = await prisma.customer.findMany({
    where: { entityId, deletedAt: null },
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    nif: row.nif,
    address: row.address,
    notes: row.notes,
    loyaltyCardNumber: row.loyaltyCardNumber,
    points: row.points,
    tier: row.tier,
    lifetimeSpendMinor: Number(row.lifetimeSpendMinor),
    storeCreditMinor: Number(row.storeCreditMinor),
    orderCount: row.orderCount,
    active: row.active,
  }));
}

export async function exportPromotions(entityId: string) {
  const rows = await prisma.promotion.findMany({
    where: { entityId },
    orderBy: { code: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    namePt: row.namePt,
    nameEn: row.nameEn,
    type: row.type,
    value: row.value,
    categoryId: row.categoryId,
    productIds: parseJsonArray(row.productIds),
    buyQuantity: row.buyQuantity,
    getQuantity: row.getQuantity,
    minSpendMinor: Number(row.minSpendMinor),
    usageLimit: row.usageLimit,
    usageCount: row.usageCount,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    active: row.active,
  }));
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, item] of Object.entries(parsed as Record<string, unknown>)) {
      out[key] = String(item);
    }
    return out;
  } catch {
    return {};
  }
}

/* -------------------------------------------------------------------------- */
/* Import                                                                      */
/* -------------------------------------------------------------------------- */

export interface ImportTally {
  created: number;
  skipped: number;
}

export interface ImportSummary {
  categories: ImportTally;
  suppliers: ImportTally;
  products: ImportTally;
  variants: ImportTally;
  images: ImportTally;
  recipeComponents: ImportTally;
  customers: ImportTally;
  promotions: ImportTally;
  locations: ImportTally;
  settingsApplied: string[];
  taxRatesApplied: boolean;
  warnings: string[];
}

function tally(): ImportTally {
  return { created: 0, skipped: 0 };
}

function emptySummary(): ImportSummary {
  return {
    categories: tally(),
    suppliers: tally(),
    products: tally(),
    variants: tally(),
    images: tally(),
    recipeComponents: tally(),
    customers: tally(),
    promotions: tally(),
    locations: tally(),
    settingsApplied: [],
    taxRatesApplied: false,
    warnings: [],
  };
}

function nullable(value: string | null | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

function toMinorBigInt(value: number | null | undefined, fallback = 0): bigint {
  const source = value === null || value === undefined ? fallback : value;
  return BigInt(Math.round(source));
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Imports catalogue data into `entityId`.
 *
 * Rules that keep this safe to run against a live tenant:
 *  - it only ever ADDS. A row that already exists (same SKU, code, name) is
 *    counted as skipped and left untouched.
 *  - old ids in the file are mapped to the ids in this database; nothing from
 *    the file is ever used as a primary key.
 *  - stock quantities are ignored: stock only moves through the inventory
 *    ledger, never through a settings import.
 *  - users, password hashes and sales are not part of the payload at all.
 */
export async function importCatalogue(
  entityId: string,
  payload: ImportPayload,
  tx: Tx,
): Promise<ImportSummary> {
  const summary = emptySummary();

  /* Locations ------------------------------------------------------------- */
  for (const location of payload.locations ?? []) {
    const existing = await tx.location.findFirst({
      where: { entityId, name: location.name },
      select: { id: true },
    });
    if (existing) {
      summary.locations.skipped++;
      continue;
    }
    await tx.location.create({
      data: {
        entityId,
        name: location.name,
        address: nullable(location.address),
        phone: nullable(location.phone),
        // Never steal the default flag from the location already holding it.
        isDefault: false,
        active: location.active ?? true,
      },
    });
    summary.locations.created++;
  }

  /* Categories ------------------------------------------------------------- */
  const categoryMap = new Map<string, string>();
  const createdCategories: Array<{ oldId: string; newId: string; parentId: string | null }> = [];
  const categories = payload.categories ?? [];

  for (const category of categories) {
    const existing = await tx.category.findFirst({
      where: { entityId, deletedAt: null, namePt: category.namePt },
      select: { id: true },
    });
    if (existing) {
      categoryMap.set(category.id, existing.id);
      summary.categories.skipped++;
      continue;
    }
    const created = await tx.category.create({
      data: {
        entityId,
        namePt: category.namePt,
        nameEn: nullable(category.nameEn),
        color: nullable(category.color),
        iconUrl: nullable(category.iconUrl),
        sortOrder: category.sortOrder ?? 0,
        active: category.active ?? true,
      },
      select: { id: true },
    });
    categoryMap.set(category.id, created.id);
    createdCategories.push({
      oldId: category.id,
      newId: created.id,
      parentId: category.parentId ?? null,
    });
    summary.categories.created++;
  }

  // Second pass: the parent may have been created after the child.
  const parentByOldId = new Map(categories.map((c) => [c.id, c.parentId ?? null]));
  for (const created of createdCategories) {
    if (!created.parentId) continue;
    if (cyclicInPayload(created.oldId, parentByOldId)) {
      summary.warnings.push(`Categoria "${created.oldId}" tem hierarquia circular; pai ignorado.`);
      continue;
    }
    const parentNewId = categoryMap.get(created.parentId);
    if (!parentNewId || parentNewId === created.newId) continue;
    await tx.category.update({ where: { id: created.newId }, data: { parentId: parentNewId } });
  }

  /* Suppliers -------------------------------------------------------------- */
  const supplierMap = new Map<string, string>();
  for (const supplier of payload.suppliers ?? []) {
    const existing = await tx.supplier.findFirst({
      where: { entityId, deletedAt: null, name: supplier.name },
      select: { id: true },
    });
    if (existing) {
      supplierMap.set(supplier.id, existing.id);
      summary.suppliers.skipped++;
      continue;
    }
    const created = await tx.supplier.create({
      data: {
        entityId,
        name: supplier.name,
        contactName: nullable(supplier.contactName),
        phone: nullable(supplier.phone),
        email: nullable(supplier.email),
        address: nullable(supplier.address),
        nif: nullable(supplier.nif),
        paymentTerms: nullable(supplier.paymentTerms),
        notes: nullable(supplier.notes),
        active: supplier.active ?? true,
      },
      select: { id: true },
    });
    supplierMap.set(supplier.id, created.id);
    summary.suppliers.created++;
  }

  /* Products --------------------------------------------------------------- */
  const products = payload.products ?? [];
  const productMap = new Map<string, string>();
  const createdProducts: ImportProduct[] = [];

  for (const product of products) {
    // The [entityId, sku] unique covers soft-deleted rows too, so look without
    // the deletedAt filter or the create below would collide.
    const existing = await tx.product.findFirst({
      where: { entityId, sku: product.sku },
      select: { id: true, deletedAt: true },
    });
    if (existing) {
      summary.products.skipped++;
      if (existing.deletedAt === null) {
        productMap.set(product.id, existing.id);
      } else {
        summary.warnings.push(
          `Produto "${product.sku}" corresponde a um registo eliminado; ignorado.`,
        );
      }
      continue;
    }

    const created = await tx.product.create({
      data: {
        entityId,
        sku: product.sku,
        barcode: nullable(product.barcode),
        altBarcodes: JSON.stringify(product.altBarcodes ?? []),
        namePt: product.namePt,
        nameEn: nullable(product.nameEn),
        descriptionPt: nullable(product.descriptionPt),
        descriptionEn: nullable(product.descriptionEn),
        categoryId: product.categoryId ? (categoryMap.get(product.categoryId) ?? null) : null,
        supplierId: product.supplierId ? (supplierMap.get(product.supplierId) ?? null) : null,
        type: product.type ?? 'standard',
        unit: product.unit ?? 'each',
        salePriceMinor: toMinorBigInt(product.salePriceMinor),
        costPriceMinor: toMinorBigInt(product.costPriceMinor),
        taxRateBps: product.taxRateBps ?? 1400,
        trackStock: product.trackStock ?? true,
        // stockQuantity stays at its default; stock arrives through the ledger.
        minStockLevel: product.minStockLevel ?? 0,
        maxStockLevel: product.maxStockLevel ?? null,
        tileColor: nullable(product.tileColor),
        showInQuickGrid: product.showInQuickGrid ?? false,
        quickGridOrder: product.quickGridOrder ?? 0,
        isMenuItem: product.isMenuItem ?? false,
        prepStation: nullable(product.prepStation),
        available: product.available ?? true,
        publishOnline: product.publishOnline ?? false,
        onlineSlug: nullable(product.onlineSlug),
        weightGrams: product.weightGrams ?? null,
        active: product.active ?? true,
      },
      select: { id: true },
    });

    productMap.set(product.id, created.id);
    createdProducts.push(product);
    summary.products.created++;
  }

  /* Images, variants and recipes - only for products we created ------------- */
  for (const product of createdProducts) {
    const productId = productMap.get(product.id);
    if (!productId) continue;

    for (const image of product.images ?? []) {
      await tx.productImage.create({
        data: {
          productId,
          url: image.url,
          alt: nullable(image.alt),
          sortOrder: image.sortOrder ?? 0,
          isPrimary: image.isPrimary ?? false,
        },
      });
      summary.images.created++;
    }

    for (const variant of product.variants ?? []) {
      const clash = await tx.productVariant.findFirst({
        where: { entityId, sku: variant.sku },
        select: { id: true },
      });
      if (clash) {
        summary.variants.skipped++;
        continue;
      }
      await tx.productVariant.create({
        data: {
          productId,
          entityId,
          sku: variant.sku,
          barcode: nullable(variant.barcode),
          options:
            typeof variant.options === 'string'
              ? variant.options
              : JSON.stringify(variant.options ?? {}),
          salePriceMinor:
            variant.salePriceMinor === null || variant.salePriceMinor === undefined
              ? null
              : toMinorBigInt(variant.salePriceMinor),
          costPriceMinor:
            variant.costPriceMinor === null || variant.costPriceMinor === undefined
              ? null
              : toMinorBigInt(variant.costPriceMinor),
          minStockLevel: variant.minStockLevel ?? 0,
          imageUrl: nullable(variant.imageUrl),
          active: variant.active ?? true,
        },
      });
      summary.variants.created++;
    }
  }

  // Recipes last: a component may be any product the import touched.
  for (const product of createdProducts) {
    const parentProductId = productMap.get(product.id);
    if (!parentProductId) continue;

    for (const component of product.components ?? []) {
      const componentProductId = productMap.get(component.componentProductId);
      if (!componentProductId || componentProductId === parentProductId) {
        summary.recipeComponents.skipped++;
        continue;
      }
      const clash = await tx.recipeComponent.findUnique({
        where: { parentProductId_componentProductId: { parentProductId, componentProductId } },
        select: { id: true },
      });
      if (clash) {
        summary.recipeComponents.skipped++;
        continue;
      }
      await tx.recipeComponent.create({
        data: {
          parentProductId,
          componentProductId,
          quantity: component.quantity,
          unit: component.unit ?? 'each',
          wastagePercentBps: component.wastagePercentBps ?? 0,
        },
      });
      summary.recipeComponents.created++;
    }
  }

  /* Customers -------------------------------------------------------------- */
  for (const customer of payload.customers ?? []) {
    const identity: Prisma.CustomerWhereInput[] = [];
    if (customer.phone) identity.push({ phone: customer.phone });
    if (customer.email) identity.push({ email: customer.email });
    if (customer.loyaltyCardNumber) {
      identity.push({ loyaltyCardNumber: customer.loyaltyCardNumber });
    }

    const existing = identity.length
      ? await tx.customer.findFirst({
          where: { entityId, deletedAt: null, OR: identity },
          select: { id: true },
        })
      : await tx.customer.findFirst({
          where: { entityId, deletedAt: null, name: customer.name },
          select: { id: true },
        });

    if (existing) {
      summary.customers.skipped++;
      continue;
    }

    await tx.customer.create({
      data: {
        entityId,
        name: customer.name,
        phone: nullable(customer.phone),
        email: nullable(customer.email),
        nif: nullable(customer.nif),
        address: nullable(customer.address),
        notes: nullable(customer.notes),
        // passwordHash is never imported - storefront logins are re-created.
        loyaltyCardNumber: nullable(customer.loyaltyCardNumber),
        points: Math.max(0, customer.points ?? 0),
        tier: customer.tier ?? 'none',
        lifetimeSpendMinor: toMinorBigInt(Math.max(0, customer.lifetimeSpendMinor ?? 0)),
        storeCreditMinor: toMinorBigInt(Math.max(0, customer.storeCreditMinor ?? 0)),
        orderCount: Math.max(0, customer.orderCount ?? 0),
        active: customer.active ?? true,
      },
    });
    summary.customers.created++;
  }

  /* Promotions ------------------------------------------------------------- */
  for (const promotion of payload.promotions ?? []) {
    const existing = await tx.promotion.findFirst({
      where: { entityId, code: promotion.code },
      select: { id: true },
    });
    if (existing) {
      summary.promotions.skipped++;
      continue;
    }

    const mappedProductIds = (promotion.productIds ?? [])
      .map((oldId) => productMap.get(oldId))
      .filter((value): value is string => Boolean(value));

    await tx.promotion.create({
      data: {
        entityId,
        code: promotion.code,
        namePt: promotion.namePt,
        nameEn: nullable(promotion.nameEn),
        type: promotion.type,
        value: promotion.value ?? 0,
        categoryId: promotion.categoryId ? (categoryMap.get(promotion.categoryId) ?? null) : null,
        productIds: JSON.stringify(mappedProductIds),
        buyQuantity: promotion.buyQuantity ?? null,
        getQuantity: promotion.getQuantity ?? null,
        minSpendMinor: toMinorBigInt(Math.max(0, promotion.minSpendMinor ?? 0)),
        usageLimit: promotion.usageLimit ?? null,
        usageCount: Math.max(0, promotion.usageCount ?? 0),
        startsAt: parseDate(promotion.startsAt),
        endsAt: parseDate(promotion.endsAt),
        active: promotion.active ?? true,
      },
    });
    summary.promotions.created++;
  }

  /* Settings --------------------------------------------------------------- */
  if (payload.settings && typeof payload.settings === 'object') {
    const parsed = settingsPatchSchema.safeParse(payload.settings);
    if (parsed.success) {
      const patch = parsed.data as Record<string, unknown>;
      const keys = Object.keys(patch).filter((key) => patch[key] !== undefined);
      if (keys.length > 0) {
        await setSettings(entityId, parsed.data as Partial<EntitySettings>, tx);
        summary.settingsApplied = keys;
      }
    } else {
      summary.warnings.push('Definicoes do ficheiro invalidas; ignoradas.');
    }
  }

  if (payload.taxRates !== undefined) {
    const parsed = taxRatesArraySchema.safeParse(payload.taxRates);
    if (parsed.success && parsed.data.length > 0) {
      await writeTaxRates(entityId, parsed.data, tx);
      summary.taxRatesApplied = true;
    } else {
      summary.warnings.push('Tabela de taxas do ficheiro invalida; ignorada.');
    }
  }

  return summary;
}

/** Walks the payload's parent chain to spot a loop before writing one. */
function cyclicInPayload(startId: string, parents: Map<string, string | null>): boolean {
  const seen = new Set<string>([startId]);
  let current = parents.get(startId) ?? null;
  let depth = 0;

  while (current && depth < 64) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = parents.get(current) ?? null;
    depth++;
  }
  return depth >= 64;
}
