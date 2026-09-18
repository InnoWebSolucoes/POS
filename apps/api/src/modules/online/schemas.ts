import { z } from 'zod';
import {
  FULFILMENT_METHODS,
  ONLINE_ORDER_STATUSES,
  PAYMENT_GATEWAYS,
  PAYMENT_STATUSES,
} from '@pos/shared';

/**
 * Validation for the online store.
 *
 * The storefront and cart routes are the only unauthenticated surface in this
 * API, so every field that reaches them is bounded here: lengths, ranges and
 * enums, never a free-form pass-through. Messages are European Portuguese
 * written without accents so the source stays ASCII-safe.
 */

const idField = z
  .string()
  .trim()
  .min(1, 'Identificador invalido.')
  .max(64, 'Identificador invalido.');

const slugField = z
  .string()
  .trim()
  .min(1, 'Loja invalida.')
  .max(140, 'Loja invalida.')
  .regex(/^[A-Za-z0-9._-]+$/, 'Loja invalida.');

/** Client-generated browser session id for guest carts. */
const sessionIdField = z
  .string()
  .trim()
  .min(8, 'Sessao invalida.')
  .max(120, 'Sessao invalida.')
  .regex(/^[A-Za-z0-9._:-]+$/, 'Sessao invalida.');

/** Quantities may be fractional (1.350 kg); three decimals is the limit. */
const quantityField = z.coerce
  .number({ invalid_type_error: 'Quantidade invalida.' })
  .positive('A quantidade tem de ser maior que zero.')
  .max(100_000, 'Quantidade demasiado alta.');

const optionalText = (max: number, message: string) =>
  z
    .union([z.string().trim().max(max, message), z.null()])
    .optional()
    .transform((value) => (value === undefined ? undefined : value ? value : null));

const emailField = z
  .string()
  .trim()
  .max(180, 'Email demasiado longo.')
  .email('Email invalido.');

const phoneField = z
  .string()
  .trim()
  .min(6, 'Telefone invalido.')
  .max(30, 'Telefone invalido.')
  .regex(/^[0-9+()\s-]+$/, 'Telefone invalido.');

/** Query flags arrive as strings ("?inStock=true"). */
const boolParam = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return ['true', '1', 'yes', 'sim', 'on'].includes(value.toLowerCase());
    }
    return false;
  });

const pageField = z.coerce
  .number({ invalid_type_error: 'Pagina invalida.' })
  .int('Pagina invalida.')
  .min(1, 'Pagina invalida.')
  .optional();

const pageSizeField = z.coerce
  .number({ invalid_type_error: 'Tamanho de pagina invalido.' })
  .int('Tamanho de pagina invalido.')
  .min(1, 'Tamanho de pagina invalido.')
  .max(100, 'Tamanho de pagina demasiado grande.')
  .optional();

/* -------------------------------------------------------------------------- */
/* Storefront                                                                  */
/* -------------------------------------------------------------------------- */

export const storefrontParamsSchema = z.object({ entitySlug: slugField });

export const catalogueQuerySchema = z
  .object({
    page: pageField,
    pageSize: pageSizeField,
    search: z.string().trim().max(120, 'Pesquisa demasiado longa.').optional(),
    categoryId: idField.optional(),
    /** Minor units, compared against the displayed (tax-inclusive) price. */
    minPrice: z.coerce.number({ invalid_type_error: 'Preco minimo invalido.' }).min(0).optional(),
    maxPrice: z.coerce.number({ invalid_type_error: 'Preco maximo invalido.' }).min(0).optional(),
    inStock: boolParam,
    sort: z.enum(['price', 'name', 'newest']).optional(),
  })
  .refine(
    (q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice,
    { message: 'O preco minimo nao pode exceder o maximo.', path: ['minPrice'] },
  );
export type CatalogueQuery = z.infer<typeof catalogueQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Cart                                                                        */
/* -------------------------------------------------------------------------- */

export const createCartSchema = z
  .object({
    entitySlug: slugField,
    sessionId: sessionIdField.optional(),
    customerId: idField.optional(),
  })
  .refine((body) => Boolean(body.sessionId || body.customerId), {
    message: 'Indique sessionId ou customerId.',
    path: ['sessionId'],
  });
export type CreateCartInput = z.infer<typeof createCartSchema>;

export const addCartItemSchema = z.object({
  productId: idField,
  variantId: z.union([idField, z.null()]).optional(),
  quantity: quantityField.default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  /** Zero removes the line. */
  quantity: z.coerce
    .number({ invalid_type_error: 'Quantidade invalida.' })
    .min(0, 'A quantidade nao pode ser negativa.')
    .max(100_000, 'Quantidade demasiado alta.'),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const mergeCartSchema = z.object({ sessionId: sessionIdField });
export type MergeCartInput = z.infer<typeof mergeCartSchema>;

/* -------------------------------------------------------------------------- */
/* Checkout                                                                    */
/* -------------------------------------------------------------------------- */

export const shippingAddressSchema = z.object({
  recipient: z.string().trim().min(1, 'Indique o destinatario.').max(120, 'Nome demasiado longo.'),
  phone: phoneField,
  line1: z.string().trim().min(1, 'Indique a morada.').max(180, 'Morada demasiado longa.'),
  line2: optionalText(180, 'Morada demasiado longa.'),
  city: z.string().trim().min(1, 'Indique a cidade.').max(120, 'Cidade demasiado longa.'),
  province: optionalText(120, 'Provincia demasiado longa.'),
  postalCode: optionalText(20, 'Codigo postal invalido.'),
  country: z.string().trim().length(2, 'Pais invalido.').optional(),
  label: optionalText(60, 'Etiqueta demasiado longa.'),
});
export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;

export const createOrderSchema = z
  .object({
    entitySlug: slugField,
    cartId: idField,
    fulfilmentMethod: z.enum(FULFILMENT_METHODS),
    pickupLocationId: idField.optional(),
    shippingAddress: shippingAddressSchema.optional(),
    guestName: z.string().trim().min(1).max(120, 'Nome demasiado longo.').optional(),
    guestEmail: emailField.optional(),
    guestPhone: phoneField.optional(),
    customerId: idField.optional(),
    paymentGateway: z.enum(PAYMENT_GATEWAYS),
    note: optionalText(500, 'Nota demasiado longa.'),
  })
  .superRefine((body, ctx) => {
    if (body.fulfilmentMethod === 'delivery' && !body.shippingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shippingAddress'],
        message: 'Indique a morada de entrega.',
      });
    }
    if (body.fulfilmentMethod === 'pickup' && !body.pickupLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pickupLocationId'],
        message: 'Indique o ponto de levantamento.',
      });
    }
    // Without a customer account we still need a way to reach the buyer and to
    // let them look the order up later without guessing order numbers.
    if (!body.customerId && !body.guestEmail && !body.guestPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['guestEmail'],
        message: 'Indique um email ou telefone de contacto.',
      });
    }
    if (!body.customerId && !body.guestName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['guestName'],
        message: 'Indique o seu nome.',
      });
    }
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** Public status lookup: order number alone is never enough. */
export const orderLookupQuerySchema = z
  .object({
    /** Kept in the schema so validateQuery does not strip the tenant hint. */
    entitySlug: slugField.optional(),
    email: z.string().trim().max(180).optional(),
    phone: z.string().trim().max(30).optional(),
  })
  .refine((q) => Boolean(q.email || q.phone), {
    message: 'Indique o email ou telefone da encomenda.',
    path: ['email'],
  });
export type OrderLookupQuery = z.infer<typeof orderLookupQuerySchema>;

export const payOrderSchema = z.object({
  gateway: z.enum(PAYMENT_GATEWAYS),
  reference: z.string().trim().min(1, 'Indique a referencia.').max(120, 'Referencia demasiado longa.'),
  status: z.enum(['pending', 'confirmed', 'failed']),
  /** Free-form gateway metadata. Card numbers are stripped before storage. */
  payload: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type PayOrderInput = z.infer<typeof payOrderSchema>;

/* -------------------------------------------------------------------------- */
/* Back office                                                                 */
/* -------------------------------------------------------------------------- */

export const adminOrderQuerySchema = z.object({
  page: pageField,
  pageSize: pageSizeField,
  status: z.enum(ONLINE_ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  from: z.coerce.date({ invalid_type_error: 'Data inicial invalida.' }).optional(),
  to: z.coerce.date({ invalid_type_error: 'Data final invalida.' }).optional(),
  search: z.string().trim().max(120, 'Pesquisa demasiado longa.').optional(),
});
export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;

export const updateStatusSchema = z.object({
  status: z.enum(ONLINE_ORDER_STATUSES),
  note: optionalText(300, 'Nota demasiado longa.'),
});
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const trackingSchema = z.object({
  carrier: z.string().trim().min(1, 'Indique a transportadora.').max(120, 'Nome demasiado longo.'),
  trackingNumber: z
    .string()
    .trim()
    .min(1, 'Indique o numero de seguimento.')
    .max(120, 'Numero de seguimento demasiado longo.'),
});
export type TrackingInput = z.infer<typeof trackingSchema>;
