import { z } from 'zod';
import { PROMOTION_TYPES, type PromotionType } from '@pos/shared';
import { ApiError } from '../../lib/http.js';

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

const TRUTHY = ['true', '1', 'yes', 'sim', 'on'];
const FALSY = ['false', '0', 'no', 'nao', 'off'];

/** Query flags arrive as strings; accept the usual spellings. */
const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    const raw = value.trim().toLowerCase();
    if (raw === '') return undefined;
    if (TRUTHY.includes(raw)) return true;
    if (FALSY.includes(raw)) return false;
    return undefined;
  });

const dateish = z
  .union([z.string(), z.date()])
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Data invalida.')
  .transform((value) => new Date(value));

const codeField = z
  .string()
  .trim()
  .min(2, 'Codigo demasiado curto.')
  .max(40, 'Codigo demasiado longo.')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Use apenas letras, numeros, ponto, hifen ou underscore.')
  .transform((value) => value.toUpperCase());

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  search: z.string().trim().max(120).optional(),
  active: boolish,
  running: boolish,
  type: z.enum(PROMOTION_TYPES).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Write bodies                                                                */
/* -------------------------------------------------------------------------- */

const promotionShape = z.object({
  code: codeField,
  namePt: z.string().trim().min(1, 'Nome obrigatorio.').max(140),
  nameEn: z.string().trim().max(140).nullish(),
  type: z.enum(PROMOTION_TYPES),
  /** bps for percent_off, minor units for fixed_off. Integer, always. */
  value: z.number().int('Valor deve ser um numero inteiro.').min(0).max(1_000_000_000).default(0),
  categoryId: z.string().trim().min(1).nullish(),
  productIds: z.array(z.string().trim().min(1)).max(500).optional(),
  buyQuantity: z.number().int().min(1).max(999).nullish(),
  getQuantity: z.number().int().min(1).max(999).nullish(),
  minSpendMinor: z.number().int().min(0).default(0),
  usageLimit: z.number().int().min(1).max(1_000_000).nullish(),
  startsAt: dateish.nullish(),
  endsAt: dateish.nullish(),
  active: z.boolean().default(true),
});

export const createSchema = promotionShape;
export type CreateBody = z.infer<typeof createSchema>;

export const updateSchema = promotionShape.partial();
export type UpdateBody = z.infer<typeof updateSchema>;

/* -------------------------------------------------------------------------- */
/* Cross-field rules                                                           */
/* -------------------------------------------------------------------------- */

export interface PromotionRules {
  type: PromotionType;
  value: number;
  buyQuantity: number | null;
  getQuantity: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

/**
 * Validated against the MERGED record so a PATCH that flips the type is checked
 * against what the promotion will actually become.
 */
export function assertPromotionRules(rules: PromotionRules): void {
  const details: Record<string, string[]> = {};

  if (rules.type === 'percent_off') {
    if (rules.value < 1 || rules.value > 10_000) {
      details.value = ['A percentagem deve estar entre 1 e 10000 pontos base (0,01% a 100%).'];
    }
  }

  if (rules.type === 'fixed_off' && rules.value < 1) {
    details.value = ['O desconto fixo deve ser superior a zero.'];
  }

  if (rules.type === 'buy_x_get_y') {
    if (!rules.buyQuantity || rules.buyQuantity < 1) {
      details.buyQuantity = ['Indique quantas unidades o cliente tem de levar.'];
    }
    if (!rules.getQuantity || rules.getQuantity < 1) {
      details.getQuantity = ['Indique quantas unidades sao oferecidas.'];
    }
  }

  if (rules.startsAt && rules.endsAt && rules.endsAt.getTime() <= rules.startsAt.getTime()) {
    details.endsAt = ['A data de fim tem de ser posterior a data de inicio.'];
  }

  if (Object.keys(details).length > 0) {
    throw ApiError.unprocessable('Promocao invalida.', details);
  }
}

/* -------------------------------------------------------------------------- */
/* Validate (the register's call)                                              */
/* -------------------------------------------------------------------------- */

export const validateBodySchema = z.object({
  code: z.string().trim().min(1, 'Codigo obrigatorio.').max(40),
  lines: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.number().finite().min(0).max(1_000_000),
        unitPriceMinor: z.number().int().min(0),
        categoryId: z.string().trim().min(1).nullish(),
      }),
    )
    .max(500)
    .default([]),
  subtotalMinor: z.number().int().min(0).optional(),
});
export type ValidatePromotionBody = z.infer<typeof validateBodySchema>;
