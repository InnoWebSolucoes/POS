import { z } from 'zod';
import {
  ENTITY_MODES,
  LOCALES,
  type AuthResponse,
  type EntityMode,
} from '@pos/shared';
import { hashPassword } from '../../lib/auth.js';
import { ApiError } from '../../lib/http.js';
import { prisma, TX_OPTIONS, type Tx } from '../../lib/prisma.js';
import { setSettings } from '../../lib/settings.js';
import { uniqueSlug } from '../entities/service.js';
import { AUTH_USER_SELECT, ENTITY_SELECT, toAuthUser, toEntityDto } from './mappers.js';
import { issueSession } from './service.js';

/**
 * Self-service sign-up.
 *
 * This is how a business gets onto the platform: they pick what kind of
 * business they run, and that single choice shapes the whole product they
 * land in - which dashboard, which navigation, which workflows. Nobody has to
 * provision them by hand, and the platform operator never touches their data
 * to get them started.
 *
 * It is the only public route in the system that writes, so it is deliberately
 * strict about what it accepts and careful about what it leaks.
 */

export const registerSchema = z.object({
  /** The business, not the person. */
  businessName: z.string().trim().min(2, 'Nome do negocio demasiado curto.').max(120),
  mode: z.enum(ENTITY_MODES),

  ownerName: z.string().trim().min(2, 'Nome demasiado curto.').max(120),
  email: z.string().trim().toLowerCase().email('Email invalido.').max(160),
  password: z
    .string()
    .min(8, 'A palavra-passe deve ter pelo menos 8 caracteres.')
    .max(128),

  phone: z.string().trim().max(40).optional(),
  nif: z.string().trim().max(40).optional(),
  currency: z.string().trim().length(3).toUpperCase().default('AOA'),
  locale: z.enum(LOCALES).default('pt-PT'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** The starting shape of each business type. */
const MODE_DEFAULTS: Record<
  EntityMode,
  { locationName: string; accentColor: string; serviceChargeBps: number }
> = {
  retail: { locationName: 'Loja Principal', accentColor: '#006AFF', serviceChargeBps: 0 },
  restaurant: { locationName: 'Sala Principal', accentColor: '#E0364A', serviceChargeBps: 0 },
  online: { locationName: 'Armazem', accentColor: '#0E9F9F', serviceChargeBps: 0 },
};

/**
 * Creates the business, its first location and its owner account in one
 * transaction, then signs the owner in. A half-created tenant - an entity with
 * no way to log into it - would be worse than a failed sign-up.
 */
export async function registerBusiness(
  input: RegisterInput,
  meta: { userAgent?: string | null } = {},
): Promise<AuthResponse> {
  const email = input.email.trim().toLowerCase();

  // Checked up front for a clean message; the unique index is the real guard.
  const taken = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  if (taken) {
    throw ApiError.conflict('Ja existe uma conta com este email.');
  }

  const defaults = MODE_DEFAULTS[input.mode];

  const { entityId, userId } = await prisma.$transaction(async (tx: Tx) => {
    const slug = await uniqueSlug(tx, input.businessName);

    const entity = await tx.entity.create({
      data: {
        name: input.businessName,
        slug,
        mode: input.mode,
        nif: input.nif || null,
        phone: input.phone || null,
        email,
        currency: input.currency,
        locale: input.locale,
        accentColor: defaults.accentColor,
        pricingMode: 'inclusive',
        costingMethod: 'weighted_average',
        defaultTaxRateBps: 1400,
      },
      select: { id: true },
    });

    await tx.location.create({
      data: {
        entityId: entity.id,
        name: defaults.locationName,
        isDefault: true,
      },
    });

    const user = await tx.user.create({
      data: {
        entityId: entity.id,
        name: input.ownerName,
        email,
        passwordHash: await hashPassword(input.password),
        // The person who signs the business up owns it.
        role: 'entity_admin',
        locale: input.locale,
      },
      select: { id: true },
    });

    return { entityId: entity.id, userId: user.id };
  }, TX_OPTIONS);

  // Settings live in their own rows and are not worth failing the sign-up over.
  await setSettings(entityId, {
    serviceChargeBps: defaults.serviceChargeBps,
    tipsEnabled: input.mode === 'restaurant',
    posTheme: input.mode === 'restaurant' ? 'light' : 'dark',
  }).catch(() => undefined);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: AUTH_USER_SELECT,
  });
  const entity = await prisma.entity.findUniqueOrThrow({
    where: { id: entityId },
    select: ENTITY_SELECT,
  });

  const tokens = await issueSession(
    prisma,
    { id: user.id, role: 'entity_admin', entityId, locationId: user.locationId ?? null },
    meta.userAgent ?? null,
  );

  return {
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    user: toAuthUser(user),
    entity: toEntityDto(entity),
  };
}

/** Free-text availability check for the sign-up form. */
export async function emailAvailable(email: string): Promise<boolean> {
  const existing = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  return !existing;
}
