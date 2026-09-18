import {
  DEFAULT_EMBEDDED_RULES,
  computeLine,
  computeLineDiscount,
  computeSale,
  type CartLine,
  type DiscountType,
  type EntitySettings,
  type LineDiscount,
  type LineInput,
  type ModifierGroupDto,
  type PricingMode,
  type ProductDto,
  type ProductType,
  type ProductVariantDto,
  type ReturnReason,
  type SaleLineDto,
  type ScanResult,
  type Unit,
} from '@pos/shared';

/* -------------------------------------------------------------------------- */
/* Lookup (GET /api/products/lookup)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Mirror of the register hot-path payload. It is deliberately narrower than
 * ProductDto: the lookup endpoint returns only what a cart line needs, and
 * costPriceMinor is absent entirely for a cashier.
 */
export interface LookupProductDto {
  id: string;
  entityId: string;
  sku: string;
  barcode: string | null;
  namePt: string;
  nameEn: string | null;
  categoryId: string | null;
  type: ProductType;
  unit: Unit;
  salePriceMinor: number;
  costPriceMinor?: number;
  taxRateBps: number;
  trackStock: boolean;
  stockQuantity: number;
  available: boolean;
  active: boolean;
  imageUrl: string | null;
  tileColor: string | null;
  isMenuItem: boolean;
  modifierGroups?: ModifierGroupDto[];
}

export interface LookupResponse {
  found: boolean;
  product?: LookupProductDto;
  variant?: ProductVariantDto;
  /** Weight decoded from a scale barcode, in the product unit. */
  quantity?: number;
  /** Price decoded from a scale barcode, in minor units. */
  priceMinor?: number;
  scan: ScanResult;
}

/**
 * Narrows a full catalogue row (tile grid, offline mirror) to the shape the
 * cart builder expects. costPriceMinor is copied only when the role was allowed
 * to see it in the first place.
 */
export function productToLookup(product: ProductDto): LookupProductDto {
  return {
    id: product.id,
    entityId: product.entityId,
    sku: product.sku,
    barcode: product.barcode,
    namePt: product.namePt,
    nameEn: product.nameEn,
    categoryId: product.categoryId,
    type: product.type,
    unit: product.unit,
    salePriceMinor: product.salePriceMinor,
    ...(product.costPriceMinor === undefined ? {} : { costPriceMinor: product.costPriceMinor }),
    taxRateBps: product.taxRateBps,
    trackStock: product.trackStock,
    stockQuantity: product.stockQuantity,
    available: product.available,
    active: product.active,
    imageUrl: product.imageUrl,
    tileColor: product.tileColor,
    isMenuItem: product.isMenuItem,
  };
}

/* -------------------------------------------------------------------------- */
/* Cart                                                                        */
/* -------------------------------------------------------------------------- */

export interface PosLine {
  /** Client-side id: a line exists long before the sale does. */
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  unit: Unit;
  type: ProductType;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
  discountType: DiscountType | null;
  /** Basis points when percentage, minor units when fixed. */
  discountValue: number | null;
  note: string | null;
  imageUrl: string | null;
  categoryId: string | null;
}

const FRACTIONAL: Unit[] = ['kg', 'g', 'litre', 'ml', 'metre'];

/** Weight, volume and length are entered with three decimals; units are whole. */
export function stepFor(line: { unit: Unit; type: ProductType }): number {
  if (line.type === 'weighted') return 0.001;
  return FRACTIONAL.includes(line.unit) ? 0.001 : 1;
}

export function isFractional(line: { unit: Unit; type: ProductType }): boolean {
  return stepFor(line) < 1;
}

export function lineDiscountOf(line: PosLine): LineDiscount | null {
  if (!line.discountType || !line.discountValue) return null;
  return { type: line.discountType, value: line.discountValue };
}

export function toLineInput(line: PosLine, pricingMode: PricingMode): LineInput {
  return {
    unitPriceMinor: line.unitPriceMinor,
    quantity: line.quantity,
    taxRateBps: line.taxRateBps,
    pricingMode,
    discount: lineDiscountOf(line),
  };
}

/** What the customer pays for one line, discount and tax included. */
export function lineTotalMinor(line: PosLine, pricingMode: PricingMode): number {
  return computeLine(toLineInput(line, pricingMode)).grossMinor;
}

export interface CartTotals {
  subtotalMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxBreakdown: Array<{ rateBps: number; netMinor: number; taxMinor: number }>;
  itemCount: number;
}

const EMPTY_TOTALS: CartTotals = {
  subtotalMinor: 0,
  discountMinor: 0,
  netMinor: 0,
  taxMinor: 0,
  totalMinor: 0,
  taxBreakdown: [],
  itemCount: 0,
};

/**
 * Mirrors the server's pricing engine exactly: line discounts first, then the
 * manual whole-sale discount against what is left, then the promotion on top.
 * Showing one total and charging another is the worst bug this screen can have.
 */
export function cartTotals(
  lines: PosLine[],
  pricingMode: PricingMode,
  manualDiscount: LineDiscount | null,
  promotionDiscountMinor = 0,
): CartTotals {
  if (lines.length === 0) return EMPTY_TOTALS;

  // A weighted line is one item on the counter, whatever it weighs.
  const itemCount = lines.reduce((sum, line) => sum + (isFractional(line) ? 1 : line.quantity), 0);

  const inputs = lines.map((line) => toLineInput(line, pricingMode));
  const base = inputs.map(computeLine);
  const afterLineDiscount = base.reduce((sum, l) => sum + (l.subtotalMinor - l.discountMinor), 0);
  const manualMinor = computeLineDiscount(afterLineDiscount, manualDiscount);

  const totals = computeSale(inputs, {
    type: 'fixed',
    value: manualMinor + Math.max(0, promotionDiscountMinor),
  });

  return {
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountMinor,
    netMinor: totals.netMinor,
    taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor,
    taxBreakdown: totals.taxBreakdown,
    itemCount,
  };
}

/** Strips the register's bookkeeping fields down to the API contract. */
export function toCartLines(lines: PosLine[]): CartLine[] {
  return lines.map((line) => ({
    key: line.key,
    productId: line.productId,
    variantId: line.variantId,
    name: line.name,
    sku: line.sku,
    unit: line.unit,
    type: line.type,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    taxRateBps: line.taxRateBps,
    discountType: line.discountType,
    discountValue: line.discountValue,
    note: line.note,
    imageUrl: line.imageUrl,
  }));
}

/** Rebuilds cart lines from a stored sale, for "recuperar venda suspensa". */
export function fromSaleLines(lines: SaleLineDto[]): PosLine[] {
  return lines
    .filter((line): line is SaleLineDto & { productId: string } => Boolean(line.productId))
    .map((line, index) => ({
      key: `recall_${line.id}_${index}`,
      productId: line.productId,
      variantId: line.variantId,
      name: line.name,
      sku: line.sku ?? '',
      unit: line.unit,
      // The stored line has no product type; the unit is enough to decide
      // whether the quantity may carry decimals.
      type: (FRACTIONAL.includes(line.unit) ? 'weighted' : 'standard') as ProductType,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxRateBps: line.taxRateBps,
      discountType: line.discountMinor > 0 ? ('fixed' as DiscountType) : null,
      discountValue: line.discountMinor > 0 ? line.discountMinor : null,
      note: line.note,
      imageUrl: null,
      categoryId: null,
    }));
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A cashier does not hold `settings:read`, so the register has to run without
 * the settings call ever succeeding. These are the API's own defaults.
 */
export const POS_DEFAULT_SETTINGS: EntitySettings = {
  receiptHeader: '',
  receiptFooter: 'Obrigado pela sua preferencia!',
  receiptShowLogo: true,
  beepSound: 'classic',
  beepVolume: 0.6,
  defaultPaymentMethod: 'cash',
  enabledPaymentMethods: ['cash', 'card', 'multicaixa_express', 'mobile_money', 'bank_transfer'],
  customPaymentLabels: {},
  embeddedBarcodeRules: DEFAULT_EMBEDDED_RULES,
  lowStockAlertsEnabled: true,
  loyaltyEarnPerMinor: 10_000,
  loyaltyPointValueMinor: 500,
  vipThresholds: { bronze: 5_000_000, silver: 25_000_000, gold: 100_000_000 },
  kdsWarnAfterMinutes: 8,
  kdsAlertAfterMinutes: 15,
  tipsEnabled: true,
  tipPresetsBps: [500, 1000, 1500],
  serviceChargeBps: 0,
  autoLogoutMinutes: 0,
  posTheme: 'light',
};

export interface SettingsResponse {
  settings: EntitySettings;
}

/* -------------------------------------------------------------------------- */
/* Cache invalidation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A qk key is [name, params]. Passing the whole key to invalidateQueries only
 * matches a query registered with byte-identical params, so `qk.sales()` would
 * quietly miss `qk.sales({ from, to })`. The name alone reaches every variant.
 */
export function keyFamily(key: readonly unknown[]): unknown[] {
  return key.slice(0, 1);
}

/* -------------------------------------------------------------------------- */
/* Refunds                                                                     */
/* -------------------------------------------------------------------------- */

export type RefundMethod = 'original' | 'store_credit' | 'cash';

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  defective: 'Defeituoso',
  wrong_item: 'Artigo errado',
  changed_mind: 'Mudou de ideias',
  expired: 'Expirado',
  other: 'Outro',
};

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  original: 'Metodo original',
  store_credit: 'Credito de loja',
  cash: 'Numerario',
};

export interface RefundLineDto {
  id: string;
  saleLineId: string;
  productId: string | null;
  name: string | null;
  sku: string | null;
  quantity: number;
  amountMinor: number;
  reason: string;
  restocked: boolean;
}

export interface RefundDto {
  id: string;
  entityId: string;
  saleId: string;
  receiptNumber: string | null;
  reference: string;
  totalMinor: number;
  taxMinor: number;
  cogsMinor?: number;
  method: string;
  note: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
  lines: RefundLineDto[];
}

export interface SendReceiptResponse {
  emailQueued: boolean;
  whatsappUrl: string | null;
  receiptText: string;
  recordedEmail: string | null;
  recordedPhone: string | null;
  sentAt: string | null;
  message: string;
}
