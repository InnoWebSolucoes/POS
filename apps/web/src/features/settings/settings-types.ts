import type { EntityDto, EntitySettings } from '@pos/shared';

/**
 * Shapes the settings module returns that do not live in @pos/shared, plus the
 * draft model the tabbed screen edits against.
 *
 * The screen keeps TWO drafts, because the server keeps two records: the
 * Entity row (branding, currency, pricing mode) is patched through
 * /api/entities/:id, while everything key-by-key lives in the settings blob
 * patched through /api/settings.
 */

export interface SettingsResponse {
  entity: EntityDto;
  settings: EntitySettings;
}

export interface TaxRateRow {
  id: string;
  namePt: string;
  rateBps: number;
  isDefault: boolean;
  productCount: number;
}

export interface TaxRatesResponse {
  defaultTaxRateBps: number;
  rates: TaxRateRow[];
}

/** What PUT /api/settings/tax-rates accepts. */
export interface TaxRateInput {
  id: string;
  namePt: string;
  rateBps: number;
}

export interface ReceiptPreview {
  text: string;
  /** Character columns of the paper roll - 42 for 80mm. */
  width: number;
  lines: string[];
}

/** POST /api/uploads/logo */
export interface UploadedFile {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

export interface ImportTally {
  created: number;
  skipped: number;
}

export interface ImportSummary {
  categories: ImportTally;
  suppliers: ImportTally;
  products: ImportTally;
  variants: ImportTally;
  images: ImportTally;
  recipeComponents: ImportTally;
  customers: ImportTally;
  promotions: ImportTally;
  locations: ImportTally;
  settingsApplied: string[];
  taxRatesApplied: boolean;
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/* The entity half of the form                                                 */
/* -------------------------------------------------------------------------- */

/** Exactly the columns PATCH /api/entities/:id understands from this screen. */
export interface EntityDraft {
  name: string;
  nif: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  accentColor: string;
  currency: string;
  locale: EntityDto['locale'];
  pricingMode: EntityDto['pricingMode'];
  costingMethod: EntityDto['costingMethod'];
  defaultTaxRateBps: number;
}

export function entityToDraft(entity: EntityDto): EntityDraft {
  return {
    name: entity.name,
    nif: entity.nif ?? '',
    address: entity.address ?? '',
    phone: entity.phone ?? '',
    email: entity.email ?? '',
    logoUrl: entity.logoUrl ?? '',
    accentColor: entity.accentColor,
    currency: entity.currency,
    locale: entity.locale,
    pricingMode: entity.pricingMode,
    costingMethod: entity.costingMethod,
    defaultTaxRateBps: entity.defaultTaxRateBps,
  };
}

/** Empty text becomes null so the column never stores "". */
export function draftToEntityPatch(draft: EntityDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    nif: draft.nif.trim() || null,
    address: draft.address.trim() || null,
    phone: draft.phone.trim() || null,
    email: draft.email.trim() || null,
    logoUrl: draft.logoUrl.trim() || null,
    accentColor: draft.accentColor,
    currency: draft.currency,
    locale: draft.locale,
    pricingMode: draft.pricingMode,
    costingMethod: draft.costingMethod,
    defaultTaxRateBps: draft.defaultTaxRateBps,
  };
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

export const PRICING_MODE_LABELS: Record<EntityDto['pricingMode'], string> = {
  inclusive: 'Preco com imposto incluido',
  exclusive: 'Preco sem imposto',
};

export const PRICING_MODE_HINTS: Record<EntityDto['pricingMode'], string> = {
  inclusive:
    'O preco de venda ja contem o IVA; o imposto e extraido do total na venda.',
  exclusive: 'O preco de venda e sem IVA; o imposto e somado por cima no total.',
};

export const COSTING_METHOD_LABELS: Record<EntityDto['costingMethod'], string> = {
  weighted_average: 'Custo medio ponderado',
  fifo: 'FIFO (primeiro a entrar, primeiro a sair)',
};

export const COSTING_METHOD_HINTS: Record<EntityDto['costingMethod'], string> = {
  weighted_average: 'Cada entrada de stock recalcula a media do custo do produto.',
  fifo: 'O custo da venda segue a ordem de chegada dos lotes.',
};

export const LOCALE_LABELS: Record<EntityDto['locale'], string> = {
  'pt-PT': 'Portugues (Portugal)',
  en: 'English',
};

export const BEEP_SOUND_LABELS: Record<EntitySettings['beepSound'], string> = {
  classic: 'Classico',
  chime: 'Carrilhao',
  silent: 'Silencioso',
};

export const POS_THEME_LABELS: Record<EntitySettings['posTheme'], string> = {
  light: 'Claro',
  dark: 'Escuro',
  system: 'Como o sistema',
};

export const VALUE_KIND_LABELS: Record<string, string> = {
  weight_grams: 'Peso em gramas',
  weight_milli: 'Peso x1000 (milesimos)',
  price_minor: 'Preco em centimos',
  price_major_2dp: 'Preco com 2 decimais',
};
