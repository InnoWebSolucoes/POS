import type { Locale, Permission, Role } from '@pos/shared';

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
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  location: { id: string; name: string } | null;
}

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    entityId: row.entityId,
    name: row.name,
    email: row.email,
    role: row.role as Role,
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
  };
}
