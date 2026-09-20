import {
  PERMISSIONS,
  effectivePermissions,
  hasOverrides,
  overridesFromSelection,
  parseOverrides,
  permissionsForRole,
  serialiseOverrides,
  type Permission,
  type PermissionOverrides,
  type Role,
} from '@pos/shared';
import { verifyPin } from '../../lib/auth.js';
import { ApiError } from '../../lib/http.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import type { ListUsersQuery } from './schemas.js';
import { permissionLabel, type UserRow } from './mappers.js';

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
  permissionOverrides: true,
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

/**
 * Who is asking, and what they actually hold - their role's preset plus their
 * own overrides, exactly as the request middleware computed it.
 */
export interface RoleActor {
  role: Role;
  permissions: Permission[];
}

/** The permissions in `wanted` that the actor does not hold themselves. */
function beyond(actor: RoleActor, wanted: readonly Permission[]): Permission[] {
  const held = new Set(actor.permissions);
  return sortPermissions(wanted).filter((permission) => !held.has(permission));
}

/**
 * Assigning a role hands over everything that role confers, so it is governed by
 * the same rule as the permission editor: nobody may hand out access they do not
 * hold themselves.
 *
 * Without this the editor's guard rails are decoration. A manager granted
 * `user:write` could not tick `settings:write` for a cashier - the planner
 * refuses - but could create a fresh account with the `entity_admin` role and
 * sign in as it, arriving at the same place through the side door.
 */
export function assertCanAssignRole(actor: RoleActor, targetRole: Role): void {
  if (actor.role === 'super_admin') return;

  if (targetRole === 'super_admin') {
    throw ApiError.forbidden(
      'Apenas um super administrador pode atribuir o perfil de super administrador.',
    );
  }

  const excess = beyond(actor, permissionsForRole(targetRole));
  if (excess.length > 0) {
    throw ApiError.forbidden(
      `Nao pode atribuir um perfil com acesso que nao tem: ${describe(excess)}.`,
    );
  }
}

/**
 * The same rule pointed the other way: you may not administer an account that
 * can do more than you can.
 *
 * This is what stops the other side door. Resetting a password is a takeover -
 * whoever sets it can sign in as that person - so a manager who may not grant
 * themselves `settings:write` must not be able to reset the owner's password
 * and simply become the owner.
 */
export function assertCanManage(
  actor: RoleActor,
  target: { role: string; permissionOverrides: string },
): void {
  if (actor.role === 'super_admin') return;

  if (target.role === 'super_admin') {
    throw ApiError.forbidden('Nao pode gerir a conta de um super administrador.');
  }

  const held = effectivePermissions(target.role as Role, target.permissionOverrides);
  const excess = beyond(actor, held);
  if (excess.length > 0) {
    throw ApiError.forbidden(
      `Nao pode gerir uma conta com mais acesso do que o seu: ${describe(excess)}.`,
    );
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

/* -------------------------------------------------------------------------- */
/* Per-member permissions                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The role is a preset, not a cage: a business hires "a cashier" and then
 * decides, for that one person, whether they may see margins or void a sale.
 * Everything below is the server side of that tuning. None of it takes an
 * Express type, so the guard rails can be unit tested on their own.
 */

const PERMISSION_ORDER = new Map<Permission, number>(PERMISSIONS.map((p, i) => [p, i] as const));

/** Canonical ordering, so two equal sets always read the same way. */
export function sortPermissions(list: readonly Permission[]): Permission[] {
  return [...new Set(list)].sort(
    (a, b) => (PERMISSION_ORDER.get(a) ?? 0) - (PERMISSION_ORDER.get(b) ?? 0),
  );
}

/** Who is making the change. */
export interface PermissionActor {
  userId: string;
  role: Role;
  /** The caller's OWN effective permissions - the ceiling on what they can give. */
  permissions: Permission[];
}

/** The member being changed, as read from the database. */
export interface PermissionSubject {
  id: string;
  entityId: string | null;
  role: string;
  permissionOverrides: string;
}

export interface PermissionChangePlan {
  role: Role;
  roleDefaults: Permission[];
  before: PermissionOverrides;
  after: PermissionOverrides;
  beforeEffective: Permission[];
  afterEffective: Permission[];
  /** What this change hands out, and what it takes away. */
  added: Permission[];
  removed: Permission[];
  changed: boolean;
  /** Set when the change would take staff management away from this member. */
  losesUserWrite: boolean;
  /** Ready for User.permissionOverrides. */
  serialised: string;
}

export interface PlanPermissionChangeInput {
  actor: PermissionActor;
  subject: PermissionSubject;
  /** The tenant the request is scoped to. */
  entityId: string;
  /** The desired FINAL set, exactly as the checkboxes show it. */
  desired: Permission[];
}

/** Names the permissions in a refusal, without a wall of text on a tablet. */
function describe(permissions: Permission[]): string {
  const labels = permissions.map((permission) => permissionLabel(permission).pt);
  if (labels.length <= 4) return labels.join(', ');
  return labels.slice(0, 4).join(', ') + ' e mais ' + String(labels.length - 4);
}

function sameOverrides(a: PermissionOverrides, b: PermissionOverrides): boolean {
  return serialiseOverrides(a) === serialiseOverrides(b);
}

/**
 * Every synchronous guard rail, in one pure function.
 *
 * Deliberately strict in both directions: a manager may not GRANT access they do
 * not hold (nobody mints a permission out of thin air) and may not REVOKE it
 * either, because otherwise they could quietly switch off something they cannot
 * even see, and nobody would know where the setting went.
 */
export function planPermissionChange(input: PlanPermissionChangeInput): PermissionChangePlan {
  const { actor, subject, entityId, desired } = input;
  const targetRole = subject.role as Role;
  const isSuperAdmin = actor.role === 'super_admin';

  // 1. The member has to be one of ours.
  if (subject.entityId !== entityId) {
    throw ApiError.notFound('Utilizador nao encontrado nesta entidade.');
  }

  // 2. Nobody grants themselves more.
  if (subject.id === actor.userId) {
    throw ApiError.forbidden(
      'Nao pode alterar as suas proprias permissoes. Peca a outro responsavel para o fazer.',
    );
  }

  // 3. The platform operator's account is not tunable from inside a business.
  if (targetRole === 'super_admin' && !isSuperAdmin) {
    throw ApiError.forbidden('Nao pode alterar as permissoes de um super administrador.');
  }

  // 4. The owner's account is only tunable by another owner (or the platform).
  if (targetRole === 'entity_admin' && !isSuperAdmin && actor.role !== 'entity_admin') {
    throw ApiError.forbidden(
      'Apenas um administrador do negocio pode alterar as permissoes de outro administrador.',
    );
  }

  const before = parseOverrides(subject.permissionOverrides);
  const beforeEffective = sortPermissions(effectivePermissions(targetRole, before));

  // Store the DELTA against the role, never the whole set, so a later change to
  // what "cashier" means still reaches everyone who was never hand-tuned.
  const after = overridesFromSelection(targetRole, sortPermissions(desired));
  const afterEffective = sortPermissions(effectivePermissions(targetRole, after));

  const beforeSet = new Set(beforeEffective);
  const afterSet = new Set(afterEffective);
  const added = afterEffective.filter((permission) => !beforeSet.has(permission));
  const removed = beforeEffective.filter((permission) => !afterSet.has(permission));

  // 5. You may only hand out - or take away - access you hold yourself.
  if (!isSuperAdmin) {
    const held = new Set(actor.permissions);

    const cannotGrant = added.filter((permission) => !held.has(permission));
    if (cannotGrant.length > 0) {
      throw ApiError.forbidden(`Nao pode dar acesso que nao tem: ${describe(cannotGrant)}.`);
    }

    const cannotRevoke = removed.filter((permission) => !held.has(permission));
    if (cannotRevoke.length > 0) {
      throw ApiError.forbidden(`Nao pode retirar acesso que nao tem: ${describe(cannotRevoke)}.`);
    }
  }

  return {
    role: targetRole,
    roleDefaults: sortPermissions(permissionsForRole(targetRole)),
    before,
    after,
    beforeEffective,
    afterEffective,
    added,
    removed,
    changed: added.length > 0 || removed.length > 0 || !sameOverrides(before, after),
    losesUserWrite: beforeSet.has('user:write') && !afterSet.has('user:write'),
    serialised: serialiseOverrides(after),
  };
}

/**
 * The last guard rail, and the only one that needs the database: a business must
 * never be able to lock itself out of its own staff management.
 */
export async function assertEntityKeepsAUserManager(
  entityId: string,
  excludeUserId: string,
): Promise<void> {
  const members = await prisma.user.findMany({
    where: { entityId, active: true, deletedAt: null, id: { not: excludeUserId } },
    select: { role: true, permissionOverrides: true },
  });

  const stillManaging = members.filter((member) =>
    effectivePermissions(member.role as Role, member.permissionOverrides).includes('user:write'),
  );

  if (stillManaging.length === 0) {
    throw ApiError.conflict(
      'Esta e a ultima pessoa que pode gerir a equipa. Se lhe retirar essa permissao, ninguem ' +
        'no negocio fica com acesso as contas. De essa permissao a outra pessoa primeiro.',
    );
  }
}

/** The effective view of one member, for the editor and the team list. */
export function permissionStateOf(row: { role: string; permissionOverrides: string }): {
  role: Role;
  overrides: PermissionOverrides;
  roleDefaults: Permission[];
  effective: Permission[];
  custom: boolean;
} {
  const role = row.role as Role;
  const overrides = parseOverrides(row.permissionOverrides);
  return {
    role,
    overrides,
    roleDefaults: sortPermissions(permissionsForRole(role)),
    effective: sortPermissions(effectivePermissions(role, overrides)),
    custom: hasOverrides(overrides),
  };
}

export interface ApplyPermissionChangeInput {
  actor: PermissionActor;
  entityId: string;
  targetId: string;
  /** The desired FINAL set. Left out for a reset back to the role defaults. */
  desired?: Permission[];
}

/** Loads the member, runs every guard rail, and writes the delta. */
export async function applyPermissionChange(
  input: ApplyPermissionChangeInput,
): Promise<{ plan: PermissionChangePlan; user: UserRow }> {
  const subject = await findUserInEntity(input.entityId, input.targetId);

  const plan = planPermissionChange({
    actor: input.actor,
    subject,
    entityId: input.entityId,
    // No selection means "put this person back on their role defaults". Running
    // a reset through the same planner keeps every guard rail in force.
    desired: input.desired ?? permissionsForRole(subject.role as Role),
  });

  if (plan.losesUserWrite) {
    await assertEntityKeepsAUserManager(input.entityId, subject.id);
  }

  // Nothing moved: do not touch the row, and do not write an empty audit entry.
  if (!plan.changed) return { plan, user: subject };

  const user = await prisma.user.update({
    where: { id: subject.id },
    data: { permissionOverrides: plan.serialised },
    select: USER_SELECT,
  });

  return { plan, user };
}
