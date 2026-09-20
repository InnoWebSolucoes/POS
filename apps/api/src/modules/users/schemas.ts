import { z } from 'zod';
import { LOCALES, PERMISSIONS, ROLES } from '@pos/shared';

/**
 * Query strings arrive as strings (or not at all). Every optional filter treats
 * an empty string as "not sent" so the UI can bind inputs straight to the query.
 */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

const optionalFlag = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}, z.boolean().optional());

const roleFilter = z.preprocess(blankToUndefined, z.enum(ROLES).optional());

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  search: optionalText(120),
  role: roleFilter,
  active: optionalFlag,
  locationId: optionalText(64),
  sort: z.preprocess(
    blankToUndefined,
    z.enum(['name', 'role', 'createdAt', 'lastLoginAt']).optional(),
  ),
  order: z.preprocess(blankToUndefined, z.enum(['asc', 'desc']).optional()),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

const nameField = z
  .string()
  .trim()
  .min(2, 'O nome deve ter pelo menos 2 caracteres.')
  .max(120, 'Nome demasiado longo.');

const emailField = z
  .string()
  .trim()
  .max(180, 'Email demasiado longo.')
  .email('Email invalido.')
  .transform((value) => value.toLowerCase());

const passwordField = z
  .string()
  .min(6, 'A palavra-passe deve ter pelo menos 6 caracteres.')
  .max(128, 'Palavra-passe demasiado longa.');

const pinField = z
  .string()
  .trim()
  .regex(/^[0-9]{4,8}$/, 'O PIN deve ter entre 4 e 8 digitos.');

export const createUserSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  role: z.enum(ROLES),
  locationId: z.string().trim().min(1).max(64).nullish(),
  phone: z.string().trim().max(40).nullish(),
  locale: z.enum(LOCALES).optional(),
  avatarUrl: z.string().trim().max(500).nullish(),
  pin: pinField.nullish(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: nameField.optional(),
    email: emailField.optional(),
    role: z.enum(ROLES).optional(),
    locationId: z.string().trim().min(1).max(64).nullish(),
    phone: z.string().trim().max(40).nullish(),
    locale: z.enum(LOCALES).optional(),
    avatarUrl: z.string().trim().max(500).nullish(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nada para actualizar.',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  password: passwordField,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const setPinSchema = z.object({
  pin: pinField.nullable(),
});
export type SetPinInput = z.infer<typeof setPinSchema>;

export const pinUsersQuerySchema = z.object({
  entityId: z
    .string({ required_error: 'Indique a entidade (entityId).' })
    .trim()
    .min(1, 'Indique a entidade (entityId).')
    .max(64),
});
export type PinUsersQuery = z.infer<typeof pinUsersQuerySchema>;

/**
 * The permission editor posts the desired FINAL set, exactly as the checkboxes
 * show it. The server works out the delta against the role - the client never
 * has to reason about overrides.
 */
export const updatePermissionsSchema = z.object({
  permissions: z
    .array(z.enum(PERMISSIONS), {
      required_error: 'Indique as permissoes.',
      invalid_type_error: 'Indique as permissoes.',
    })
    .max(PERMISSIONS.length, 'Lista de permissoes invalida.'),
});
export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>;
