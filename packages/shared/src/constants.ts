/**
 * Single source of truth for every "enum-like" value in the system.
 *
 * These are plain string unions rather than Prisma enums so that the exact same
 * schema runs on PostgreSQL (production) and SQLite (local development, where
 * Prisma has no enum support).
 */

export const ENTITY_MODES = ['retail', 'restaurant', 'online'] as const;
export type EntityMode = (typeof ENTITY_MODES)[number];

export const ROLES = [
  'super_admin',
  'entity_admin',
  'manager',
  'cashier',
  'stock_clerk',
  'waiter',
  'kitchen',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, { pt: string; en: string }> = {
  super_admin: { pt: 'Super Administrador', en: 'Super Admin' },
  entity_admin: { pt: 'Administrador', en: 'Entity Admin' },
  manager: { pt: 'Gerente', en: 'Manager' },
  cashier: { pt: 'Operador de Caixa', en: 'Cashier' },
  stock_clerk: { pt: 'Repositor de Stock', en: 'Stock Clerk' },
  waiter: { pt: 'Empregado de Mesa', en: 'Waiter' },
  kitchen: { pt: 'Cozinha', en: 'Kitchen' },
};

export const PRODUCT_TYPES = ['standard', 'weighted', 'composite', 'service'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const UNITS = ['each', 'kg', 'g', 'litre', 'ml', 'metre', 'box', 'pack'] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, { pt: string; en: string; short: string }> = {
  each: { pt: 'Unidade', en: 'Each', short: 'un' },
  kg: { pt: 'Quilograma', en: 'Kilogram', short: 'kg' },
  g: { pt: 'Grama', en: 'Gram', short: 'g' },
  litre: { pt: 'Litro', en: 'Litre', short: 'L' },
  ml: { pt: 'Mililitro', en: 'Millilitre', short: 'ml' },
  metre: { pt: 'Metro', en: 'Metre', short: 'm' },
  box: { pt: 'Caixa', en: 'Box', short: 'cx' },
  pack: { pt: 'Pacote', en: 'Pack', short: 'pct' },
};

/** Units that are sold by weight / measure rather than by discrete count. */
export const FRACTIONAL_UNITS: Unit[] = ['kg', 'g', 'litre', 'ml', 'metre'];

export const BARCODE_FORMATS = [
  'EAN13',
  'EAN8',
  'UPCA',
  'CODE128',
  'CODE39',
  'QR',
  'INTERNAL',
] as const;
export type BarcodeFormat = (typeof BARCODE_FORMATS)[number];

export const PAYMENT_METHODS = [
  'cash',
  'card',
  'multicaixa_express',
  'mobile_money',
  'bank_transfer',
  'store_credit',
  'loyalty_points',
  'custom',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, { pt: string; en: string }> = {
  cash: { pt: 'Numerario', en: 'Cash' },
  card: { pt: 'Cartao', en: 'Card' },
  multicaixa_express: { pt: 'Multicaixa Express', en: 'Multicaixa Express' },
  mobile_money: { pt: 'Dinheiro Movel', en: 'Mobile Money' },
  bank_transfer: { pt: 'Transferencia Bancaria', en: 'Bank Transfer' },
  store_credit: { pt: 'Credito de Loja', en: 'Store Credit' },
  loyalty_points: { pt: 'Pontos de Fidelidade', en: 'Loyalty Points' },
  custom: { pt: 'Outro', en: 'Other' },
};

export const PAYMENT_STATUSES = [
  'pending',
  'confirmed',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SALE_STATUSES = [
  'draft',
  'held',
  'completed',
  'refunded',
  'partially_refunded',
  'voided',
] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SALE_CHANNELS = ['pos', 'restaurant', 'online'] as const;
export type SaleChannel = (typeof SALE_CHANNELS)[number];

export const DISCOUNT_TYPES = ['percentage', 'fixed'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const PROMOTION_TYPES = ['percent_off', 'fixed_off', 'buy_x_get_y'] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export const STOCK_MOVEMENT_TYPES = [
  'receipt',
  'sale',
  'refund',
  'adjustment',
  'transfer_in',
  'transfer_out',
  'stocktake',
  'composite_consumption',
  'waste',
  'initial',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const ADJUSTMENT_REASONS = [
  'damage',
  'theft',
  'expiry',
  'count_error',
  'internal_use',
  'promotion',
  'other',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, { pt: string; en: string }> = {
  damage: { pt: 'Danificado', en: 'Damaged' },
  theft: { pt: 'Roubo / Quebra', en: 'Theft / Shrinkage' },
  expiry: { pt: 'Expirado', en: 'Expired' },
  count_error: { pt: 'Erro de Contagem', en: 'Count Error' },
  internal_use: { pt: 'Consumo Interno', en: 'Internal Use' },
  promotion: { pt: 'Promocao / Amostra', en: 'Promotion / Sample' },
  other: { pt: 'Outro', en: 'Other' },
};

export const RETURN_REASONS = ['defective', 'wrong_item', 'changed_mind', 'expired', 'other'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const PO_STATUSES = ['draft', 'sent', 'partially_received', 'received', 'cancelled'] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

export const STOCKTAKE_STATUSES = ['open', 'counting', 'review', 'approved', 'cancelled'] as const;
export type StockTakeStatus = (typeof STOCKTAKE_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* Restaurant                                                                  */
/* -------------------------------------------------------------------------- */

export const TABLE_STATUSES = ['available', 'occupied', 'attention', 'reserved', 'dirty'] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const TABLE_STATUS_COLORS: Record<TableStatus, string> = {
  available: '#16A34A',
  occupied: '#F59E0B',
  attention: '#DC2626',
  reserved: '#2563EB',
  dirty: '#6B7280',
};

export const TABLE_SHAPES = ['square', 'circle', 'rectangle'] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];

export const ORDER_STATUSES = ['open', 'sent', 'ready', 'served', 'paid', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_ITEM_STATUSES = [
  'unsent',
  'held',
  'sent',
  'in_progress',
  'ready',
  'served',
  'cancelled',
] as const;
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

export const TICKET_STATUSES = ['new', 'in_progress', 'ready', 'served', 'cancelled'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PREP_STATIONS = ['grill', 'fry', 'salad', 'bar', 'dessert', 'pastry', 'expo'] as const;
export type PrepStation = (typeof PREP_STATIONS)[number];

export const PREP_STATION_LABELS: Record<PrepStation, { pt: string; en: string }> = {
  grill: { pt: 'Grelha', en: 'Grill' },
  fry: { pt: 'Fritos', en: 'Fry' },
  salad: { pt: 'Saladas', en: 'Salad' },
  bar: { pt: 'Bar', en: 'Bar' },
  dessert: { pt: 'Sobremesas', en: 'Dessert' },
  pastry: { pt: 'Pastelaria', en: 'Pastry' },
  expo: { pt: 'Passe', en: 'Expo' },
};

export const MODIFIER_GROUP_TYPES = ['required', 'optional', 'removal'] as const;
export type ModifierGroupType = (typeof MODIFIER_GROUP_TYPES)[number];

/** Course 0 is "straight fire" (send to the kitchen immediately). */
export const COURSE_STRAIGHT_FIRE = 0;
export const COURSE_MAX = 6;

/* -------------------------------------------------------------------------- */
/* Online store                                                                */
/* -------------------------------------------------------------------------- */

export const ONLINE_ORDER_STATUSES = [
  'pending',
  'processing',
  'ready_for_pickup',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
] as const;
export type OnlineOrderStatus = (typeof ONLINE_ORDER_STATUSES)[number];

export const FULFILMENT_METHODS = ['delivery', 'pickup'] as const;
export type FulfilmentMethod = (typeof FULFILMENT_METHODS)[number];

export const PAYMENT_GATEWAYS = [
  'multicaixa_express',
  'stripe',
  'paypal',
  'bank_transfer',
  'cash_on_delivery',
] as const;
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

/* -------------------------------------------------------------------------- */
/* Loyalty                                                                     */
/* -------------------------------------------------------------------------- */

export const VIP_TIERS = ['none', 'bronze', 'silver', 'gold'] as const;
export type VipTier = (typeof VIP_TIERS)[number];

export const LOYALTY_TX_TYPES = ['earn', 'redeem', 'adjust', 'expire'] as const;
export type LoyaltyTxType = (typeof LOYALTY_TX_TYPES)[number];

/* -------------------------------------------------------------------------- */
/* Misc                                                                        */
/* -------------------------------------------------------------------------- */

export const LOCALES = ['pt-PT', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Whether the sale price already contains tax (inclusive) or not (exclusive). */
export const PRICING_MODES = ['inclusive', 'exclusive'] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export const BEEP_SOUNDS = ['classic', 'chime', 'silent'] as const;
export type BeepSound = (typeof BEEP_SOUNDS)[number];

export const COSTING_METHODS = ['weighted_average', 'fifo'] as const;
export type CostingMethod = (typeof COSTING_METHODS)[number];

/** Socket.io event names shared by server and client. */
export const SOCKET_EVENTS = {
  INVENTORY_UPDATED: 'inventory:updated',
  LOW_STOCK: 'inventory:low_stock',
  SALE_COMPLETED: 'sale:completed',
  ORDER_UPDATED: 'order:updated',
  TICKET_CREATED: 'kds:ticket_created',
  TICKET_UPDATED: 'kds:ticket_updated',
  TICKET_READY: 'kds:ticket_ready',
  TABLE_UPDATED: 'table:updated',
  ONLINE_ORDER_CREATED: 'online:order_created',
  ONLINE_ORDER_UPDATED: 'online:order_updated',
  NOTIFICATION: 'notification',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
