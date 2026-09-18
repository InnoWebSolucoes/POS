import { z } from 'zod';
import { VIP_TIERS } from '@pos/shared';

/**
 * Query strings arrive as strings, so anything numeric or boolean is coerced
 * here rather than in the handlers. Empty strings are treated as "absent" so a
 * form that posts `?tier=` does not fail validation.
 */

const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Optional free text: trims, and turns "" into an explicit null. */
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value),
    z.string().max(max, `Maximo de ${max} caracteres.`).nullable().optional(),
  );

const optionalEmail = () =>
  z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value.trim() === ''
          ? null
          : value.trim().toLowerCase()
        : value,
    z.string().email('Email invalido.').max(160).nullable().optional(),
  );

const boolQuery = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'sim') return true;
  if (s === 'false' || s === '0' || s === 'nao') return false;
  return value;
}, z.boolean().optional());

const dateQuery = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Data invalida.')
    .optional(),
);

const intQuery = (min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).optional());

/* -------------------------------------------------------------------------- */
/* Bodies                                                                      */
/* -------------------------------------------------------------------------- */

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'O nome e obrigatorio.').max(160),
  phone: optionalText(40),
  email: optionalEmail(),
  nif: optionalText(40),
  address: optionalText(400),
  notes: optionalText(2000),
  loyaltyCardNumber: optionalText(60),
  active: z.boolean().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1, 'O nome e obrigatorio.').max(160).optional(),
    phone: optionalText(40),
    email: optionalEmail(),
    nif: optionalText(40),
    address: optionalText(400),
    notes: optionalText(2000),
    loyaltyCardNumber: optionalText(60),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para actualizar.');
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const adjustPointsSchema = z.object({
  points: z
    .number()
    .int('Os pontos devem ser um numero inteiro.')
    .refine((v) => v !== 0, 'O ajuste nao pode ser zero.')
    .refine((v) => Math.abs(v) <= 1_000_000, 'Ajuste demasiado elevado.'),
  note: optionalText(500),
});
export type AdjustPointsInput = z.infer<typeof adjustPointsSchema>;

export const redeemPointsSchema = z.object({
  points: z.number().int('Os pontos devem ser um numero inteiro.').positive('Indique pontos a usar.'),
});
export type RedeemPointsInput = z.infer<typeof redeemPointsSchema>;

export const storeCreditSchema = z.object({
  amountMinor: z
    .number()
    .int('O valor deve estar em centimos inteiros.')
    .refine((v) => v !== 0, 'O movimento nao pode ser zero.'),
  note: optionalText(500),
});
export type StoreCreditInput = z.infer<typeof storeCreditSchema>;

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

export const CUSTOMER_SORTS = ['name', 'spend', 'lastPurchase', 'created'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const listCustomersQuerySchema = z.object({
  page: intQuery(1, 100_000),
  pageSize: intQuery(1, 200),
  search: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  tier: z.preprocess(blankToUndefined, z.enum(VIP_TIERS).optional()),
  active: boolQuery,
  sort: z.preprocess(blankToUndefined, z.enum(CUSTOMER_SORTS).optional()),
  order: z.preprocess(blankToUndefined, z.enum(['asc', 'desc']).optional()),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export const lookupQuerySchema = z.object({
  q: z.string().trim().min(1, 'Indique um termo de pesquisa.').max(120),
  limit: intQuery(1, 10),
});
export type LookupQuery = z.infer<typeof lookupQuerySchema>;

export const createCustomerQuerySchema = z.object({
  withCard: boolQuery,
});
export type CreateCustomerQuery = z.infer<typeof createCustomerQuerySchema>;

export const purchasesQuerySchema = z.object({
  page: intQuery(1, 100_000),
  pageSize: intQuery(1, 200),
});
export type PurchasesQuery = z.infer<typeof purchasesQuerySchema>;

export const topCustomersQuerySchema = z.object({
  from: dateQuery,
  to: dateQuery,
  limit: intQuery(1, 100),
});
export type TopCustomersQuery = z.infer<typeof topCustomersQuerySchema>;

export const retentionQuerySchema = z.object({
  from: dateQuery,
  to: dateQuery,
});
export type RetentionQuery = z.infer<typeof retentionQuerySchema>;
