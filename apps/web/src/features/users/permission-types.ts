import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS as SHARED_PERMISSION_LABELS,
  ROLE_PERMISSIONS,
  type EntityMode,
  type Permission,
  type Role,
} from '@pos/shared';

import { PERMISSION_LABELS as FALLBACK_LABELS } from './user-types';

/**
 * The vocabulary of the permission editor.
 *
 * The shop owner opening this screen does not know what "product:cost" is, and
 * should never have to. Everything here exists to turn the permission matrix
 * into sentences: what this person can do, what the role said by default, and
 * how far the owner has strayed from it.
 */

/* -------------------------------------------------------------------------- */
/* The API contract                                                            */
/* -------------------------------------------------------------------------- */

export interface PermissionOverridesDto {
  granted: Permission[];
  revoked: Permission[];
}

/** GET /api/users/:id/permissions */
export interface UserPermissionsDto {
  role: Role;
  /** What the role grants out of the box. */
  roleDefaults: Permission[];
  /** What this person may actually do right now (role + granted - revoked). */
  effective: Permission[];
  overrides: PermissionOverridesDto;
  hasOverrides: boolean;
  /**
   * What the caller is allowed to hand out or take away. You cannot grant an
   * access you do not hold yourself, so a manager never widens someone past
   * their own reach.
   */
  editableByCaller: Permission[];
}

/**
 * GET /api/users/permission-catalogue
 *
 * Read defensively: the editor works entirely from @pos/shared, and the
 * catalogue only ever *overrides* a label or a group title. That way a server
 * that adds a permission next month shows up here without a web deploy, and a
 * server that has not shipped the route yet changes nothing.
 */
export type CataloguePermission =
  | Permission
  | { key: Permission; labelPt?: string; labelEn?: string };

export interface PermissionCatalogueGroup {
  key: string;
  labelPt?: string;
  labelEn?: string;
  permissions: CataloguePermission[];
}

export interface PermissionCatalogueDto {
  groups: PermissionCatalogueGroup[];
  roleDefaults?: Partial<Record<Role, Permission[]>>;
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

function catalogueEntry(
  catalogue: PermissionCatalogueDto | undefined,
  permission: Permission,
): { labelPt?: string } | null {
  if (!catalogue || !Array.isArray(catalogue.groups)) return null;
  for (const group of catalogue.groups) {
    if (!Array.isArray(group.permissions)) continue;
    for (const entry of group.permissions) {
      if (typeof entry === 'string') {
        if (entry === permission) return {};
        continue;
      }
      if (entry && entry.key === permission) return entry;
    }
  }
  return null;
}

/** "Ver precos de custo e margens" - never "product:cost". */
export function permissionLabel(
  permission: Permission,
  catalogue?: PermissionCatalogueDto,
): string {
  const fromServer = catalogueEntry(catalogue, permission);
  if (fromServer?.labelPt) return fromServer.labelPt;
  return SHARED_PERMISSION_LABELS[permission]?.pt ?? FALLBACK_LABELS[permission] ?? permission;
}

export function groupLabel(key: string, fallback: string, catalogue?: PermissionCatalogueDto): string {
  const group = catalogue?.groups?.find((candidate) => candidate.key === key);
  return group?.labelPt ?? fallback;
}

/* -------------------------------------------------------------------------- */
/* What belongs to this kind of business                                       */
/* -------------------------------------------------------------------------- */

const RESTAURANT_GROUP = 'restaurant';
const ONLINE_GROUP = 'online';

const RESTAURANT_PERMISSIONS = new Set<Permission>(
  PERMISSION_GROUPS.find((group) => group.key === RESTAURANT_GROUP)?.permissions ?? [],
);
const ONLINE_PERMISSIONS = new Set<Permission>(
  PERMISSION_GROUPS.find((group) => group.key === ONLINE_GROUP)?.permissions ?? [],
);

/**
 * A retail shop has no tables and no storefront. Hiding those switches is not
 * cosmetic - it is a third of the list the owner never has to read.
 */
export function isPermissionRelevant(permission: Permission, mode: EntityMode | undefined): boolean {
  if (!mode) return true;
  if (RESTAURANT_PERMISSIONS.has(permission)) return mode === 'restaurant';
  if (ONLINE_PERMISSIONS.has(permission)) return mode === 'online';
  return true;
}

export interface EditorGroup {
  key: string;
  label: string;
  permissions: Permission[];
}

/**
 * The groups to draw, in order.
 *
 * A group irrelevant to the entity's mode is dropped, EXCEPT when this person
 * still holds something inside it - an access that is live must never be
 * invisible, or the owner cannot take it away.
 */
export function buildEditorGroups(
  mode: EntityMode | undefined,
  active: ReadonlySet<Permission>,
  catalogue?: PermissionCatalogueDto,
): EditorGroup[] {
  return PERMISSION_GROUPS.map((group) => {
    const relevant = group.permissions.filter(
      (permission) => isPermissionRelevant(permission, mode) || active.has(permission),
    );
    return {
      key: group.key,
      label: groupLabel(group.key, group.labelPt, catalogue),
      permissions: relevant,
    };
  }).filter((group) => group.permissions.length > 0);
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

export interface PermissionPreset {
  key: string;
  label: string;
  description: string;
  /** Applied in every kind of business. */
  base: Permission[];
  /** Added when the business is a restaurant. */
  restaurant?: Permission[];
  /** Added when the business is an online store. */
  online?: Permission[];
}

const CASHIER_BASIC: Permission[] = [
  'entity:read',
  'settings:read',
  'product:read',
  'sale:create',
  'sale:hold',
  'customer:read',
];

const CASHIER_REFUNDS: Permission[] = [
  ...CASHIER_BASIC,
  'sale:read',
  'sale:refund',
  'customer:write',
  'inventory:read',
];

/**
 * Three answers to "what should a till be able to do?", one tap each.
 *
 * None of them ever includes `product:cost` or `report:financial`: margins are
 * the owner's business, and a preset should never be the thing that leaks them.
 */
export const PERMISSION_PRESETS: PermissionPreset[] = [
  {
    key: 'cashier-basic',
    label: 'Caixa basico',
    description: 'So vender. Sem custos, sem stock, sem relatorios.',
    base: CASHIER_BASIC,
    restaurant: ['restaurant:order', 'restaurant:table', 'restaurant:bill'],
    online: ['online:order:read'],
  },
  {
    key: 'cashier-refunds',
    label: 'Caixa com devolucoes',
    description: 'O caixa basico, mais consultar vendas e devolver.',
    base: CASHIER_REFUNDS,
    restaurant: ['restaurant:order', 'restaurant:table', 'restaurant:bill'],
    online: ['online:order:read'],
  },
  {
    key: 'shift-lead',
    label: 'Chefe de turno',
    description: 'Devolucoes, descontos, anulacoes e relatorios de vendas.',
    base: [
      ...CASHIER_REFUNDS,
      'sale:discount',
      'sale:void',
      'report:read',
      'user:read',
      'inventory:adjust',
    ],
    restaurant: [
      'restaurant:order',
      'restaurant:table',
      'restaurant:bill',
      'restaurant:floorplan',
    ],
    online: ['online:order:read', 'online:order:write'],
  },
];

export function presetPermissions(
  preset: PermissionPreset,
  mode: EntityMode | undefined,
): Set<Permission> {
  const result = new Set<Permission>(preset.base);
  if (mode === 'restaurant') for (const p of preset.restaurant ?? []) result.add(p);
  if (mode === 'online') for (const p of preset.online ?? []) result.add(p);
  return result;
}

/**
 * Applying a preset only ever touches switches the owner can see AND is allowed
 * to change. Anything hidden or locked keeps exactly the value it had, so a tap
 * can never move something nobody was looking at.
 */
export function applyPreset(
  current: ReadonlySet<Permission>,
  preset: Set<Permission>,
  touchable: readonly Permission[],
): Set<Permission> {
  const next = new Set<Permission>(current);
  for (const permission of touchable) {
    if (preset.has(permission)) next.add(permission);
    else next.delete(permission);
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* Diffing                                                                     */
/* -------------------------------------------------------------------------- */

export function sameSelection(a: ReadonlySet<Permission>, b: ReadonlySet<Permission>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/** How many of the drawn switches sit away from the role's default. */
export function countChanged(
  selection: ReadonlySet<Permission>,
  defaults: ReadonlySet<Permission>,
  permissions: readonly Permission[],
): number {
  return permissions.filter((permission) => selection.has(permission) !== defaults.has(permission))
    .length;
}

/* -------------------------------------------------------------------------- */
/* Reading a role at a glance                                                  */
/* -------------------------------------------------------------------------- */

interface RoleTheme {
  label: string;
  /** The role has this capability when it holds ANY of these. */
  any: Permission[];
  /** Only mentioned for a business of this kind. */
  mode?: EntityMode;
}

const ROLE_THEMES: RoleTheme[] = [
  { label: 'Vender na caixa', any: ['sale:create'] },
  { label: 'Tirar pedidos as mesas', any: ['restaurant:order'], mode: 'restaurant' },
  { label: 'Fechar contas e cobrar', any: ['restaurant:bill'], mode: 'restaurant' },
  { label: 'Usar o ecra de cozinha', any: ['restaurant:kds'], mode: 'restaurant' },
  { label: 'Processar encomendas online', any: ['online:order:write'], mode: 'online' },
  { label: 'Aplicar descontos', any: ['sale:discount'] },
  { label: 'Devolver e anular vendas', any: ['sale:refund', 'sale:void'] },
  { label: 'Ver e editar produtos', any: ['product:write'] },
  { label: 'Dar entrada e ajustar stock', any: ['inventory:receive', 'inventory:adjust'] },
  { label: 'Encomendar a fornecedores', any: ['po:write'] },
  { label: 'Gerir clientes', any: ['customer:write'] },
  { label: 'Ver relatorios de vendas', any: ['report:read'] },
  { label: 'Ver lucro, margens e custos', any: ['report:financial', 'product:cost'] },
  { label: 'Gerir a equipa', any: ['user:write'] },
  { label: 'Alterar definicoes do negocio', any: ['settings:write'] },
];

export interface RoleHighlights {
  can: string[];
  cannot: string[];
  total: number;
}

/**
 * What choosing this role actually means, in a dozen words.
 *
 * The "cannot" half matters as much as the "can" half: the owner picking
 * "Operador de Caixa" needs to see, before saving, that it does not show
 * margins and does not open the reports.
 */
export function roleHighlights(role: Role, mode: EntityMode | undefined): RoleHighlights {
  const granted = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
  const can: string[] = [];
  const cannot: string[] = [];

  for (const theme of ROLE_THEMES) {
    if (theme.mode && mode && theme.mode !== mode) continue;
    if (theme.any.some((permission) => granted.has(permission))) can.push(theme.label);
    else cannot.push(theme.label);
  }

  const relevant = [...granted].filter((permission) => isPermissionRelevant(permission, mode));

  return { can, cannot: cannot.slice(0, 4), total: relevant.length };
}
