import { z } from 'zod';

/**
 * Validation for the catalogue tree. Every user-facing message is European
 * Portuguese written without accents so the source stays ASCII-safe.
 */

const HEX_COLOUR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Ids are uuids in practice, but seeds may use shorter slugs. */
const idField = z.string().trim().min(1, 'Identificador invalido.').max(64, 'Identificador invalido.');

const namePtField = z
  .string()
  .trim()
  .min(1, 'O nome e obrigatorio.')
  .max(120, 'O nome nao pode exceder 120 caracteres.');

/**
 * Optional text that can be cleared. `undefined` means "leave as is" (PATCH),
 * `null` / "" means "clear it".
 */
function nullableText(max: number, message: string) {
  return z
    .union([z.string().trim().max(max, message), z.null()])
    .optional()
    .transform((value) => (value === undefined ? undefined : value ? value : null));
}

const colourField = z
  .union([
    z.string().trim().regex(HEX_COLOUR, 'Cor invalida. Use o formato #RRGGBB.'),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((value) => (value === undefined ? undefined : value ? value.toUpperCase() : null));

const sortOrderField = z.coerce
  .number({ invalid_type_error: 'Ordem invalida.' })
  .int('A ordem tem de ser um numero inteiro.')
  .min(0, 'A ordem nao pode ser negativa.')
  .max(1_000_000, 'Ordem demasiado alta.');

const parentIdField = z.union([idField, z.null()]).optional();

/** Query flags arrive as strings ("?tree=true"). */
const boolParam = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['true', '1', 'yes', 'sim', 'on'].includes(value.toLowerCase());
    return false;
  });

export const listQuerySchema = z.object({
  /** Nested CategoryDto[] with children[] instead of a flat list. */
  tree: boolParam,
  includeInactive: boolParam,
  search: z.string().trim().max(120, 'Pesquisa demasiado longa.').optional(),
  parentId: z.union([idField, z.literal('root')]).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const createSchema = z.object({
  namePt: namePtField,
  nameEn: nullableText(120, 'O nome nao pode exceder 120 caracteres.'),
  parentId: parentIdField,
  color: colourField,
  iconUrl: nullableText(500, 'URL do icone demasiado longo.'),
  sortOrder: sortOrderField.optional(),
  active: z.boolean().optional(),
});
export type CreateInput = z.infer<typeof createSchema>;

export const updateSchema = z
  .object({
    namePt: namePtField.optional(),
    nameEn: nullableText(120, 'O nome nao pode exceder 120 caracteres.'),
    parentId: parentIdField,
    color: colourField,
    iconUrl: nullableText(500, 'URL do icone demasiado longo.'),
    sortOrder: sortOrderField.optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Nada para actualizar.',
  });
export type UpdateInput = z.infer<typeof updateSchema>;

export const reorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: idField,
        sortOrder: sortOrderField,
        parentId: parentIdField,
      }),
    )
    .min(1, 'Indique pelo menos uma categoria.')
    .max(500, 'Demasiadas categorias num so pedido.'),
});
export type ReorderInput = z.infer<typeof reorderSchema>;
