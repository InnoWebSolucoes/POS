import { Globe, ShoppingCart, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { CostingMethod, EntityMode, Locale, PricingMode } from '@pos/shared';

export interface EntityListParams {
  page: number;
  pageSize: number;
  search: string;
  active: 'all' | 'true' | 'false';
}

export const defaultEntityListParams = (): EntityListParams => ({
  page: 1,
  pageSize: 25,
  search: '',
  active: 'all',
});

/* -------------------------------------------------------------------------- */
/* Modes                                                                       */
/* -------------------------------------------------------------------------- */

export const MODE_LABELS: Record<EntityMode, string> = {
  retail: 'Retalho',
  restaurant: 'Restauracao',
  online: 'Loja online',
};

/** One line each, because the mode decides which screens even exist. */
export const MODE_HINTS: Record<EntityMode, string> = {
  retail: 'Caixa com leitor de codigos, stock por artigo e talao de venda.',
  restaurant: 'Plano de sala, pedidos por mesa, ecra de cozinha e conta a fechar.',
  online: 'Montra publica, carrinho e encomendas com entrega ou levantamento.',
};

export const MODE_VARIANTS: Record<EntityMode, 'default' | 'secondary' | 'outline'> = {
  retail: 'default',
  restaurant: 'secondary',
  online: 'outline',
};

/**
 * The three choice cards, written to match the ones a client sees at /registar.
 *
 * This is the decision that shapes everything that follows - which dashboard,
 * which navigation, which workflows exist at all - so the card says plainly
 * what picking it turns on instead of leaving the operator to guess from a
 * label. Kept here rather than imported from the sign-up screen so the console
 * can word things for an operator without dragging the public page along.
 */
export interface ModeOption {
  mode: EntityMode;
  icon: LucideIcon;
  title: string;
  tagline: string;
  /** What choosing this actually switches on. */
  features: readonly string[];
}

export const MODE_OPTIONS: readonly ModeOption[] = [
  {
    mode: 'retail',
    icon: ShoppingCart,
    title: 'Retalho / Supermercado',
    tagline: 'Balcao de venda rapida com leitor de codigo de barras',
    features: [
      'Caixa com leitura de codigos de barras e som de confirmacao',
      'Produtos ao peso (fruta, talho) com grelha visual',
      'Gestao de stock, entradas e inventario',
      'Relatorios de margem e lucro',
    ],
  },
  {
    mode: 'restaurant',
    icon: UtensilsCrossed,
    title: 'Restaurante / Bar',
    tagline: 'Mesas, pedidos e ecra de cozinha',
    features: [
      'Plano de sala com mesas e estados em tempo real',
      'Ementa com opcoes, extras e pratos por tempos',
      'Ecra de cozinha (KDS) por posto de preparacao',
      'Divisao de conta e gorjetas',
    ],
  },
  {
    mode: 'online',
    icon: Globe,
    title: 'Loja Online',
    tagline: 'Montra publica com carrinho e encomendas',
    features: [
      'Loja publica com catalogo e carrinho',
      'Checkout com entrega ou recolha na loja',
      'Gestao de encomendas e expedicao',
      'Stock sincronizado com a loja fisica',
    ],
  },
];

/** What the starter catalogue puts in a brand new business of each kind. */
export const MODE_STARTER_HINTS: Record<EntityMode, string> = {
  retail: '4 categorias e 12 produtos com codigo de barras e stock inicial.',
  restaurant: '4 categorias, 12 pratos, um grupo de opcoes e uma sala com 8 mesas.',
  online: '3 categorias e 10 produtos ja publicados na montra.',
};

/* -------------------------------------------------------------------------- */
/* Defaults that follow the mode                                               */
/* -------------------------------------------------------------------------- */

interface ModeDefaults {
  locationName: string;
  accentColor: string;
}

/** Mirrors what self-service sign-up gives a business of each kind. */
export const MODE_DEFAULTS: Record<EntityMode, ModeDefaults> = {
  retail: { locationName: 'Loja Principal', accentColor: '#006AFF' },
  restaurant: { locationName: 'Sala Principal', accentColor: '#E0364A' },
  online: { locationName: 'Armazem', accentColor: '#0E9F9F' },
};

/* -------------------------------------------------------------------------- */
/* Wizard                                                                      */
/* -------------------------------------------------------------------------- */

export interface EntityWizardValues {
  mode: EntityMode;

  name: string;
  nif: string;
  address: string;
  phone: string;
  email: string;
  locationName: string;

  currency: string;
  locale: Locale;
  pricingMode: PricingMode;
  costingMethod: CostingMethod;
  defaultTaxRateBps: number;
  accentColor: string;

  adminName: string;
  adminEmail: string;
  adminPassword: string;

  /** Seed the mode's example catalogue right after creating the business. */
  starterContent: boolean;
}

export const emptyWizard = (): EntityWizardValues => ({
  mode: 'retail',

  name: '',
  nif: '',
  address: '',
  phone: '',
  email: '',
  locationName: MODE_DEFAULTS.retail.locationName,

  currency: 'AOA',
  locale: 'pt-PT',
  pricingMode: 'inclusive',
  costingMethod: 'weighted_average',
  defaultTaxRateBps: 1400,
  accentColor: MODE_DEFAULTS.retail.accentColor,

  adminName: '',
  adminEmail: '',
  adminPassword: '',

  starterContent: true,
});

/**
 * Switching business type moves the fields that only ever had a default because
 * of the previous type - a restaurant's first "location" is a room, not a shop.
 * Anything the operator has actually typed is left exactly as they left it.
 */
export function applyModeDefaults(
  values: EntityWizardValues,
  mode: EntityMode,
): EntityWizardValues {
  const previous = MODE_DEFAULTS[values.mode];
  const next = MODE_DEFAULTS[mode];

  return {
    ...values,
    mode,
    locationName:
      values.locationName === previous.locationName ? next.locationName : values.locationName,
    accentColor:
      values.accentColor.toUpperCase() === previous.accentColor.toUpperCase()
        ? next.accentColor
        : values.accentColor,
  };
}

/** Shapes the payload POST /api/entities expects, dropping blanks. */
export function wizardToPayload(values: EntityWizardValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: values.name.trim(),
    mode: values.mode,
    nif: values.nif.trim() || null,
    address: values.address.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    currency: values.currency,
    locale: values.locale,
    pricingMode: values.pricingMode,
    costingMethod: values.costingMethod,
    defaultTaxRateBps: values.defaultTaxRateBps,
    accentColor: values.accentColor,
    locationName: values.locationName.trim() || MODE_DEFAULTS[values.mode].locationName,
  };

  // The admin trio travels together or not at all - the API rejects a half pair.
  if (values.adminEmail.trim() && values.adminPassword) {
    payload.adminName = values.adminName.trim() || values.name.trim();
    payload.adminEmail = values.adminEmail.trim();
    payload.adminPassword = values.adminPassword;
  }

  return payload;
}

/* -------------------------------------------------------------------------- */
/* Handover                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What the operator hands to the new client, held only for as long as the
 * handover panel is open. The password is never stored, never logged and never
 * sent back by the API, so this object is the single moment it can be read.
 */
export interface Handover {
  entityId: string;
  businessName: string;
  slug: string;
  mode: EntityMode;
  loginUrl: string;
  adminEmail: string;
  adminPassword: string;
  starterContent: boolean;
}

export function handoverText(handover: Handover): string {
  return [
    `Negocio: ${handover.businessName}`,
    `Endereco: ${handover.loginUrl}`,
    `Email: ${handover.adminEmail}`,
    `Palavra-passe: ${handover.adminPassword}`,
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/* Password generation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Readable over the phone, strong enough to hand over.
 *
 * Two ordinary words, a two-digit number and one symbol: fourteen-odd
 * characters with mixed case, digits and punctuation, but nothing an operator
 * has to spell out letter by letter. No look-alike characters (l/1, O/0) get in
 * because the alphabet is words, not noise.
 */
const PASSWORD_WORDS = [
  'Bairro', 'Cacimbo', 'Chuva', 'Costa', 'Ferro', 'Fogo', 'Folha', 'Forte',
  'Girassol', 'Ilha', 'Janela', 'Kwanza', 'Lenha', 'Leste', 'Marfim', 'Mesa',
  'Muxima', 'Norte', 'Palanca', 'Palmeira', 'Pedra', 'Ponte', 'Praia', 'Quintal',
  'Rocha', 'Serra', 'Sumbe', 'Vento', 'Verde', 'Zambeze',
] as const;

const PASSWORD_SYMBOLS = '!#$%&*?' as const;

function randomInt(max: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  // Rejection-free is not worth it here; the bias at these sizes is negligible.
  return (buffer[0] ?? 0) % max;
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(items.length)] as T;
}

export function generatePassword(): string {
  const first = pick(PASSWORD_WORDS);
  let second = pick(PASSWORD_WORDS);
  while (second === first) second = pick(PASSWORD_WORDS);

  const digits = String(10 + randomInt(90));
  const symbol = PASSWORD_SYMBOLS[randomInt(PASSWORD_SYMBOLS.length)] ?? '!';

  return `${first}-${second}${digits}${symbol}`;
}
