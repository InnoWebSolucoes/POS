import type { CostingMethod, EntityMode, Locale, PricingMode } from '@pos/shared';

/**
 * Tenancy administration: the list filters, the per-tenant stat tiles and the
 * provisioning wizard's form model.
 */

export interface EntityStats {
  entityId: string;
  productCount: number;
  userCount: number;
  locationCount: number;
  /** Null for a role without financial visibility - never assume a number. */
  todayRevenueMinor: number | null;
  todaySaleCount: number;
  openOrderCount: number;
}

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
  restaurant: 'Restaurante',
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

/* -------------------------------------------------------------------------- */
/* Wizard                                                                      */
/* -------------------------------------------------------------------------- */

export interface EntityWizardValues {
  name: string;
  nif: string;
  address: string;
  phone: string;
  email: string;
  locationName: string;

  mode: EntityMode;

  currency: string;
  locale: Locale;
  pricingMode: PricingMode;
  costingMethod: CostingMethod;
  defaultTaxRateBps: number;
  accentColor: string;

  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export const emptyWizard = (): EntityWizardValues => ({
  name: '',
  nif: '',
  address: '',
  phone: '',
  email: '',
  locationName: 'Loja Principal',

  mode: 'retail',

  currency: 'AOA',
  locale: 'pt-PT',
  pricingMode: 'inclusive',
  costingMethod: 'weighted_average',
  defaultTaxRateBps: 1400,
  accentColor: '#006AFF',

  adminName: '',
  adminEmail: '',
  adminPassword: '',
});

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
    locationName: values.locationName.trim() || 'Loja Principal',
  };

  // The admin trio travels together or not at all - the API rejects a half pair.
  if (values.adminEmail.trim() && values.adminPassword) {
    payload.adminName = values.adminName.trim() || values.name.trim();
    payload.adminEmail = values.adminEmail.trim();
    payload.adminPassword = values.adminPassword;
  }

  return payload;
}
