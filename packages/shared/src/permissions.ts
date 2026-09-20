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

/* -------------------------------------------------------------------------- */
/* Per-member overrides                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A single member's deviation from their role's defaults.
 *
 * The role remains the starting point - it is the sensible default for "a
 * cashier" - but no two businesses agree on exactly what a cashier may do. One
 * shop lets the till see margins, the next would never. So the role is a
 * preset, not a cage, and this is the tuning on top of it.
 */
export interface PermissionOverrides {
  granted: Permission[];
  revoked: Permission[];
}

export const EMPTY_OVERRIDES: PermissionOverrides = { granted: [], revoked: [] };

const PERMISSION_SET = new Set<string>(PERMISSIONS);

function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && PERMISSION_SET.has(value);
}

/**
 * Parses the stored JSON defensively. Anything malformed means "no overrides"
 * rather than an exception - a corrupted column must never lock a user out or,
 * worse, silently widen their access.
 */
export function parseOverrides(raw: string | null | undefined): PermissionOverrides {
  if (!raw) return { granted: [], revoked: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<PermissionOverrides>;
    return {
      granted: Array.isArray(parsed.granted) ? parsed.granted.filter(isPermission) : [],
      revoked: Array.isArray(parsed.revoked) ? parsed.revoked.filter(isPermission) : [],
    };
  } catch {
    return { granted: [], revoked: [] };
  }
}

export function serialiseOverrides(overrides: PermissionOverrides): string {
  // Sorted and de-duplicated so the column is stable and diffable in the audit log.
  const clean = (list: Permission[]) => [...new Set(list.filter(isPermission))].sort();
  return JSON.stringify({ granted: clean(overrides.granted), revoked: clean(overrides.revoked) });
}

/**
 * What a member may actually do: their role's defaults, plus anything granted
 * to them individually, minus anything revoked. Revocation wins over granting,
 * because the safer reading of a contradictory record is the narrower one.
 */
export function effectivePermissions(
  role: Role,
  overrides?: PermissionOverrides | string | null,
): Permission[] {
  const parsed = typeof overrides === 'string' ? parseOverrides(overrides) : overrides ?? EMPTY_OVERRIDES;
  const result = new Set<Permission>(permissionsForRole(role));

  for (const permission of parsed.granted) result.add(permission);
  for (const permission of parsed.revoked) result.delete(permission);

  return [...result];
}

/**
 * Turns a desired final permission set back into overrides against the role, so
 * the UI can present plain checkboxes while storage keeps only the difference.
 * Storing the delta rather than the whole set means a later change to a role's
 * defaults still reaches everyone who was never specifically tuned.
 */
export function overridesFromSelection(role: Role, selected: Permission[]): PermissionOverrides {
  const base = new Set<Permission>(permissionsForRole(role));
  const wanted = new Set<Permission>(selected.filter(isPermission));

  return {
    granted: [...wanted].filter((p) => !base.has(p)).sort(),
    revoked: [...base].filter((p) => !wanted.has(p)).sort(),
  };
}

export function hasOverrides(overrides: PermissionOverrides): boolean {
  return overrides.granted.length > 0 || overrides.revoked.length > 0;
}

/** Grouping for the permission editor, so it reads as a list of jobs. */
export const PERMISSION_GROUPS: Array<{
  key: string;
  labelPt: string;
  labelEn: string;
  permissions: Permission[];
}> = [
  {
    key: 'selling',
    labelPt: 'Vendas',
    labelEn: 'Selling',
    permissions: ['sale:create', 'sale:read', 'sale:hold', 'sale:discount', 'sale:refund', 'sale:void'],
  },
  {
    key: 'catalogue',
    labelPt: 'Catalogo',
    labelEn: 'Catalogue',
    permissions: ['product:read', 'product:write', 'product:cost', 'category:write'],
  },
  {
    key: 'inventory',
    labelPt: 'Stock',
    labelEn: 'Inventory',
    permissions: [
      'inventory:read',
      'inventory:receive',
      'inventory:adjust',
      'inventory:transfer',
      'inventory:stocktake',
    ],
  },
  {
    key: 'purchasing',
    labelPt: 'Compras',
    labelEn: 'Purchasing',
    permissions: ['supplier:read', 'supplier:write', 'po:read', 'po:write'],
  },
  {
    key: 'customers',
    labelPt: 'Clientes',
    labelEn: 'Customers',
    permissions: ['customer:read', 'customer:write', 'loyalty:manage'],
  },
  {
    key: 'restaurant',
    labelPt: 'Restaurante',
    labelEn: 'Restaurant',
    permissions: [
      'restaurant:order',
      'restaurant:table',
      'restaurant:floorplan',
      'restaurant:kds',
      'restaurant:bill',
    ],
  },
  {
    key: 'online',
    labelPt: 'Loja Online',
    labelEn: 'Online store',
    permissions: ['online:order:read', 'online:order:write', 'online:settings'],
  },
  {
    key: 'insight',
    labelPt: 'Relatorios',
    labelEn: 'Reporting',
    permissions: ['report:read', 'report:financial', 'audit:read'],
  },
  {
    key: 'admin',
    labelPt: 'Administracao',
    labelEn: 'Administration',
    permissions: ['user:read', 'user:write', 'settings:read', 'settings:write', 'entity:read', 'entity:write', 'location:write'],
  },
];

/** One plain sentence per permission, for the editor. */
export const PERMISSION_LABELS: Partial<Record<Permission, { pt: string; en: string }>> = {
  'sale:create': { pt: 'Registar vendas na caixa', en: 'Ring up sales' },
  'sale:read': { pt: 'Ver o historico de vendas', en: 'View sales history' },
  'sale:hold': { pt: 'Suspender e recuperar vendas', en: 'Hold and recall sales' },
  'sale:discount': { pt: 'Aplicar descontos', en: 'Apply discounts' },
  'sale:refund': { pt: 'Processar devolucoes', en: 'Process refunds' },
  'sale:void': { pt: 'Anular vendas', en: 'Void sales' },
  'product:read': { pt: 'Ver produtos', en: 'View products' },
  'product:write': { pt: 'Criar e editar produtos', en: 'Create and edit products' },
  'product:cost': { pt: 'Ver precos de custo e margens', en: 'See cost prices and margins' },
  'category:write': { pt: 'Gerir categorias', en: 'Manage categories' },
  'inventory:read': { pt: 'Consultar stock', en: 'View stock' },
  'inventory:receive': { pt: 'Dar entrada de mercadoria', en: 'Receive goods' },
  'inventory:adjust': { pt: 'Ajustar stock (quebras, perdas)', en: 'Adjust stock' },
  'inventory:transfer': { pt: 'Transferir entre localizacoes', en: 'Transfer between locations' },
  'inventory:stocktake': { pt: 'Fazer inventario fisico', en: 'Run stocktakes' },
  'supplier:read': { pt: 'Ver fornecedores', en: 'View suppliers' },
  'supplier:write': { pt: 'Gerir fornecedores', en: 'Manage suppliers' },
  'po:read': { pt: 'Ver encomendas a fornecedores', en: 'View purchase orders' },
  'po:write': { pt: 'Criar encomendas a fornecedores', en: 'Create purchase orders' },
  'customer:read': { pt: 'Ver clientes', en: 'View customers' },
  'customer:write': { pt: 'Criar e editar clientes', en: 'Create and edit customers' },
  'loyalty:manage': { pt: 'Gerir pontos e credito de loja', en: 'Manage loyalty and credit' },
  'restaurant:order': { pt: 'Tirar pedidos as mesas', en: 'Take table orders' },
  'restaurant:table': { pt: 'Abrir, mover e juntar mesas', en: 'Open, move and merge tables' },
  'restaurant:floorplan': { pt: 'Editar o plano de sala', en: 'Edit the floor plan' },
  'restaurant:kds': { pt: 'Usar o ecra de cozinha', en: 'Use the kitchen display' },
  'restaurant:bill': { pt: 'Fechar contas e receber pagamento', en: 'Close bills and take payment' },
  'online:order:read': { pt: 'Ver encomendas online', en: 'View online orders' },
  'online:order:write': { pt: 'Processar encomendas online', en: 'Fulfil online orders' },
  'online:settings': { pt: 'Configurar a loja online', en: 'Configure the online store' },
  'report:read': { pt: 'Ver relatorios de vendas', en: 'View sales reports' },
  'report:financial': { pt: 'Ver lucro, margem e resultados', en: 'View profit, margin and P&L' },
  'audit:read': { pt: 'Consultar o registo de auditoria', en: 'View the audit log' },
  'user:read': { pt: 'Ver a equipa', en: 'View staff' },
  'user:write': { pt: 'Gerir contas da equipa', en: 'Manage staff accounts' },
  'settings:read': { pt: 'Ver definicoes', en: 'View settings' },
  'settings:write': { pt: 'Alterar definicoes do negocio', en: 'Change business settings' },
  'entity:read': { pt: 'Ver dados do negocio', en: 'View business details' },
  'entity:write': { pt: 'Alterar dados do negocio', en: 'Edit business details' },
  'location:write': { pt: 'Gerir localizacoes', en: 'Manage locations' },
};

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
