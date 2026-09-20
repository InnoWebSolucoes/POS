import {
  ROLE_LABELS,
  ROLES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_PERMISSIONS,
  effectivePermissions,
  hasOverrides,
  parseOverrides,
  type Locale,
  type Permission,
  type PermissionOverrides,
  type Role,
} from '@pos/shared';

/**
 * The staff DTO. Deliberately built field by field so a hash can never travel
 * to the client by accident - `passwordHash` and `pinHash` are not shaped in.
 */
export interface UserDto {
  id: string;
  entityId: string | null;
  name: string;
  email: string;
  role: Role;
  locationId: string | null;
  locationName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  locale: Locale;
  active: boolean;
  pinEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** True when this member has been tuned away from their role's defaults. */
  hasCustomPermissions: boolean;
  /** How many things this member may actually do, after the tuning. */
  permissionCount: number;
}

export interface RoleOptionDto {
  role: Role;
  labelPt: string;
  labelEn: string;
  permissions: Permission[];
}

/** What the PIN keypad screen shows before anybody is logged in. */
export interface PinUserDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
}

export interface UserRow {
  id: string;
  entityId: string | null;
  name: string;
  email: string;
  role: string;
  locationId: string | null;
  phone: string | null;
  avatarUrl: string | null;
  locale: string;
  active: boolean;
  pinHash: string | null;
  permissionOverrides: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  location: { id: string; name: string } | null;
}

export function toUserDto(row: UserRow): UserDto {
  const role = row.role as Role;
  const overrides = parseOverrides(row.permissionOverrides);
  return {
    id: row.id,
    entityId: row.entityId,
    name: row.name,
    email: row.email,
    role,
    locationId: row.locationId,
    locationName: row.location?.name ?? null,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    locale: (row.locale || 'pt-PT') as Locale,
    active: row.active,
    pinEnabled: Boolean(row.pinHash),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    hasCustomPermissions: hasOverrides(overrides),
    permissionCount: effectivePermissions(role, overrides).length,
  };
}

/* -------------------------------------------------------------------------- */
/* Per-member permissions                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What the permission editor needs for ONE member.
 *
 * `roleDefaults` is what the role gives out of the box, `effective` is what this
 * person may actually do, and `overrides` is only the difference between the
 * two. `editableByCaller` is the caller's own effective list: the editor greys
 * out every toggle outside it, because you may only hand out access you hold.
 */
export interface UserPermissionsDto {
  userId: string;
  name: string;
  role: Role;
  roleLabelPt: string;
  roleLabelEn: string;
  roleDefaults: Permission[];
  effective: Permission[];
  overrides: PermissionOverrides;
  hasOverrides: boolean;
  editableByCaller: Permission[];
}

export interface PermissionOptionDto {
  permission: Permission;
  labelPt: string;
  labelEn: string;
}

export interface PermissionGroupDto {
  key: string;
  labelPt: string;
  labelEn: string;
  permissions: PermissionOptionDto[];
}

/** The editor's data source: the groups, their labels, and every role preset. */
export interface PermissionCatalogueDto {
  groups: PermissionGroupDto[];
  roleDefaults: Record<Role, Permission[]>;
  roles: Array<{ role: Role; labelPt: string; labelEn: string }>;
}

export function permissionLabel(permission: Permission): { pt: string; en: string } {
  // A permission with no sentence written for it still has to render as
  // something a person can read, so fall back to the key itself.
  return PERMISSION_LABELS[permission] ?? { pt: permission, en: permission };
}

export function buildPermissionCatalogue(): PermissionCatalogueDto {
  const roleDefaults = Object.fromEntries(
    ROLES.map((role) => [role, ROLE_PERMISSIONS[role]]),
  ) as Record<Role, Permission[]>;

  return {
    groups: PERMISSION_GROUPS.map((group) => ({
      key: group.key,
      labelPt: group.labelPt,
      labelEn: group.labelEn,
      permissions: group.permissions.map((permission) => {
        const label = permissionLabel(permission);
        return { permission, labelPt: label.pt, labelEn: label.en };
      }),
    })),
    roleDefaults,
    roles: ROLES.map((role) => ({
      role,
      labelPt: ROLE_LABELS[role].pt,
      labelEn: ROLE_LABELS[role].en,
    })),
  };
}
