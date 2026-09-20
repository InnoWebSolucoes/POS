import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import {
  EMPTY_OVERRIDES,
  ROLE_LABELS,
  ROLES,
  effectivePermissions,
  permissionsForRole,
  type Permission,
  type Role,
} from '@pos/shared';

import { hashPassword, hashPin } from '../../lib/auth.js';
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
  optionalAuth,
  requireAuth,
  requireAuthContext,
  requireEntity,
  requirePermission,
} from '../../lib/middleware.js';
import { prisma, TX_OPTIONS } from '../../lib/prisma.js';

import {
  buildPermissionCatalogue,
  toUserDto,
  type PermissionCatalogueDto,
  type PinUserDto,
  type RoleOptionDto,
  type UserDto,
  type UserPermissionsDto,
} from './mappers.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  pinUsersQuerySchema,
  resetPasswordSchema,
  setPinSchema,
  updatePermissionsSchema,
  updateUserSchema,
  type CreateUserInput,
  type ListUsersQuery,
  type PinUsersQuery,
  type ResetPasswordInput,
  type SetPinInput,
  type UpdatePermissionsInput,
  type UpdateUserInput,
} from './schemas.js';
import {
  applyPermissionChange,
  assertCanAssignRole,
  assertCanManage,
  assertEmailAvailable,
  assertEntityKeepsAUserManager,
  assertLocationInEntity,
  assertNotLastEntityAdmin,
  assertPinAvailable,
  findUserInEntity,
  listUsers,
  permissionStateOf,
  revokeSessions,
  sortPermissions,
  USER_SELECT,
  type PermissionActor,
  type PermissionChangePlan,
} from './service.js';

const router = Router();

/* -------------------------------------------------------------------------- */
/* Catalogue routes - declared before /:id so they are not swallowed by it      */
/* -------------------------------------------------------------------------- */

/** GET /api/users/roles - the role picker for the staff form. */
router.get(
  '/roles',
  requireAuth,
  requirePermission('user:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuthContext(req);
    const roles: RoleOptionDto[] = ROLES.filter(
      (role) => role !== 'super_admin' || auth.role === 'super_admin',
    ).map((role) => ({
      role,
      labelPt: ROLE_LABELS[role].pt,
      labelEn: ROLE_LABELS[role].en,
      permissions: permissionsForRole(role),
    }));
    res.json(roles);
  }),
);

/**
 * GET /api/users/pin-users?entityId=...
 * Read by the PIN keypad BEFORE anyone is authenticated, so the entity must be
 * named explicitly. Emails, hashes and anything else private stay behind.
 */
router.get(
  '/pin-users',
  optionalAuth,
  validateQuery(pinUsersQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { entityId } = parsedQuery<PinUsersQuery>(res);

    // A logged-in user may only peek at their own tenant.
    const auth = req.auth;
    if (auth && auth.role !== 'super_admin' && auth.entityId && auth.entityId !== entityId) {
      throw ApiError.forbidden('Entidade fora do seu alcance.');
    }

    const rows = await prisma.user.findMany({
      where: { entityId, active: true, deletedAt: null, pinHash: { not: null } },
      select: { id: true, name: true, avatarUrl: true, role: true },
      orderBy: { name: 'asc' },
      take: 100,
    });

    const data: PinUserDto[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      avatarUrl: row.avatarUrl,
      role: row.role as Role,
    }));
    res.json(data);
  }),
);

/* -------------------------------------------------------------------------- */
/* Per-member permissions                                                      */
/* -------------------------------------------------------------------------- */

/** Audit actions for the tuning, kept out of the generic user.update bucket. */
const PERMISSION_AUDIT = {
  UPDATE: 'user.permissions_update',
  RESET: 'user.permissions_reset',
} as const;

function actorOf(auth: { userId: string; role: Role; permissions: Permission[] }): PermissionActor {
  return { userId: auth.userId, role: auth.role, permissions: auth.permissions };
}

function toPermissionsDto(
  row: { id: string; name: string; role: string; permissionOverrides: string },
  caller: { permissions: Permission[] },
): UserPermissionsDto {
  const state = permissionStateOf(row);
  return {
    userId: row.id,
    name: row.name,
    role: state.role,
    roleLabelPt: ROLE_LABELS[state.role].pt,
    roleLabelEn: ROLE_LABELS[state.role].en,
    roleDefaults: state.roleDefaults,
    effective: state.effective,
    overrides: state.overrides,
    hasOverrides: state.custom,
    // You may only hand out access you hold yourself, so the editor greys out
    // everything outside this list rather than letting the save fail.
    editableByCaller: sortPermissions(caller.permissions),
  };
}

/** The before/after the audit log keeps for a permission change. */
function auditDetails(plan: PermissionChangePlan) {
  return {
    role: plan.role,
    before: { granted: plan.before.granted, revoked: plan.before.revoked },
    after: { granted: plan.after.granted, revoked: plan.after.revoked },
    added: plan.added,
    removed: plan.removed,
    permissionCount: plan.afterEffective.length,
  };
}

/**
 * GET /api/users/permission-catalogue
 * Declared before /:id so it is not swallowed by it. This is what the editor
 * renders: the groups, one plain sentence per toggle in both languages, and
 * every role preset so it can show "padrao do perfil" beside each one.
 */
router.get(
  '/permission-catalogue',
  requireAuth,
  requirePermission('user:read'),
  asyncHandler(async (_req: Request, res: Response) => {
    const catalogue: PermissionCatalogueDto = buildPermissionCatalogue();
    res.json(catalogue);
  }),
);

/** GET /api/users/:id/permissions - what this member may do, and why. */
router.get(
  '/:id/permissions',
  requireAuth,
  requirePermission('user:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuthContext(req);
    const entityId = requireEntity(req);
    const user = await findUserInEntity(entityId, req.params.id);
    res.json(toPermissionsDto(user, auth));
  }),
);

/**
 * PUT /api/users/:id/permissions
 * The body is the desired FINAL set, exactly as the checkboxes show it. What
 * gets stored is only the difference against the role, so a later change to
 * what "cashier" means still reaches everyone who was never hand-tuned.
 */
router.put(
  '/:id/permissions',
  requireAuth,
  requirePermission('user:write'),
  validateBody(updatePermissionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuthContext(req);
    const entityId = requireEntity(req);
    const body = req.body as UpdatePermissionsInput;

    const { plan, user } = await applyPermissionChange({
      actor: actorOf(auth),
      entityId,
      targetId: req.params.id,
      desired: body.permissions,
    });

    if (plan.changed) {
      await auditRequest(req, {
        action: PERMISSION_AUDIT.UPDATE,
        targetType: 'user',
        targetId: user.id,
        details: { name: user.name, ...auditDetails(plan) },
      });
    }

    res.json(toPermissionsDto(user, auth));
  }),
);

/** POST /api/users/:id/permissions/reset - back to the role's defaults. */
router.post(
  '/:id/permissions/reset',
  requireAuth,
  requirePermission('user:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuthContext(req);
    const entityId = requireEntity(req);

    const { plan, user } = await applyPermissionChange({
      actor: actorOf(auth),
      entityId,
      targetId: req.params.id,
    });

    if (plan.changed) {
      await auditRequest(req, {
        action: PERMISSION_AUDIT.RESET,
        targetType: 'user',
        targetId: user.id,
        details: { name: user.name, ...auditDetails(plan) },
      });
    }

    res.json(toPermissionsDto(user, auth));
  }),
);

/* -------------------------------------------------------------------------- */
/* Staff CRUD                                                                  */
/* -------------------------------------------------------------------------- */

/** GET /api/users */
router.get(
  '/',
  requireAuth,
  requirePermission('user:read'),
  validateQuery(listUsersQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<ListUsersQuery>(res);
    const params = pageParams(query);

    const { rows, total } = await listUsers(entityId, query, params.skip, params.take);
    res.json(paginated<UserDto>(rows.map(toUserDto), total, params));
  }),
);

/** POST /api/users */
router.post(
  '/',
  requireAuth,
  requirePermission('user:write'),
  validateBody(createUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuthContext(req);
    const entityId = requireEntity(req);
    const body = req.body as CreateUserInput;

    assertCanAssignRole(auth, body.role);
    await assertEmailAvailable(body.email);
    await assertLocationInEntity(entityId, body.locationId);
    if (body.pin) await assertPinAvailable(entityId, body.pin);

    const created = await prisma.user.create({
      data: {
        entityId,
        name: body.name,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        locationId: body.locationId ?? null,
        phone: body.phone ?? null,
        avatarUrl: body.avatarUrl ?? null,
        locale: body.locale ?? 'pt-PT',
        pinHash: body.pin ? await hashPin(body.pin) : null,
        active: true,
      },
      select: USER_SELECT,
    });

    await auditRequest(req, {
      action: AUDIT_ACTIONS.USER_CREATE,
      targetType: 'user',
      targetId: created.id,
      details: {
        name: created.name,
        email: created.email,
        role: created.role,
        locationId: created.locationId,
      },
    });

    res.status(201).json(toUserDto(created));
  }),
);

/** GET /api/users/:id */
router.get(
  '/:id',
  requireAuth,
  requirePermission('user:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);
    const user = await findUserInEntity(entityId, req.params.id);
    res.json(toUserDto(user));
  }),
);

/** PATCH /api/users/:id */
router.patch(
  '/:id',
  requireAuth,
  requirePermission('user:write'),
  validateBody(updateUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuthContext(req);
    const entityId = requireEntity(req);
    const body = req.body as UpdateUserInput;
    const target = await findUserInEntity(entityId, req.params.id);

    assertCanManage(auth, target);

    const isSelf = target.id === auth.userId;
    if (isSelf && body.role !== undefined && body.role !== target.role) {
      throw ApiError.forbidden('Nao pode alterar o seu proprio perfil de acesso.');
    }
    if (isSelf && body.active === false) {
      throw ApiError.forbidden('Nao pode desactivar a sua propria conta.');
    }
    if (body.role !== undefined) assertCanAssignRole(auth, body.role);

    const losingAdmin =
      target.role === 'entity_admin' &&
      target.active &&
      ((body.role !== undefined && body.role !== 'entity_admin') || body.active === false);
    if (losingAdmin) {
      await assertNotLastEntityAdmin(
        entityId,
        target.id,
        'Nao pode remover o ultimo administrador activo da entidade.',
      );
    }

    if (body.email !== undefined && body.email !== target.email) {
      await assertEmailAvailable(body.email, target.id);
    }
    if (body.locationId) await assertLocationInEntity(entityId, body.locationId);

    // A role is a preset, and the overrides are a delta against THAT preset.
    // Carrying them into a different job would silently hand over access the new
    // role never had - so changing somebody's role puts them back on defaults.
    const roleChanged = body.role !== undefined && body.role !== target.role;
    if (roleChanged && body.role) {
      const before = effectivePermissions(target.role as Role, target.permissionOverrides);
      const after = effectivePermissions(body.role, EMPTY_OVERRIDES);
      if (before.includes('user:write') && !after.includes('user:write')) {
        await assertEntityKeepsAUserManager(entityId, target.id);
      }
    }

    const data: Prisma.UserUncheckedUpdateInput = {};
    if (roleChanged) data.permissionOverrides = '{}';
    if (body.name !== undefined) data.name = body.name;
    if (body.email !== undefined) data.email = body.email;
    if (body.role !== undefined) data.role = body.role;
    if (body.locationId !== undefined) data.locationId = body.locationId ?? null;
    if (body.phone !== undefined) data.phone = body.phone ?? null;
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl ?? null;
    if (body.locale !== undefined) data.locale = body.locale;
    if (body.active !== undefined) data.active = body.active;

    const deactivating = body.active === false && target.active;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: target.id },
        data,
        select: USER_SELECT,
      });
      // A deactivated account must lose its live sessions at once.
      if (deactivating) await revokeSessions(target.id, tx);
      return row;
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.USER_UPDATE,
      targetType: 'user',
      targetId: target.id,
      details: { changes: data, deactivated: deactivating, permissionsReset: roleChanged },
    });

    res.json(toUserDto(updated));
  }),
);

/**
 * POST /api/users/:id/password
 * A manager resetting somebody's password. Every existing session of that user
 * dies with it, so a stolen refresh token cannot outlive the reset.
 */
router.post(
  '/:id/password',
  requireAuth,
  requirePermission('user:write'),
  validateBody(resetPasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuthContext(req);
    const entityId = requireEntity(req);
    const body = req.body as ResetPasswordInput;
    const target = await findUserInEntity(entityId, req.params.id);

    assertCanManage(auth, target);

    const passwordHash = await hashPassword(body.password);

    const sessionsRevoked = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { passwordHash } });
      return revokeSessions(target.id, tx);
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.USER_UPDATE,
      targetType: 'user',
      targetId: target.id,
      details: { passwordReset: true, sessionsRevoked },
    });

    res.json({ success: true, id: target.id, sessionsRevoked });
  }),
);

/**
 * POST /api/users/:id/pin
 * Sets or clears the fast-switch PIN. null removes it, which also removes the
 * user from the PIN login screen.
 */
router.post(
  '/:id/pin',
  requireAuth,
  requirePermission('user:write'),
  validateBody(setPinSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuthContext(req);
    const entityId = requireEntity(req);
    const body = req.body as SetPinInput;
    const target = await findUserInEntity(entityId, req.params.id);

    assertCanManage(auth, target);
    if (body.pin) await assertPinAvailable(entityId, body.pin, target.id);

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { pinHash: body.pin ? await hashPin(body.pin) : null },
      select: USER_SELECT,
    });

    await auditRequest(req, {
      action: AUDIT_ACTIONS.USER_UPDATE,
      targetType: 'user',
      targetId: target.id,
      details: { pinEnabled: Boolean(body.pin) },
    });

    res.json(toUserDto(updated));
  }),
);

/** DELETE /api/users/:id - soft delete, never a hard one. */
router.delete(
  '/:id',
  requireAuth,
  requirePermission('user:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuthContext(req);
    const entityId = requireEntity(req);
    const target = await findUserInEntity(entityId, req.params.id);

    if (target.id === auth.userId) {
      throw ApiError.forbidden('Nao pode remover a sua propria conta.');
    }
    assertCanManage(auth, target);

    if (target.role === 'entity_admin' && target.active) {
      await assertNotLastEntityAdmin(
        entityId,
        target.id,
        'Nao pode remover o ultimo administrador activo da entidade.',
      );
    }

    const sessionsRevoked = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { deletedAt: new Date(), active: false },
      });
      return revokeSessions(target.id, tx);
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.USER_DEACTIVATE,
      targetType: 'user',
      targetId: target.id,
      details: { name: target.name, email: target.email, role: target.role, sessionsRevoked },
    });

    res.json({ success: true, id: target.id, sessionsRevoked });
  }),
);

export default router;
