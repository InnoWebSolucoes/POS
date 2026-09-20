import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import type { EntityDto, LocationDto, Paginated } from '@pos/shared';

import { hashPassword } from '../../lib/auth.js';
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
import {
  canSeeCost,
  requireAuth,
  requireAuthContext,
  requirePermission,
} from '../../lib/middleware.js';
import { prisma, TX_OPTIONS } from '../../lib/prisma.js';
import { DEFAULT_SETTINGS, setSettings } from '../../lib/settings.js';

import { toEntityDto, toLocationDto } from './mappers.js';
import {
  createEntitySchema,
  createLocationSchema,
  listEntitiesQuerySchema,
  listLocationsQuerySchema,
  updateEntitySchema,
  updateLocationSchema,
  type CreateEntityBody,
  type CreateLocationBody,
  type ListEntitiesQuery,
  type ListLocationsQuery,
  type UpdateEntityBody,
  type UpdateLocationBody,
} from './schemas.js';
import {
  assertEntityAccess,
  clearOtherDefaults,
  countActiveLocations,
  entityStats,
  isSuperAdmin,
  loadEntity,
  loadLocationForRequest,
  locationHoldsStock,
  promoteAnotherDefault,
  uniqueSlug,
} from './service.js';
import { loadSetupState, seedStarterContent } from './starter-content.js';

/** Actions the shared AUDIT_ACTIONS table does not carry. */
const AUDIT_ENTITY_DELETE = 'entity.delete';
const AUDIT_LOCATION_CREATE = 'location.create';
const AUDIT_LOCATION_UPDATE = 'location.update';
const AUDIT_LOCATION_DELETE = 'location.delete';
const AUDIT_ENTITY_STARTER = 'entity.starter_content';

/** Relation counts the admin list renders as tiles. */
const COUNT_SELECT = {
  _count: {
    select: {
      locations: { where: { active: true } },
      users: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.EntityInclude;

const router = Router();

/* -------------------------------------------------------------------------- */
/* Entities                                                                    */
/* -------------------------------------------------------------------------- */

/** GET /api/entities - super admin sees every tenant, everyone else sees one. */
router.get(
  '/',
  requireAuth,
  requirePermission('entity:read'),
  validateQuery(listEntitiesQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuthContext(req);
    const query = parsedQuery<ListEntitiesQuery>(res);
    const params = pageParams(query);

    const where: Prisma.EntityWhereInput = { deletedAt: null };

    if (auth.role !== 'super_admin') {
      // Never trust the header here: a normal user only ever sees their own.
      if (!auth.entityId) {
        const empty: Paginated<EntityDto> = paginated<EntityDto>([], 0, params);
        return res.json(empty);
      }
      where.id = auth.entityId;
    }

    if (query.active !== undefined) where.active = query.active;

    if (query.search) {
      // SQLite has no 'mode: insensitive'; contains is the portable filter.
      where.OR = [
        { name: { contains: query.search } },
        { slug: { contains: query.search } },
        { nif: { contains: query.search } },
        { email: { contains: query.search } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.entity.findMany({
        where,
        include: COUNT_SELECT,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        skip: params.skip,
        take: params.take,
      }),
      prisma.entity.count({ where }),
    ]);

    const body: Paginated<EntityDto> = paginated(rows.map(toEntityDto), total, params);
    return res.json(body);
  }),
);

/** POST /api/entities - provisions a tenant, its first location and its admin. */
router.post(
  '/',
  requireAuth,
  requirePermission('entity:create'),
  validateBody(createEntitySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateEntityBody;

    if ((body.adminEmail && !body.adminPassword) || (!body.adminEmail && body.adminPassword)) {
      throw ApiError.unprocessable('Indique o email e a palavra-passe do administrador.');
    }

    // bcrypt is slow: hash before opening the transaction so SQLite is not
    // holding its write lock while we burn CPU.
    const adminEmail = body.adminEmail ? body.adminEmail.toLowerCase() : null;
    const passwordHash = body.adminPassword ? await hashPassword(body.adminPassword) : null;

    if (adminEmail) {
      const clash = await prisma.user.findFirst({
        where: { email: adminEmail },
        select: { id: true },
      });
      if (clash) throw ApiError.conflict('Ja existe um utilizador com esse email.');
    }

    const created = await prisma.$transaction(async (tx) => {
      const slug = await uniqueSlug(tx, body.name);

      const entity = await tx.entity.create({
        data: {
          name: body.name,
          slug,
          mode: body.mode,
          nif: body.nif ?? null,
          address: body.address ?? null,
          phone: body.phone ?? null,
          email: body.email ?? null,
          logoUrl: body.logoUrl ?? null,
          accentColor: body.accentColor,
          currency: body.currency,
          locale: body.locale,
          pricingMode: body.pricingMode,
          costingMethod: body.costingMethod,
          defaultTaxRateBps: body.defaultTaxRateBps,
        },
      });

      const location = await tx.location.create({
        data: {
          entityId: entity.id,
          name: body.locationName,
          address: body.address ?? null,
          phone: body.phone ?? null,
          isDefault: true,
          active: true,
        },
      });

      let adminId: string | null = null;
      if (adminEmail && passwordHash) {
        const clash = await tx.user.findFirst({
          where: { email: adminEmail },
          select: { id: true },
        });
        if (clash) throw ApiError.conflict('Ja existe um utilizador com esse email.');

        const admin = await tx.user.create({
          data: {
            entityId: entity.id,
            locationId: location.id,
            name: body.adminName ?? body.name,
            email: adminEmail,
            passwordHash,
            role: 'entity_admin',
            locale: body.locale,
            active: true,
          },
        });
        adminId = admin.id;
      }

      await setSettings(entity.id, DEFAULT_SETTINGS, tx);

      return { entity, location, adminId };
    }, TX_OPTIONS);

    await auditRequest(req, {
      entityId: created.entity.id,
      action: AUDIT_ACTIONS.ENTITY_CREATE,
      targetType: 'entity',
      targetId: created.entity.id,
      details: {
        name: created.entity.name,
        slug: created.entity.slug,
        mode: created.entity.mode,
        locationId: created.location.id,
        adminId: created.adminId,
      },
    });

    const full = await prisma.entity.findUniqueOrThrow({
      where: { id: created.entity.id },
      include: COUNT_SELECT,
    });

    return res.status(201).json(toEntityDto(full));
  }),
);

/* -------------------------------------------------------------------------- */
/* Locations addressed directly - declared before /:id so they never collide   */
/* -------------------------------------------------------------------------- */

router.patch(
  '/locations/:id',
  requireAuth,
  requirePermission('location:write'),
  validateBody(updateLocationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as UpdateLocationBody;
    const current = await loadLocationForRequest(req, req.params.id);

    if (body.isDefault === false && current.isDefault) {
      throw ApiError.conflict('Defina outra localizacao como principal em vez de desmarcar esta.');
    }

    if (body.active === false && current.active) {
      const others = await countActiveLocations(prisma, current.entityId, current.id);
      if (others === 0) {
        throw ApiError.conflict('Nao pode desactivar a unica localizacao activa.');
      }
      if (await locationHoldsStock(prisma, current.id)) {
        throw ApiError.conflict(
          'A localizacao ainda tem stock. Transfira o stock antes de a desactivar.',
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await clearOtherDefaults(tx, current.entityId, current.id);
      }

      let row = await tx.location.update({
        where: { id: current.id },
        data: {
          name: body.name,
          address: body.address,
          phone: body.phone,
          isDefault: body.isDefault,
          active: body.active,
        },
      });

      // A deactivated location must not remain the tenant's default.
      if (row.active === false && row.isDefault) {
        row = await tx.location.update({ where: { id: row.id }, data: { isDefault: false } });
        await promoteAnotherDefault(tx, current.entityId, row.id);
      }

      return row;
    }, TX_OPTIONS);

    await auditRequest(req, {
      entityId: current.entityId,
      action: AUDIT_LOCATION_UPDATE,
      targetType: 'location',
      targetId: current.id,
      details: {
        before: { name: current.name, isDefault: current.isDefault, active: current.active },
        after: { name: updated.name, isDefault: updated.isDefault, active: updated.active },
      },
    });

    const dto: LocationDto = toLocationDto(updated);
    return res.json(dto);
  }),
);

/**
 * DELETE /api/entities/locations/:id
 *
 * Deactivation, not destruction: InventoryLevel cascades off Location, so a
 * hard delete would silently erase stock rows. The location keeps its history
 * and simply stops being selectable.
 */
router.delete(
  '/locations/:id',
  requireAuth,
  requirePermission('location:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const current = await loadLocationForRequest(req, req.params.id);

    const others = await countActiveLocations(prisma, current.entityId, current.id);
    if (current.active && others === 0) {
      throw ApiError.conflict('Nao pode remover a unica localizacao activa.');
    }
    if (await locationHoldsStock(prisma, current.id)) {
      throw ApiError.conflict('A localizacao ainda tem stock. Transfira o stock antes de a remover.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.location.update({
        where: { id: current.id },
        data: { active: false, isDefault: false },
      });
      if (current.isDefault) await promoteAnotherDefault(tx, current.entityId, row.id);
      return row;
    }, TX_OPTIONS);

    await auditRequest(req, {
      entityId: current.entityId,
      action: AUDIT_LOCATION_DELETE,
      targetType: 'location',
      targetId: current.id,
      details: { name: current.name },
    });

    return res.json(toLocationDto(updated));
  }),
);

/* -------------------------------------------------------------------------- */
/* Single entity                                                               */
/* -------------------------------------------------------------------------- */

router.get(
  '/:id',
  requireAuth,
  requirePermission('entity:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = req.params.id;
    assertEntityAccess(req, entityId);

    const entity = await prisma.entity.findFirst({
      where: { id: entityId, deletedAt: null },
      include: COUNT_SELECT,
    });
    if (!entity) throw ApiError.notFound('Entidade nao encontrada.');

    return res.json(toEntityDto(entity));
  }),
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('entity:write'),
  validateBody(updateEntitySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = req.params.id;
    assertEntityAccess(req, entityId);

    const body = req.body as UpdateEntityBody;
    const existing = await loadEntity(entityId);

    const snapshot = existing as unknown as Record<string, unknown>;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      if (snapshot[key] === value) continue;
      before[key] = snapshot[key] ?? null;
      after[key] = value;
    }

    if (Object.keys(after).length === 0) {
      const unchanged = await prisma.entity.findUniqueOrThrow({
        where: { id: entityId },
        include: COUNT_SELECT,
      });
      return res.json(toEntityDto(unchanged));
    }

    // Only a super admin may switch a whole tenant off.
    if (after.active === false && !isSuperAdmin(req)) {
      throw ApiError.forbidden('Apenas o super administrador pode desactivar uma entidade.');
    }

    const updated = await prisma.entity.update({
      where: { id: entityId },
      data: {
        name: body.name,
        mode: body.mode,
        nif: body.nif,
        address: body.address,
        phone: body.phone,
        email: body.email,
        logoUrl: body.logoUrl,
        accentColor: body.accentColor,
        currency: body.currency,
        locale: body.locale,
        pricingMode: body.pricingMode,
        costingMethod: body.costingMethod,
        defaultTaxRateBps: body.defaultTaxRateBps,
        active: body.active,
      },
      include: COUNT_SELECT,
    });

    await auditRequest(req, {
      entityId,
      action: AUDIT_ACTIONS.ENTITY_UPDATE,
      targetType: 'entity',
      targetId: entityId,
      details: { before, after },
    });

    return res.json(toEntityDto(updated));
  }),
);

/** DELETE /api/entities/:id - soft delete, super admin only. */
router.delete(
  '/:id',
  requireAuth,
  requirePermission('entity:create'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!isSuperAdmin(req)) {
      throw ApiError.forbidden('Apenas o super administrador pode remover uma entidade.');
    }

    const entityId = req.params.id;
    const existing = await loadEntity(entityId);

    const otherActive = await prisma.entity.count({
      where: { deletedAt: null, active: true, NOT: { id: entityId } },
    });
    if (otherActive === 0) {
      throw ApiError.conflict('Nao pode remover a unica entidade activa.');
    }

    const deleted = await prisma.entity.update({
      where: { id: entityId },
      data: { active: false, deletedAt: new Date() },
      include: COUNT_SELECT,
    });

    await auditRequest(req, {
      entityId,
      action: AUDIT_ENTITY_DELETE,
      targetType: 'entity',
      targetId: entityId,
      details: { name: existing.name, slug: existing.slug },
    });

    return res.json(toEntityDto(deleted));
  }),
);

/* -------------------------------------------------------------------------- */
/* Locations under an entity                                                   */
/* -------------------------------------------------------------------------- */

router.get(
  '/:id/locations',
  requireAuth,
  requirePermission('entity:read'),
  validateQuery(listLocationsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = req.params.id;
    assertEntityAccess(req, entityId);
    await loadEntity(entityId);

    const query = parsedQuery<ListLocationsQuery>(res);

    const rows = await prisma.location.findMany({
      where: { entityId, ...(query.active === undefined ? {} : { active: query.active }) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    const body: LocationDto[] = rows.map(toLocationDto);
    return res.json(body);
  }),
);

router.post(
  '/:id/locations',
  requireAuth,
  requirePermission('location:write'),
  validateBody(createLocationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = req.params.id;
    assertEntityAccess(req, entityId);
    await loadEntity(entityId);

    const body = req.body as CreateLocationBody;

    const created = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.location.count({ where: { entityId } });
      // The very first location is always the default one.
      const isDefault = existingCount === 0 ? true : body.isDefault === true;

      if (isDefault) await clearOtherDefaults(tx, entityId, null);

      return tx.location.create({
        data: {
          entityId,
          name: body.name,
          address: body.address ?? null,
          phone: body.phone ?? null,
          isDefault,
          active: body.active ?? true,
        },
      });
    }, TX_OPTIONS);

    await auditRequest(req, {
      entityId,
      action: AUDIT_LOCATION_CREATE,
      targetType: 'location',
      targetId: created.id,
      details: { name: created.name, isDefault: created.isDefault },
    });

    return res.status(201).json(toLocationDto(created));
  }),
);

/* -------------------------------------------------------------------------- */
/* Stats                                                                       */
/* -------------------------------------------------------------------------- */

/** GET /api/entities/:id/stats - the tile numbers on the admin entity list. */
router.get(
  '/:id/stats',
  requireAuth,
  requirePermission('entity:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = req.params.id;
    assertEntityAccess(req, entityId);
    await loadEntity(entityId);

    const stats = await entityStats(entityId);

    // Revenue is a financial figure: an operator without cost visibility gets
    // the operational tiles only.
    if (!canSeeCost(req)) {
      return res.json({ ...stats, todayRevenueMinor: null });
    }

    return res.json(stats);
  }),
);

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/entities/:id/setup-state
 *
 * How far this client has got with their setup, in counts only. The console
 * uses it to decide whether the starter catalogue is still on the table. There
 * is deliberately no money and no sales figure in the answer.
 */
router.get(
  '/:id/setup-state',
  requireAuth,
  requirePermission('entity:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = req.params.id;
    assertEntityAccess(req, entityId);

    const state = await loadSetupState(entityId);
    return res.json(state);
  }),
);

/**
 * POST /api/entities/:id/starter-content
 *
 * Fills a brand new business with a small, sensible catalogue for its mode so
 * the owner has something to tap on their first day. Refuses once the client
 * has products of their own.
 *
 * Guarded by the permissions for what it actually writes, not by `entity:create`,
 * which only the platform operator holds. Otherwise a business that signed itself
 * up at /registar could never use this and would start on an empty screen, while
 * an identical business the operator created starts ready to trade.
 * `assertEntityAccess` still pins everyone but the operator to their own business.
 */
router.post(
  '/:id/starter-content',
  requireAuth,
  requirePermission('product:write', 'category:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = req.params.id;
    assertEntityAccess(req, entityId);
    await loadEntity(entityId);

    const auth = requireAuthContext(req);
    const summary = await seedStarterContent(entityId, {
      userId: auth.userId,
      userName: auth.name,
    });

    await auditRequest(req, {
      entityId,
      action: AUDIT_ENTITY_STARTER,
      targetType: 'entity',
      targetId: entityId,
      details: summary,
    });

    return res.status(201).json(summary);
  }),
);

export default router;
