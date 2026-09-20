import type { EntityMode, ProductType, Unit } from '@pos/shared';

import { ApiError } from '../../lib/http.js';
import {
  applyStockChange,
  defaultLocationId,
  publishStockChanges,
  type StockChangeResult,
} from '../../lib/inventory.js';
import { prisma, TX_OPTIONS, type Tx } from '../../lib/prisma.js';
import { generateBarcode, generateSku, loadEntityDefaults } from '../products/service.js';

/**
 * Demo content for a brand new client.
 *
 * An empty product is the hardest one to learn: there is nothing to tap, so
 * there is nothing to understand. A handful of real categories and real
 * products - priced in Kwanza, barcoded, with opening stock on the shelf - lets
 * an owner ring up a sale five minutes after signing up and see exactly how the
 * thing behaves before they type in a single item of their own.
 *
 * It is a starting point, not a fixture: everything here is ordinary data the
 * client can rename or delete.
 */

/* -------------------------------------------------------------------------- */
/* Shape of a catalogue                                                        */
/* -------------------------------------------------------------------------- */

interface StarterCategory {
  key: string;
  namePt: string;
  nameEn: string;
  color: string;
}

interface StarterProduct {
  /** Key of the category in the same catalogue. */
  category: string;
  namePt: string;
  nameEn: string;
  /** Shelf price in WHOLE units of the entity's currency (Kwanza by default). */
  price: number;
  /** Cost in whole units. Omitted for dishes that are not stock tracked. */
  cost?: number;
  unit?: Unit;
  type?: ProductType;
  /** Defaults to true for retail/online, false for restaurant dishes. */
  trackStock?: boolean;
  /** Opening quantity on the shelf, booked through the ledger. */
  openingStock?: number;
  minStockLevel?: number;
  /** Pinned to the POS quick grid, so the till is not empty either. */
  quickGrid?: boolean;
  menuItem?: boolean;
  prepStation?: string;
  publishOnline?: boolean;
  weightGrams?: number;
  /** Keys of modifier groups attached to this dish. */
  modifiers?: string[];
}

interface StarterModifierGroup {
  key: string;
  namePt: string;
  nameEn: string;
  /** required | optional | removal */
  type: string;
  minSelect: number;
  maxSelect: number;
  options: Array<{ namePt: string; nameEn: string; delta: number }>;
}

interface StarterFloor {
  areaName: string;
  tableCount: number;
  seats: number;
}

interface StarterCatalogue {
  categories: StarterCategory[];
  products: StarterProduct[];
  modifierGroups: StarterModifierGroup[];
  floor: StarterFloor | null;
}

/* -------------------------------------------------------------------------- */
/* Retail                                                                      */
/* -------------------------------------------------------------------------- */

const RETAIL: StarterCatalogue = {
  categories: [
    { key: 'bebidas', namePt: 'Bebidas', nameEn: 'Drinks', color: '#2F80ED' },
    { key: 'mercearia', namePt: 'Mercearia', nameEn: 'Grocery', color: '#F2814B' },
    { key: 'frescos', namePt: 'Frescos', nameEn: 'Fresh', color: '#16A34A' },
    { key: 'padaria', namePt: 'Padaria', nameEn: 'Bakery', color: '#D6499B' },
  ],
  products: [
    { category: 'bebidas', namePt: 'Agua Mineral 1,5 L', nameEn: 'Mineral Water 1.5 L', price: 450, cost: 300, openingStock: 48, minStockLevel: 12, quickGrid: true },
    { category: 'bebidas', namePt: 'Refrigerante Lata 33 cl', nameEn: 'Soft Drink Can 33 cl', price: 700, cost: 480, openingStock: 72, minStockLevel: 24, quickGrid: true },
    { category: 'bebidas', namePt: 'Cerveja Nacional 33 cl', nameEn: 'Local Beer 33 cl', price: 650, cost: 430, openingStock: 96, minStockLevel: 24, quickGrid: true },
    { category: 'mercearia', namePt: 'Arroz Agulha 1 kg', nameEn: 'Long Grain Rice 1 kg', price: 1800, cost: 1250, openingStock: 40, minStockLevel: 10, quickGrid: true },
    { category: 'mercearia', namePt: 'Oleo Alimentar 1 L', nameEn: 'Cooking Oil 1 L', price: 2500, cost: 1850, openingStock: 30, minStockLevel: 8 },
    { category: 'mercearia', namePt: 'Massa Esparguete 500 g', nameEn: 'Spaghetti 500 g', price: 900, cost: 600, openingStock: 36, minStockLevel: 10 },
    { category: 'mercearia', namePt: 'Acucar Branco 1 kg', nameEn: 'White Sugar 1 kg', price: 1400, cost: 980, openingStock: 32, minStockLevel: 8 },
    { category: 'frescos', namePt: 'Leite UHT 1 L', nameEn: 'UHT Milk 1 L', price: 1100, cost: 780, openingStock: 48, minStockLevel: 12, quickGrid: true },
    { category: 'frescos', namePt: 'Ovos - Duzia', nameEn: 'Eggs - Dozen', price: 2200, cost: 1600, openingStock: 24, minStockLevel: 6 },
    { category: 'frescos', namePt: 'Banana', nameEn: 'Banana', price: 1500, cost: 950, unit: 'kg', type: 'weighted', openingStock: 25, minStockLevel: 5, quickGrid: true },
    { category: 'padaria', namePt: 'Pao de Forma', nameEn: 'Sliced Bread', price: 1300, cost: 900, openingStock: 20, minStockLevel: 5 },
    { category: 'padaria', namePt: 'Pao Carcaca', nameEn: 'Bread Roll', price: 100, cost: 60, openingStock: 200, minStockLevel: 40, quickGrid: true },
  ],
  modifierGroups: [],
  floor: null,
};

/* -------------------------------------------------------------------------- */
/* Restaurant                                                                  */
/* -------------------------------------------------------------------------- */

const RESTAURANT: StarterCatalogue = {
  categories: [
    { key: 'entradas', namePt: 'Entradas', nameEn: 'Starters', color: '#16A34A' },
    { key: 'principais', namePt: 'Pratos Principais', nameEn: 'Main Courses', color: '#E0364A' },
    { key: 'sobremesas', namePt: 'Sobremesas', nameEn: 'Desserts', color: '#D6499B' },
    { key: 'bebidas', namePt: 'Bebidas', nameEn: 'Drinks', color: '#2F80ED' },
  ],
  products: [
    { category: 'entradas', namePt: 'Sopa do Dia', nameEn: 'Soup of the Day', price: 1200, menuItem: true, trackStock: false, prepStation: 'cozinha' },
    { category: 'entradas', namePt: 'Rissois de Camarao (3 un)', nameEn: 'Prawn Rissoles (3)', price: 1800, menuItem: true, trackStock: false, prepStation: 'cozinha' },
    { category: 'principais', namePt: 'Muamba de Galinha', nameEn: 'Chicken Muamba', price: 4500, menuItem: true, trackStock: false, prepStation: 'cozinha', modifiers: ['acompanhamento'] },
    { category: 'principais', namePt: 'Calulu de Peixe', nameEn: 'Fish Calulu', price: 4800, menuItem: true, trackStock: false, prepStation: 'cozinha', modifiers: ['acompanhamento'] },
    { category: 'principais', namePt: 'Frango Grelhado', nameEn: 'Grilled Chicken', price: 3800, menuItem: true, trackStock: false, prepStation: 'grelha', modifiers: ['acompanhamento'] },
    { category: 'principais', namePt: 'Bife de Vaca Grelhado', nameEn: 'Grilled Beef Steak', price: 6500, menuItem: true, trackStock: false, prepStation: 'grelha', modifiers: ['acompanhamento'] },
    { category: 'principais', namePt: 'Feijoada de Ginguba', nameEn: 'Peanut Bean Stew', price: 4000, menuItem: true, trackStock: false, prepStation: 'cozinha', modifiers: ['acompanhamento'] },
    { category: 'sobremesas', namePt: 'Cocada Amarela', nameEn: 'Coconut Pudding', price: 1500, menuItem: true, trackStock: false, prepStation: 'cozinha' },
    { category: 'sobremesas', namePt: 'Pudim de Leite', nameEn: 'Milk Pudding', price: 1400, menuItem: true, trackStock: false, prepStation: 'cozinha' },
    { category: 'bebidas', namePt: 'Agua Mineral 50 cl', nameEn: 'Mineral Water 50 cl', price: 500, cost: 280, menuItem: true, prepStation: 'bar', openingStock: 60, minStockLevel: 12 },
    { category: 'bebidas', namePt: 'Cerveja Nacional 33 cl', nameEn: 'Local Beer 33 cl', price: 800, cost: 430, menuItem: true, prepStation: 'bar', openingStock: 96, minStockLevel: 24 },
    { category: 'bebidas', namePt: 'Sumo Natural', nameEn: 'Fresh Juice', price: 1200, cost: 600, menuItem: true, prepStation: 'bar', openingStock: 40, minStockLevel: 10 },
  ],
  modifierGroups: [
    {
      key: 'acompanhamento',
      namePt: 'Acompanhamento',
      nameEn: 'Side dish',
      type: 'required',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { namePt: 'Arroz Branco', nameEn: 'White Rice', delta: 0 },
        { namePt: 'Funge de Bombo', nameEn: 'Cassava Funge', delta: 0 },
        { namePt: 'Batata Frita', nameEn: 'Chips', delta: 300 },
        { namePt: 'Salada Mista', nameEn: 'Mixed Salad', delta: 500 },
      ],
    },
  ],
  floor: { areaName: 'Sala Principal', tableCount: 8, seats: 4 },
};

/* -------------------------------------------------------------------------- */
/* Online store                                                                */
/* -------------------------------------------------------------------------- */

const ONLINE: StarterCatalogue = {
  categories: [
    { key: 'bebidas', namePt: 'Bebidas', nameEn: 'Drinks', color: '#2F80ED' },
    { key: 'mercearia', namePt: 'Mercearia', nameEn: 'Grocery', color: '#F2814B' },
    { key: 'casa', namePt: 'Casa e Limpeza', nameEn: 'Home and Cleaning', color: '#0E9F9F' },
  ],
  products: [
    { category: 'bebidas', namePt: 'Agua Mineral - Pack 6', nameEn: 'Mineral Water - 6 Pack', price: 2400, cost: 1700, unit: 'pack', publishOnline: true, openingStock: 40, minStockLevel: 8, weightGrams: 9000 },
    { category: 'bebidas', namePt: 'Refrigerante - Pack 6', nameEn: 'Soft Drink - 6 Pack', price: 3900, cost: 2800, unit: 'pack', publishOnline: true, openingStock: 30, minStockLevel: 6, weightGrams: 2200 },
    { category: 'bebidas', namePt: 'Cafe Moido 250 g', nameEn: 'Ground Coffee 250 g', price: 3200, cost: 2300, publishOnline: true, openingStock: 25, minStockLevel: 5, weightGrams: 280 },
    { category: 'mercearia', namePt: 'Arroz Agulha 5 kg', nameEn: 'Long Grain Rice 5 kg', price: 8200, cost: 6100, publishOnline: true, openingStock: 20, minStockLevel: 4, weightGrams: 5000 },
    { category: 'mercearia', namePt: 'Oleo Alimentar 5 L', nameEn: 'Cooking Oil 5 L', price: 11500, cost: 8900, publishOnline: true, openingStock: 15, minStockLevel: 3, weightGrams: 4800 },
    { category: 'mercearia', namePt: 'Feijao Manteiga 1 kg', nameEn: 'Butter Beans 1 kg', price: 2100, cost: 1500, publishOnline: true, openingStock: 30, minStockLevel: 6, weightGrams: 1000 },
    { category: 'mercearia', namePt: 'Leite em Po 400 g', nameEn: 'Powdered Milk 400 g', price: 4600, cost: 3500, publishOnline: true, openingStock: 24, minStockLevel: 6, weightGrams: 450 },
    { category: 'casa', namePt: 'Detergente Louca 1 L', nameEn: 'Dish Soap 1 L', price: 1900, cost: 1300, publishOnline: true, openingStock: 36, minStockLevel: 8, weightGrams: 1050 },
    { category: 'casa', namePt: 'Lixivia 2 L', nameEn: 'Bleach 2 L', price: 1600, cost: 1050, publishOnline: true, openingStock: 30, minStockLevel: 6, weightGrams: 2100 },
    { category: 'casa', namePt: 'Papel Higienico - Pack 4', nameEn: 'Toilet Paper - 4 Pack', price: 2300, cost: 1600, unit: 'pack', publishOnline: true, openingStock: 40, minStockLevel: 10, weightGrams: 500 },
  ],
  modifierGroups: [],
  floor: null,
};

const CATALOGUES: Record<EntityMode, StarterCatalogue> = {
  retail: RETAIL,
  restaurant: RESTAURANT,
  online: ONLINE,
};

/* -------------------------------------------------------------------------- */
/* What the console needs to know before offering it                           */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately count-only. The platform operator may see how far a client has
 * got with their setup; what that client sold is theirs alone, so no money,
 * no sales and no orders appear here.
 */
export interface EntitySetupState {
  entityId: string;
  mode: EntityMode;
  productCount: number;
  categoryCount: number;
  userCount: number;
  locationCount: number;
  tableCount: number;
  /** Someone in this business can actually sign in. */
  hasAdmin: boolean;
  /** The starter catalogue can still be seeded (no products yet). */
  canSeedStarter: boolean;
  /** How many products seeding would create, so the button can say so. */
  starterProductCount: number;
}

export async function loadSetupState(entityId: string): Promise<EntitySetupState> {
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, deletedAt: null },
    select: { id: true, mode: true },
  });
  if (!entity) throw ApiError.notFound('Entidade nao encontrada.');

  const mode = entity.mode as EntityMode;

  const [productCount, categoryCount, userCount, locationCount, tableCount, adminCount] =
    await Promise.all([
      prisma.product.count({ where: { entityId, deletedAt: null } }),
      prisma.category.count({ where: { entityId, deletedAt: null } }),
      prisma.user.count({ where: { entityId, deletedAt: null } }),
      prisma.location.count({ where: { entityId, active: true } }),
      prisma.restaurantTable.count({ where: { entityId, active: true } }),
      prisma.user.count({
        where: { entityId, deletedAt: null, active: true, role: { in: ['entity_admin', 'manager'] } },
      }),
    ]);

  return {
    entityId,
    mode,
    productCount,
    categoryCount,
    userCount,
    locationCount,
    tableCount,
    hasAdmin: adminCount > 0,
    canSeedStarter: productCount === 0,
    starterProductCount: CATALOGUES[mode].products.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Seeding                                                                     */
/* -------------------------------------------------------------------------- */

export interface StarterContentSummary {
  entityId: string;
  mode: EntityMode;
  categories: number;
  products: number;
  modifierGroups: number;
  floorAreas: number;
  tables: number;
}

/** Whole currency units in, integer minor units out. */
function minor(value: number): number {
  return Math.round(value * 100);
}

interface PreparedProduct {
  spec: StarterProduct;
  sku: string;
  barcode: string;
}

/**
 * Eight tables laid out 4 x 2 on the standard 1200 x 800 canvas, with the same
 * margins the floor plan editor uses, so the first thing a restaurant sees is a
 * room that already looks like a room.
 */
function tableLayout(index: number, seats: number) {
  const columns = 4;
  const size = 120;
  const gapX = 280;
  const gapY = 300;
  const originX = 120;
  const originY = 130;

  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    name: `Mesa ${index + 1}`,
    shape: 'square',
    x: originX + column * gapX,
    y: originY + row * gapY,
    width: size,
    height: size,
    rotation: 0,
    seats,
    status: 'available',
  };
}

/**
 * Seeds the starting catalogue for an entity's mode.
 *
 * Refuses outright once the client has products of their own: this is a leg-up
 * for an empty account, never something that can quietly inject rows into a
 * business that is already trading. Categories, modifier groups and the floor
 * plan are matched by name and skipped when they already exist, so a retry
 * after a partial failure completes the job instead of duplicating it.
 */
export async function seedStarterContent(
  entityId: string,
  actor: { userId?: string | null; userName?: string | null } = {},
): Promise<StarterContentSummary> {
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, deletedAt: null },
    select: { id: true, mode: true, defaultTaxRateBps: true },
  });
  if (!entity) throw ApiError.notFound('Entidade nao encontrada.');

  const mode = entity.mode as EntityMode;
  const catalogue = CATALOGUES[mode];

  const existingProducts = await prisma.product.count({ where: { entityId, deletedAt: null } });
  if (existingProducts > 0) {
    throw ApiError.conflict(
      'Este negocio ja tem produtos. O catalogo de exemplo so pode ser criado num negocio vazio.',
    );
  }

  const locationId = await defaultLocationId(entityId);
  const { skuPrefix } = await loadEntityDefaults(entityId);

  // SKUs and barcodes come from the entity's own sequences, which create-then-
  // increment; burning a number on a failure is far cheaper than doing that
  // inside the transaction that writes the rows.
  const prepared: PreparedProduct[] = [];
  for (const spec of catalogue.products) {
    prepared.push({
      spec,
      sku: await generateSku(entityId, skuPrefix),
      barcode: await generateBarcode(entityId),
    });
  }

  const summary = await prisma.$transaction(async (tx: Tx) => {
    /* Categories - reuse anything already named the same. */
    const categoryIds = new Map<string, string>();
    let categoriesCreated = 0;

    for (const [index, category] of catalogue.categories.entries()) {
      const existing = await tx.category.findFirst({
        where: { entityId, namePt: category.namePt, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        categoryIds.set(category.key, existing.id);
        continue;
      }
      const created = await tx.category.create({
        data: {
          entityId,
          namePt: category.namePt,
          nameEn: category.nameEn,
          color: category.color,
          sortOrder: index,
          active: true,
        },
        select: { id: true },
      });
      categoryIds.set(category.key, created.id);
      categoriesCreated += 1;
    }

    /* Modifier groups. */
    const groupIds = new Map<string, string>();
    let groupsCreated = 0;

    for (const [index, group] of catalogue.modifierGroups.entries()) {
      const existing = await tx.modifierGroup.findFirst({
        where: { entityId, namePt: group.namePt },
        select: { id: true },
      });
      if (existing) {
        groupIds.set(group.key, existing.id);
        continue;
      }
      const created = await tx.modifierGroup.create({
        data: {
          entityId,
          namePt: group.namePt,
          nameEn: group.nameEn,
          type: group.type,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          sortOrder: index,
        },
        select: { id: true },
      });
      for (const [optionIndex, option] of group.options.entries()) {
        await tx.modifier.create({
          data: {
            groupId: created.id,
            namePt: option.namePt,
            nameEn: option.nameEn,
            priceDeltaMinor: BigInt(minor(option.delta)),
            sortOrder: optionIndex,
            available: true,
          },
        });
      }
      groupIds.set(group.key, created.id);
      groupsCreated += 1;
    }

    /* Products. */
    const stockChanges: StockChangeResult[] = [];
    let quickGridOrder = 0;

    for (const { spec, sku, barcode } of prepared) {
      // A dish is cooked to order and is not counted; a bottle pulled from the
      // bar fridge is, even though it sits on the same menu. Declaring an
      // opening quantity is what says which of the two this is - without that
      // reading, a spec's openingStock would be silently thrown away and the
      // bar would start the day showing nothing in the fridge.
      const trackStock = spec.trackStock ?? (spec.openingStock !== undefined || !spec.menuItem);
      const quickGrid = spec.quickGrid ?? false;

      const product = await tx.product.create({
        data: {
          entityId,
          sku,
          barcode,
          namePt: spec.namePt,
          nameEn: spec.nameEn,
          categoryId: categoryIds.get(spec.category) ?? null,
          type: spec.type ?? 'standard',
          unit: spec.unit ?? 'each',
          salePriceMinor: BigInt(minor(spec.price)),
          costPriceMinor: BigInt(minor(spec.cost ?? 0)),
          taxRateBps: entity.defaultTaxRateBps,
          trackStock,
          minStockLevel: spec.minStockLevel ?? 0,
          showInQuickGrid: quickGrid,
          quickGridOrder: quickGrid ? (quickGridOrder += 1) : 0,
          isMenuItem: spec.menuItem ?? false,
          prepStation: spec.prepStation ?? null,
          available: true,
          publishOnline: spec.publishOnline ?? false,
          onlineSlug: spec.publishOnline ? `${slugSegment(spec.namePt)}-${sku.toLowerCase()}` : null,
          weightGrams: spec.weightGrams ?? null,
          active: true,
        },
        select: { id: true },
      });

      for (const groupKey of spec.modifiers ?? []) {
        const groupId = groupIds.get(groupKey);
        if (!groupId) continue;
        await tx.productModifierGroup.create({
          data: { productId: product.id, groupId, sortOrder: 0 },
        });
      }

      // Opening stock goes through the ledger like every other movement, so
      // the StockMovement history explains where the quantity came from.
      const opening = spec.openingStock ?? 0;
      if (trackStock && opening > 0) {
        stockChanges.push(
          await applyStockChange(tx, {
            entityId,
            productId: product.id,
            locationId,
            quantity: opening,
            type: 'initial',
            unitCostMinor: spec.cost != null ? minor(spec.cost) : null,
            reason: 'starter_content',
            note: 'Stock inicial do catalogo de exemplo',
            userId: actor.userId ?? null,
            userName: actor.userName ?? null,
          }),
        );
      }
    }

    /* Floor plan. */
    let floorAreas = 0;
    let tables = 0;

    if (catalogue.floor) {
      const existingArea = await tx.floorArea.findFirst({
        where: { entityId },
        select: { id: true },
      });

      if (!existingArea) {
        const area = await tx.floorArea.create({
          data: {
            entityId,
            name: catalogue.floor.areaName,
            sortOrder: 0,
            width: 1200,
            height: 800,
          },
          select: { id: true },
        });
        floorAreas = 1;

        for (let index = 0; index < catalogue.floor.tableCount; index += 1) {
          const layout = tableLayout(index, catalogue.floor.seats);
          const clash = await tx.restaurantTable.findFirst({
            where: { entityId, name: layout.name },
            select: { id: true },
          });
          if (clash) continue;
          await tx.restaurantTable.create({
            data: { entityId, areaId: area.id, active: true, ...layout },
          });
          tables += 1;
        }
      }
    }

    return {
      entityId,
      mode,
      categories: categoriesCreated,
      products: prepared.length,
      modifierGroups: groupsCreated,
      floorAreas,
      tables,
      stockChanges,
    };
  }, TX_OPTIONS);

  // Always after the commit: the sockets must never see a state the database
  // could still roll back.
  await publishStockChanges(entityId, summary.stockChanges);

  return {
    entityId: summary.entityId,
    mode: summary.mode,
    categories: summary.categories,
    products: summary.products,
    modifierGroups: summary.modifierGroups,
    floorAreas: summary.floorAreas,
    tables: summary.tables,
  };
}

/** "Agua Mineral 1,5 L" -> "agua-mineral-1-5-l", for the online store URL. */
function slugSegment(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/g, '') || 'produto'
  );
}
