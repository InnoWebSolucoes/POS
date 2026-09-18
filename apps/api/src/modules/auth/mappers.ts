import {
  ENTITY_MODES,
  LOCALES,
  ROLES,
  permissionsForRole,
  type AuthUser,
  type CostingMethod,
  type EntityDto,
  type EntityMode,
  type Locale,
  type PricingMode,
  type Role,
} from '@pos/shared';

/**
 * Structural row shapes so any Prisma `select` that carries these columns can be
 * mapped, without the module depending on a particular generated payload type.
 */
export interface AuthUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  entityId: string | null;
  locationId: string | null;
  locale: string;
  avatarUrl: string | null;
  pinHash: string | null;
}

export interface EntityRow {
  id: string;
  name: string;
  slug: string;
  mode: string;
  nif: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  accentColor: string;
  currency: string;
  locale: string;
  pricingMode: string;
  costingMethod: string;
  defaultTaxRateBps: number;
  active: boolean;
  createdAt: Date;
}

/** Columns every auth response needs from the user table. */
export const AUTH_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  entityId: true,
  locationId: true,
  locale: true,
  avatarUrl: true,
  pinHash: true,
} as const;

export const ENTITY_SELECT = {
  id: true,
  name: true,
  slug: true,
  mode: true,
  nif: true,
  address: true,
  phone: true,
  email: true,
  logoUrl: true,
  accentColor: true,
  currency: true,
  locale: true,
  pricingMode: true,
  costingMethod: true,
  defaultTaxRateBps: true,
  active: true,
  createdAt: true,
} as const;

/* -------------------------------------------------------------------------- */
/* Coercion - the database stores these unions as plain strings                */
/* -------------------------------------------------------------------------- */

export function toRole(value: string): Role {
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : 'cashier';
}

export function toLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : 'pt-PT';
}

function toMode(value: string): EntityMode {
  return (ENTITY_MODES as readonly string[]).includes(value) ? (value as EntityMode) : 'retail';
}

function toPricingMode(value: string): PricingMode {
  return value === 'exclusive' ? 'exclusive' : 'inclusive';
}

function toCostingMethod(value: string): CostingMethod {
  return value === 'fifo' ? 'fifo' : 'weighted_average';
}

/* -------------------------------------------------------------------------- */
/* Mappers                                                                     */
/* -------------------------------------------------------------------------- */

/** The identity payload the client caches for the whole session. */
export function toAuthUser(user: AuthUserRow): AuthUser {
  const role = toRole(user.role);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    entityId: user.entityId,
    locationId: user.locationId,
    locale: toLocale(user.locale),
    avatarUrl: user.avatarUrl,
    permissions: permissionsForRole(role),
    pinEnabled: user.pinHash != null,
  };
}

export function toEntityDto(entity: EntityRow): EntityDto;
export function toEntityDto(entity: EntityRow | null | undefined): EntityDto | null;
export function toEntityDto(entity: EntityRow | null | undefined): EntityDto | null {
  if (!entity) return null;
  return {
    id: entity.id,
    name: entity.name,
    slug: entity.slug,
    mode: toMode(entity.mode),
    nif: entity.nif,
    address: entity.address,
    phone: entity.phone,
    email: entity.email,
    logoUrl: entity.logoUrl,
    accentColor: entity.accentColor,
    currency: entity.currency,
    locale: toLocale(entity.locale),
    pricingMode: toPricingMode(entity.pricingMode),
    costingMethod: toCostingMethod(entity.costingMethod),
    defaultTaxRateBps: Number(entity.defaultTaxRateBps),
    active: entity.active,
    createdAt: entity.createdAt.toISOString(),
  };
}
