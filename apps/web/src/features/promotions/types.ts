/**
 * The promotions wire shapes.
 *
 * @pos/shared carries no PromotionDto, so this mirrors the API module's own
 * contract in apps/api/src/modules/promotions/mappers.ts exactly: BigInt as
 * Number, dates as ISO strings, the product scope as a real array.
 *
 * Money is MINOR units. A percent_off `value` is BASIS POINTS.
 */
import { bpsToPct, pctToBps, type PromotionType } from '@pos/shared';

export interface PromotionDto {
  id: string;
  code: string;
  namePt: string;
  nameEn: string | null;
  type: PromotionType;
  /** Basis points for percent_off, minor units for fixed_off, unused for buy_x_get_y. */
  value: number;
  categoryId: string | null;
  categoryName: string | null;
  productIds: string[];
  buyQuantity: number | null;
  getQuantity: number | null;
  minSpendMinor: number;
  usageLimit: number | null;
  usageCount: number;
  usageRemaining: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  /** The server's own "live right now" verdict, computed at request time. */
  running: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionSummaryDto {
  id: string;
  code: string;
  namePt: string;
  nameEn: string | null;
  type: PromotionType;
  value: number;
  minSpendMinor: number;
  buyQuantity: number | null;
  getQuantity: number | null;
}

export interface PromotionAffectedLine {
  productId: string;
  discountMinor: number;
}

/** What POST /api/promotions/validate answers. */
export interface PromotionEvaluationDto {
  valid: boolean;
  /** Already European Portuguese, straight from the server. */
  reason?: string;
  promotion?: PromotionSummaryDto;
  discountMinor: number;
  affectedLines: PromotionAffectedLine[];
}

export interface PromotionPayload {
  code: string;
  namePt: string;
  nameEn: string | null;
  type: PromotionType;
  value: number;
  categoryId: string | null;
  productIds: string[];
  buyQuantity: number | null;
  getQuantity: number | null;
  minSpendMinor: number;
  usageLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  percent_off: 'Percentagem',
  fixed_off: 'Valor fixo',
  buy_x_get_y: 'Leve X pague Y',
};

export const PROMOTION_TYPE_HINTS: Record<PromotionType, string> = {
  percent_off: 'Desconta uma percentagem do valor abrangido.',
  fixed_off: 'Desconta um valor fixo em kwanzas.',
  buy_x_get_y: 'Oferece unidades a cada grupo comprado.',
};

/** Where the discount lands. */
export type PromotionScope = 'basket' | 'category' | 'products';

export const SCOPE_LABELS: Record<PromotionScope, string> = {
  basket: 'Todo o cesto',
  category: 'Uma categoria',
  products: 'Produtos especificos',
};

/** The window state a poster needs to be honest about. */
export type PromotionState = 'running' | 'scheduled' | 'expired' | 'exhausted' | 'inactive';

export const STATE_LABELS: Record<PromotionState, string> = {
  running: 'Activa agora',
  scheduled: 'Agendada',
  expired: 'Expirada',
  exhausted: 'Limite atingido',
  inactive: 'Inactiva',
};

export const STATE_VARIANTS: Record<PromotionState, 'success' | 'warning' | 'muted' | 'destructive'> = {
  running: 'success',
  scheduled: 'warning',
  expired: 'muted',
  exhausted: 'destructive',
  inactive: 'muted',
};

/**
 * Mirrors the server's isRunning(), so the badge never contradicts the register.
 * The DTO's `running` is only true as of the response; this recomputes it as the
 * clock moves past a window boundary.
 */
export function promotionState(promotion: PromotionDto, now: number = Date.now()): PromotionState {
  if (!promotion.active) return 'inactive';
  if (promotion.startsAt && new Date(promotion.startsAt).getTime() > now) return 'scheduled';
  if (promotion.endsAt && new Date(promotion.endsAt).getTime() < now) return 'expired';
  if (promotion.usageLimit !== null && promotion.usageCount >= promotion.usageLimit) return 'exhausted';
  return 'running';
}

/** "Leve 3 pague 2" - the customer takes buy + get and pays for buy. */
export function buyGetLabel(buyQuantity: number | null, getQuantity: number | null): string {
  const buy = buyQuantity ?? 0;
  const get = getQuantity ?? 0;
  if (buy < 1 || get < 1) return 'Por configurar';
  return `Leve ${buy + get} pague ${buy}`;
}

export function scopeOf(promotion: PromotionDto): PromotionScope {
  if (promotion.productIds.length > 0) return 'products';
  if (promotion.categoryId) return 'category';
  return 'basket';
}

/* -------------------------------------------------------------------------- */
/* Local datetime <-> ISO                                                      */
/* -------------------------------------------------------------------------- */

const pad = (value: number): string => String(value).padStart(2, '0');

/** ISO -> the "2026-09-18T08:00" a datetime-local input expects, in local time. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/* -------------------------------------------------------------------------- */
/* The form                                                                    */
/* -------------------------------------------------------------------------- */

export interface PromotionFormValues {
  code: string;
  namePt: string;
  nameEn: string;
  type: PromotionType;
  /** Whole percent as typed by a human; converted to bps on submit. */
  percent: number;
  /** Minor units, straight out of MoneyInput. */
  fixedMinor: number;
  buyQuantity: number;
  getQuantity: number;
  scope: PromotionScope;
  categoryId: string;
  productIds: string[];
  minSpendMinor: number;
  limitUsage: boolean;
  usageLimit: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

export function emptyPromotionForm(): PromotionFormValues {
  return {
    code: '',
    namePt: '',
    nameEn: '',
    type: 'percent_off',
    percent: 10,
    fixedMinor: 0,
    buyQuantity: 2,
    getQuantity: 1,
    scope: 'basket',
    categoryId: '',
    productIds: [],
    minSpendMinor: 0,
    limitUsage: false,
    usageLimit: 100,
    startsAt: '',
    endsAt: '',
    active: true,
  };
}

export function promotionToForm(promotion: PromotionDto): PromotionFormValues {
  const base = emptyPromotionForm();
  return {
    ...base,
    code: promotion.code,
    namePt: promotion.namePt,
    nameEn: promotion.nameEn ?? '',
    type: promotion.type,
    percent: promotion.type === 'percent_off' ? bpsToPct(promotion.value) : base.percent,
    fixedMinor: promotion.type === 'fixed_off' ? promotion.value : base.fixedMinor,
    buyQuantity: promotion.buyQuantity ?? base.buyQuantity,
    getQuantity: promotion.getQuantity ?? base.getQuantity,
    scope: scopeOf(promotion),
    categoryId: promotion.categoryId ?? '',
    productIds: [...promotion.productIds],
    minSpendMinor: promotion.minSpendMinor,
    limitUsage: promotion.usageLimit !== null,
    usageLimit: promotion.usageLimit ?? base.usageLimit,
    startsAt: isoToLocalInput(promotion.startsAt),
    endsAt: isoToLocalInput(promotion.endsAt),
    active: promotion.active,
  };
}

export function formToPayload(values: PromotionFormValues): PromotionPayload {
  const buyXGetY = values.type === 'buy_x_get_y';
  const value =
    values.type === 'percent_off'
      ? pctToBps(values.percent)
      : values.type === 'fixed_off'
        ? Math.round(values.fixedMinor)
        : 0;

  return {
    code: values.code.trim().toUpperCase(),
    namePt: values.namePt.trim(),
    nameEn: values.nameEn.trim() ? values.nameEn.trim() : null,
    type: values.type,
    value,
    categoryId: values.scope === 'category' ? values.categoryId || null : null,
    productIds: values.scope === 'products' ? values.productIds : [],
    buyQuantity: buyXGetY ? Math.round(values.buyQuantity) : null,
    getQuantity: buyXGetY ? Math.round(values.getQuantity) : null,
    minSpendMinor: Math.round(values.minSpendMinor),
    usageLimit: values.limitUsage ? Math.round(values.usageLimit) : null,
    startsAt: localInputToIso(values.startsAt),
    endsAt: localInputToIso(values.endsAt),
    active: values.active,
  };
}

export type PromotionFormErrors = Partial<Record<keyof PromotionFormValues, string>>;

/** The same rules the API enforces, said in Portuguese before the round trip. */
export function validatePromotionForm(values: PromotionFormValues): PromotionFormErrors {
  const errors: PromotionFormErrors = {};

  const code = values.code.trim();
  if (code.length < 2) errors.code = 'Codigo demasiado curto.';
  else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(code)) {
    errors.code = 'Use apenas letras, numeros, ponto, hifen ou underscore.';
  }

  if (!values.namePt.trim()) errors.namePt = 'Nome obrigatorio.';

  if (values.type === 'percent_off') {
    const bps = pctToBps(values.percent);
    if (bps < 1 || bps > 10_000) errors.percent = 'A percentagem tem de estar entre 0,01% e 100%.';
  }

  if (values.type === 'fixed_off' && Math.round(values.fixedMinor) < 1) {
    errors.fixedMinor = 'O desconto fixo tem de ser superior a zero.';
  }

  if (values.type === 'buy_x_get_y') {
    if (!values.buyQuantity || values.buyQuantity < 1) errors.buyQuantity = 'Indique quantas unidades sao compradas.';
    if (!values.getQuantity || values.getQuantity < 1) errors.getQuantity = 'Indique quantas unidades sao oferecidas.';
  }

  if (values.scope === 'category' && !values.categoryId) errors.categoryId = 'Escolha uma categoria.';
  if (values.scope === 'products' && values.productIds.length === 0) {
    errors.productIds = 'Escolha pelo menos um produto.';
  }

  if (values.limitUsage && (!values.usageLimit || values.usageLimit < 1)) {
    errors.usageLimit = 'O limite tem de ser pelo menos 1.';
  }

  const start = localInputToIso(values.startsAt);
  const end = localInputToIso(values.endsAt);
  if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
    errors.endsAt = 'A data de fim tem de ser posterior a data de inicio.';
  }

  return errors;
}
