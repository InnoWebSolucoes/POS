import type { BadgeProps } from '@/components/ui';

/**
 * The audit trail as the client sees it.
 *
 * The API stores an action string like "stock.adjust". The family (everything
 * before the dot) drives the badge colour, and the full string drives the
 * Portuguese label. Anything unknown still renders - a new server action must
 * never produce a blank cell.
 */

export interface AuditLogEntry {
  id: string;
  entityId: string | null;
  userId: string | null;
  userName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  /** Parsed JSON, whatever shape the writer chose. */
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditActionOption {
  action: string;
  count: number;
}

export interface AuditFilters {
  page: number;
  pageSize: number;
  search: string;
  action: string;
  userId: string;
  targetType: string;
  targetId: string;
  /** Both ISO yyyy-MM-dd, applied only while `dated` is on. */
  from: string;
  to: string;
  dated: boolean;
}

export const defaultAuditFilters = (): AuditFilters => ({
  page: 1,
  pageSize: 25,
  search: '',
  action: 'all',
  userId: 'all',
  targetType: 'all',
  targetId: '',
  from: '',
  to: '',
  dated: false,
});

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

export const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Sessao iniciada',
  'auth.login_failed': 'Tentativa de sessao falhada',
  'auth.logout': 'Sessao terminada',

  'user.create': 'Utilizador criado',
  'user.update': 'Utilizador actualizado',
  'user.deactivate': 'Utilizador desactivado',

  'entity.create': 'Entidade criada',
  'entity.update': 'Entidade actualizada',
  'entity.delete': 'Entidade removida',

  'location.create': 'Localizacao criada',
  'location.update': 'Localizacao actualizada',
  'location.delete': 'Localizacao removida',

  'product.create': 'Produto criado',
  'product.update': 'Produto actualizado',
  'product.delete': 'Produto removido',
  'product.price_change': 'Preco alterado',

  'stock.receipt': 'Entrada de stock',
  'stock.adjust': 'Ajuste de stock',
  'stock.transfer': 'Transferencia de stock',
  'stock.stocktake_approve': 'Inventario aprovado',

  'sale.create': 'Venda registada',
  'sale.void': 'Venda anulada',
  'sale.refund': 'Devolucao emitida',
  'sale.hold': 'Venda suspensa',
  'sale.discount': 'Desconto aplicado',

  'order.send': 'Pedido enviado para a cozinha',
  'order.close': 'Conta fechada',

  'online_order.update': 'Encomenda online actualizada',

  'settings.update': 'Definicoes alteradas',
  'settings.tax_rates_update': 'Taxas de imposto alteradas',
  'settings.export': 'Dados exportados',
  'settings.import': 'Dados importados',

  'upload.image': 'Imagem carregada',
  'upload.logo': 'Logotipo carregado',
  'upload.delete': 'Ficheiro removido',
};

/** "stock.stocktake_approve" -> "Stock stocktake approve", never a blank cell. */
export function actionLabel(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  const readable = action.replace(/[._]/g, ' ').trim();
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

export function actionFamily(action: string): string {
  const dot = action.indexOf('.');
  return dot === -1 ? action : action.slice(0, dot);
}

export const FAMILY_LABELS: Record<string, string> = {
  auth: 'Autenticacao',
  user: 'Utilizadores',
  entity: 'Entidade',
  location: 'Localizacoes',
  product: 'Catalogo',
  stock: 'Stock',
  sale: 'Vendas',
  order: 'Restaurante',
  online_order: 'Loja online',
  settings: 'Definicoes',
  upload: 'Ficheiros',
};

type BadgeVariant = NonNullable<BadgeProps['variant']>;

const FAMILY_VARIANTS: Record<string, BadgeVariant> = {
  auth: 'outline',
  user: 'secondary',
  entity: 'default',
  location: 'secondary',
  product: 'success',
  stock: 'warning',
  sale: 'default',
  order: 'secondary',
  online_order: 'outline',
  settings: 'muted',
  upload: 'muted',
};

/** Anything that destroys, voids or fails reads as destructive, whatever family. */
const DESTRUCTIVE = new Set([
  'auth.login_failed',
  'user.deactivate',
  'entity.delete',
  'location.delete',
  'product.delete',
  'sale.void',
  'sale.refund',
  'upload.delete',
]);

export function actionVariant(action: string): BadgeVariant {
  if (DESTRUCTIVE.has(action)) return 'destructive';
  return FAMILY_VARIANTS[actionFamily(action)] ?? 'muted';
}

/* -------------------------------------------------------------------------- */
/* Targets                                                                     */
/* -------------------------------------------------------------------------- */

export const TARGET_TYPE_LABELS: Record<string, string> = {
  entity: 'Entidade',
  user: 'Utilizador',
  product: 'Produto',
  category: 'Categoria',
  supplier: 'Fornecedor',
  sale: 'Venda',
  order: 'Pedido',
  location: 'Localizacao',
  settings: 'Definicao',
  customer: 'Cliente',
  promotion: 'Promocao',
  stocktake: 'Inventario',
  purchase_order: 'Encomenda',
  online_order: 'Encomenda online',
  Upload: 'Ficheiro',
};

export function targetLabel(targetType: string | null): string {
  if (!targetType) return '-';
  return TARGET_TYPE_LABELS[targetType] ?? targetType;
}

/** What the target filter offers. Unknown types are still reachable by search. */
export const TARGET_TYPES = Object.keys(TARGET_TYPE_LABELS);

/* -------------------------------------------------------------------------- */
/* Detail keys                                                                 */
/* -------------------------------------------------------------------------- */

export const DETAIL_KEY_LABELS: Record<string, string> = {
  before: 'Antes',
  after: 'Depois',
  changed: 'Campos alterados',
  changes: 'Alteracoes',
  name: 'Nome',
  email: 'Email',
  role: 'Perfil',
  slug: 'Endereco',
  mode: 'Modo',
  active: 'Activo',
  deactivated: 'Desactivado',
  passwordReset: 'Palavra-passe reposta',
  sessionsRevoked: 'Sessoes terminadas',
  pinEnabled: 'PIN activo',
  locationId: 'Localizacao',
  adminId: 'Administrador',
  filename: 'Ficheiro',
  products: 'Produtos',
  url: 'Endereco',
  size: 'Tamanho',
  mimeType: 'Tipo',
  count: 'Quantidade',
  reason: 'Motivo',
  quantity: 'Quantidade',
  totalMinor: 'Total',
  isDefault: 'Por omissao',
};

export function detailKeyLabel(key: string): string {
  const known = DETAIL_KEY_LABELS[key];
  if (known) return known;
  // camelCase -> "Camel case"
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
