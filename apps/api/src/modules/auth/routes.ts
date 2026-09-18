import { Router, type Request } from 'express';
import type { AuthResponse, AuthUser, EntityDto } from '@pos/shared';

import {
  hashPassword,
  hashPin,
  hashToken,
  verifyPassword,
  verifyPin,
  verifyToken,
} from '../../lib/auth.js';
import { AUDIT_ACTIONS, audit, auditRequest } from '../../lib/audit.js';
import { ApiError, asyncHandler, validateBody } from '../../lib/http.js';
import { optionalAuth, requireAuth, requireAuthContext } from '../../lib/middleware.js';
import { TX_OPTIONS, prisma } from '../../lib/prisma.js';

import { toAuthUser, toEntityDto, type AuthUserRow, type EntityRow } from './mappers.js';
import {
  CREDENTIAL_SELECT,
  PIN_SELECT,
  SESSION_SELECT,
  clearAttempts,
  clientIp,
  findEntityById,
  findEntityBySlug,
  findUserByEmail,
  guardAttempts,
  issueSession,
  loadSession,
  resolveEntity,
  revokeAllRefreshTokens,
  revokeRefreshToken,
} from './service.js';
import {
  changePasswordSchema,
  loginSchema,
  logoutSchema,
  pinLoginSchema,
  refreshSchema,
  setPinSchema,
  updateMeSchema,
  type ChangePasswordBody,
  type LoginBody,
  type LogoutBody,
  type PinLoginBody,
  type RefreshBody,
  type SetPinBody,
  type UpdateMeBody,
} from './schemas.js';

const router = Router();

/** Deliberately identical for "no such email" and "wrong password". */
const BAD_CREDENTIALS = 'Credenciais invalidas.';

/** Custom audit actions; AUDIT_ACTIONS covers only the shared vocabulary. */
const PASSWORD_CHANGE = 'auth.password_change';
const PIN_SET = 'auth.pin_set';
const PIN_REMOVE = 'auth.pin_remove';

function userAgent(req: Request): string | null {
  const value = req.headers['user-agent'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sessionPayload(
  user: AuthUserRow,
  entity: EntityRow | null,
): { user: AuthUser; entity: EntityDto | null } {
  return { user: toAuthUser(user), entity: toEntityDto(entity) };
}

/* -------------------------------------------------------------------------- */
/* POST /api/auth/login                                                        */
/* -------------------------------------------------------------------------- */

router.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as LoginBody;
    const email = body.email.toLowerCase();
    const ip = clientIp(req);
    // app.ts already caps attempts per IP; this narrows it to one account so a
    // shared shop connection cannot be locked out by one mistyped password.
    const throttleKey = `login:${ip}:${email}`;
    guardAttempts(throttleKey);

    const fail = async (reason: string, userId?: string, entityId?: string | null) => {
      await audit({
        entityId: entityId ?? null,
        userId: userId ?? null,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        targetType: 'user',
        targetId: userId ?? null,
        details: { email, reason },
        ipAddress: ip,
      });
      return ApiError.unauthorized(BAD_CREDENTIALS);
    };

    const user = await findUserByEmail(email, body.email);
    if (!user) throw await fail('unknown_email');
    if (!user.active) throw await fail('inactive_user', user.id, user.entityId);

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) throw await fail('bad_password', user.id, user.entityId);

    // A suspended tenant must not be able to trade, whatever the credentials.
    if (user.entity && !user.entity.active) {
      throw await fail('inactive_entity', user.id, user.entityId);
    }

    // Optional tenant hint: a member must match it, a super admin may use it to
    // pick the entity they start inside.
    let entity: EntityRow | null = user.entity;
    if (body.entitySlug) {
      if (user.entity) {
        if (user.entity.slug.toLowerCase() !== body.entitySlug) {
          throw await fail('entity_mismatch', user.id, user.entityId);
        }
      } else {
        entity = await findEntityBySlug(body.entitySlug);
        if (!entity) throw ApiError.notFound('Entidade nao encontrada.');
      }
    }

    const tokens = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        // Normalise the stored address on the way through, so the fallback
        // lookup for legacy mixed-case rows is needed at most once per user.
        data: user.email === email ? { lastLoginAt: new Date() } : { lastLoginAt: new Date(), email },
      });
      return issueSession(tx, user, userAgent(req));
    }, TX_OPTIONS);

    clearAttempts(throttleKey);

    await audit({
      entityId: user.entityId ?? entity?.id ?? null,
      userId: user.id,
      userName: user.name,
      action: AUDIT_ACTIONS.LOGIN,
      targetType: 'user',
      targetId: user.id,
      details: { method: 'password', entitySlug: entity?.slug ?? null },
      ipAddress: ip,
    });

    const response: AuthResponse = { ...tokens, ...sessionPayload(user, entity) };
    response.user.email = email;
    res.json(response);
  }),
);

/* -------------------------------------------------------------------------- */
/* POST /api/auth/pin-login                                                    */
/* -------------------------------------------------------------------------- */

router.post(
  '/pin-login',
  validateBody(pinLoginSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as PinLoginBody;
    const ip = clientIp(req);
    const throttleKey = `pin:${ip}:${body.entityId}`;
    guardAttempts(throttleKey);

    const fail = async (reason: string, userId?: string) => {
      await audit({
        entityId: body.entityId,
        userId: userId ?? null,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        details: { method: 'pin', reason },
        ipAddress: ip,
      });
    };

    const entity = await findEntityById(body.entityId);
    if (!entity || !entity.active) {
      await fail('unknown_entity');
      throw ApiError.unauthorized('PIN invalido.');
    }

    const candidates = await prisma.user.findMany({
      where: {
        entityId: entity.id,
        active: true,
        deletedAt: null,
        pinHash: { not: null },
      },
      select: PIN_SELECT,
    });

    const matches: typeof candidates = [];
    for (const candidate of candidates) {
      if (await verifyPin(body.pin, candidate.pinHash)) matches.push(candidate);
    }

    if (matches.length === 0) {
      await fail('bad_pin');
      throw ApiError.unauthorized('PIN invalido.');
    }
    if (matches.length > 1) {
      // Ambiguous PINs would let one operator sell under another's name.
      await fail('ambiguous_pin');
      throw ApiError.conflict(
        'Este PIN pertence a mais do que um utilizador. Contacte o administrador.',
      );
    }

    const user = matches[0]!;
    const tokens = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return issueSession(tx, user, userAgent(req));
    }, TX_OPTIONS);

    clearAttempts(throttleKey);

    await audit({
      entityId: entity.id,
      userId: user.id,
      userName: user.name,
      action: AUDIT_ACTIONS.LOGIN,
      targetType: 'user',
      targetId: user.id,
      details: { method: 'pin' },
      ipAddress: ip,
    });

    const response: AuthResponse = {
      ...tokens,
      user: toAuthUser(user),
      entity: toEntityDto(entity),
    };
    res.json(response);
  }),
);

/* -------------------------------------------------------------------------- */
/* POST /api/auth/refresh                                                      */
/* -------------------------------------------------------------------------- */

router.post(
  '/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken: presented } = req.body as RefreshBody;
    const payload = verifyToken(presented, 'refresh');

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presented) },
      select: { id: true, userId: true, revokedAt: true, expiresAt: true },
    });

    const expired = ApiError.unauthorized('Sessao expirada. Inicie sessao novamente.');
    if (!stored) throw expired;

    if (stored.revokedAt) {
      // A revoked token coming back means it was replayed: drop every session
      // this user has rather than hand out a fresh pair.
      await revokeAllRefreshTokens(stored.userId);
      throw expired;
    }
    if (stored.expiresAt.getTime() <= Date.now()) throw expired;
    if (stored.userId !== payload.sub) {
      await revokeAllRefreshTokens(stored.userId);
      throw expired;
    }

    const user = await loadSession(stored.userId);
    if (user.entity && !user.entity.active) {
      throw ApiError.forbidden('Entidade inactiva. Contacte o suporte.');
    }

    // Rotation: the presented token dies in the same transaction that mints its
    // replacement, so a stolen copy is good for exactly one use.
    const tokens = await prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      return issueSession(tx, user, userAgent(req));
    }, TX_OPTIONS);

    res.json(tokens);
  }),
);

/* -------------------------------------------------------------------------- */
/* POST /api/auth/logout                                                       */
/* -------------------------------------------------------------------------- */

router.post(
  '/logout',
  optionalAuth,
  validateBody(logoutSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as LogoutBody;
    let userId = req.auth?.userId ?? null;

    if (body.refreshToken) {
      const owner = await revokeRefreshToken(body.refreshToken);
      userId ??= owner;
    } else if (req.auth) {
      await revokeAllRefreshTokens(req.auth.userId);
    }

    await audit({
      entityId: req.entityId ?? req.auth?.entityId ?? null,
      userId,
      userName: req.auth?.name ?? null,
      action: AUDIT_ACTIONS.LOGOUT,
      targetType: 'user',
      targetId: userId,
      details: { scope: body.refreshToken ? 'session' : 'all' },
      ipAddress: clientIp(req),
    });

    res.json({ success: true });
  }),
);

/* -------------------------------------------------------------------------- */
/* GET /api/auth/me                                                            */
/* -------------------------------------------------------------------------- */

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = requireAuthContext(req);
    const user = await loadSession(auth.userId);
    const entity = await resolveEntity(user, req.entityId);
    res.json(sessionPayload(user, entity));
  }),
);

/* -------------------------------------------------------------------------- */
/* PATCH /api/auth/me                                                          */
/* -------------------------------------------------------------------------- */

router.patch(
  '/me',
  requireAuth,
  validateBody(updateMeSchema),
  asyncHandler(async (req, res) => {
    const auth = requireAuthContext(req);
    const body = req.body as UpdateMeBody;

    const data: {
      name?: string;
      phone?: string | null;
      locale?: string;
      avatarUrl?: string | null;
    } = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.locale !== undefined) data.locale = body.locale;
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl || null;

    const user = await prisma.user.update({
      where: { id: auth.userId },
      data,
      select: SESSION_SELECT,
    });

    await auditRequest(req, {
      action: AUDIT_ACTIONS.USER_UPDATE,
      targetType: 'user',
      targetId: auth.userId,
      details: { fields: Object.keys(data), self: true },
    });

    const entity = await resolveEntity(user, req.entityId);
    res.json(sessionPayload(user, entity));
  }),
);

/* -------------------------------------------------------------------------- */
/* POST /api/auth/me/password                                                  */
/* -------------------------------------------------------------------------- */

router.post(
  '/me/password',
  requireAuth,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const auth = requireAuthContext(req);
    const body = req.body as ChangePasswordBody;

    const user = await prisma.user.findFirst({
      where: { id: auth.userId, deletedAt: null },
      select: CREDENTIAL_SELECT,
    });
    if (!user) throw ApiError.unauthorized('Utilizador inactivo ou inexistente.');

    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      await auditRequest(req, {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        targetType: 'user',
        targetId: auth.userId,
        details: { reason: 'bad_current_password', context: 'password_change' },
      });
      throw ApiError.badRequest('Palavra-passe actual incorrecta.');
    }
    if (body.currentPassword === body.newPassword) {
      throw ApiError.badRequest('A nova palavra-passe tem de ser diferente da actual.');
    }

    const passwordHash = await hashPassword(body.newPassword);

    // Every other device is logged out; the caller gets a fresh pair back so the
    // register they are standing at keeps working.
    const tokens = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await revokeAllRefreshTokens(user.id, tx);
      return issueSession(tx, user, userAgent(req));
    }, TX_OPTIONS);

    await auditRequest(req, {
      action: PASSWORD_CHANGE,
      targetType: 'user',
      targetId: auth.userId,
      details: { self: true },
    });

    res.json({ success: true, ...tokens });
  }),
);

/* -------------------------------------------------------------------------- */
/* POST /api/auth/me/pin  &  DELETE /api/auth/me/pin                           */
/* -------------------------------------------------------------------------- */

router.post(
  '/me/pin',
  requireAuth,
  validateBody(setPinSchema),
  asyncHandler(async (req, res) => {
    const auth = requireAuthContext(req);
    const { pin } = req.body as SetPinBody;

    // pin-login refuses an ambiguous PIN, so refuse to create one here.
    if (auth.entityId) {
      const peers = await prisma.user.findMany({
        where: {
          entityId: auth.entityId,
          id: { not: auth.userId },
          active: true,
          deletedAt: null,
          pinHash: { not: null },
        },
        select: { id: true, pinHash: true },
      });
      for (const peer of peers) {
        if (await verifyPin(pin, peer.pinHash)) {
          throw ApiError.conflict('Esse PIN ja esta a ser usado. Escolha outro.');
        }
      }
    }

    await prisma.user.update({
      where: { id: auth.userId },
      data: { pinHash: await hashPin(pin) },
    });

    await auditRequest(req, {
      action: PIN_SET,
      targetType: 'user',
      targetId: auth.userId,
      details: { self: true },
    });

    res.json({ success: true, pinEnabled: true });
  }),
);

router.delete(
  '/me/pin',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = requireAuthContext(req);

    await prisma.user.update({
      where: { id: auth.userId },
      data: { pinHash: null },
    });

    await auditRequest(req, {
      action: PIN_REMOVE,
      targetType: 'user',
      targetId: auth.userId,
      details: { self: true },
    });

    res.json({ success: true, pinEnabled: false });
  }),
);

export default router;
