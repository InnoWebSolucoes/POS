import {
  ArrowLeftRight,
  Boxes,
  Building2,
  ChartColumn,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  FolderTree,
  Ellipsis,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Package,
  PackagePlus,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  Truck,
  Undo2,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { EntityMode, Permission, Role } from '@pos/shared';

/**
 * One source of truth for navigation.
 *
 * Both shells read this file: the back office renders it as a grouped sidebar,
 * the register renders a slice of it as the bottom tab bar and the "Mais"
 * sheet. Adding a screen means adding a row here, not editing two components.
 *
 * Every entry declares the permission that opens it, because a link a cashier
 * cannot follow is worse than no link at all - it looks like a broken app.
 * The server is still the authority: hiding a button is not access control.
 */

export interface NavItem {
  /** Stable key for React lists and for the "Mais" sheet selection. */
  key: string;
  /** pt-PT, without accents, like the rest of the source. */
  label: string;
  to: string;
  icon: LucideIcon;
  /** Required to see the link at all. */
  permission?: Permission;
  /** Restricts the link to these entity modes; omitted means every mode. */
  modes?: EntityMode[];
  /** Tenancy administration - only the platform owner. */
  superAdminOnly?: boolean;
  /**
   * Highlight only on an exact path match. Off by default so /produtos/novo
   * still lights up "Produtos".
   */
  exact?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
  /** Whole group hidden outside these modes. */
  modes?: EntityMode[];
}

export interface NavVisibility {
  mode: EntityMode | null;
  role: Role | null;
  can: (permission: Permission) => boolean;
}

/* -------------------------------------------------------------------------- */
/* The map                                                                     */
/* -------------------------------------------------------------------------- */

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'principal',
    label: 'Principal',
    items: [
      {
        key: 'dashboard',
        label: 'Painel',
        to: '/dashboard',
        icon: LayoutDashboard,
        permission: 'entity:read',
      },
    ],
  },
  {
    key: 'vendas',
    label: 'Vendas',
    items: [
      { key: 'pos', label: 'Caixa', to: '/pos', icon: ShoppingCart, permission: 'sale:create', exact: true },
      { key: 'sales', label: 'Transaccoes', to: '/transaccoes', icon: Receipt, permission: 'sale:read' },
      { key: 'promotions', label: 'Promocoes', to: '/promocoes', icon: TrendingUp, permission: 'product:read' },
      { key: 'customers', label: 'Clientes', to: '/clientes', icon: Users, permission: 'customer:read' },
    ],
  },
  {
    key: 'restaurante',
    label: 'Restaurante',
    modes: ['restaurant'],
    items: [
      {
        key: 'floor',
        label: 'Plano de Sala',
        to: '/restaurante/sala',
        icon: LayoutGrid,
        permission: 'restaurant:table',
      },
      {
        key: 'orders',
        label: 'Pedidos',
        to: '/restaurante/pedidos',
        icon: ClipboardList,
        permission: 'restaurant:order',
      },
      { key: 'kds', label: 'Cozinha', to: '/kds', icon: ChefHat, permission: 'restaurant:kds' },
    ],
  },
  {
    key: 'loja-online',
    label: 'Loja Online',
    modes: ['online'],
    items: [
      {
        key: 'online-orders',
        label: 'Encomendas',
        to: '/loja-online/encomendas',
        icon: ShoppingBag,
        permission: 'online:order:read',
      },
    ],
  },
  {
    key: 'catalogo',
    label: 'Catalogo',
    items: [
      { key: 'products', label: 'Produtos', to: '/produtos', icon: Package, permission: 'product:read' },
      { key: 'categories', label: 'Categorias', to: '/categorias', icon: FolderTree, permission: 'product:read' },
      { key: 'modifiers', label: 'Opcoes', to: '/opcoes', icon: SlidersHorizontal, permission: 'product:read' },
    ],
  },
  {
    key: 'stock',
    label: 'Stock',
    items: [
      { key: 'inventory', label: 'Stock', to: '/stock', icon: Boxes, permission: 'inventory:read', exact: true },
      {
        key: 'receive',
        label: 'Entrada de Stock',
        to: '/stock/entrada',
        icon: PackagePlus,
        permission: 'inventory:receive',
      },
      { key: 'adjust', label: 'Ajustes', to: '/stock/ajuste', icon: Scale, permission: 'inventory:adjust' },
      {
        key: 'stocktake',
        label: 'Inventario',
        to: '/stock/inventario',
        icon: ClipboardCheck,
        permission: 'inventory:stocktake',
      },
      {
        key: 'movements',
        label: 'Movimentos',
        to: '/stock/movimentos',
        icon: ScrollText,
        permission: 'inventory:read',
      },
      {
        key: 'transfers',
        label: 'Transferencias',
        to: '/stock/transferencias',
        icon: ArrowLeftRight,
        permission: 'inventory:transfer',
      },
    ],
  },
  {
    key: 'compras',
    label: 'Compras',
    items: [
      { key: 'suppliers', label: 'Fornecedores', to: '/fornecedores', icon: Truck, permission: 'supplier:read' },
      { key: 'purchase-orders', label: 'Encomendas', to: '/encomendas', icon: ClipboardList, permission: 'po:read' },
    ],
  },
  {
    key: 'analise',
    label: 'Analise',
    items: [
      { key: 'reports', label: 'Relatorios', to: '/relatorios', icon: ChartColumn, permission: 'report:read', exact: true },
      {
        key: 'profit-loss',
        label: 'Resultados',
        to: '/relatorios/resultados',
        icon: TrendingUp,
        permission: 'report:financial',
      },
    ],
  },
  {
    key: 'sistema',
    label: 'Sistema',
    items: [
      { key: 'users', label: 'Utilizadores', to: '/utilizadores', icon: UserCog, permission: 'user:read' },
      { key: 'settings', label: 'Definicoes', to: '/definicoes', icon: Settings, permission: 'settings:read', exact: true },
      { key: 'audit', label: 'Auditoria', to: '/definicoes/auditoria', icon: ScrollText, permission: 'audit:read' },
      {
        key: 'entities',
        label: 'Entidades',
        to: '/admin/entidades',
        icon: Building2,
        permission: 'entity:create',
        superAdminOnly: true,
      },
    ],
  },
];

/** Human label for the tenant's mode, shown under the entity name. */
export const MODE_LABELS: Record<EntityMode, string> = {
  retail: 'Retalho',
  restaurant: 'Restaurante',
  online: 'Loja Online',
};

/* -------------------------------------------------------------------------- */
/* Filtering                                                                   */
/* -------------------------------------------------------------------------- */

export function isNavItemVisible(item: NavItem, visibility: NavVisibility): boolean {
  if (item.superAdminOnly && visibility.role !== 'super_admin') return false;
  if (item.modes && (!visibility.mode || !item.modes.includes(visibility.mode))) return false;
  if (item.permission && !visibility.can(item.permission)) return false;
  return true;
}

/** Groups with nothing left in them disappear rather than leaving a heading. */
export function visibleNavGroups(visibility: NavVisibility): NavGroup[] {
  return NAV_GROUPS.map((group) => {
    if (group.modes && (!visibility.mode || !group.modes.includes(visibility.mode))) return null;
    const items = group.items.filter((item) => isNavItemVisible(item, visibility));
    return items.length ? { ...group, items } : null;
  }).filter((group): group is NavGroup => group !== null);
}

/** Flat list, for the command palette and the register's "Mais" sheet. */
export function visibleNavItems(visibility: NavVisibility): NavItem[] {
  return visibleNavGroups(visibility).flatMap((group) => group.items);
}

/**
 * Does this path belong to that destination? `/produtos/novo` belongs to
 * `/produtos`, but `/stock/entrada` must not also light up `/stock`, which is
 * why entries with children of their own are marked `exact`.
 */
export function isPathActive(to: string, pathname: string, exact = false): boolean {
  if (exact) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return isPathActive(item.to, pathname, item.exact);
}

/** The nav entry that owns a path - longest match wins. */
export function findNavItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!isNavItemActive(item, pathname)) continue;
      if (!best || item.to.length > best.to.length) best = item;
    }
  }
  return best;
}

/** Page title for the top bar when a screen has not set its own. */
export function titleForPath(pathname: string): string {
  return findNavItem(pathname)?.label ?? 'Painel';
}

/* -------------------------------------------------------------------------- */
/* The register's bottom bar                                                   */
/* -------------------------------------------------------------------------- */

export interface PosTab {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Destinations have a route; "Terminar Sessao" and "Mais" have an action. */
  to?: string;
  action?: 'logout' | 'more';
  permission?: Permission;
  exact?: boolean;
}

/**
 * The tab bar mirrors the reference layout: five or six destinations, never a
 * scrolling row. What lands here depends on the tenant's mode - a supermarket
 * has no floor plan, a restaurant has no returns counter.
 *
 * Duplicates are dropped: in restaurant mode "Ementa" and "Pedidos" resolve to
 * the same route, and two tabs pointing at one screen just waste a slot.
 */
export function posTabs(visibility: NavVisibility): PosTab[] {
  const restaurant = visibility.mode === 'restaurant';

  const candidates: PosTab[] = [
    { key: 'logout', label: 'Terminar Sessao', icon: LogOut, action: 'logout' },
    ...(restaurant
      ? [
          {
            key: 'floor',
            label: 'Plano de Sala',
            icon: LayoutGrid,
            to: '/restaurante/sala',
            permission: 'restaurant:table' as Permission,
            exact: true,
          },
        ]
      : []),
    restaurant
      ? {
          key: 'menu',
          label: 'Ementa',
          icon: ClipboardList,
          to: '/restaurante/pedidos',
          permission: 'restaurant:order',
        }
      : { key: 'register', label: 'Caixa', icon: ShoppingCart, to: '/pos', permission: 'sale:create', exact: true },
    { key: 'sales', label: 'Transaccoes', icon: Receipt, to: '/transaccoes', permission: 'sale:read' },
    restaurant
      ? {
          key: 'orders',
          label: 'Pedidos',
          icon: ChefHat,
          to: '/restaurante/pedidos',
          permission: 'restaurant:order',
        }
      : {
          key: 'returns',
          label: 'Devolucoes',
          icon: Undo2,
          to: '/pos/devolucoes',
          permission: 'sale:refund',
        },
    { key: 'more', label: 'Mais', icon: Ellipsis, action: 'more' },
  ];

  const seen = new Set<string>();
  return candidates.filter((tab) => {
    if (tab.permission && !visibility.can(tab.permission)) return false;
    if (!tab.to) return true;
    if (seen.has(tab.to)) return false;
    seen.add(tab.to);
    return true;
  });
}

/** The destinations the register hides behind "Mais". */
export const POS_MORE_KEYS = ['products', 'inventory', 'customers', 'reports', 'settings', 'kds'] as const;

export function posMoreItems(visibility: NavVisibility): NavItem[] {
  const byKey = new Map(visibleNavItems(visibility).map((item) => [item.key, item]));
  return POS_MORE_KEYS.map((key) => byKey.get(key)).filter((item): item is NavItem => item !== undefined);
}
