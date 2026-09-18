import { z } from 'zod';
import { LOCALES } from '@pos/shared';

const localeSchema = z.enum(LOCALES);

/** 4 to 6 digits - long enough to be unique per till, short enough to type fast. */
export const pinValue = z
  .string()
  .trim()
  .regex(/^\d{4,6}$/, 'O PIN deve ter 4 a 6 digitos.');

export const loginSchema = z.object({
  // Kept as typed so the route can still try the legacy mixed-case row; it is
  // lower-cased before every comparison and before being stored.
  email: z.string().trim().min(1, 'Email obrigatorio.').max(190).email('Email invalido.'),
  password: z.string().min(1, 'Palavra-passe obrigatoria.').max(200),
  entitySlug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .transform((value) => value.toLowerCase())
    .optional(),
});
export type LoginBody = z.infer<typeof loginSchema>;

export const pinLoginSchema = z.object({
  entityId: z.string().trim().min(1, 'Entidade obrigatoria.').max(64),
  pin: pinValue,
});
export type PinLoginBody = z.infer<typeof pinLoginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1, 'Token de renovacao obrigatorio.'),
});
export type RefreshBody = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(1).optional(),
});
export type LogoutBody = z.infer<typeof logoutSchema>;

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome demasiado curto.').max(120).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    locale: localeSchema.optional(),
    avatarUrl: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nada para actualizar.',
  });
export type UpdateMeBody = z.infer<typeof updateMeSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Palavra-passe actual obrigatoria.').max(200),
  newPassword: z
    .string()
    .min(8, 'A nova palavra-passe deve ter pelo menos 8 caracteres.')
    .max(200),
});
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;

export const setPinSchema = z.object({ pin: pinValue });
export type SetPinBody = z.infer<typeof setPinSchema>;
