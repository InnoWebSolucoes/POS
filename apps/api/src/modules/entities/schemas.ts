import { z } from 'zod';
import { COSTING_METHODS, ENTITY_MODES, LOCALES, PRICING_MODES } from '@pos/shared';

/**
 * Zod contracts for the tenancy module.
 *
 * Text fields that the database stores as NULL accept either a string or null;
 * an empty string coming from a form is normalised to null so the column never
 * ends up holding "".
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Optional, nullable, trimmed text. undefined = leave alone, null = clear. */
function optionalText(max: number) {
  return z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === null || value === '' ? null : value));
}

const optionalEmail = z
  .union([z.string().trim().max(160), z.null()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === null || value === '' ? null : value))
  .refine(
    (value) => value === undefined || value === null || z.string().email().safeParse(value).success,
    { message: 'Email invalido.' },
  );

const currency = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'Moeda deve ter 3 letras (ex: AOA).')
  .transform((value) => value.toUpperCase());

const accentColor = z.string().trim().regex(HEX_COLOR, 'Cor deve estar no formato #RRGGBB.');

const taxRateBps = z
  .number()
  .int('Taxa deve ser um inteiro em pontos base.')
  .min(0)
  .max(10_000, 'Taxa nao pode exceder 10000 pontos base (100%).');

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

export const listEntitiesQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value ? value : undefined)),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});
export type ListEntitiesQuery = z.infer<typeof listEntitiesQuerySchema>;

export const listLocationsQuerySchema = z.object({
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});
export type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Entity                                                                      */
/* -------------------------------------------------------------------------- */

export const createEntitySchema = z.object({
  name: z.string().trim().min(2, 'Nome demasiado curto.').max(120),
  mode: z.enum(ENTITY_MODES).default('retail'),
  nif: optionalText(40),
  address: optionalText(240),
  phone: optionalText(40),
  email: optionalEmail,
  currency: currency.default('AOA'),
  locale: z.enum(LOCALES).default('pt-PT'),
  pricingMode: z.enum(PRICING_MODES).default('inclusive'),
  costingMethod: z.enum(COSTING_METHODS).default('weighted_average'),
  defaultTaxRateBps: taxRateBps.default(1400),
  accentColor: accentColor.default('#006AFF'),
  logoUrl: optionalText(500),

  /** Name of the location created together with the entity. */
  locationName: z.string().trim().min(1).max(120).default('Loja Principal'),

  /** Supply both to get an entity_admin account created in the same transaction. */
  adminName: z.string().trim().min(2).max(120).optional(),
  adminEmail: z.string().trim().email('Email invalido.').max(160).optional(),
  adminPassword: z.string().min(8, 'Palavra-passe deve ter pelo menos 8 caracteres.').max(128).optional(),
});
export type CreateEntityBody = z.infer<typeof createEntitySchema>;

export const updateEntitySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    mode: z.enum(ENTITY_MODES).optional(),
    nif: optionalText(40),
    address: optionalText(240),
    phone: optionalText(40),
    email: optionalEmail,
    logoUrl: optionalText(500),
    accentColor: accentColor.optional(),
    currency: currency.optional(),
    locale: z.enum(LOCALES).optional(),
    pricingMode: z.enum(PRICING_MODES).optional(),
    costingMethod: z.enum(COSTING_METHODS).optional(),
    defaultTaxRateBps: taxRateBps.optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Nada para actualizar.',
  });
export type UpdateEntityBody = z.infer<typeof updateEntitySchema>;

/* -------------------------------------------------------------------------- */
/* Location                                                                    */
/* -------------------------------------------------------------------------- */

export const createLocationSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatorio.').max(120),
  address: optionalText(240),
  phone: optionalText(40),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type CreateLocationBody = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    address: optionalText(240),
    phone: optionalText(40),
    isDefault: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Nada para actualizar.',
  });
export type UpdateLocationBody = z.infer<typeof updateLocationSchema>;
