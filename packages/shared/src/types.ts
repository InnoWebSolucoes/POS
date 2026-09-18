import type {
  AdjustmentReason,
  BeepSound,
  CostingMethod,
  DiscountType,
  EntityMode,
  Locale,
  OrderItemStatus,
  OrderStatus,
  PaymentMethod,
  PrepStation,
  PricingMode,
  ProductType,
  Role,
  SaleChannel,
  SaleStatus,
  TableShape,
  TableStatus,
  TicketStatus,
  Unit,
  VipTier,
} from './constants.js';
import type { EmbeddedBarcodeRule } from './barcode.js';
import type { Permission } from './permissions.js';

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Field-level validation problems, keyed by dotted path. */
    details?: Record<string, string[]> | null;
  };
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  entityId: string | null;
  locationId: string | null;
  locale: Locale;
  avatarUrl: string | null;
  permissions: Permission[];
  pinEnabled: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  entitySlug?: string;
}

export interface PinLoginRequest {
  entityId: string;
  pin: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: AuthUser;
  entity: EntityDto | null;
}

export interface JwtPayload {
  sub: string;
  role: Role;
  entityId: string | null;
  locationId: string | null;
  type: 'access' | 'refresh';
}

/* -------------------------------------------------------------------------- */
/* Tenancy                                                                     */
/* -------------------------------------------------------------------------- */

export interface EntityDto {
  id: string;
  name: string;
  slug: string;
  mode: EntityMode;
  nif: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  accentColor: string;
  currency: string;
  locale: Locale;
  pricingMode: PricingMode;
  costingMethod: CostingMethod;
  defaultTaxRateBps: number;
  active: boolean;
  createdAt: string;
  locationCount?: number;
  userCount?: number;
}

export interface LocationDto {
  id: string;
  entityId: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  active: boolean;
}

export interface EntitySettings {
  receiptHeader: string;
  receiptFooter: string;
  receiptShowLogo: boolean;
  beepSound: BeepSound;
  beepVolume: number;
  defaultPaymentMethod: PaymentMethod;
  enabledPaymentMethods: PaymentMethod[];
  customPaymentLabels: Record<string, string>;
  embeddedBarcodeRules: EmbeddedBarcodeRule[];
  lowStockAlertsEnabled: boolean;
  loyaltyEarnPerMinor: number;
  loyaltyPointValueMinor: number;
  vipThresholds: Record<Exclude<VipTier, 'none'>, number>;
  kdsWarnAfterMinutes: number;
  kdsAlertAfterMinutes: number;
  tipsEnabled: boolean;
  tipPresetsBps: number[];
  serviceChargeBps: number;
  autoLogoutMinutes: number;
  posTheme: 'dark' | 'light' | 'system';
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                   */
/* -------------------------------------------------------------------------- */

export interface CategoryDto {
  id: string;
  entityId: string;
  parentId: string | null;
  namePt: string;
  nameEn: string | null;
  color: string | null;
  iconUrl: string | null;
  sortOrder: number;
  active: boolean;
  children?: CategoryDto[];
  productCount?: number;
}

export interface ProductImageDto {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductVariantDto {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  /** e.g. { Tamanho: "M", Cor: "Preto" } */
  options: Record<string, string>;
  salePriceMinor: number | null;
  costPriceMinor: number | null;
  stockQuantity: number;
  active: boolean;
}

export interface ProductDto {
  id: string;
  entityId: string;
  sku: string;
  barcode: string | null;
  namePt: string;
  nameEn: string | null;
  descriptionPt: string | null;
  descriptionEn: string | null;
  categoryId: string | null;
  category?: Pick<CategoryDto, 'id' | 'namePt' | 'nameEn' | 'color'> | null;
  type: ProductType;
  unit: Unit;
  salePriceMinor: number;
  /** Omitted entirely for roles without `product:cost`. */
  costPriceMinor?: number;
  taxRateBps: number;
  supplierId: string | null;
  minStockLevel: number;
  stockQuantity: number;
  trackStock: boolean;
  images: ProductImageDto[];
  imageUrl: string | null;
  tileColor: string | null;
  showInQuickGrid: boolean;
  prepStation: PrepStation | null;
  isMenuItem: boolean;
  available: boolean;
  active: boolean;
  variants?: ProductVariantDto[];
  components?: RecipeComponentDto[];
  modifierGroups?: ModifierGroupDto[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeComponentDto {
  id: string;
  componentProductId: string;
  componentName: string;
  quantity: number;
  unit: Unit;
  wastagePercentBps: number;
}

export interface ModifierDto {
  id: string;
  groupId: string;
  namePt: string;
  nameEn: string | null;
  priceDeltaMinor: number;
  sortOrder: number;
  available: boolean;
  linkedProductId: string | null;
}

export interface ModifierGroupDto {
  id: string;
  entityId: string;
  namePt: string;
  nameEn: string | null;
  type: 'required' | 'optional' | 'removal';
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  modifiers: ModifierDto[];
}

/* -------------------------------------------------------------------------- */
/* Selling                                                                     */
/* -------------------------------------------------------------------------- */

export interface CartModifier {
  modifierId: string;
  name: string;
  priceDeltaMinor: number;
}

export interface CartLine {
  /** Client-side id so a line can be edited before the sale exists. */
  key: string;
  productId: string;
  variantId?: string | null;
  name: string;
  sku: string;
  unit: Unit;
  type: ProductType;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
  discountType?: DiscountType | null;
  discountValue?: number | null;
  modifiers?: CartModifier[];
  note?: string | null;
  /** Restaurant: 0 = straight fire, 1..n = course number. */
  course?: number;
  seat?: number | null;
  imageUrl?: string | null;
}

export interface PaymentInput {
  method: PaymentMethod;
  amountMinor: number;
  /** Cash only - what the customer handed over. */
  tenderedMinor?: number;
  reference?: string | null;
  label?: string | null;
}

export interface CreateSaleRequest {
  channel: SaleChannel;
  locationId?: string | null;
  customerId?: string | null;
  lines: CartLine[];
  payments: PaymentInput[];
  orderDiscountType?: DiscountType | null;
  orderDiscountValue?: number | null;
  promotionCode?: string | null;
  tipMinor?: number;
  note?: string | null;
  /** Set when closing a restaurant table order. */
  orderId?: string | null;
  /** Client-generated id so offline replays are idempotent. */
  idempotencyKey?: string;
  receiptEmail?: string | null;
  receiptPhone?: string | null;
  loyaltyPointsRedeemed?: number;
}

export interface SaleLineDto {
  id: string;
  productId: string | null;
  variantId: string | null;
  name: string;
  sku: string | null;
  unit: Unit;
  quantity: number;
  unitPriceMinor: number;
  unitCostMinor?: number;
  discountMinor: number;
  taxRateBps: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  modifiers: CartModifier[];
  note: string | null;
  refundedQuantity: number;
}

export interface PaymentDto {
  id: string;
  method: PaymentMethod;
  label: string | null;
  amountMinor: number;
  tenderedMinor: number | null;
  changeMinor: number | null;
  reference: string | null;
  status: string;
  createdAt: string;
}

export interface SaleDto {
  id: string;
  entityId: string;
  locationId: string | null;
  receiptNumber: string;
  channel: SaleChannel;
  status: SaleStatus;
  cashierId: string | null;
  cashierName: string | null;
  customerId: string | null;
  customerName: string | null;
  subtotalMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  tipMinor: number;
  totalMinor: number;
  changeMinor: number;
  cogsMinor?: number;
  lines: SaleLineDto[];
  payments: PaymentDto[];
  taxBreakdown: Array<{ rateBps: number; netMinor: number; taxMinor: number }>;
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface HeldSaleDto {
  id: string;
  label: string;
  lineCount: number;
  totalMinor: number;
  cashierName: string | null;
  customerName: string | null;
  createdAt: string;
}

export interface RefundLineInput {
  saleLineId: string;
  quantity: number;
  reason: string;
  restock: boolean;
}

export interface CreateRefundRequest {
  saleId: string;
  lines: RefundLineInput[];
  method: 'original' | 'store_credit' | 'cash';
  note?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Inventory                                                                   */
/* -------------------------------------------------------------------------- */

export interface StockMovementDto {
  id: string;
  productId: string;
  productName: string;
  variantId: string | null;
  type: string;
  quantity: number;
  balanceAfter: number;
  unitCostMinor: number | null;
  reason: AdjustmentReason | null;
  reference: string | null;
  note: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
}

export interface StockReceiptLineInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitCostMinor: number;
  expiryDate?: string | null;
  batchNumber?: string | null;
}

export interface CreateStockReceiptRequest {
  supplierId?: string | null;
  locationId?: string | null;
  invoiceNumber?: string | null;
  purchaseOrderId?: string | null;
  note?: string | null;
  lines: StockReceiptLineInput[];
}

export interface StockAdjustmentRequest {
  productId: string;
  variantId?: string | null;
  locationId?: string | null;
  /** Signed delta: -3 removes three units. */
  quantityDelta: number;
  reason: AdjustmentReason;
  note?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Restaurant                                                                  */
/* -------------------------------------------------------------------------- */

export interface FloorAreaDto {
  id: string;
  entityId: string;
  name: string;
  sortOrder: number;
  backgroundUrl: string | null;
  width: number;
  height: number;
  tables: RestaurantTableDto[];
}

export interface RestaurantTableDto {
  id: string;
  entityId: string;
  areaId: string;
  name: string;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  seats: number;
  status: TableStatus;
  mergedIntoId: string | null;
  activeOrderId: string | null;
  /** Live rollup shown on the floor plan tile. */
  orderTotalMinor?: number;
  openedAt?: string | null;
  serverName?: string | null;
  guestCount?: number | null;
}

export interface OrderItemDto {
  id: string;
  orderId: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
  totalMinor: number;
  status: OrderItemStatus;
  course: number;
  seat: number | null;
  note: string | null;
  prepStation: PrepStation | null;
  modifiers: CartModifier[];
  sentAt: string | null;
  readyAt: string | null;
}

export interface OrderDto {
  id: string;
  entityId: string;
  tableId: string | null;
  tableName: string | null;
  orderNumber: string;
  status: OrderStatus;
  serverId: string | null;
  serverName: string | null;
  guestCount: number;
  items: OrderItemDto[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceChargeMinor: number;
  totalMinor: number;
  sentTotalMinor: number;
  unsentTotalMinor: number;
  note: string | null;
  openedAt: string;
  closedAt: string | null;
}

export interface KitchenTicketDto {
  id: string;
  entityId: string;
  orderId: string;
  orderNumber: string;
  tableName: string | null;
  station: PrepStation | null;
  status: TicketStatus;
  course: number;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    note: string | null;
    modifiers: string[];
    status: OrderItemStatus;
  }>;
  serverName: string | null;
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  /** Seconds since creation, computed server-side on each push. */
  ageSeconds: number;
}

export interface SplitBillRequest {
  orderId: string;
  mode: 'even' | 'by_seat' | 'by_item';
  people?: number;
  /** by_item: list of orderItemIds per resulting bill. */
  groups?: string[][];
}

/* -------------------------------------------------------------------------- */
/* Customers                                                                   */
/* -------------------------------------------------------------------------- */

export interface CustomerDto {
  id: string;
  entityId: string;
  name: string;
  phone: string | null;
  email: string | null;
  nif: string | null;
  address: string | null;
  loyaltyCardNumber: string | null;
  points: number;
  tier: VipTier;
  lifetimeSpendMinor: number;
  storeCreditMinor: number;
  orderCount: number;
  lastPurchaseAt: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

export interface ReportFilters {
  from?: string;
  to?: string;
  entityId?: string;
  locationId?: string;
  userId?: string;
  categoryId?: string;
  productId?: string;
  channel?: SaleChannel;
}

export interface DashboardSummary {
  revenueMinor: number;
  cogsMinor: number;
  grossProfitMinor: number;
  grossMarginBps: number;
  discountMinor: number;
  refundMinor: number;
  taxMinor: number;
  transactionCount: number;
  averageTicketMinor: number;
  itemsSold: number;
  /** Same window, immediately prior - for the trend arrows. */
  previous?: Omit<DashboardSummary, 'previous'>;
}

export interface TimeSeriesPoint {
  bucket: string;
  revenueMinor: number;
  cogsMinor: number;
  profitMinor: number;
  transactions: number;
}

export interface BreakdownRow {
  id: string;
  label: string;
  revenueMinor: number;
  cogsMinor: number;
  profitMinor: number;
  marginBps: number;
  quantity: number;
  share: number;
}

export interface ProfitAndLossReport {
  summary: DashboardSummary;
  series: TimeSeriesPoint[];
  byCategory: BreakdownRow[];
  byProduct: BreakdownRow[];
  byStaff: BreakdownRow[];
  byPaymentMethod: BreakdownRow[];
  hourlyHeatmap: Array<{ dayOfWeek: number; hour: number; revenueMinor: number; transactions: number }>;
  losses: {
    discountsMinor: number;
    refundsMinor: number;
    wasteMinor: number;
  };
}

/* -------------------------------------------------------------------------- */
/* Realtime payloads                                                           */
/* -------------------------------------------------------------------------- */

export interface InventoryUpdatePayload {
  entityId: string;
  productId: string;
  variantId?: string | null;
  stockQuantity: number;
  available: boolean;
}

export interface NotificationPayload {
  id: string;
  level: 'info' | 'warning' | 'error' | 'success';
  titlePt: string;
  titleEn: string;
  bodyPt?: string;
  bodyEn?: string;
  link?: string;
  createdAt: string;
}
