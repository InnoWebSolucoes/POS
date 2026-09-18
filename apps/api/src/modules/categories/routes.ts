import { Router } from 'express';
import { Prisma } from '@prisma/client';

import { auditRequest } from '../../lib/audit.js';
import { ApiError, asyncHandler, parsedQuery, validateBody, validateQuery } from '../../lib/http.js';
import { requireAuth, requireEntity, requirePermission } from '../../lib/middleware.js';
import { prisma, TX_OPTIONS } from '../../lib/prisma.js';

import { compareCategories, toCategoryDto, type CategoryDetailDto } from './mappers.js';
import {
  createSchema,
  listQuerySchema,
  reorderSchema,
  updateSchema,
  type CreateInput,
  type ListQuery,
  type ReorderInput,
  type UpdateInput,
} from './schemas.js';
import {
  ancestorPath,
  assertHierarchy,
  assertParentExists,
  assertPlacement,
  buildTree,
  categorySelect,
  CATEGORY_ORDER_BY,
  loadTreeNodes,
  nextSortOrder,
  nodeMap,
  quickGridSelect,
} from './service.js';

const router = Router();

/** Every route below is authenticated and tenant-scoped. */
router.use(requireAuth);

const AUDIT = {
  CREATE: 'category.create',
  UPDATE: 'category.update',
  DELETE: 'category.delete',
  REORDER: 'category.reorder',
} as const;

/* -------------------------------------------------------------------------- */
/* Read                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/categories
 * ?tree=true    nested CategoryDto[] (roots first, sortOrder then namePt)
 * ?includeInactive=true, ?search=, ?parentId=<id>|root (flat listing only)
 */
router.get(
  '/',
  requirePermission('product:read'),
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<ListQuery>(res);

    const where: Prisma.CategoryWhereInput = { entityId, deletedAt: null };
    if (!query.includeInactive) where.active = true;
    if (query.search) {
      // SQLite has no case-insensitive mode; `contains` is what both engines share.
      where.OR = [{ namePt: { contains: query.search } }, { nameEn: { contains: query.search } }];
    }
    // A parent filter would cut the tree in half, so it only applies to the flat list.
    if (!query.tree && query.parentId) {
      where.parentId = query.parentId === 'root' ? null : query.parentId;
    }

    const rows = await prisma.category.findMany({
      where,
      select: categorySelect,
      orderBy: CATEGORY_ORDER_BY,
    });

    const dtos = rows.map(toCategoryDto);
    res.json({ data: query.tree ? buildTree(dtos) : dtos });
  }),
);

/**
 * GET /api/categories/quick-grid
 * The POS tile grid: categories holding at least one quick-grid product.
 * Declared before /:id so the literal path wins.
 */
router.get(
  '/quick-grid',
  requirePermission('product:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);

    const rows = await prisma.category.findMany({
      where: {
        entityId,
        deletedAt: null,
        active: true,
        products: { some: { deletedAt: null, active: true, showInQuickGrid: true } },
      },
      select: quickGridSelect,
      orderBy: CATEGORY_ORDER_BY,
    });

    res.json({ data: rows.map(toCategoryDto) });
  }),
);

/** GET /api/categories/:id - the category, its direct children and its breadcrumb. */
router.get(
  '/:id',
  requirePermission('product:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const id = req.params.id;

    const [row, children, nodes] = await Promise.all([
      prisma.category.findFirst({
        where: { id, entityId, deletedAt: null },
        select: categorySelect,
      }),
      prisma.category.findMany({
        where: { parentId: id, entityId, deletedAt: null },
        select: categorySelect,
        orderBy: CATEGORY_ORDER_BY,
      }),
      loadTreeNodes(prisma, entityId),
    ]);

    if (!row) throw ApiError.notFound('Categoria nao encontrada.');

    const detail: CategoryDetailDto = {
      ...toCategoryDto(row),
      children: children.map(toCategoryDto).sort(compareCategories),
      path: ancestorPath(id, nodeMap(nodes)),
    };

    res.json(detail);
  }),
);

/* -------------------------------------------------------------------------- */
/* Write                                                                       */
/* -------------------------------------------------------------------------- */

/** POST /api/categories */
router.post(
  '/',
  requirePermission('category:write'),
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as CreateInput;
    const parentId = body.parentId ?? null;

    const created = await prisma.$transaction(async (tx) => {
      const nodes = await loadTreeNodes(tx, entityId);
      if (parentId) assertParentExists(nodeMap(nodes), parentId);
      assertPlacement(nodes, undefined, parentId);

      const data: Prisma.CategoryUncheckedCreateInput = {
        entityId,
        parentId,
        namePt: body.namePt,
        nameEn: body.nameEn ?? null,
        color: body.color ?? null,
        iconUrl: body.iconUrl ?? null,
        sortOrder: body.sortOrder ?? (await nextSortOrder(tx, entityId, parentId)),
        active: body.active ?? true,
      };

      return tx.category.create({ data, select: categorySelect });
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: AUDIT.CREATE,
      targetType: 'category',
      targetId: created.id,
      details: { namePt: created.namePt, parentId: created.parentId },
    });

    res.status(201).json(toCategoryDto(created));
  }),
);

/** PATCH /api/categories/:id */
router.patch(
  '/:id',
  requirePermission('category:write'),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const id = req.params.id;
    const body = req.body as UpdateInput;
    const reparenting = 'parentId' in body && body.parentId !== undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.category.findFirst({
        where: { id, entityId, deletedAt: null },
        select: { id: true, parentId: true, namePt: true },
      });
      if (!existing) throw ApiError.notFound('Categoria nao encontrada.');

      const data: Prisma.CategoryUncheckedUpdateInput = {};
      if (body.namePt !== undefined) data.namePt = body.namePt;
      if (body.nameEn !== undefined) data.nameEn = body.nameEn;
      if (body.color !== undefined) data.color = body.color;
      if (body.iconUrl !== undefined) data.iconUrl = body.iconUrl;
      if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
      if (body.active !== undefined) data.active = body.active;

      if (reparenting) {
        const parentId = body.parentId ?? null;
        const nodes = await loadTreeNodes(tx, entityId);
        if (parentId) assertParentExists(nodeMap(nodes), parentId);
        // Re-validates the whole forest, so moving a branch under one of its own
        // descendants - or past three levels - is rejected.
        assertPlacement(nodes, id, parentId);
        data.parentId = parentId;
      }

      return tx.category.update({ where: { id }, data, select: categorySelect });
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: AUDIT.UPDATE,
      targetType: 'category',
      targetId: id,
      details: { changed: Object.keys(body) },
    });

    res.json(toCategoryDto(updated));
  }),
);

/**
 * POST /api/categories/reorder
 * Bulk drag-and-drop: one transaction, validated as a whole before any write.
 */
router.post(
  '/reorder',
  requirePermission('category:write'),
  validateBody(reorderSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const { items } = req.body as ReorderInput;

    const ids = items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      throw ApiError.unprocessable('A lista contem categorias repetidas.');
    }

    const rows = await prisma.$transaction(async (tx) => {
      const nodes = await loadTreeNodes(tx, entityId);
      const known = nodeMap(nodes);

      for (const item of items) {
        if (!known.has(item.id)) throw ApiError.notFound('Categoria nao encontrada.');
      }

      const moves = new Map<string, string | null>();
      for (const item of items) {
        if ('parentId' in item && item.parentId !== undefined) {
          const parentId = item.parentId ?? null;
          if (parentId) assertParentExists(known, parentId);
          moves.set(item.id, parentId);
        }
      }

      const proposed = nodes.map((node) => ({
        id: node.id,
        parentId: moves.has(node.id) ? moves.get(node.id) ?? null : node.parentId,
      }));
      // Validate the whole proposed forest before touching a single row.
      assertHierarchy(proposed);

      for (const item of items) {
        const update: Prisma.CategoryUncheckedUpdateInput = { sortOrder: item.sortOrder };
        if (moves.has(item.id)) update.parentId = moves.get(item.id) ?? null;
        await tx.category.update({ where: { id: item.id }, data: update });
      }

      return tx.category.findMany({
        where: { entityId, deletedAt: null },
        select: categorySelect,
        orderBy: CATEGORY_ORDER_BY,
      });
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: AUDIT.REORDER,
      targetType: 'category',
      targetId: null,
      details: { count: items.length, ids },
    });

    res.json({ data: rows.map(toCategoryDto) });
  }),
);

/**
 * DELETE /api/categories/:id - soft delete.
 * Refuses while sub-categories remain; products are detached in the same
 * transaction so nothing points at a dead category.
 */
router.delete(
  '/:id',
  requirePermission('category:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const id = req.params.id;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.category.findFirst({
        where: { id, entityId, deletedAt: null },
        select: { id: true, namePt: true },
      });
      if (!existing) throw ApiError.notFound('Categoria nao encontrada.');

      const children = await tx.category.count({
        where: { entityId, parentId: id, deletedAt: null },
      });
      if (children > 0) {
        throw ApiError.conflict(
          'Nao e possivel eliminar: a categoria ainda tem subcategorias. Mova ou elimine as subcategorias primeiro.',
        );
      }

      const detached = await tx.product.updateMany({
        where: { entityId, categoryId: id },
        data: { categoryId: null },
      });

      await tx.category.update({
        where: { id },
        data: { deletedAt: new Date(), active: false },
      });

      return { namePt: existing.namePt, productsDetached: detached.count };
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: AUDIT.DELETE,
      targetType: 'category',
      targetId: id,
      details: { namePt: result.namePt, productsDetached: result.productsDetached },
    });

    res.json({ id, deleted: true, productsDetached: result.productsDetached });
  }),
);

export default router;
