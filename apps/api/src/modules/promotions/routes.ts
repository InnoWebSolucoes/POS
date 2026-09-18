import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { SOCKET_EVENTS } from '@pos/shared';

import { auditRequest } from '../../lib/audit.js';
import { ApiError, asyncHandler, pageParams, paginated, parsedQuery, validateBody, validateQuery } from '../../lib/http.js';
import {
  requireAnyPermission,
  requireAuth,
  requireAuthContext,
  requireEntity,
  requirePermission,
} from '../../lib/middleware.js';
import { prisma } from '../../lib/prisma.js';
import { emitToEntity } from '../../lib/realtime.js';

import { toPromotionDto, type PromotionRowWithRelations } from './mappers.js';
import {
  assertPromotionRules,
  createSchema,
  listQuerySchema,
  updateSchema,
  validateBodySchema,
  type CreateBody,
  type ListQuery,
  type UpdateBody,
  type ValidatePromotionBody,
} from './schemas.js';
import {
  evaluatePromotion,
  findPromotionByCode,
  isRunning,
  normaliseCode,
  serialiseProductIds,
  toPromotionRecord,
} from './service.js';

const router = Router();

const CATEGORY_SELECT = { select: { id: true, namePt: true } } as const;
const WITH_CATEGORY = { category: CATEGORY_SELECT } as const;

const AUDIT = {
  CREATE: 'promotion.create',
  UPDATE: 'promotion.update',
  DELETE: 'promotion.delete',
} as const;

/** Tells the POS its banners are stale. */
function announce(entityId: string, action: string, id: string): void {
  emitToEntity(entityId, SOCKET_EVENTS.NOTIFICATION, {
    type: 'promotion',
    action,
    promotionId: id,
  });
}

/** Rejects a category or product scope that belongs to another tenant. */
async function assertScopeBelongsToEntity(
  entityId: string,
  categoryId: string | null | undefined,
  productIds: string[] | undefined,
): Promise<void> {
  if (categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, entityId, deletedAt: null },
      select: { id: true },
    });
    if (!category) throw ApiError.unprocessable('Categoria nao encontrada.', { categoryId: ['Categoria nao encontrada.'] });
  }

  if (productIds && productIds.length > 0) {
    const unique = [...new Set(productIds)];
    const found = await prisma.product.findMany({
      where: { id: { in: unique }, entityId, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw ApiError.unprocessable('Um ou mais produtos nao foram encontrados.', {
        productIds: ['Um ou mais produtos nao foram encontrados.'],
      });
    }
  }
}

async function loadOwned(entityId: string, id: string): Promise<PromotionRowWithRelations> {
  const row = await prisma.promotion.findFirst({
    where: { id, entityId },
    include: WITH_CATEGORY,
  });
  if (!row) throw ApiError.notFound('Promocao nao encontrada.');
  return row as PromotionRowWithRelations;
}

/* -------------------------------------------------------------------------- */
/* GET /api/promotions                                                         */
/* -------------------------------------------------------------------------- */

router.get(
  '/',
  requireAuth,
  requirePermission('product:read'),
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<ListQuery>(res);
    const params = pageParams(query);

    const where: Prisma.PromotionWhereInput = { entityId };
    if (query.active !== undefined) where.active = query.active;
    if (query.type) where.type = query.type;

    const search = query.search?.trim();
    if (search) {
      // SQLite has no case-insensitive filter mode, and codes are stored
      // uppercased, so the code is matched against the uppercased needle.
      where.OR = [
        { code: { contains: search.toUpperCase() } },
        { namePt: { contains: search } },
        { nameEn: { contains: search } },
      ];
    }

    const now = new Date();

    if (query.running === true) {
      Object.assign(where, {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      } satisfies Prisma.PromotionWhereInput);
    }

    const [rows, total] = await Promise.all([
      prisma.promotion.findMany({
        where,
        include: WITH_CATEGORY,
        orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
        skip: params.skip,
        take: params.take,
      }),
      prisma.promotion.count({ where }),
    ]);

    res.json(
      paginated(
        (rows as PromotionRowWithRelations[]).map((row) => toPromotionDto(row, now)),
        total,
        params,
      ),
    );
  }),
);

/* -------------------------------------------------------------------------- */
/* GET /api/promotions/active                                                  */
/* -------------------------------------------------------------------------- */

router.get(
  '/active',
  requireAuth,
  requirePermission('product:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const now = new Date();

    const rows = await prisma.promotion.findMany({
      where: {
        entityId,
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      include: WITH_CATEGORY,
      orderBy: [{ endsAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });

    // The usage limit is a column-to-column comparison, which Prisma cannot
    // express without raw SQL - filtered here instead.
    const live = (rows as PromotionRowWithRelations[]).filter((row) =>
      isRunning(toPromotionRecord(row), now),
    );

    res.json({ data: live.map((row) => toPromotionDto(row, now)) });
  }),
);

/* -------------------------------------------------------------------------- */
/* POST /api/promotions/validate  - THE REGISTER CALLS THIS                    */
/* -------------------------------------------------------------------------- */

router.post(
  '/validate',
  requireAuth,
  requireAnyPermission('sale:create', 'sale:discount', 'restaurant:bill'),
  validateBody(validateBodySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as ValidatePromotionBody;

    const promotion = await findPromotionByCode(entityId, body.code);
    const result = evaluatePromotion(promotion, {
      lines: body.lines,
      subtotalMinor: body.subtotalMinor,
    });

    res.json(result);
  }),
);

/* -------------------------------------------------------------------------- */
/* POST /api/promotions                                                        */
/* -------------------------------------------------------------------------- */

router.post(
  '/',
  requireAuth,
  requirePermission('sale:discount'),
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const body = req.body as CreateBody;

    assertPromotionRules({
      type: body.type,
      value: body.value,
      buyQuantity: body.buyQuantity ?? null,
      getQuantity: body.getQuantity ?? null,
      startsAt: body.startsAt ?? null,
      endsAt: body.endsAt ?? null,
    });

    await assertScopeBelongsToEntity(entityId, body.categoryId, body.productIds);

    const code = normaliseCode(body.code);
    const clash = await prisma.promotion.findFirst({
      where: { entityId, code },
      select: { id: true },
    });
    if (clash) throw ApiError.conflict('Ja existe uma promocao com esse codigo.');

    const row = await prisma.promotion.create({
      data: {
        entityId,
        code,
        namePt: body.namePt,
        nameEn: body.nameEn ?? null,
        type: body.type,
        value: body.value,
        categoryId: body.categoryId ?? null,
        productIds: serialiseProductIds(body.productIds),
        buyQuantity: body.type === 'buy_x_get_y' ? body.buyQuantity ?? null : null,
        getQuantity: body.type === 'buy_x_get_y' ? body.getQuantity ?? null : null,
        minSpendMinor: BigInt(Math.round(body.minSpendMinor)),
        usageLimit: body.usageLimit ?? null,
        startsAt: body.startsAt ?? null,
        endsAt: body.endsAt ?? null,
        active: body.active,
      },
      include: WITH_CATEGORY,
    });

    await auditRequest(req, {
      action: AUDIT.CREATE,
      targetType: 'promotion',
      targetId: row.id,
      details: { code, type: body.type, value: body.value, by: auth.userId },
    });

    announce(entityId, 'created', row.id);
    res.status(201).json(toPromotionDto(row as PromotionRowWithRelations));
  }),
);

/* -------------------------------------------------------------------------- */
/* GET /api/promotions/:id                                                     */
/* -------------------------------------------------------------------------- */

router.get(
  '/:id',
  requireAuth,
  requirePermission('product:read'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const row = await loadOwned(entityId, req.params.id as string);
    res.json(toPromotionDto(row));
  }),
);

/* -------------------------------------------------------------------------- */
/* PATCH /api/promotions/:id                                                   */
/* -------------------------------------------------------------------------- */

router.patch(
  '/:id',
  requireAuth,
  requirePermission('sale:discount'),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const id = req.params.id as string;
    const body = req.body as UpdateBody;
    const existing = await loadOwned(entityId, id);

    // Rules are checked against what the promotion BECOMES, not what was sent.
    const type = body.type ?? (existing.type as CreateBody['type']);
    const merged = {
      type,
      value: body.value ?? Number(existing.value),
      buyQuantity: body.buyQuantity !== undefined ? body.buyQuantity ?? null : existing.buyQuantity,
      getQuantity: body.getQuantity !== undefined ? body.getQuantity ?? null : existing.getQuantity,
      startsAt: body.startsAt !== undefined ? body.startsAt ?? null : existing.startsAt,
      endsAt: body.endsAt !== undefined ? body.endsAt ?? null : existing.endsAt,
    };
    assertPromotionRules(merged);

    await assertScopeBelongsToEntity(entityId, body.categoryId, body.productIds);

    const data: Prisma.PromotionUpdateInput = {};
    if (body.code !== undefined) {
      const code = normaliseCode(body.code);
      if (code !== existing.code) {
        const clash = await prisma.promotion.findFirst({
          where: { entityId, code, NOT: { id } },
          select: { id: true },
        });
        if (clash) throw ApiError.conflict('Ja existe uma promocao com esse codigo.');
      }
      data.code = code;
    }
    if (body.namePt !== undefined) data.namePt = body.namePt;
    if (body.nameEn !== undefined) data.nameEn = body.nameEn ?? null;
    if (body.type !== undefined) data.type = body.type;
    if (body.value !== undefined) data.value = body.value;
    if (body.productIds !== undefined) data.productIds = serialiseProductIds(body.productIds);
    if (body.minSpendMinor !== undefined) data.minSpendMinor = BigInt(Math.round(body.minSpendMinor));
    if (body.usageLimit !== undefined) data.usageLimit = body.usageLimit ?? null;
    if (body.startsAt !== undefined) data.startsAt = body.startsAt ?? null;
    if (body.endsAt !== undefined) data.endsAt = body.endsAt ?? null;
    if (body.active !== undefined) data.active = body.active;

    // buy/get only mean anything on a buy_x_get_y promotion; switching the type
    // away from it clears them so stale numbers cannot resurface later.
    if (merged.type === 'buy_x_get_y') {
      if (body.buyQuantity !== undefined) data.buyQuantity = body.buyQuantity ?? null;
      if (body.getQuantity !== undefined) data.getQuantity = body.getQuantity ?? null;
    } else if (body.type !== undefined) {
      data.buyQuantity = null;
      data.getQuantity = null;
    }

    if (body.categoryId !== undefined) {
      data.category = body.categoryId
        ? { connect: { id: body.categoryId } }
        : { disconnect: true };
    }

    const row = await prisma.promotion.update({
      where: { id: existing.id },
      data,
      include: WITH_CATEGORY,
    });

    await auditRequest(req, {
      action: AUDIT.UPDATE,
      targetType: 'promotion',
      targetId: row.id,
      details: { code: row.code, changed: Object.keys(data) },
    });

    announce(entityId, 'updated', row.id);
    res.json(toPromotionDto(row as PromotionRowWithRelations));
  }),
);

/* -------------------------------------------------------------------------- */
/* DELETE /api/promotions/:id                                                  */
/* -------------------------------------------------------------------------- */

router.delete(
  '/:id',
  requireAuth,
  requirePermission('sale:discount'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const existing = await loadOwned(entityId, req.params.id as string);

    await prisma.promotion.delete({ where: { id: existing.id } });

    await auditRequest(req, {
      action: AUDIT.DELETE,
      targetType: 'promotion',
      targetId: existing.id,
      details: { code: existing.code, usageCount: existing.usageCount },
    });

    announce(entityId, 'deleted', existing.id);
    res.status(204).send();
  }),
);

export default router;
