import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type SaleChannel,
  type SaleStatus,
} from '@pos/shared';

/**
 * Display labels for the sale unions. pt-PT without accents, English behind the
 * locale toggle. Kept out of i18n.ts because that file is not ours to edit.
 */

export type UiLang = 'pt' | 'en';

export function langOf(locale: string | undefined): UiLang {
  return locale?.toLowerCase().startsWith('en') ? 'en' : 'pt';
}

const CHANNELS: Record<SaleChannel, Record<UiLang, string>> = {
  pos: { pt: 'Caixa', en: 'Register' },
  restaurant: { pt: 'Restaurante', en: 'Restaurant' },
  online: { pt: 'Online', en: 'Online' },
};

const STATUSES: Record<SaleStatus, Record<UiLang, string>> = {
  draft: { pt: 'Rascunho', en: 'Draft' },
  held: { pt: 'Suspensa', en: 'Held' },
  completed: { pt: 'Concluida', en: 'Completed' },
  refunded: { pt: 'Reembolsada', en: 'Refunded' },
  partially_refunded: { pt: 'Parcialmente reembolsada', en: 'Partially refunded' },
  voided: { pt: 'Anulada', en: 'Voided' },
};

const REFUND_METHODS: Record<string, Record<UiLang, string>> = {
  original: { pt: 'Metodo original', en: 'Original method' },
  store_credit: { pt: 'Credito de loja', en: 'Store credit' },
  cash: { pt: 'Numerario', en: 'Cash' },
};

/** Free text on the wire, but the POS writes these codes. */
const REFUND_REASONS: Record<string, Record<UiLang, string>> = {
  damaged: { pt: 'Danificado', en: 'Damaged' },
  defective: { pt: 'Defeituoso', en: 'Defective' },
  expired: { pt: 'Expirado', en: 'Expired' },
  wrong_item: { pt: 'Artigo errado', en: 'Wrong item' },
  customer_changed_mind: { pt: 'Cliente desistiu', en: 'Changed mind' },
  other: { pt: 'Outro', en: 'Other' },
};

export function channelLabel(channel: SaleChannel, lang: UiLang): string {
  return CHANNELS[channel]?.[lang] ?? channel;
}

export function statusLabel(status: SaleStatus, lang: UiLang): string {
  return STATUSES[status]?.[lang] ?? status;
}

export function paymentMethodLabel(method: PaymentMethod | string, lang: UiLang): string {
  const entry = PAYMENT_METHOD_LABELS[method as PaymentMethod];
  return entry ? entry[lang] : String(method);
}

export function refundMethodLabel(method: string, lang: UiLang): string {
  return REFUND_METHODS[method]?.[lang] ?? method;
}

export function refundReasonLabel(reason: string, lang: UiLang): string {
  return REFUND_REASONS[reason]?.[lang] ?? reason;
}

export type SaleBadgeTone = 'success' | 'warning' | 'destructive' | 'muted' | 'secondary';

export const STATUS_TONE: Record<SaleStatus, SaleBadgeTone> = {
  draft: 'muted',
  held: 'secondary',
  completed: 'success',
  refunded: 'destructive',
  partially_refunded: 'warning',
  voided: 'destructive',
};
