import type { Role } from './constants.js';

/**
 * Granular permissions. The UI hides things it cannot do, but the server is the
 * authority: every protected route calls `requirePermission(...)`.
 */
export const PERMISSIONS = [
  // Tenancy
  'entity:read',
  'entity:write',
  'entity:create',
  'location:write',

  // People
  'user:read',
  'user:write',

  // Catalogue
  'product:read',
  'product:write',
  'product:cost', // see cost price / margin / COGS
  'category:write',
  'supplier:read',
  'supplier:write',

  // Inventory
  'inventory:read',
  'inventory:receive',
  'inventory:adjust',
  'inventory:transfer',
  'inventory:stocktake',
  'po:read',
  'po:write',

  // Selling
  'sale:create',
  'sale:read',
  'sale:discount',
  'sale:refund',
  'sale:void',
  'sale:hold',

  // Customers
  'customer:read',
  'customer:write',
  'loyalty:manage',

  // Restaurant
  'restaurant:order', // take / edit table orders
  'restaurant:floorplan', // edit the floor plan layout
  'restaurant:table', // open / move / merge tables
  'restaurant:kds', // kitchen display
  'restaurant:bill', // close a bill, take payment

  // Online store
  'online:order:read',
  'online:order:write',
  'online:settings',

  // Insight
  'report:read',
  'report:financial', // P&L, margins, COGS
  'audit:read',

  // Config
  'settings:read',
  'settings:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

/**
 * Role -> permission matrix, mirroring the spec's RBAC table.
 *
 * Note the deliberate omissions:
 *  - cashier never gets `product:cost` or `report:financial` (no margin data)
 *  - stock_clerk never gets `sale:create` (no selling)
 *  - waiter never gets `restaurant:bill` (no payment processing)
 *  - kitchen only ever sees the KDS
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ALL,

  entity_admin: ALL.filter((p) => p !== 'entity:create'),

  manager: [
    'entity:read',
    'user:read',
    'product:read',
    'product:write',
    'product:cost',
    'category:write',
    'supplier:read',
    'supplier:write',
    'inventory:read',
    'inventory:receive',
    'inventory:adjust',
    'inventory:transfer',
    'inventory:stocktake',
    'po:read',
    'po:write',
    'sale:create',
    'sale:read',
    'sale:discount',
    'sale:refund',
    'sale:void',
    'sale:hold',
    'customer:read',
    'customer:write',
    'loyalty:manage',
    'restaurant:order',
    'restaurant:floorplan',
    'restaurant:table',
    'restaurant:kds',
    'restaurant:bill',
    'online:order:read',
    'online:order:write',
    'report:read',
    'report:financial',
    'audit:read',
    'settings:read',
  ],

  cashier: [
    'entity:read',
    'product:read',
    'inventory:read',
    'sale:create',
    'sale:read',
    'sale:hold',
    'customer:read',
    'customer:write',
    'restaurant:order',
    'restaurant:table',
    'restaurant:bill',
    'settings:read',
  ],

  stock_clerk: [
    'entity:read',
    'product:read',
    'product:write',
    'product:cost',
    'category:write',
    'supplier:read',
    'inventory:read',
    'inventory:receive',
    'inventory:adjust',
    'inventory:transfer',
    'inventory:stocktake',
    'po:read',
    'po:write',
    'settings:read',
  ],

  waiter: [
    'entity:read',
    'product:read',
    'customer:read',
    'restaurant:order',
    'restaurant:table',
    'settings:read',
  ],

  kitchen: ['entity:read', 'restaurant:kds'],
};

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function hasPermission(
  granted: readonly string[] | undefined | null,
  permission: Permission,
): boolean {
  if (!granted) return false;
  return granted.includes(permission);
}

export function hasAnyPermission(
  granted: readonly string[] | undefined | null,
  permissions: Permission[],
): boolean {
  if (!granted) return false;
  return permissions.some((p) => granted.includes(p));
}

/**
 * The screen a user should land on right after logging in.
 *
 * These must stay in step with the route table in apps/web/src/App.tsx, which
 * uses Portuguese paths. A target that does not resolve sends the router to its
 * catch-all, and if that catch-all redirects home you get an infinite loop and
 * a blank page rather than an error.
 */
export const ROLE_HOME: Record<Role, string> = {
  super_admin: '/admin/entidades',
  entity_admin: '/dashboard',
  manager: '/dashboard',
  cashier: '/pos',
  stock_clerk: '/stock',
  waiter: '/restaurante/sala',
  kitchen: '/kds',
};
