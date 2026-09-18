import crypto from 'node:crypto';
import {
  FRACTIONAL_UNITS,
  allocate,
  applyBps,
  computeLine,
  computeLineDiscount,
  computeSale,
  formatMoney,
  type CartModifier,
  type CostingMethod,
  type EntitySettings,
  type LineDiscount,
  type LineInput,
  type PricingMode,
  type Unit,
  type VipTier,
} from '@pos/shared';
import { ApiError } from '../../lib/http.js';
import { TX_OPTIONS, prisma, type Tx } from '../../lib/prisma.js';
import {
  applyStockChange,
  consumeForSale,
  defaultLocationId,
  round3,
  type StockChangeResult,
} from '../../lib/inventory.js';
import { nextDocumentNumber } from '../../lib/sequence.js';
import { getSettings } from '../../lib/settings.js';
import { saleInclude } from './mappers.js';
import type {
  CartLineInput,
  CreateRefundInput,
  CreateSaleInput,
  HoldSaleInput,
  PaymentInputBody,
} from './schemas.js';

/* -------------------------------------------------------------------------- */
/* Context                                                                     */
/* -------------------------------------------------------------------------- */

export interface ActorContext {
  entityId: string;
  userId: string;
  userName: string;
  locationId: string | null;
  /** Whether the caller holds `sale:discount`. */
  canDiscount: boolean;
}

const QTY_EPSILON = 1e-6;

/* -------------------------------------------------------------------------- */
/* Pricing engine                                                              */
/* -------------------------------------------------------------------------- */

export interface PricedLine {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  unit: string;
  productType: string;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  modifiers: CartModifier[];
  note: string | null;
  sortOrder: number;
  categoryId: string | null;
}

export interface PricedEntity {
  id: string;
  name: string;
  nif: string | null;
  address: string | null;
  phone: string | null;
  currency: string;
  locale: string;
  pricingMode: PricingMode;
  costingMethod: CostingMethod;
  defaultTaxRateBps: number;
}

export interface ResolvedPromotion {
  id: string;
  code: string;
  namePt: string;
  discountMinor: number;
}

export interface PricedSale {
  entity: PricedEntity;
  lines: PricedLine[];
  subtotalMinor: number;
  lineDiscountMinor: number;
  manualOrderDiscountMinor: number;
  promotionDiscountMinor: number;
  orderDiscountMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxBreakdown: Array<{ rateBps: number; netMinor: number; taxMinor: number }>;
  promotion: ResolvedPromotion | null;
}

export interface PriceCartInput {
  lines: CartLineInput[];
  orderDiscountType?: string | null;
  orderDiscountValue?: number | null;
  promotionCode?: string | null;
}

function money(value: number, entity: { currency: string; locale: string }): string {
  return formatMoney(value, { currency: entity.currency, locale: entity.locale });
}

async function loadEntity(tx: Tx, entityId: string): Promise<PricedEntity> {
  const entity = await tx.entity.findFirst({
    where: { id: entityId, deletedAt: null },
    select: {
      id: true,
      name: true,
      nif: true,
      address: true,
      phone: true,
      currency: true,
      locale: true,
      pricingMode: true,
      costingMethod: true,
      defaultTaxRateBps: true,
    },
  });
  if (!entity) throw ApiError.notFound('Entidade nao encontrada.');
  return {
    ...entity,
    pricingMode: (entity.pricingMode === 'exclusive' ? 'exclusive' : 'inclusive') as PricingMode,
    costingMethod: (entity.costingMethod === 'fifo' ? 'fifo' : 'weighted_average') as CostingMethod,
  };
}

/**
 * Re-prices a cart from the database.
 *
 * The client's unit price is ignored for everything except a `weighted`
 * product, where the figure comes off the scale (or out of an embedded-value
 * barcode) and cannot be known from the catalogue alone.
 */
export async function priceCart(
  tx: Tx,
  entityId: string,
  input: PriceCartInput,
  options: { canDiscount: boolean },
): Promise<PricedSale> {
  const entity = await loadEntity(tx, entityId);

  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, entityId, deletedAt: null },
    select: {
      id: true,
      namePt: true,
      sku: true,
      unit: true,
      type: true,
      salePriceMinor: true,
      taxRateBps: true,
      active: true,
      categoryId: true,
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const variantIds = [
    ...new Set(input.lines.map((l) => l.variantId).filter((v): v is string => Boolean(v))),
  ];
  const variants = variantIds.length
    ? await tx.productVariant.findMany({
        where: { id: { in: variantIds }, entityId, deletedAt: null },
        select: { id: true, productId: true, sku: true, salePriceMinor: true, active: true },
      })
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const modifierIds = [
    ...new Set(input.lines.flatMap((l) => (l.modifiers ?? []).map((m) => m.modifierId))),
  ];
  const modifiers = modifierIds.length
    ? await tx.modifier.findMany({
        where: { id: { in: modifierIds }, group: { entityId } },
        select: { id: true, namePt: true, priceDeltaMinor: true, available: true },
      })
    : [];
  const modifierById = new Map(modifiers.map((m) => [m.id, m]));

  const priced: Array<Omit<PricedLine, 'discountMinor' | 'netMinor' | 'taxMinor' | 'totalMinor'>> = [];
  const lineInputs: LineInput[] = [];

  input.lines.forEach((line, index) => {
    const product = productById.get(line.productId);
    if (!product) throw ApiError.notFound(`Produto nao encontrado: ${line.productId}`);
    if (!product.active) throw ApiError.unprocessable(`Produto inactivo: ${product.namePt}`);

    let variant = null as (typeof variants)[number] | null;
    if (line.variantId) {
      variant = variantById.get(line.variantId) ?? null;
      if (!variant || variant.productId !== product.id) {
        throw ApiError.notFound(`Variante nao encontrada: ${line.variantId}`);
      }
      if (!variant.active) throw ApiError.unprocessable(`Variante inactiva: ${variant.sku}`);
    }

    const fractionalAllowed =
      product.type === 'weighted' || FRACTIONAL_UNITS.includes(product.unit as Unit);
    const quantity = round3(line.quantity);
    if (quantity <= 0) {
      throw ApiError.unprocessable(`Quantidade invalida para "${product.namePt}".`);
    }
    if (!fractionalAllowed && Math.abs(quantity - Math.round(quantity)) > QTY_EPSILON) {
      throw ApiError.unprocessable(
        `Quantidade fraccionada nao permitida para "${product.namePt}".`,
      );
    }

    // Catalogue price is the authority; only a weighted item may be priced by
    // the scale / embedded barcode that the client scanned.
    const cataloguePrice = Number(variant?.salePriceMinor ?? product.salePriceMinor);
    let unitPriceMinor = cataloguePrice;
    if (product.type === 'weighted' && line.unitPriceMinor != null && line.unitPriceMinor > 0) {
      unitPriceMinor = Math.round(line.unitPriceMinor);
    }

    const chosenModifiers: CartModifier[] = [];
    for (const requested of line.modifiers ?? []) {
      const modifier = modifierById.get(requested.modifierId);
      if (!modifier) {
        throw ApiError.unprocessable(`Opcao nao encontrada: ${requested.modifierId}`);
      }
      if (!modifier.available) {
        throw ApiError.unprocessable(`Opcao indisponivel: ${modifier.namePt}`);
      }
      const delta = Number(modifier.priceDeltaMinor);
      unitPriceMinor += delta;
      chosenModifiers.push({
        modifierId: modifier.id,
        name: modifier.namePt,
        priceDeltaMinor: delta,
      });
    }
    if (unitPriceMinor < 0) unitPriceMinor = 0;

    const discount = normaliseDiscount(line.discountType, line.discountValue);
    if (discount && !options.canDiscount) {
      throw ApiError.forbidden('Permissao em falta: sale:discount.');
    }

    const taxRateBps = product.taxRateBps ?? entity.defaultTaxRateBps;

    priced.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.namePt,
      sku: variant?.sku ?? product.sku,
      unit: product.unit,
      productType: product.type,
      quantity,
      unitPriceMinor,
      taxRateBps,
      modifiers: chosenModifiers,
      note: line.note ?? null,
      sortOrder: index,
      categoryId: product.categoryId,
    });

    lineInputs.push({
      unitPriceMinor,
      quantity,
      taxRateBps,
      pricingMode: entity.pricingMode,
      discount,
    });
  });

  const manualDiscount = normaliseDiscount(input.orderDiscountType, input.orderDiscountValue);
  if (manualDiscount && !options.canDiscount) {
    throw ApiError.forbidden('Permissao em falta: sale:discount.');
  }

  const base = lineInputs.map(computeLine);
  const afterLineDiscount = base.reduce((sum, l) => sum + (l.subtotalMinor - l.discountMinor), 0);
  const manualOrderDiscountMinor = computeLineDiscount(afterLineDiscount, manualDiscount);

  let promotion: ResolvedPromotion | null = null;
  if (input.promotionCode && input.promotionCode.trim()) {
    promotion = await resolvePromotion(tx, entityId, input.promotionCode.trim(), {
      entity,
      lines: priced.map((line, i) => ({
        productId: line.productId,
        categoryId: line.categoryId,
        quantity: line.quantity,
        amountMinor: base[i]!.subtotalMinor - base[i]!.discountMinor,
      })),
      baseMinor: afterLineDiscount - manualOrderDiscountMinor,
    });
  }

  const totalOrderDiscount: LineDiscount = {
    type: 'fixed',
    value: manualOrderDiscountMinor + (promotion?.discountMinor ?? 0),
  };

  const totals = computeSale(lineInputs, totalOrderDiscount);

  // Mirror computeSale's internal allocation so every stored line adds back up
  // to the stored total - no lost or invented centimos on the receipt.
  const orderDiscountMinor = computeLineDiscount(afterLineDiscount, totalOrderDiscount);
  const weights = base.map((l) => l.subtotalMinor - l.discountMinor);
  const spread = allocate(orderDiscountMinor, weights);
  const finalLines = lineInputs.map((source, i) =>
    computeLine({
      ...source,
      discount: { type: 'fixed', value: base[i]!.discountMinor + (spread[i] ?? 0) },
    }),
  );

  const lines: PricedLine[] = priced.map((line, i) => ({
    ...line,
    discountMinor: finalLines[i]!.discountMinor,
    netMinor: finalLines[i]!.netMinor,
    taxMinor: finalLines[i]!.taxMinor,
    totalMinor: finalLines[i]!.grossMinor,
  }));

  return {
    entity,
    lines,
    subtotalMinor: totals.subtotalMinor,
    lineDiscountMinor: totals.lineDiscountMinor,
    manualOrderDiscountMinor,
    promotionDiscountMinor: Math.max(0, orderDiscountMinor - manualOrderDiscountMinor),
    orderDiscountMinor,
    discountMinor: totals.discountMinor,
    netMinor: totals.netMinor,
    taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor,
    taxBreakdown: totals.taxBreakdown,
    promotion: promotion
      ? { ...promotion, discountMinor: Math.max(0, orderDiscountMinor - manualOrderDiscountMinor) }
      : null,
  };
}

function normaliseDiscount(
  type: string | null | undefined,
  value: number | null | undefined,
): LineDiscount | null {
  if (!type || !value || value <= 0) return null;
  if (type !== 'percentage' && type !== 'fixed') return null;
  return { type, value };
}

/* -------------------------------------------------------------------------- */
/* Promotions                                                                  */
/* -------------------------------------------------------------------------- */

interface PromotionContext {
  entity: PricedEntity;
  lines: Array<{
    productId: string;
    categoryId: string | null;
    quantity: number;
    amountMinor: number;
  }>;
  baseMinor: number;
}

/**
 * Looks a promotion code up and works out what it is worth for this basket.
 * The Promotion rows themselves belong to the promotions module; sales only
 * reads them and bumps `usageCount` when the sale actually completes.
 */
export async function resolvePromotion(
  tx: Tx,
  entityId: string,
  code: string,
  ctx: PromotionContext,
): Promise<ResolvedPromotion> {
  // SQLite has no case-insensitive filter, so try the code as typed and then
  // the two spellings a cashier is most likely to produce.
  const candidates = [...new Set([code, code.toUpperCase(), code.toLowerCase()])];
  const promotion = await tx.promotion.findFirst({
    where: { entityId, code: { in: candidates } },
  });

  if (!promotion) throw ApiError.unprocessable(`Codigo promocional invalido: ${code}`);
  if (!promotion.active) throw ApiError.unprocessable('Promocao inactiva.');

  const now = new Date();
  if (promotion.startsAt && promotion.startsAt.getTime() > now.getTime()) {
    throw ApiError.unprocessable('Promocao ainda nao esta a decorrer.');
  }
  if (promotion.endsAt && promotion.endsAt.getTime() < now.getTime()) {
    throw ApiError.unprocessable('Promocao expirada.');
  }
  if (promotion.usageLimit != null && promotion.usageCount >= promotion.usageLimit) {
    throw ApiError.unprocessable('Promocao esgotada.');
  }

  const minSpend = Number(promotion.minSpendMinor);
  if (minSpend > 0 && ctx.baseMinor < minSpend) {
    throw ApiError.unprocessable(
      `Compra minima de ${money(minSpend, ctx.entity)} nao atingida para esta promocao.`,
    );
  }

  let scopedProductIds: string[] = [];
  try {
    const parsed = JSON.parse(promotion.productIds || '[]') as unknown;
    if (Array.isArray(parsed)) scopedProductIds = parsed.map(String);
  } catch {
    scopedProductIds = [];
  }

  const scoped = ctx.lines.filter(
    (line) =>
      (scopedProductIds.length === 0 || scopedProductIds.includes(line.productId)) &&
      (!promotion.categoryId || line.categoryId === promotion.categoryId),
  );
  if (scoped.length === 0) {
    throw ApiError.unprocessable('A promocao nao se aplica a nenhum artigo deste carrinho.');
  }

  const scopedBase = scoped.reduce((sum, line) => sum + line.amountMinor, 0);
  let discountMinor = 0;

  switch (promotion.type) {
    case 'percent_off':
      discountMinor = applyBps(scopedBase, promotion.value);
      break;
    case 'fixed_off':
      discountMinor = Math.min(promotion.value, scopedBase);
      break;
    case 'buy_x_get_y': {
      const buy = Math.max(1, promotion.buyQuantity ?? 1);
      const get = Math.max(1, promotion.getQuantity ?? 1);
      for (const line of scoped) {
        if (line.quantity <= 0) continue;
        const groups = Math.floor(line.quantity / (buy + get));
        if (groups <= 0) continue;
        const free = groups * get;
        const unit = line.amountMinor / line.quantity;
        discountMinor += Math.min(line.amountMinor, Math.round(unit * free));
      }
      break;
    }
    default:
      throw ApiError.unprocessable(`Tipo de promocao nao suportado: ${promotion.type}`);
  }

  discountMinor = Math.max(0, Math.min(discountMinor, scopedBase));
  if (discountMinor <= 0) {
    throw ApiError.unprocessable('A promocao nao produz desconto neste carrinho.');
  }

  return {
    id: promotion.id,
    code: promotion.code,
    namePt: promotion.namePt,
    discountMinor,
  };
}

/* -------------------------------------------------------------------------- */
/* Payment validation                                                          */
/* -------------------------------------------------------------------------- */

export interface ValidatedPayment {
  method: string;
  label: string | null;
  amountMinor: number;
  tenderedMinor: number | null;
  changeMinor: number | null;
  reference: string | null;
}

export interface ValidatedPayments {
  payments: ValidatedPayment[];
  changeMinor: number;
  storeCreditUsedMinor: number;
  loyaltyPointsUsed: number;
}

export interface PaymentCustomer {
  id: string;
  points: number;
  storeCreditMinor: bigint;
}

export function validatePayments(params: {
  dueMinor: number;
  payments: PaymentInputBody[];
  settings: EntitySettings;
  entity: { currency: string; locale: string };
  customer: PaymentCustomer | null;
  loyaltyPointsRedeemed: number;
}): ValidatedPayments {
  const { dueMinor, payments, settings, entity, customer } = params;

  const paidMinor = payments.reduce((sum, p) => sum + Math.round(p.amountMinor), 0);
  if (paidMinor !== dueMinor) {
    throw ApiError.unprocessable(
      `Pagamentos de ${money(paidMinor, entity)} nao correspondem ao total a pagar de ${money(dueMinor, entity)}.`,
    );
  }

  const storeCreditUsedMinor = payments
    .filter((p) => p.method === 'store_credit')
    .reduce((sum, p) => sum + Math.round(p.amountMinor), 0);

  if (storeCreditUsedMinor > 0) {
    if (!customer) {
      throw ApiError.unprocessable('O pagamento com credito de loja exige um cliente associado.');
    }
    const available = Number(customer.storeCreditMinor);
    if (available < storeCreditUsedMinor) {
      throw ApiError.unprocessable(
        `Credito de loja insuficiente: disponivel ${money(available, entity)}, pedido ${money(storeCreditUsedMinor, entity)}.`,
      );
    }
  }

  const loyaltyMinor = payments
    .filter((p) => p.method === 'loyalty_points')
    .reduce((sum, p) => sum + Math.round(p.amountMinor), 0);

  let loyaltyPointsUsed = 0;
  if (loyaltyMinor > 0) {
    if (!customer) {
      throw ApiError.unprocessable('O resgate de pontos exige um cliente associado.');
    }
    const pointValue = Math.max(1, Math.round(settings.loyaltyPointValueMinor || 1));
    loyaltyPointsUsed = Math.max(
      Math.ceil(loyaltyMinor / pointValue),
      Math.max(0, Math.round(params.loyaltyPointsRedeemed)),
    );
    if (customer.points < loyaltyPointsUsed) {
      throw ApiError.unprocessable(
        `Pontos insuficientes: disponiveis ${customer.points}, necessarios ${loyaltyPointsUsed}.`,
      );
    }
  } else if (params.loyaltyPointsRedeemed > 0) {
    throw ApiError.unprocessable(
      'Indique um pagamento do tipo "loyalty_points" para resgatar pontos.',
    );
  }

  let changeMinor = 0;
  const validated = payments.map((payment) => {
    const amountMinor = Math.round(payment.amountMinor);
    if (payment.method === 'cash') {
      const tendered = Math.max(
        amountMinor,
        payment.tenderedMinor != null ? Math.round(payment.tenderedMinor) : amountMinor,
      );
      const change = tendered - amountMinor;
      changeMinor += change;
      return {
        method: payment.method,
        label: payment.label ?? null,
        amountMinor,
        tenderedMinor: tendered,
        changeMinor: change,
        reference: payment.reference ?? null,
      };
    }
    return {
      method: payment.method,
      label: payment.label ?? null,
      amountMinor,
      tenderedMinor: null,
      changeMinor: null,
      reference: payment.reference ?? null,
    };
  });

  return { payments: validated, changeMinor, storeCreditUsedMinor, loyaltyPointsUsed };
}

/* -------------------------------------------------------------------------- */
/* Loyalty                                                                     */
/* -------------------------------------------------------------------------- */

export function tierFor(
  lifetimeSpendMinor: number,
  thresholds: EntitySettings['vipThresholds'] | undefined,
): VipTier {
  const gold = Number(thresholds?.gold ?? Number.POSITIVE_INFINITY);
  const silver = Number(thresholds?.silver ?? Number.POSITIVE_INFINITY);
  const bronze = Number(thresholds?.bronze ?? Number.POSITIVE_INFINITY);
  if (lifetimeSpendMinor >= gold) return 'gold';
  if (lifetimeSpendMinor >= silver) return 'silver';
  if (lifetimeSpendMinor >= bronze) return 'bronze';
  return 'none';
}

/* -------------------------------------------------------------------------- */
/* Stock restoration (refunds and voids)                                       */
/* -------------------------------------------------------------------------- */

async function restoreStock(
  tx: Tx,
  entityId: string,
  input: {
    productId: string | null;
    variantId: string | null;
    quantity: number;
    locationId: string | null;
    unitCostMinor: number;
    reference: string;
    note: string;
    userId: string | null;
    userName: string | null;
  },
): Promise<StockChangeResult[]> {
  if (!input.productId || input.quantity <= 0) return [];

  const product = await tx.product.findFirst({
    where: { id: input.productId, entityId },
    select: { id: true, type: true, trackStock: true, namePt: true },
  });
  if (!product) return [];

  const changes: StockChangeResult[] = [];

  if (product.type === 'composite') {
    const components = await tx.recipeComponent.findMany({
      where: { parentProductId: product.id },
    });
    for (const component of components) {
      const wastageFactor = 1 + component.wastagePercentBps / 10_000;
      const quantity = round3(component.quantity * input.quantity * wastageFactor);
      if (quantity <= 0) continue;
      changes.push(
        await applyStockChange(tx, {
          entityId,
          productId: component.componentProductId,
          locationId: input.locationId,
          quantity,
          type: 'refund',
          reference: input.reference,
          note: `${input.note} (${product.namePt})`,
          userId: input.userId,
          userName: input.userName,
        }),
      );
    }
    return changes;
  }

  if (product.type === 'service' || !product.trackStock) return changes;

  changes.push(
    await applyStockChange(tx, {
      entityId,
      productId: product.id,
      variantId: input.variantId,
      locationId: input.locationId,
      quantity: input.quantity,
      type: 'refund',
      unitCostMinor: input.unitCostMinor > 0 ? input.unitCostMinor : null,
      reference: input.reference,
      note: input.note,
      userId: input.userId,
      userName: input.userName,
    }),
  );
  return changes;
}

/* -------------------------------------------------------------------------- */
/* Checkout                                                                    */
/* -------------------------------------------------------------------------- */

export interface CheckoutResult {
  saleId: string;
  created: boolean;
  stockChanges: StockChangeResult[];
  receiptNumber: string;
  totalMinor: number;
  orderId: string | null;
  tableId: string | null;
}

export async function checkout(
  ctx: ActorContext,
  input: CreateSaleInput,
): Promise<CheckoutResult> {
  const { entityId } = ctx;

  // Fast path: an offline replay never needs to enter the transaction.
  if (input.idempotencyKey) {
    const existing = await prisma.sale.findFirst({
      where: { entityId, idempotencyKey: input.idempotencyKey },
      select: { id: true, receiptNumber: true, totalMinor: true, orderId: true },
    });
    if (existing) {
      return {
        saleId: existing.id,
        created: false,
        stockChanges: [],
        receiptNumber: existing.receiptNumber,
        totalMinor: Number(existing.totalMinor),
        orderId: existing.orderId,
        tableId: null,
      };
    }
  }

  const settings = await getSettings(entityId);

  return prisma.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.sale.findFirst({
        where: { entityId, idempotencyKey: input.idempotencyKey },
        select: { id: true, receiptNumber: true, totalMinor: true, orderId: true },
      });
      if (existing) {
        return {
          saleId: existing.id,
          created: false,
          stockChanges: [],
          receiptNumber: existing.receiptNumber,
          totalMinor: Number(existing.totalMinor),
          orderId: existing.orderId,
          tableId: null,
        };
      }
    }

    const priced = await priceCart(tx, entityId, input, { canDiscount: ctx.canDiscount });
    const entity = priced.entity;

    if (input.locationId) {
      const location = await tx.location.findFirst({
        where: { id: input.locationId, entityId },
        select: { id: true },
      });
      if (!location) throw ApiError.notFound('Localizacao nao encontrada.');
    }
    const locationId =
      input.locationId ?? ctx.locationId ?? (await defaultLocationId(entityId, tx));

    let customer: {
      id: string;
      points: number;
      storeCreditMinor: bigint;
      lifetimeSpendMinor: bigint;
    } | null = null;
    if (input.customerId) {
      customer = await tx.customer.findFirst({
        where: { id: input.customerId, entityId, deletedAt: null },
        select: { id: true, points: true, storeCreditMinor: true, lifetimeSpendMinor: true },
      });
      if (!customer) throw ApiError.notFound('Cliente nao encontrado.');
    }

    let order: { id: string; status: string; tableId: string | null } | null = null;
    if (input.orderId) {
      order = await tx.order.findFirst({
        where: { id: input.orderId, entityId },
        select: { id: true, status: true, tableId: true },
      });
      if (!order) throw ApiError.notFound('Pedido nao encontrado.');
      if (order.status === 'paid') throw ApiError.conflict('Este pedido ja foi pago.');
      if (order.status === 'cancelled') throw ApiError.conflict('Este pedido foi cancelado.');
      const duplicate = await tx.sale.findFirst({
        where: { orderId: order.id },
        select: { id: true },
      });
      if (duplicate) throw ApiError.conflict('Este pedido ja tem uma venda associada.');
    }

    const tipMinor = Math.round(input.tipMinor ?? 0);
    const dueMinor = priced.totalMinor + tipMinor;
    const settled = validatePayments({
      dueMinor,
      payments: input.payments,
      settings,
      entity,
      customer,
      loyaltyPointsRedeemed: input.loyaltyPointsRedeemed ?? 0,
    });

    const receiptNumber = await nextDocumentNumber(entityId, 'receipt', { client: tx });

    const consumption = await consumeForSale(
      tx,
      entityId,
      priced.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        locationId,
      })),
      {
        reference: receiptNumber,
        userId: ctx.userId,
        userName: ctx.userName,
        costingMethod: entity.costingMethod,
        // A shop floor is the source of truth for a walk-in sale, but an online
        // order must never promise stock that is not there.
        preventNegative: input.channel === 'online',
      },
    );

    const now = new Date();
    const sale = await tx.sale.create({
      data: {
        entityId,
        locationId,
        receiptNumber,
        channel: input.channel,
        status: 'completed',
        cashierId: ctx.userId,
        cashierName: ctx.userName,
        customerId: customer?.id ?? null,
        orderId: order?.id ?? null,
        subtotalMinor: BigInt(Math.round(priced.subtotalMinor)),
        discountMinor: BigInt(Math.round(priced.discountMinor)),
        netMinor: BigInt(Math.round(priced.netMinor)),
        taxMinor: BigInt(Math.round(priced.taxMinor)),
        tipMinor: BigInt(tipMinor),
        totalMinor: BigInt(Math.round(priced.totalMinor)),
        changeMinor: BigInt(Math.round(settled.changeMinor)),
        cogsMinor: BigInt(Math.round(consumption.cogsMinor)),
        taxBreakdown: JSON.stringify(priced.taxBreakdown),
        orderDiscountType: input.orderDiscountType ?? null,
        orderDiscountValue: input.orderDiscountValue ?? null,
        promotionCode: priced.promotion?.code ?? null,
        receiptEmail: input.receiptEmail || null,
        receiptPhone: input.receiptPhone || null,
        note: input.note ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        completedAt: now,
        lines: {
          create: priced.lines.map((line, index) => ({
            productId: line.productId,
            variantId: line.variantId,
            name: line.name,
            sku: line.sku,
            unit: line.unit,
            quantity: line.quantity,
            unitPriceMinor: BigInt(Math.round(line.unitPriceMinor)),
            unitCostMinor: BigInt(Math.round(consumption.unitCosts[index] ?? 0)),
            discountMinor: BigInt(Math.round(line.discountMinor)),
            taxRateBps: line.taxRateBps,
            netMinor: BigInt(Math.round(line.netMinor)),
            taxMinor: BigInt(Math.round(line.taxMinor)),
            totalMinor: BigInt(Math.round(line.totalMinor)),
            modifiers: JSON.stringify(line.modifiers),
            note: line.note,
            sortOrder: index,
          })),
        },
        payments: {
          create: settled.payments.map((payment) => ({
            method: payment.method,
            label: payment.label,
            amountMinor: BigInt(payment.amountMinor),
            tenderedMinor: payment.tenderedMinor == null ? null : BigInt(payment.tenderedMinor),
            changeMinor: payment.changeMinor == null ? null : BigInt(payment.changeMinor),
            reference: payment.reference,
            status: 'confirmed',
          })),
        },
      },
      select: { id: true },
    });

    if (priced.promotion) {
      await tx.promotion.update({
        where: { id: priced.promotion.id },
        data: { usageCount: { increment: 1 } },
      });
    }

    if (customer) {
      const earnPer = Math.max(1, Math.round(settings.loyaltyEarnPerMinor || 1));
      const earned = Math.floor(priced.totalMinor / earnPer);
      let balance = customer.points;

      if (settled.loyaltyPointsUsed > 0) {
        balance -= settled.loyaltyPointsUsed;
        await tx.loyaltyTransaction.create({
          data: {
            customerId: customer.id,
            type: 'redeem',
            points: -settled.loyaltyPointsUsed,
            balanceAfter: balance,
            saleId: sale.id,
            note: `Resgate na venda ${receiptNumber}`,
          },
        });
      }
      if (earned > 0) {
        balance += earned;
        await tx.loyaltyTransaction.create({
          data: {
            customerId: customer.id,
            type: 'earn',
            points: earned,
            balanceAfter: balance,
            saleId: sale.id,
            note: `Venda ${receiptNumber}`,
          },
        });
      }

      const lifetime = Number(customer.lifetimeSpendMinor) + priced.totalMinor;
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          points: balance,
          lifetimeSpendMinor: BigInt(Math.round(lifetime)),
          storeCreditMinor: BigInt(
            Math.round(Number(customer.storeCreditMinor) - settled.storeCreditUsedMinor),
          ),
          orderCount: { increment: 1 },
          lastPurchaseAt: now,
          tier: tierFor(lifetime, settings.vipThresholds),
        },
      });
    }

    if (order) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'paid', closedAt: now, tipMinor: BigInt(tipMinor) },
      });
      if (order.tableId) {
        await tx.restaurantTable.updateMany({
          where: { id: order.tableId, entityId },
          data: { status: 'available', activeOrderId: null },
        });
      }
    }

    // Recalling a parked sale: the held row is discarded in the same commit so
    // it can never be recalled twice.
    if (input.heldSaleId) {
      const held = await tx.sale.findFirst({
        where: { id: input.heldSaleId, entityId, status: 'held' },
        select: { id: true },
      });
      if (held) await tx.sale.delete({ where: { id: held.id } });
    }

    return {
      saleId: sale.id,
      created: true,
      stockChanges: consumption.changes,
      receiptNumber,
      totalMinor: priced.totalMinor,
      orderId: order?.id ?? null,
      tableId: order?.tableId ?? null,
    };
  }, TX_OPTIONS);
}

/* -------------------------------------------------------------------------- */
/* Held sales                                                                  */
/* -------------------------------------------------------------------------- */

export async function holdSale(ctx: ActorContext, input: HoldSaleInput): Promise<string> {
  const { entityId } = ctx;

  return prisma.$transaction(async (tx) => {
    const priced = await priceCart(tx, entityId, input, { canDiscount: ctx.canDiscount });

    if (input.customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, entityId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) throw ApiError.notFound('Cliente nao encontrado.');
    }
    if (input.locationId) {
      const location = await tx.location.findFirst({
        where: { id: input.locationId, entityId },
        select: { id: true },
      });
      if (!location) throw ApiError.notFound('Localizacao nao encontrada.');
    }

    // A parked sale has no fiscal number, but receiptNumber is unique per
    // entity, so it carries a throwaway placeholder that never reaches the UI.
    const placeholder = `HELD-${crypto.randomUUID()}`;

    const sale = await tx.sale.create({
      data: {
        entityId,
        locationId: input.locationId ?? ctx.locationId ?? null,
        receiptNumber: placeholder,
        channel: input.channel,
        status: 'held',
        holdLabel: input.holdLabel,
        cashierId: ctx.userId,
        cashierName: ctx.userName,
        customerId: input.customerId ?? null,
        subtotalMinor: BigInt(Math.round(priced.subtotalMinor)),
        discountMinor: BigInt(Math.round(priced.discountMinor)),
        netMinor: BigInt(Math.round(priced.netMinor)),
        taxMinor: BigInt(Math.round(priced.taxMinor)),
        totalMinor: BigInt(Math.round(priced.totalMinor)),
        taxBreakdown: JSON.stringify(priced.taxBreakdown),
        orderDiscountType: input.orderDiscountType ?? null,
        orderDiscountValue: input.orderDiscountValue ?? null,
        promotionCode: priced.promotion?.code ?? null,
        note: input.note ?? null,
        lines: {
          create: priced.lines.map((line, index) => ({
            productId: line.productId,
            variantId: line.variantId,
            name: line.name,
            sku: line.sku,
            unit: line.unit,
            quantity: line.quantity,
            unitPriceMinor: BigInt(Math.round(line.unitPriceMinor)),
            discountMinor: BigInt(Math.round(line.discountMinor)),
            taxRateBps: line.taxRateBps,
            netMinor: BigInt(Math.round(line.netMinor)),
            taxMinor: BigInt(Math.round(line.taxMinor)),
            totalMinor: BigInt(Math.round(line.totalMinor)),
            modifiers: JSON.stringify(line.modifiers),
            note: line.note,
            sortOrder: index,
          })),
        },
      },
      select: { id: true },
    });

    return sale.id;
  }, TX_OPTIONS);
}

/* -------------------------------------------------------------------------- */
/* Void                                                                        */
/* -------------------------------------------------------------------------- */

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export interface VoidResult {
  saleId: string;
  stockChanges: StockChangeResult[];
}

export async function voidSale(
  ctx: ActorContext,
  saleId: string,
  reason: string | null,
): Promise<VoidResult> {
  const { entityId } = ctx;
  const settings = await getSettings(entityId);

  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, entityId },
      include: { lines: true, payments: true, refunds: { select: { id: true } } },
    });
    if (!sale) throw ApiError.notFound('Venda nao encontrada.');
    if (sale.status === 'voided') throw ApiError.conflict('Esta venda ja foi anulada.');
    if (sale.status !== 'completed') {
      throw ApiError.conflict('Apenas vendas concluidas podem ser anuladas.');
    }
    if (sale.refunds.length > 0 || sale.lines.some((l) => l.refundedQuantity > 0)) {
      throw ApiError.conflict('Venda com devolucoes nao pode ser anulada. Emita uma devolucao.');
    }
    if (!isSameLocalDay(sale.createdAt, new Date())) {
      throw ApiError.conflict('So e possivel anular vendas do proprio dia. Emita uma devolucao.');
    }

    const changes: StockChangeResult[] = [];
    for (const line of sale.lines) {
      changes.push(
        ...(await restoreStock(tx, entityId, {
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          locationId: sale.locationId,
          unitCostMinor: Number(line.unitCostMinor),
          reference: sale.receiptNumber,
          note: `Anulacao da venda ${sale.receiptNumber}`,
          userId: ctx.userId,
          userName: ctx.userName,
        })),
      );
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: 'voided',
        note: reason ? [sale.note, `Anulada: ${reason}`].filter(Boolean).join(' | ') : sale.note,
      },
    });
    await tx.payment.updateMany({ where: { saleId: sale.id }, data: { status: 'refunded' } });

    // Undo everything the sale did to the customer's account.
    if (sale.customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: sale.customerId, entityId },
        select: { id: true, points: true, storeCreditMinor: true, lifetimeSpendMinor: true, orderCount: true },
      });
      if (customer) {
        const ledger = await tx.loyaltyTransaction.findMany({
          where: { customerId: customer.id, saleId: sale.id },
          select: { points: true },
        });
        const netPoints = ledger.reduce((sum, row) => sum + row.points, 0);
        let balance = customer.points;
        if (netPoints !== 0) {
          balance = Math.max(0, customer.points - netPoints);
          await tx.loyaltyTransaction.create({
            data: {
              customerId: customer.id,
              type: 'adjust',
              points: -netPoints,
              balanceAfter: balance,
              saleId: sale.id,
              note: `Anulacao da venda ${sale.receiptNumber}`,
            },
          });
        }

        const creditBack = sale.payments
          .filter((p) => p.method === 'store_credit')
          .reduce((sum, p) => sum + Number(p.amountMinor), 0);
        const lifetime = Math.max(0, Number(customer.lifetimeSpendMinor) - Number(sale.totalMinor));

        await tx.customer.update({
          where: { id: customer.id },
          data: {
            points: balance,
            storeCreditMinor: BigInt(Math.round(Number(customer.storeCreditMinor) + creditBack)),
            lifetimeSpendMinor: BigInt(Math.round(lifetime)),
            orderCount: Math.max(0, customer.orderCount - 1),
            tier: tierFor(lifetime, settings.vipThresholds),
          },
        });
      }
    }

    if (sale.promotionCode) {
      await tx.promotion.updateMany({
        where: { entityId, code: sale.promotionCode, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }

    if (sale.orderId) {
      await tx.order.updateMany({
        where: { id: sale.orderId, entityId },
        data: { status: 'cancelled', closedAt: new Date() },
      });
    }

    return { saleId: sale.id, stockChanges: changes };
  }, TX_OPTIONS);
}

/* -------------------------------------------------------------------------- */
/* Refunds                                                                     */
/* -------------------------------------------------------------------------- */

export interface RefundResult {
  refundId: string;
  saleId: string;
  reference: string;
  totalMinor: number;
  stockChanges: StockChangeResult[];
  saleStatus: string;
}

export async function createRefund(
  ctx: ActorContext,
  input: CreateRefundInput,
): Promise<RefundResult> {
  const { entityId } = ctx;
  const settings = await getSettings(entityId);

  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: input.saleId, entityId },
      include: { lines: true },
    });
    if (!sale) throw ApiError.notFound('Venda nao encontrada.');
    if (sale.status === 'voided') throw ApiError.conflict('Venda anulada nao pode ser devolvida.');
    if (sale.status === 'held' || sale.status === 'draft') {
      throw ApiError.conflict('Apenas vendas concluidas podem ser devolvidas.');
    }
    if (sale.status === 'refunded') {
      throw ApiError.conflict('Esta venda ja foi totalmente devolvida.');
    }

    const lineById = new Map(sale.lines.map((line) => [line.id, line]));
    const refundedByLine = new Map<string, number>();

    interface PreparedRefundLine {
      saleLineId: string;
      quantity: number;
      amountMinor: number;
      taxMinor: number;
      cogsMinor: number;
      reason: string;
      restock: boolean;
    }

    const prepared: PreparedRefundLine[] = [];

    for (const requested of input.lines) {
      const line = lineById.get(requested.saleLineId);
      if (!line) {
        throw ApiError.notFound(`Linha da venda nao encontrada: ${requested.saleLineId}`);
      }
      const quantity = round3(requested.quantity);
      const alreadyRefunded = refundedByLine.get(line.id) ?? line.refundedQuantity;
      const remaining = round3(line.quantity - alreadyRefunded);
      if (quantity <= 0) {
        throw ApiError.unprocessable(`Quantidade invalida para "${line.name}".`);
      }
      if (quantity - remaining > QTY_EPSILON) {
        throw ApiError.unprocessable(
          `Quantidade a devolver excede a disponivel em "${line.name}": restam ${remaining}.`,
        );
      }

      const share = line.quantity > 0 ? quantity / line.quantity : 0;
      const amountMinor = Math.round(Number(line.totalMinor) * share);
      const taxMinor = Math.round(Number(line.taxMinor) * share);
      const cogsMinor = Math.round(Number(line.unitCostMinor) * quantity);

      refundedByLine.set(line.id, round3(alreadyRefunded + quantity));
      prepared.push({
        saleLineId: line.id,
        quantity,
        amountMinor,
        taxMinor,
        cogsMinor,
        reason: requested.reason,
        restock: requested.restock,
      });
    }

    const totalMinor = prepared.reduce((sum, l) => sum + l.amountMinor, 0);
    const taxMinor = prepared.reduce((sum, l) => sum + l.taxMinor, 0);
    const cogsMinor = prepared.reduce((sum, l) => sum + l.cogsMinor, 0);

    if (input.method === 'store_credit' && !sale.customerId) {
      throw ApiError.unprocessable('Devolucao em credito de loja exige um cliente na venda.');
    }

    const reference = await nextDocumentNumber(entityId, 'refund', { client: tx });

    const refund = await tx.refund.create({
      data: {
        entityId,
        saleId: sale.id,
        reference,
        totalMinor: BigInt(Math.round(totalMinor)),
        taxMinor: BigInt(Math.round(taxMinor)),
        cogsMinor: BigInt(Math.round(cogsMinor)),
        method: input.method,
        note: input.note ?? null,
        userId: ctx.userId,
        userName: ctx.userName,
        lines: {
          create: prepared.map((line) => ({
            saleLineId: line.saleLineId,
            quantity: line.quantity,
            amountMinor: BigInt(Math.round(line.amountMinor)),
            reason: line.reason,
            restocked: line.restock,
          })),
        },
      },
      select: { id: true },
    });

    const changes: StockChangeResult[] = [];
    for (const line of prepared) {
      const saleLine = lineById.get(line.saleLineId)!;
      await tx.saleLine.update({
        where: { id: saleLine.id },
        data: { refundedQuantity: refundedByLine.get(saleLine.id) ?? saleLine.refundedQuantity },
      });

      if (!line.restock) continue;
      changes.push(
        ...(await restoreStock(tx, entityId, {
          productId: saleLine.productId,
          variantId: saleLine.variantId,
          quantity: line.quantity,
          locationId: sale.locationId,
          unitCostMinor: Number(saleLine.unitCostMinor),
          reference,
          note: `Devolucao ${reference} da venda ${sale.receiptNumber}`,
          userId: ctx.userId,
          userName: ctx.userName,
        })),
      );
    }

    const fullyRefunded = sale.lines.every((line) => {
      const refunded = refundedByLine.get(line.id) ?? line.refundedQuantity;
      return line.quantity - refunded <= QTY_EPSILON;
    });
    const saleStatus = fullyRefunded ? 'refunded' : 'partially_refunded';

    await tx.sale.update({ where: { id: sale.id }, data: { status: saleStatus } });
    await tx.payment.updateMany({
      where: { saleId: sale.id },
      data: { status: fullyRefunded ? 'refunded' : 'partially_refunded' },
    });

    if (sale.customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: sale.customerId, entityId },
        select: { id: true, points: true, storeCreditMinor: true, lifetimeSpendMinor: true },
      });
      if (customer) {
        const earnPer = Math.max(1, Math.round(settings.loyaltyEarnPerMinor || 1));
        const reversed = Math.min(customer.points, Math.floor(totalMinor / earnPer));
        let balance = customer.points;
        if (reversed > 0) {
          balance -= reversed;
          await tx.loyaltyTransaction.create({
            data: {
              customerId: customer.id,
              type: 'adjust',
              points: -reversed,
              balanceAfter: balance,
              saleId: sale.id,
              note: `Devolucao ${reference}`,
            },
          });
        }

        const lifetime = Math.max(0, Number(customer.lifetimeSpendMinor) - totalMinor);
        const storeCredit =
          Number(customer.storeCreditMinor) + (input.method === 'store_credit' ? totalMinor : 0);

        await tx.customer.update({
          where: { id: customer.id },
          data: {
            points: balance,
            lifetimeSpendMinor: BigInt(Math.round(lifetime)),
            storeCreditMinor: BigInt(Math.round(storeCredit)),
            tier: tierFor(lifetime, settings.vipThresholds),
          },
        });
      }
    }

    return {
      refundId: refund.id,
      saleId: sale.id,
      reference,
      totalMinor,
      stockChanges: changes,
      saleStatus,
    };
  }, TX_OPTIONS);
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

export async function loadSale(entityId: string, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, entityId },
    include: saleInclude,
  });
  if (!sale) throw ApiError.notFound('Venda nao encontrada.');
  return sale;
}

export async function loadSaleByReceipt(entityId: string, receiptNumber: string) {
  const sale = await prisma.sale.findFirst({
    where: { entityId, receiptNumber },
    include: saleInclude,
  });
  if (!sale) throw ApiError.notFound(`Recibo nao encontrado: ${receiptNumber}`);
  return sale;
}

export async function loadReceiptEntity(entityId: string) {
  const entity = await prisma.entity.findFirst({
    where: { id: entityId },
    select: {
      name: true,
      nif: true,
      address: true,
      phone: true,
      currency: true,
      locale: true,
      pricingMode: true,
    },
  });
  if (!entity) throw ApiError.notFound('Entidade nao encontrada.');
  return entity;
}
