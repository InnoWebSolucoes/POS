import type { Role } from '@pos/shared';
import { verifyPin } from '../../lib/auth.js';
import { ApiError } from '../../lib/http.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import type { ListUsersQuery } from './schemas.js';
import type { UserRow } from './mappers.js';

/** Every read of a user goes through this - it never selects a hash column. */
export const USER_SELECT = {
  id: true,
  entityId: true,
  name: true,
  email: true,
  role: true,
  locationId: true,
  phone: true,
  avatarUrl: true,
  locale: true,
  active: true,
  pinHash: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  location: { select: { id: true, name: true } },
} as const;

type SortField = NonNullable<ListUsersQuery['sort']>;
type SortOrder = 'asc' | 'desc';

function orderByFor(sort: SortField, order: SortOrder) {
  switch (sort) {
    case 'role':
      return [{ role: order }, { name: 'asc' as const }];
    case 'createdAt':
      return { createdAt: order };
    case 'lastLoginAt':
      return { lastLoginAt: order };
    default:
      return { name: order };
  }
}

export function buildUserWhere(entityId: string, query: ListUsersQuery) {
  const search = query.search?.trim();
  return {
    entityId,
    deletedAt: null,
    ...(query.role ? { role: query.role } : {}),
    ...(query.active === undefined ? {} : { active: query.active }),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(search
      ? {
          OR: [{ name: { contains: search } }, { email: { contains: search } }],
        }
      : {}),
  };
}

export async function listUsers(
  entityId: string,
  query: ListUsersQuery,
  skip: number,
  take: number,
): Promise<{ rows: UserRow[]; total: number }> {
  const where = buildUserWhere(entityId, query);
  const sort: SortField = query.sort ?? 'name';
  const order: SortOrder = query.order ?? (sort === 'name' || sort === 'role' ? 'asc' : 'desc');

  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: USER_SELECT, orderBy: orderByFor(sort, order), skip, take }),
    prisma.user.count({ where }),
  ]);

  return { rows, total };
}

/** Loads a user inside the caller's tenant or throws 404. */
export async function findUserInEntity(entityId: string, id: string): Promise<UserRow> {
  const user = await prisma.user.findFirst({
    where: { id, entityId, deletedAt: null },
    select: USER_SELECT,
  });
  if (!user) throw ApiError.notFound('Utilizador nao encontrado.');
  return user;
}

/** Email is globally unique in the schema, so the check cannot be tenant scoped. */
export async function assertEmailAvailable(email: string, excludeUserId?: string): Promise<void> {
  const existing = await prisma.user.findFirst({
    where: { email },
    select: { id: true },
  });
  if (existing && existing.id !== excludeUserId) {
    throw ApiError.conflict('Ja existe um utilizador com esse email.');
  }
}

export async function assertLocationInEntity(
  entityId: string,
  locationId: string | null | undefined,
): Promise<void> {
  if (!locationId) return;
  const location = await prisma.location.findFirst({
    where: { id: locationId, entityId },
    select: { id: true },
  });
  if (!location) throw ApiError.unprocessable('Local nao encontrado nesta entidade.');
}

/**
 * PIN login matches a PIN against every user of the entity, so two people
 * sharing a PIN would make the login ambiguous. Refuse the collision up front.
 */
export async function assertPinAvailable(
  entityId: string,
  pin: string,
  excludeUserId?: string,
): Promise<void> {
  const candidates = await prisma.user.findMany({
    where: { entityId, deletedAt: null, active: true, pinHash: { not: null } },
    select: { id: true, pinHash: true },
  });
  for (const candidate of candidates) {
    if (candidate.id === excludeUserId) continue;
    if (await verifyPin(pin, candidate.pinHash)) {
      throw ApiError.conflict('Ja existe um utilizador com esse PIN.');
    }
  }
}

/** Only a super admin may create, promote to, or manage a super admin. */
export function assertCanAssignRole(callerRole: Role, targetRole: Role): void {
  if (targetRole === 'super_admin' && callerRole !== 'super_admin') {
    throw ApiError.forbidden(
      'Apenas um super administrador pode atribuir o perfil de super administrador.',
    );
  }
}

export function assertCanManage(callerRole: Role, target: { role: string }): void {
  if (target.role === 'super_admin' && callerRole !== 'super_admin') {
    throw ApiError.forbidden('Nao pode gerir a conta de um super administrador.');
  }
}

/** An entity must always keep at least one administrator who can sign in. */
export async function assertNotLastEntityAdmin(
  entityId: string,
  targetId: string,
  message: string,
): Promise<void> {
  const remaining = await prisma.user.count({
    where: {
      entityId,
      role: 'entity_admin',
      active: true,
      deletedAt: null,
      id: { not: targetId },
    },
  });
  if (remaining === 0) throw ApiError.conflict(message);
}

/** Kills every live session of a user. Returns how many were revoked. */
export async function revokeSessions(userId: string, client: Tx = prisma): Promise<number> {
  const result = await client.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
