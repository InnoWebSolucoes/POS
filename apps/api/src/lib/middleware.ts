import type { NextFunction, Request, Response } from 'express';
import { effectivePermissions, type Permission, type Role } from '@pos/shared';
import { verifyToken } from './auth.js';
import { ApiError, asyncHandler } from './http.js';
import { prisma } from './prisma.js';

export interface AuthContext {
  userId: string;
  name: string;
  email: string;
  role: Role;
  /** The user's own tenant. Null only for the super admin. */
  entityId: string | null;
  locationId: string | null;
  permissions: Permission[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      /**
       * The tenant this request operates on. Equals auth.entityId for normal
       * users; for a super admin it comes from the X-Entity-Id header.
       */
      entityId?: string;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.token;
  return cookie ?? null;
}

/**
 * Authenticates the request. The token carries the role, but permissions are
 * recomputed from the CURRENT role in the database so that revoking access
 * takes effect immediately rather than when the token expires.
 */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = bearer(req);
  if (!token) throw ApiError.unauthorized('Autenticacao necessaria.');

  const payload = verifyToken(token, 'access');

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, active: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      entityId: true,
      locationId: true,
      permissionOverrides: true,
    },
  });

  if (!user) throw ApiError.unauthorized('Utilizador inactivo ou inexistente.');

  const role = user.role as Role;
  req.auth = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role,
    entityId: user.entityId,
    locationId: user.locationId,
    // Recomputed from the CURRENT role and the member's own overrides on every
    // request, so revoking access takes effect immediately rather than whenever
    // the token happens to expire.
    permissions: effectivePermissions(role, user.permissionOverrides),
  };

  // Tenant resolution. A super admin may act inside any entity by sending the
  // header; everyone else is pinned to their own and the header is ignored.
  if (role === 'super_admin') {
    const header = req.header('x-entity-id') || (req.query.entityId as string | undefined);
    req.entityId = header || user.entityId || undefined;
  } else {
    req.entityId = user.entityId ?? undefined;
  }

  next();
});

/** Like requireAuth but never rejects - used by the public storefront. */
export const optionalAuth = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    if (!bearer(req)) return next();
    try {
      await new Promise<void>((resolve, reject) => {
        requireAuth(req, _res, (err?: unknown) => (err ? reject(err) : resolve()));
      });
    } catch {
      /* anonymous is fine here */
    }
    next();
  },
);

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) return next(ApiError.unauthorized());
    const ok = permissions.every((p) => auth.permissions.includes(p));
    if (!ok) {
      return next(
        ApiError.forbidden(`Permissao em falta: ${permissions.join(', ')}.`),
      );
    }
    next();
  };
}

export function requireAnyPermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) return next(ApiError.unauthorized());
    if (!permissions.some((p) => auth.permissions.includes(p))) {
      return next(ApiError.forbidden(`Permissao em falta: ${permissions.join(' ou ')}.`));
    }
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(ApiError.forbidden());
    next();
  };
}

/** Guarantees req.entityId is set, and returns it. */
export function requireEntity(req: Request): string {
  if (!req.entityId) {
    throw ApiError.badRequest(
      'Nenhuma entidade seleccionada. Envie o cabecalho X-Entity-Id.',
    );
  }
  return req.entityId;
}

export function requireAuthContext(req: Request): AuthContext {
  if (!req.auth) throw ApiError.unauthorized();
  return req.auth;
}

/**
 * Middleware form of requireEntity, for routers where every route is scoped.
 */
export function entityScoped(req: Request, _res: Response, next: NextFunction): void {
  try {
    requireEntity(req);
    next();
  } catch (error) {
    next(error);
  }
}

/** True when the caller may see cost prices, margins and COGS. */
export function canSeeCost(req: Request): boolean {
  return req.auth?.permissions.includes('product:cost') ?? false;
}
