import { z } from 'zod';
import {
  COURSE_MAX,
  DISCOUNT_TYPES,
  PAYMENT_METHODS,
  PRODUCT_TYPES,
  SALE_CHANNELS,
  SALE_STATUSES,
  UNITS,
} from '@pos/shared';

/**
 * Zod mirrors of the DTOs in @pos/shared.
 *
 * Display fields the client sends (name, sku, unit, type, unitPriceMinor for a
 * standard product) are accepted but never trusted: the pricing engine in
 * service.ts re-reads all of them from the database.
 */

const money = z.number().int().nonnegative();
const optionalText = (max: number) => z.string().trim().max(max).nullish();

export const cartModifierSchema = z.object({
  modifierId: z.string().min(1),
  name: z.string().max(120).optional(),
  priceDeltaMinor: z.number().int().optional(),
});

export const cartLineSchema = z.object({
  key: z.string().max(80).optional(),
  productId: z.string().min(1, 'Produto obrigatorio.'),
  variantId: z.string().min(1).nullish(),
  name: z.string().max(200).optional(),
  sku: optionalText(80),
  unit: z.enum(UNITS).optional(),
  type: z.enum(PRODUCT_TYPES).optional(),
  quantity: z.number().finite().positive('Quantidade tem de ser maior que zero.'),
  unitPriceMinor: money.optional(),
  taxRateBps: z.number().int().min(0).max(100_000).optional(),
  discountType: z.enum(DISCOUNT_TYPES).nullish(),
  discountValue: z.number().int().nonnegative().nullish(),
  modifiers: z.array(cartModifierSchema).max(40).optional(),
  note: optionalText(500),
  course: z.number().int().min(0).max(COURSE_MAX).optional(),
  seat: z.number().int().min(0).nullish(),
  imageUrl: optionalText(500),
});

export const paymentInputSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amountMinor: z.number().int().positive('O valor do pagamento tem de ser positivo.'),
  tenderedMinor: money.optional(),
  reference: optionalText(120),
  label: optionalText(60),
});

/** Accepts "" as "not supplied" so an empty input box is not a validation error. */
const emailish = z
  .union([z.string().trim().max(160).email('Email invalido.'), z.literal('')])
  .nullish();

const discountFields = {
  orderDiscountType: z.enum(DISCOUNT_TYPES).nullish(),
  orderDiscountValue: z.number().int().nonnegative().nullish(),
  promotionCode: optionalText(60),
};

export const createSaleSchema = z.object({
  channel: z.enum(SALE_CHANNELS).default('pos'),
  locationId: z.string().min(1).nullish(),
  customerId: z.string().min(1).nullish(),
  lines: z.array(cartLineSchema).min(1, 'A venda precisa de pelo menos uma linha.').max(500),
  payments: z.array(paymentInputSchema).min(1, 'Indique pelo menos um pagamento.').max(10),
  ...discountFields,
  tipMinor: money.default(0),
  note: optionalText(1000),
  orderId: z.string().min(1).nullish(),
  idempotencyKey: z.string().trim().min(1).max(120).optional(),
  receiptEmail: emailish,
  receiptPhone: optionalText(40),
  loyaltyPointsRedeemed: z.number().int().nonnegative().default(0),
  /**
   * Not part of CreateSaleRequest, but accepted as an optional extra so that
   * "recall a parked sale and finish it" can discard the held row atomically.
   */
  heldSaleId: z.string().min(1).nullish(),
});

export const holdSaleSchema = z.object({
  channel: z.enum(SALE_CHANNELS).default('pos'),
  locationId: z.string().min(1).nullish(),
  customerId: z.string().min(1).nullish(),
  lines: z.array(cartLineSchema).min(1, 'Nao e possivel suspender um carrinho vazio.').max(500),
  ...discountFields,
  holdLabel: z.string().trim().min(1, 'Indique uma etiqueta para a venda suspensa.').max(120),
  note: optionalText(1000),
});

export const refundLineSchema = z.object({
  saleLineId: z.string().min(1),
  quantity: z.number().finite().positive('Quantidade tem de ser maior que zero.'),
  reason: z.string().trim().min(1).max(200).default('other'),
  restock: z.boolean().default(true),
});

export const createRefundSchema = z.object({
  saleId: z.string().min(1),
  lines: z.array(refundLineSchema).min(1, 'Indique pelo menos uma linha a devolver.').max(500),
  method: z.enum(['original', 'store_credit', 'cash']).default('original'),
  note: optionalText(1000),
});

export const voidSaleSchema = z.object({
  reason: optionalText(300),
});

export const sendReceiptSchema = z
  .object({
    email: emailish,
    phone: optionalText(40),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.phone), {
    message: 'Indique um email ou um numero de telefone.',
  });

/* -------------------------------------------------------------------------- */
/* Query strings                                                               */
/* -------------------------------------------------------------------------- */

const pageFields = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
};

export const saleListQuerySchema = z.object({
  ...pageFields,
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  cashierId: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
  channel: z.enum(SALE_CHANNELS).optional(),
  status: z.enum(SALE_STATUSES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  search: z.string().trim().max(120).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const refundListQuerySchema = z.object({
  ...pageFields,
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  saleId: z.string().trim().min(1).optional(),
  method: z.enum(['original', 'store_credit', 'cash']).optional(),
  search: z.string().trim().max(120).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const receiptTextQuerySchema = z.object({
  format: z.enum(['json', 'text']).default('json'),
});

export type CartLineInput = z.infer<typeof cartLineSchema>;
export type PaymentInputBody = z.infer<typeof paymentInputSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type HoldSaleInput = z.infer<typeof holdSaleSchema>;
export type CreateRefundInput = z.infer<typeof createRefundSchema>;
export type VoidSaleInput = z.infer<typeof voidSaleSchema>;
export type SendReceiptInput = z.infer<typeof sendReceiptSchema>;
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;
export type RefundListQuery = z.infer<typeof refundListQuerySchema>;
export type ReceiptTextQuery = z.infer<typeof receiptTextQuerySchema>;
