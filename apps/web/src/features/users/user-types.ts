import type { Locale, Permission, Role } from '@pos/shared';

/**
 * The staff screen's own vocabulary: the form model, and a Portuguese name for
 * every permission so a manager can read what a role actually grants instead of
 * guessing from "po:write".
 */

export interface UserRow {
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
  /**
   * True when this member has been tuned away from the role's defaults. Absent
   * on an older server, which reads the same as "still on the preset".
   */
  hasCustomPermissions?: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoleOption {
  role: Role;
  labelPt: string;
  labelEn: string;
  permissions: Permission[];
}

export interface UserListParams {
  page: number;
  pageSize: number;
  search: string;
  role: Role | 'all';
  active: 'all' | 'true' | 'false';
  locationId: string;
  sort: 'name' | 'role' | 'createdAt' | 'lastLoginAt';
  order: 'asc' | 'desc';
}

export const defaultUserListParams = (): UserListParams => ({
  page: 1,
  pageSize: 25,
  search: '',
  role: 'all',
  active: 'all',
  locationId: 'all',
  sort: 'name',
  order: 'asc',
});

/* -------------------------------------------------------------------------- */
/* Form                                                                        */
/* -------------------------------------------------------------------------- */

export interface UserFormValues {
  name: string;
  email: string;
  password: string;
  role: Role;
  locationId: string;
  phone: string;
  locale: Locale;
}

export const emptyUserForm = (): UserFormValues => ({
  name: '',
  email: '',
  password: '',
  role: 'cashier',
  locationId: '',
  phone: '',
  locale: 'pt-PT',
});

export function userToForm(user: UserRow): UserFormValues {
  return {
    name: user.name,
    email: user.email,
    password: '',
    role: user.role,
    locationId: user.locationId ?? '',
    phone: user.phone ?? '',
    locale: user.locale,
  };
}

/* -------------------------------------------------------------------------- */
/* Permission vocabulary                                                       */
/* -------------------------------------------------------------------------- */

export const PERMISSION_LABELS: Record<Permission, string> = {
  'entity:read': 'Ver os dados da entidade',
  'entity:write': 'Editar os dados da entidade',
  'entity:create': 'Criar novas entidades',
  'location:write': 'Gerir localizacoes',

  'user:read': 'Ver os utilizadores',
  'user:write': 'Criar e editar utilizadores',

  'product:read': 'Ver produtos',
  'product:write': 'Criar e editar produtos',
  'product:cost': 'Ver preco de custo e margem',
  'category:write': 'Gerir categorias',
  'supplier:read': 'Ver fornecedores',
  'supplier:write': 'Gerir fornecedores',

  'inventory:read': 'Ver stock',
  'inventory:receive': 'Dar entrada de stock',
  'inventory:adjust': 'Ajustar stock',
  'inventory:transfer': 'Transferir stock',
  'inventory:stocktake': 'Fazer inventario',
  'po:read': 'Ver encomendas a fornecedores',
  'po:write': 'Criar encomendas a fornecedores',

  'sale:create': 'Registar vendas',
  'sale:read': 'Consultar vendas',
  'sale:discount': 'Aplicar descontos',
  'sale:refund': 'Emitir devolucoes',
  'sale:void': 'Anular vendas',
  'sale:hold': 'Suspender vendas',

  'customer:read': 'Ver clientes',
  'customer:write': 'Criar e editar clientes',
  'loyalty:manage': 'Gerir pontos e credito de loja',

  'restaurant:order': 'Tirar e editar pedidos de mesa',
  'restaurant:floorplan': 'Editar o plano de sala',
  'restaurant:table': 'Abrir, mover e juntar mesas',
  'restaurant:kds': 'Usar o ecra da cozinha',
  'restaurant:bill': 'Fechar contas e cobrar',

  'online:order:read': 'Ver encomendas online',
  'online:order:write': 'Processar encomendas online',
  'online:settings': 'Configurar a loja online',

  'report:read': 'Ver relatorios',
  'report:financial': 'Ver resultados, margens e custos',
  'audit:read': 'Ver o registo de auditoria',

  'settings:read': 'Ver as definicoes',
  'settings:write': 'Alterar as definicoes',
};

export interface PermissionGroup {
  label: string;
  permissions: Permission[];
}

/** Grouped the way the permission list itself is grouped, so nothing is lost. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  { label: 'Entidade', permissions: ['entity:read', 'entity:write', 'entity:create', 'location:write'] },
  { label: 'Pessoas', permissions: ['user:read', 'user:write'] },
  {
    label: 'Catalogo',
    permissions: [
      'product:read',
      'product:write',
      'product:cost',
      'category:write',
      'supplier:read',
      'supplier:write',
    ],
  },
  {
    label: 'Stock',
    permissions: [
      'inventory:read',
      'inventory:receive',
      'inventory:adjust',
      'inventory:transfer',
      'inventory:stocktake',
      'po:read',
      'po:write',
    ],
  },
  {
    label: 'Vendas',
    permissions: ['sale:create', 'sale:read', 'sale:discount', 'sale:refund', 'sale:void', 'sale:hold'],
  },
  { label: 'Clientes', permissions: ['customer:read', 'customer:write', 'loyalty:manage'] },
  {
    label: 'Restaurante',
    permissions: [
      'restaurant:order',
      'restaurant:floorplan',
      'restaurant:table',
      'restaurant:kds',
      'restaurant:bill',
    ],
  },
  {
    label: 'Loja online',
    permissions: ['online:order:read', 'online:order:write', 'online:settings'],
  },
  { label: 'Analise', permissions: ['report:read', 'report:financial', 'audit:read'] },
  { label: 'Configuracao', permissions: ['settings:read', 'settings:write'] },
];

/** The handful of permissions a manager should think twice about granting. */
export const SENSITIVE_PERMISSIONS: Permission[] = [
  'product:cost',
  'report:financial',
  'sale:void',
  'sale:refund',
  'user:write',
  'settings:write',
  'entity:create',
];
