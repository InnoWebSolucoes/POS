import { Router } from 'express';
import { Prisma } from '@prisma/client';
import type { ProductType, Unit } from '@pos/shared';

import { AUDIT_ACTIONS, auditRequest } from '../../lib/audit.js';
import {
  ApiError,
  asyncHandler,
  pageParams,
  paginated,
  parsedQuery,
  validateBody,
  validateQuery,
} from '../../lib/http.js';
import { applyStockChange, publishStockChanges, type StockChangeResult } from '../../lib/inventory.js';
import {
  canSeeCost,
  requireAuth,
  requireAuthContext,
  requireEntity,
  requirePermission,
} from '../../lib/middleware.js';
import { prisma, TX_OPTIONS } from '../../lib/prisma.js';
import { deleteUpload } from '../../lib/uploads.js';

import {
  assertProductRules,
  cartesian,
  minorToNumber,
  optionsKey,
  parseOptions,
  resolveTrackStock,
  searchTerms,
  skuSegment,
  toMinorColumn,
  uniqueStrings,
} from './helpers.js';
import {
  toModifierDto,
  toModifierGroupDto,
  toProductDto,
  toProductVariantDto,
  toRecipeComponentDto,
} from './mappers.js';
import {
  assertCategory,
  assertComponentProducts,
  assertLocation,
  assertModifierGroups,
  assertNoRecipeCycle,
  assertSupplier,
  buildMenu,
  categoryWithDescendants,
  generateBarcode,
  generateSku,
  loadEntityDefaults,
  loadProductDto,
  lookupByCode,
  lowStockProductIds,
  PRODUCT_LIST_INCLUDE,
  requireProduct,
} from './service.js';
import {
  attachModifierGroupSchema,
  bulkEditSchema,
  createModifierGroupSchema,
  createProductSchema,
  listQuerySchema,
  lookupQuerySchema,
  menuQuerySchema,
  modifierInputSchema,
  recipeSchema,
  updateModifierGroupSchema,
  updateModifierSchema,
  updateProductSchema,
  updateVariantSchema,
  variantMatrixSchema,
  type AttachModifierGroupInput,
  type BulkEditInput,
  type CreateModifierGroupInput,
  type CreateProductInput,
  type ListQuery,
  type LookupQuery,
  type MenuQuery,
  type ModifierInput,
  type RecipeInput,
  type UpdateModifierGroupInput,
  type UpdateModifierInput,
  type UpdateProductInput,
  type UpdateVariantInput,
  type VariantMatrixInput,
} from './schemas.js';

const router = Router();

/** Hard ceiling on one variant-matrix call, so a typo cannot create thousands. */
const MAX_MATRIX_VARIANTS = 200;

/* -------------------------------------------------------------------------- */
/* Local helpers                                                               */
/* -------------------------------------------------------------------------- */

interface ImageInput {
  url: string;
  alt?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
}

interface ImageRowData {
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

/** Exactly one primary image, stable sort order. */
function normalizeImages(images: ImageInput[]): ImageRowData[] {
  const rows: ImageRowData[] = images.map((image, index) => ({
    url: image.url,
    alt: image.alt ?? null,
    sortOrder: image.sortOrder ?? index,
    isPrimary: image.isPrimary ?? false,
  }));

  if (rows.length > 0 && !rows.some((row) => row.isPrimary)) rows[0]!.isPrimary = true;

  let primarySeen = false;
  for (const row of rows) {
    if (!row.isPrimary) continue;
    if (primarySeen) row.isPrimary = false;
    else primarySeen = true;
  }
  return rows;
}

/** TSHIRT + { Tamanho: "M", Cor: "Preto" } -> TSHIRT-M-PRETO */
function buildVariantSku(parentSku: string, options: Record<string, string>, fallbackIndex: number): string {
  const parts = Object.values(options)
    .map((value) => skuSegment(value))
    .filter((part) => part.length > 0);
  if (parts.length === 0) return `${parentSku}-V${fallbackIndex}`;
  return `${parentSku}-${parts.join('-')}`;
}

function uniqueSku(base: string, taken: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
}

/** A "required" group the guest must answer needs at least one selection. */
function assertModifierGroupRules(input: { type: string; minSelect: number; maxSelect: number }): void {
  if (input.type === 'required' && input.minSelect < 1) {
    throw ApiError.unprocessable('Um grupo obrigatorio tem de exigir pelo menos uma escolha.', {
      minSelect: ['Minimo de 1 para um grupo obrigatorio.'],
    });
  }
  if (input.maxSelect > 0 && input.maxSelect < input.minSelect) {
    throw ApiError.unprocessable('O maximo de escolhas nao pode ser inferior ao minimo.', {
      maxSelect: ['Maximo inferior ao minimo.'],
    });
  }
}

async function assertLinkedProduct(entityId: string, productId: string | null | undefined): Promise<void> {
  if (!productId) return;
  const product = await prisma.product.findFirst({
    where: { id: productId, entityId, deletedAt: null },
    select: { id: true },
  });
  if (!product) {
    throw ApiError.unprocessable('Produto associado ao modificador nao encontrado.', {
      linkedProductId: ['Produto invalido.'],
    });
  }
}

/* ========================================================================== */
/* Catalogue                                                                   */
/* ========================================================================== */

/** GET /api/products - paginated catalogue with the register-side filters. */
router.get(
  '/',
  requireAuth,
  requirePermission('product:read'),
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<ListQuery>(res);
    const params = pageParams(query);

    const where: Prisma.ProductWhereInput = { entityId, deletedAt: null };

    if (query.search) {
      // SQLite has no case-insensitive contains, so probe the usual casings.
      const terms = searchTerms(query.search);
      where.OR = terms.flatMap((term) => [
        { namePt: { contains: term } },
        { nameEn: { contains: term } },
        { sku: { contains: term } },
        { barcode: { contains: term } },
      ]);
    }

    if (query.categoryId) {
      where.categoryId = { in: await categoryWithDescendants(entityId, query.categoryId) };
    }
    if (query.type) where.type = query.type;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.active !== undefined) where.active = query.active;
    if (query.quickGrid !== undefined) where.showInQuickGrid = query.quickGrid;
    if (query.menu !== undefined) where.isMenuItem = query.menu;
    if (query.online !== undefined) where.publishOnline = query.online;

    if (query.lowStock) {
      where.id = { in: await lowStockProductIds(entityId, where) };
    }

    const sortColumns = {
      name: 'namePt',
      price: 'salePriceMinor',
      stock: 'stockQuantity',
      created: 'createdAt',
    } as const;
    const column = sortColumns[query.sort ?? 'name'];
    const direction = query.order ?? (query.sort === 'created' ? 'desc' : 'asc');
    const orderBy = { [column]: direction } as Prisma.ProductOrderByWithRelationInput;

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: params.skip,
        take: params.take,
        include: PRODUCT_LIST_INCLUDE,
      }),
      prisma.product.count({ where }),
    ]);

    const includeCost = canSeeCost(req);
    res.json(paginated(rows.map((row) => toProductDto(row, { includeCost })), total, params));
  }),
);

/**
 * GET /api/products/lookup - the register hot path.
 * A miss is not an error: 200 with found:false lets the UI offer "create this".
 */
router.get(
  '/lookup',
  requireAuth,
  requirePermission('product:read'),
  validateQuery(lookupQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<LookupQuery>(res);
    res.json(await lookupByCode(entityId, query.code, canSeeCost(req)));
  }),
);

/** GET /api/products/menu - the restaurant tile grid, grouped by category. */
router.get(
  '/menu',
  requireAuth,
  requirePermission('product:read'),
  validateQuery(menuQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<MenuQuery>(res);
    res.json({ categories: await buildMenu(entityId, query.includeUnavailable ?? false) });
  }),
);

/* ========================================================================== */
/* Modifier groups (restaurant)                                                */
/* Registered before /:id so the literal paths win.                            */
/* ========================================================================== */

router.get(
  '/modifier-groups',
  requireAuth,
  requirePermission('product:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const groups = await prisma.modifierGroup.findMany({
      where: { entityId },
      orderBy: [{ sortOrder: 'asc' }, { namePt: 'asc' }],
      include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json(groups.map(toModifierGroupDto));
  }),
);

router.post(
  '/modifier-groups',
  requireAuth,
  requirePermission('product:write'),
  validateBody(createModifierGroupSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as CreateModifierGroupInput;

    const type = body.type ?? 'optional';
    const minSelect = body.minSelect ?? (type === 'required' ? 1 : 0);
    const maxSelect = body.maxSelect ?? 1;
    assertModifierGroupRules({ type, minSelect, maxSelect });

    for (const modifier of body.modifiers ?? []) {
      await assertLinkedProduct(entityId, modifier.linkedProductId);
    }

    const group = await prisma.modifierGroup.create({
      data: {
        entityId,
        namePt: body.namePt,
        nameEn: body.nameEn ?? null,
        type,
        minSelect,
        maxSelect,
        sortOrder: body.sortOrder ?? 0,
        modifiers: {
          create: (body.modifiers ?? []).map((modifier, index) => ({
            namePt: modifier.namePt,
            nameEn: modifier.nameEn ?? null,
            priceDeltaMinor: toMinorColumn(modifier.priceDeltaMinor ?? 0),
            sortOrder: modifier.sortOrder ?? index,
            available: modifier.available ?? true,
            linkedProductId: modifier.linkedProductId ?? null,
          })),
        },
      },
      include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
    });

    res.status(201).json(toModifierGroupDto(group));
  }),
);

router.patch(
  '/modifier-groups/:id',
  requireAuth,
  requirePermission('product:write'),
  validateBody(updateModifierGroupSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as UpdateModifierGroupInput;

    const existing = await prisma.modifierGroup.findFirst({
      where: { id: req.params.id, entityId },
      select: { id: true, type: true, minSelect: true, maxSelect: true },
    });
    if (!existing) throw ApiError.notFound('Grupo de modificadores nao encontrado.');

    const type = body.type ?? existing.type;
    const minSelect = body.minSelect ?? existing.minSelect;
    const maxSelect = body.maxSelect ?? existing.maxSelect;
    assertModifierGroupRules({ type, minSelect, maxSelect });

    const group = await prisma.modifierGroup.update({
      where: { id: existing.id },
      data: {
        ...(body.namePt !== undefined ? { namePt: body.namePt } : {}),
        ...(body.nameEn !== undefined ? { nameEn: body.nameEn ?? null } : {}),
        type,
        minSelect,
        maxSelect,
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
      include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
    });

    res.json(toModifierGroupDto(group));
  }),
);

router.delete(
  '/modifier-groups/:id',
  requireAuth,
  requirePermission('product:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const existing = await prisma.modifierGroup.findFirst({
      where: { id: req.params.id, entityId },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Grupo de modificadores nao encontrado.');

    // The schema has no deletedAt here; modifiers and product links cascade.
    await prisma.modifierGroup.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }),
);

router.post(
  '/modifier-groups/:id/modifiers',
  requireAuth,
  requirePermission('product:write'),
  validateBody(modifierInputSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as ModifierInput;

    const group = await prisma.modifierGroup.findFirst({
      where: { id: req.params.id, entityId },
      select: { id: true, _count: { select: { modifiers: true } } },
    });
    if (!group) throw ApiError.notFound('Grupo de modificadores nao encontrado.');

    await assertLinkedProduct(entityId, body.linkedProductId);

    const modifier = await prisma.modifier.create({
      data: {
        groupId: group.id,
        namePt: body.namePt,
        nameEn: body.nameEn ?? null,
        priceDeltaMinor: toMinorColumn(body.priceDeltaMinor ?? 0),
        sortOrder: body.sortOrder ?? group._count.modifiers,
        available: body.available ?? true,
        linkedProductId: body.linkedProductId ?? null,
      },
    });

    res.status(201).json(toModifierDto(modifier));
  }),
);

router.patch(
  '/modifiers/:id',
  requireAuth,
  requirePermission('product:write'),
  validateBody(updateModifierSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as UpdateModifierInput;

    const existing = await prisma.modifier.findFirst({
      where: { id: req.params.id, group: { entityId } },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Modificador nao encontrado.');

    if (body.linkedProductId !== undefined) {
      await assertLinkedProduct(entityId, body.linkedProductId);
    }

    const modifier = await prisma.modifier.update({
      where: { id: existing.id },
      data: {
        ...(body.namePt !== undefined ? { namePt: body.namePt } : {}),
        ...(body.nameEn !== undefined ? { nameEn: body.nameEn ?? null } : {}),
        ...(body.priceDeltaMinor !== undefined
          ? { priceDeltaMinor: toMinorColumn(body.priceDeltaMinor) }
          : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.available !== undefined ? { available: body.available } : {}),
        ...(body.linkedProductId !== undefined
          ? { linkedProductId: body.linkedProductId ?? null }
          : {}),
      },
    });

    res.json(toModifierDto(modifier));
  }),
);

router.delete(
  '/modifiers/:id',
  requireAuth,
  requirePermission('product:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const existing = await prisma.modifier.findFirst({
      where: { id: req.params.id, group: { entityId } },
      select: {
        id: true,
        group: { select: { id: true, type: true, minSelect: true, _count: { select: { modifiers: true } } } },
      },
    });
    if (!existing) throw ApiError.notFound('Modificador nao encontrado.');

    const remaining = existing.group._count.modifiers - 1;
    if (existing.group.type === 'required' && remaining < existing.group.minSelect) {
      throw ApiError.conflict(
        'Um grupo obrigatorio ficaria com menos opcoes do que o minimo exigido.',
      );
    }

    await prisma.modifier.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }),
);

/* ========================================================================== */
/* Bulk edit                                                                   */
/* ========================================================================== */

router.post(
  '/bulk',
  requireAuth,
  requirePermission('product:write'),
  validateBody(bulkEditSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as BulkEditInput;
    const { patch } = body;

    if (patch.categoryId !== undefined) await assertCategory(entityId, patch.categoryId);
    if (patch.supplierId !== undefined) await assertSupplier(entityId, patch.supplierId);

    const data: Prisma.ProductUncheckedUpdateManyInput = {};
    if (patch.categoryId !== undefined) data.categoryId = patch.categoryId ?? null;
    if (patch.supplierId !== undefined) data.supplierId = patch.supplierId ?? null;
    if (patch.taxRateBps !== undefined) data.taxRateBps = patch.taxRateBps;
    if (patch.active !== undefined) data.active = patch.active;
    if (patch.showInQuickGrid !== undefined) data.showInQuickGrid = patch.showInQuickGrid;
    if (patch.available !== undefined) data.available = patch.available;

    const ids = uniqueStrings(body.ids);

    const result = await prisma.$transaction(
      async (tx) =>
        tx.product.updateMany({
          where: { entityId, deletedAt: null, id: { in: ids } },
          data,
        }),
      TX_OPTIONS,
    );

    await auditRequest(req, {
      action: AUDIT_ACTIONS.PRODUCT_UPDATE,
      targetType: 'product',
      targetId: null,
      details: { bulk: true, count: result.count, ids, patch },
    });

    res.json({ updated: result.count });
  }),
);

/* ========================================================================== */
/* Variants                                                                    */
/* ========================================================================== */

router.patch(
  '/variants/:id',
  requireAuth,
  requirePermission('product:write'),
  validateBody(updateVariantSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as UpdateVariantInput;

    const existing = await prisma.productVariant.findFirst({
      where: { id: req.params.id, entityId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Variante nao encontrada.');

    const variant = await prisma.productVariant.update({
      where: { id: existing.id },
      data: {
        ...(body.sku !== undefined ? { sku: body.sku } : {}),
        ...(body.barcode !== undefined ? { barcode: body.barcode ?? null } : {}),
        ...(body.options !== undefined ? { options: JSON.stringify(body.options) } : {}),
        ...(body.salePriceMinor !== undefined
          ? { salePriceMinor: body.salePriceMinor === null ? null : toMinorColumn(body.salePriceMinor) }
          : {}),
        ...(body.costPriceMinor !== undefined
          ? { costPriceMinor: body.costPriceMinor === null ? null : toMinorColumn(body.costPriceMinor) }
          : {}),
        ...(body.minStockLevel !== undefined ? { minStockLevel: body.minStockLevel } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl ?? null } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });

    await auditRequest(req, {
      action: AUDIT_ACTIONS.PRODUCT_UPDATE,
      targetType: 'product_variant',
      targetId: variant.id,
      details: { sku: variant.sku },
    });

    res.json(toProductVariantDto(variant, { includeCost: canSeeCost(req) }));
  }),
);

router.delete(
  '/variants/:id',
  requireAuth,
  requirePermission('product:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const existing = await prisma.productVariant.findFirst({
      where: { id: req.params.id, entityId, deletedAt: null },
      select: { id: true, sku: true },
    });
    if (!existing) throw ApiError.notFound('Variante nao encontrada.');

    await prisma.productVariant.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), active: false },
    });

    await auditRequest(req, {
      action: AUDIT_ACTIONS.PRODUCT_DELETE,
      targetType: 'product_variant',
      targetId: existing.id,
      details: { sku: existing.sku },
    });

    res.json({ ok: true });
  }),
);

/* ========================================================================== */
/* Single product                                                              */
/* ========================================================================== */

router.get(
  '/:id',
  requireAuth,
  requirePermission('product:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    res.json(await loadProductDto(entityId, req.params.id, canSeeCost(req)));
  }),
);

router.post(
  '/',
  requireAuth,
  requirePermission('product:write'),
  validateBody(createProductSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const body = req.body as CreateProductInput;

    const type = (body.type ?? 'standard') as ProductType;
    const unit = (body.unit ?? (type === 'weighted' ? 'kg' : 'each')) as Unit;
    const components = body.components ?? [];
    const groupIds = uniqueStrings(body.modifierGroupIds ?? []);

    assertProductRules({ type, unit, componentCount: components.length });
    await assertCategory(entityId, body.categoryId);
    await assertSupplier(entityId, body.supplierId);
    await assertComponentProducts(entityId, components, null);
    await assertModifierGroups(entityId, groupIds);
    await assertLocation(entityId, body.initialStock?.locationId);

    const defaults = await loadEntityDefaults(entityId);
    const trackStock = resolveTrackStock(type, body.trackStock, true);
    const costPriceMinor = body.costPriceMinor ?? 0;

    // Identifiers are reserved before the transaction opens - see service.ts.
    const sku = body.sku?.trim() || (await generateSku(entityId, defaults.skuPrefix));
    const barcode = body.barcode?.trim() || (await generateBarcode(entityId));

    const takenVariantSkus = new Set(
      (await prisma.productVariant.findMany({ where: { entityId }, select: { sku: true } })).map(
        (row) => row.sku,
      ),
    );

    const plannedVariants: Array<{
      sku: string;
      barcode: string;
      options: Record<string, string>;
      salePriceMinor: number | null;
      costPriceMinor: number | null;
      minStockLevel: number;
      imageUrl: string | null;
      active: boolean;
      initialStock: number;
    }> = [];

    let index = 1;
    for (const variant of body.variants ?? []) {
      const options = variant.options ?? {};
      plannedVariants.push({
        sku: variant.sku?.trim()
          ? uniqueSku(variant.sku.trim(), takenVariantSkus)
          : uniqueSku(buildVariantSku(sku, options, index), takenVariantSkus),
        barcode: variant.barcode?.trim() || (await generateBarcode(entityId)),
        options,
        salePriceMinor: variant.salePriceMinor ?? null,
        costPriceMinor: variant.costPriceMinor ?? null,
        minStockLevel: variant.minStockLevel ?? 0,
        imageUrl: variant.imageUrl ?? null,
        active: variant.active ?? true,
        initialStock: variant.initialStock ?? 0,
      });
      index += 1;
    }

    const images = normalizeImages(body.images ?? []);
    const changes: StockChangeResult[] = [];

    const productId = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          entityId,
          sku,
          barcode,
          altBarcodes: JSON.stringify(uniqueStrings(body.altBarcodes ?? [])),
          namePt: body.namePt,
          nameEn: body.nameEn ?? null,
          descriptionPt: body.descriptionPt ?? null,
          descriptionEn: body.descriptionEn ?? null,
          categoryId: body.categoryId ?? null,
          supplierId: body.supplierId ?? null,
          type,
          unit,
          salePriceMinor: toMinorColumn(body.salePriceMinor),
          costPriceMinor: toMinorColumn(costPriceMinor),
          avgCostMinor: toMinorColumn(costPriceMinor),
          taxRateBps: body.taxRateBps ?? defaults.defaultTaxRateBps,
          trackStock,
          minStockLevel: body.minStockLevel ?? 0,
          maxStockLevel: body.maxStockLevel ?? null,
          tileColor: body.tileColor ?? null,
          showInQuickGrid: body.showInQuickGrid ?? false,
          quickGridOrder: body.quickGridOrder ?? 0,
          isMenuItem: body.isMenuItem ?? false,
          prepStation: body.prepStation ?? null,
          available: body.available ?? true,
          publishOnline: body.publishOnline ?? false,
          onlineSlug: body.onlineSlug ?? null,
          weightGrams: body.weightGrams ?? null,
          active: body.active ?? true,
          images: images.length > 0 ? { create: images } : undefined,
          recipeOf:
            components.length > 0
              ? {
                  create: components.map((component) => ({
                    componentProductId: component.componentProductId,
                    quantity: component.quantity,
                    unit: component.unit ?? 'each',
                    wastagePercentBps: component.wastagePercentBps ?? 0,
                  })),
                }
              : undefined,
          modifierGroups:
            groupIds.length > 0
              ? { create: groupIds.map((groupId, position) => ({ groupId, sortOrder: position })) }
              : undefined,
        },
        select: { id: true },
      });

      for (const planned of plannedVariants) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            entityId,
            sku: planned.sku,
            barcode: planned.barcode,
            options: JSON.stringify(planned.options),
            salePriceMinor:
              planned.salePriceMinor === null ? null : toMinorColumn(planned.salePriceMinor),
            costPriceMinor:
              planned.costPriceMinor === null ? null : toMinorColumn(planned.costPriceMinor),
            avgCostMinor: toMinorColumn(planned.costPriceMinor ?? costPriceMinor),
            minStockLevel: planned.minStockLevel,
            imageUrl: planned.imageUrl,
            active: planned.active,
          },
          select: { id: true },
        });

        if (trackStock && planned.initialStock !== 0) {
          changes.push(
            await applyStockChange(tx, {
              entityId,
              productId: product.id,
              variantId: variant.id,
              quantity: planned.initialStock,
              type: 'initial',
              unitCostMinor: planned.costPriceMinor ?? costPriceMinor,
              note: 'Stock inicial',
              userId: auth.userId,
              userName: auth.name,
            }),
          );
        }
      }

      if (body.initialStock && trackStock && body.initialStock.quantity !== 0) {
        changes.push(
          await applyStockChange(tx, {
            entityId,
            productId: product.id,
            locationId: body.initialStock.locationId ?? null,
            quantity: body.initialStock.quantity,
            type: 'initial',
            unitCostMinor: body.initialStock.unitCostMinor ?? costPriceMinor,
            note: body.initialStock.note ?? 'Stock inicial',
            userId: auth.userId,
            userName: auth.name,
          }),
        );
      }

      return product.id;
    }, TX_OPTIONS);

    // Never inside the transaction: the quantities could still roll back.
    await publishStockChanges(entityId, changes);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.PRODUCT_CREATE,
      targetType: 'product',
      targetId: productId,
      details: {
        sku,
        barcode,
        namePt: body.namePt,
        type,
        unit,
        salePriceMinor: body.salePriceMinor,
        variantCount: plannedVariants.length,
      },
    });

    res.status(201).json(await loadProductDto(entityId, productId, canSeeCost(req)));
  }),
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('product:write'),
  validateBody(updateProductSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as UpdateProductInput;

    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, entityId, deletedAt: null },
      include: { images: true },
    });
    if (!existing) throw ApiError.notFound('Produto nao encontrado.');

    const type = (body.type ?? existing.type) as ProductType;
    const unit = (body.unit ?? existing.unit) as Unit;
    const components = body.components;
    const componentCount = components
      ? components.length
      : await prisma.recipeComponent.count({ where: { parentProductId: existing.id } });

    assertProductRules({ type, unit, componentCount });

    if (body.categoryId !== undefined) await assertCategory(entityId, body.categoryId);
    if (body.supplierId !== undefined) await assertSupplier(entityId, body.supplierId);
    if (components) {
      await assertComponentProducts(entityId, components, existing.id);
      await assertNoRecipeCycle(
        entityId,
        existing.id,
        components.map((component) => component.componentProductId),
      );
    }

    const groupIds = body.modifierGroupIds ? uniqueStrings(body.modifierGroupIds) : null;
    if (groupIds) await assertModifierGroups(entityId, groupIds);

    const trackStock = resolveTrackStock(type, body.trackStock, existing.trackStock);
    const data: Prisma.ProductUncheckedUpdateInput = { type, unit, trackStock };

    if (body.sku !== undefined) data.sku = body.sku;
    if (body.barcode !== undefined) data.barcode = body.barcode ?? null;
    if (body.altBarcodes !== undefined) {
      data.altBarcodes = JSON.stringify(uniqueStrings(body.altBarcodes));
    }
    if (body.namePt !== undefined) data.namePt = body.namePt;
    if (body.nameEn !== undefined) data.nameEn = body.nameEn ?? null;
    if (body.descriptionPt !== undefined) data.descriptionPt = body.descriptionPt ?? null;
    if (body.descriptionEn !== undefined) data.descriptionEn = body.descriptionEn ?? null;
    if (body.categoryId !== undefined) data.categoryId = body.categoryId ?? null;
    if (body.supplierId !== undefined) data.supplierId = body.supplierId ?? null;
    if (body.salePriceMinor !== undefined) data.salePriceMinor = toMinorColumn(body.salePriceMinor);
    if (body.costPriceMinor !== undefined) {
      data.costPriceMinor = toMinorColumn(body.costPriceMinor);
      // With nothing on hand the rolling average carries no information, so it
      // follows the new cost; otherwise only a goods receipt may move it.
      if (existing.stockQuantity <= 0) data.avgCostMinor = toMinorColumn(body.costPriceMinor);
    }
    if (body.taxRateBps !== undefined) data.taxRateBps = body.taxRateBps;
    if (body.minStockLevel !== undefined) data.minStockLevel = body.minStockLevel;
    if (body.maxStockLevel !== undefined) data.maxStockLevel = body.maxStockLevel ?? null;
    if (body.tileColor !== undefined) data.tileColor = body.tileColor ?? null;
    if (body.showInQuickGrid !== undefined) data.showInQuickGrid = body.showInQuickGrid;
    if (body.quickGridOrder !== undefined) data.quickGridOrder = body.quickGridOrder;
    if (body.isMenuItem !== undefined) data.isMenuItem = body.isMenuItem;
    if (body.prepStation !== undefined) data.prepStation = body.prepStation ?? null;
    if (body.available !== undefined) data.available = body.available;
    if (body.publishOnline !== undefined) data.publishOnline = body.publishOnline;
    if (body.onlineSlug !== undefined) data.onlineSlug = body.onlineSlug ?? null;
    if (body.weightGrams !== undefined) data.weightGrams = body.weightGrams ?? null;
    if (body.active !== undefined) data.active = body.active;

    const images = body.images ? normalizeImages(body.images) : null;
    const removedUrls: string[] = [];

    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: existing.id }, data });

      if (images) {
        const keptUrls = new Set(images.map((image) => image.url));
        for (const image of existing.images) {
          if (!keptUrls.has(image.url)) removedUrls.push(image.url);
        }
        await tx.productImage.deleteMany({ where: { productId: existing.id } });
        for (const image of images) {
          await tx.productImage.create({ data: { productId: existing.id, ...image } });
        }
      }

      if (components) {
        await tx.recipeComponent.deleteMany({ where: { parentProductId: existing.id } });
        for (const component of components) {
          await tx.recipeComponent.create({
            data: {
              parentProductId: existing.id,
              componentProductId: component.componentProductId,
              quantity: component.quantity,
              unit: component.unit ?? 'each',
              wastagePercentBps: component.wastagePercentBps ?? 0,
            },
          });
        }
      }

      if (groupIds) {
        await tx.productModifierGroup.deleteMany({ where: { productId: existing.id } });
        for (const [position, groupId] of groupIds.entries()) {
          await tx.productModifierGroup.create({
            data: { productId: existing.id, groupId, sortOrder: position },
          });
        }
      }
    }, TX_OPTIONS);

    // Only once the new rows are committed do the old files go.
    for (const url of removedUrls) deleteUpload(url);

    const beforeSale = minorToNumber(existing.salePriceMinor);
    const beforeCost = minorToNumber(existing.costPriceMinor);
    const afterSale = body.salePriceMinor ?? beforeSale;
    const afterCost = body.costPriceMinor ?? beforeCost;

    if (afterSale !== beforeSale || afterCost !== beforeCost) {
      await auditRequest(req, {
        action: AUDIT_ACTIONS.PRICE_CHANGE,
        targetType: 'product',
        targetId: existing.id,
        details: {
          before: { salePriceMinor: beforeSale, costPriceMinor: beforeCost },
          after: { salePriceMinor: afterSale, costPriceMinor: afterCost },
        },
      });
    }

    await auditRequest(req, {
      action: AUDIT_ACTIONS.PRODUCT_UPDATE,
      targetType: 'product',
      targetId: existing.id,
      details: { sku: existing.sku, fields: Object.keys(body) },
    });

    res.json(await loadProductDto(entityId, existing.id, canSeeCost(req)));
  }),
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('product:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);

    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, entityId, deletedAt: null },
      select: { id: true, sku: true, namePt: true },
    });
    if (!existing) throw ApiError.notFound('Produto nao encontrado.');

    const usedIn = await prisma.recipeComponent.findFirst({
      where: {
        componentProductId: existing.id,
        parentProduct: { entityId, deletedAt: null, active: true },
      },
      select: { parentProduct: { select: { namePt: true } } },
    });
    if (usedIn) {
      throw ApiError.conflict(
        `Nao e possivel eliminar: este produto e componente da receita de "${usedIn.parentProduct.namePt}".`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), active: false, available: false, showInQuickGrid: false },
      });
      await tx.productVariant.updateMany({
        where: { productId: existing.id, deletedAt: null },
        data: { deletedAt: new Date(), active: false },
      });
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.PRODUCT_DELETE,
      targetType: 'product',
      targetId: existing.id,
      details: { sku: existing.sku, namePt: existing.namePt },
    });

    res.json({ ok: true });
  }),
);

/* ========================================================================== */
/* Variant matrix                                                              */
/* ========================================================================== */

router.post(
  '/:id/variants/matrix',
  requireAuth,
  requirePermission('product:write'),
  validateBody(variantMatrixSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as VariantMatrixInput;

    const product = await prisma.product.findFirst({
      where: { id: req.params.id, entityId, deletedAt: null },
      select: { id: true, sku: true, salePriceMinor: true, costPriceMinor: true },
    });
    if (!product) throw ApiError.notFound('Produto nao encontrado.');

    const axes = body.axes.map((axis) => ({ name: axis.name, values: uniqueStrings(axis.values) }));
    const combos = cartesian(axes);
    if (combos.length > MAX_MATRIX_VARIANTS) {
      throw ApiError.unprocessable(
        `A matriz gera ${combos.length} variantes; o maximo por pedido e ${MAX_MATRIX_VARIANTS}.`,
        { axes: ['Demasiadas combinacoes.'] },
      );
    }

    const existingVariants = await prisma.productVariant.findMany({
      where: { productId: product.id },
      select: { options: true },
    });
    const existingKeys = new Set(
      existingVariants.map((variant) => optionsKey(parseOptions(variant.options))),
    );
    const takenSkus = new Set(
      (await prisma.productVariant.findMany({ where: { entityId }, select: { sku: true } })).map(
        (row) => row.sku,
      ),
    );

    const salePriceMinor = body.basePriceMinor ?? minorToNumber(product.salePriceMinor);
    const costPriceMinor = body.baseCostMinor ?? minorToNumber(product.costPriceMinor);

    const planned: Array<{ options: Record<string, string>; sku: string; barcode: string }> = [];
    const skipped: Record<string, string>[] = [];

    for (const combo of combos) {
      if (existingKeys.has(optionsKey(combo))) {
        skipped.push(combo);
        continue;
      }
      planned.push({
        options: combo,
        sku: uniqueSku(buildVariantSku(product.sku, combo, planned.length + 1), takenSkus),
        barcode: await generateBarcode(entityId),
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const plan of planned) {
        rows.push(
          await tx.productVariant.create({
            data: {
              productId: product.id,
              entityId,
              sku: plan.sku,
              barcode: plan.barcode,
              options: JSON.stringify(plan.options),
              salePriceMinor: toMinorColumn(salePriceMinor),
              costPriceMinor: toMinorColumn(costPriceMinor),
              avgCostMinor: toMinorColumn(costPriceMinor),
              active: true,
            },
          }),
        );
      }
      return rows;
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.PRODUCT_UPDATE,
      targetType: 'product',
      targetId: product.id,
      details: { matrix: axes, created: created.length, skipped: skipped.length },
    });

    const includeCost = canSeeCost(req);
    res.status(201).json({
      created: created.map((variant) => toProductVariantDto(variant, { includeCost })),
      skipped,
    });
  }),
);

/* ========================================================================== */
/* Recipe (bill of materials)                                                  */
/* ========================================================================== */

router.get(
  '/:id/recipe',
  requireAuth,
  requirePermission('product:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const product = await requireProduct(entityId, req.params.id);

    const components = await prisma.recipeComponent.findMany({
      where: { parentProductId: product.id },
      include: { componentProduct: { select: { namePt: true } } },
    });

    res.json({ productId: product.id, components: components.map(toRecipeComponentDto) });
  }),
);

router.put(
  '/:id/recipe',
  requireAuth,
  requirePermission('product:write'),
  validateBody(recipeSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as RecipeInput;

    const product = await prisma.product.findFirst({
      where: { id: req.params.id, entityId, deletedAt: null },
      select: { id: true, type: true, unit: true },
    });
    if (!product) throw ApiError.notFound('Produto nao encontrado.');

    assertProductRules({
      type: product.type as ProductType,
      unit: product.unit as Unit,
      componentCount: body.components.length,
    });
    await assertComponentProducts(entityId, body.components, product.id);
    await assertNoRecipeCycle(
      entityId,
      product.id,
      body.components.map((component) => component.componentProductId),
    );

    await prisma.$transaction(async (tx) => {
      await tx.recipeComponent.deleteMany({ where: { parentProductId: product.id } });
      for (const component of body.components) {
        await tx.recipeComponent.create({
          data: {
            parentProductId: product.id,
            componentProductId: component.componentProductId,
            quantity: component.quantity,
            unit: component.unit ?? 'each',
            wastagePercentBps: component.wastagePercentBps ?? 0,
          },
        });
      }
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.PRODUCT_UPDATE,
      targetType: 'product_recipe',
      targetId: product.id,
      details: { componentCount: body.components.length },
    });

    const components = await prisma.recipeComponent.findMany({
      where: { parentProductId: product.id },
      include: { componentProduct: { select: { namePt: true } } },
    });

    res.json({ productId: product.id, components: components.map(toRecipeComponentDto) });
  }),
);

/* ========================================================================== */
/* Product <-> modifier group links                                            */
/* ========================================================================== */

router.post(
  '/:id/attach-modifier-group',
  requireAuth,
  requirePermission('product:write'),
  validateBody(attachModifierGroupSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as AttachModifierGroupInput;

    const product = await requireProduct(entityId, req.params.id);
    await assertModifierGroups(entityId, [body.groupId]);

    const link = await prisma.productModifierGroup.upsert({
      where: { productId_groupId: { productId: product.id, groupId: body.groupId } },
      create: { productId: product.id, groupId: body.groupId, sortOrder: body.sortOrder ?? 0 },
      update: { sortOrder: body.sortOrder ?? 0 },
      include: { group: { include: { modifiers: { orderBy: { sortOrder: 'asc' } } } } },
    });

    res.status(201).json({ sortOrder: link.sortOrder, group: toModifierGroupDto(link.group) });
  }),
);

router.delete(
  '/:id/modifier-groups/:groupId',
  requireAuth,
  requirePermission('product:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const product = await requireProduct(entityId, req.params.id);

    const result = await prisma.productModifierGroup.deleteMany({
      where: { productId: product.id, groupId: req.params.groupId },
    });
    if (result.count === 0) throw ApiError.notFound('Este grupo nao esta associado ao produto.');

    res.json({ ok: true });
  }),
);

export default router;
