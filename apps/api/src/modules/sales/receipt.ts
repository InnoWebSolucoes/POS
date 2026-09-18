import {
  PAYMENT_METHOD_LABELS,
  UNIT_LABELS,
  formatBps,
  formatMoney,
  type EntitySettings,
  type PaymentMethod,
  type Unit,
} from '@pos/shared';
import { toCartModifiers, toTaxBreakdown, type SaleRow } from './mappers.js';

/**
 * Plain-text receipt rendering, sized for a 42-column thermal printer. This is
 * also what gets pushed into the WhatsApp deep link, so it must stay readable
 * as a chat message.
 */

const WIDTH = 42;

function rule(char = '-'): string {
  return char.repeat(WIDTH);
}

function center(text: string): string {
  const trimmed = text.slice(0, WIDTH);
  const pad = Math.max(0, Math.floor((WIDTH - trimmed.length) / 2));
  return ' '.repeat(pad) + trimmed;
}

/** Label on the left, amount right-aligned; wraps the label when it is long. */
function pair(label: string, value: string, indent = 0): string {
  const prefix = ' '.repeat(indent);
  const room = WIDTH - value.length - prefix.length - 1;
  const left = label.length > room ? `${label.slice(0, Math.max(0, room - 1))}…` : label;
  const gap = Math.max(1, WIDTH - prefix.length - left.length - value.length);
  return prefix + left + ' '.repeat(gap) + value;
}

function wrap(text: string, indent = 0): string[] {
  const room = WIDTH - indent;
  const words = String(text).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current.length) current = word;
    else if (current.length + 1 + word.length <= room) current += ` ${word}`;
    else {
      out.push(' '.repeat(indent) + current);
      current = word;
    }
  }
  if (current.length) out.push(' '.repeat(indent) + current);
  return out.length ? out : [''];
}

function formatQuantity(quantity: number, unit: string): string {
  const label = UNIT_LABELS[unit as Unit]?.short ?? unit;
  const body = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
  return `${body} ${label}`;
}

function formatDateTime(value: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value);
  } catch {
    return value.toISOString().slice(0, 16).replace('T', ' ');
  }
}

export interface ReceiptEntity {
  name: string;
  nif: string | null;
  address: string | null;
  phone: string | null;
  currency: string;
  locale: string;
  pricingMode: string;
}

export interface RenderReceiptParams {
  entity: ReceiptEntity;
  sale: SaleRow;
  settings: Pick<EntitySettings, 'receiptHeader' | 'receiptFooter'>;
  customerName?: string | null;
  customerNif?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  completed: '',
  refunded: '*** DOCUMENTO DEVOLVIDO ***',
  partially_refunded: '*** DEVOLUCAO PARCIAL ***',
  voided: '*** DOCUMENTO ANULADO ***',
  held: '*** VENDA SUSPENSA - NAO E RECIBO ***',
  draft: '*** RASCUNHO ***',
};

export function renderReceipt(params: RenderReceiptParams): string {
  const { entity, sale, settings } = params;
  const currency = entity.currency || 'AOA';
  const locale = entity.locale || 'pt-PT';
  const money = (value: number | bigint) => formatMoney(value, { currency, locale });

  const out: string[] = [];

  if (settings.receiptHeader?.trim()) {
    for (const row of settings.receiptHeader.split('\n')) out.push(center(row.trim()));
  }
  out.push(center(entity.name.toUpperCase()));
  if (entity.nif) out.push(center(`NIF: ${entity.nif}`));
  if (entity.address) for (const row of wrap(entity.address)) out.push(center(row.trim()));
  if (entity.phone) out.push(center(`Tel: ${entity.phone}`));
  out.push(rule('='));

  const statusLabel = STATUS_LABELS[sale.status] ?? '';
  if (statusLabel) {
    out.push(center(statusLabel));
    out.push(rule());
  }

  out.push(pair('Documento', sale.receiptNumber));
  out.push(pair('Data', formatDateTime(sale.completedAt ?? sale.createdAt, locale)));
  if (sale.cashierName) out.push(pair('Operador', sale.cashierName));
  const customerName = params.customerName ?? sale.customer?.name ?? null;
  if (customerName) out.push(pair('Cliente', customerName));
  if (params.customerNif) out.push(pair('NIF cliente', params.customerNif));
  out.push(rule());

  for (const line of sale.lines ?? []) {
    out.push(...wrap(line.name));
    const unitPrice = Number(line.unitPriceMinor);
    const qtyLabel = `${formatQuantity(line.quantity, line.unit)} x ${money(unitPrice)}`;
    out.push(pair(qtyLabel, money(Number(line.totalMinor)), 2));

    for (const modifier of toCartModifiers(line.modifiers)) {
      const delta = Number(modifier.priceDeltaMinor ?? 0);
      out.push(pair(`+ ${modifier.name}`, delta ? money(delta) : '', 4));
    }
    if (Number(line.discountMinor) > 0) {
      out.push(pair('Desconto', `-${money(Number(line.discountMinor))}`, 4));
    }
    if (line.note) out.push(...wrap(`Obs: ${line.note}`, 4));
    if (line.refundedQuantity > 0) {
      out.push(pair('Devolvido', formatQuantity(line.refundedQuantity, line.unit), 4));
    }
  }

  out.push(rule());
  out.push(pair('Subtotal', money(Number(sale.subtotalMinor))));
  if (Number(sale.discountMinor) > 0) {
    const label = sale.promotionCode ? `Desconto (${sale.promotionCode})` : 'Desconto';
    out.push(pair(label, `-${money(Number(sale.discountMinor))}`));
  }

  const breakdown = toTaxBreakdown(sale.taxBreakdown);
  const inclusive = entity.pricingMode === 'inclusive';
  if (breakdown.length) {
    out.push(pair('Incidencia', inclusive ? 'IVA incluido' : 'IVA a acrescer'));
    for (const row of breakdown) {
      out.push(pair(`  Base ${formatBps(row.rateBps, locale)}`, money(row.netMinor)));
      out.push(pair(`  IVA ${formatBps(row.rateBps, locale)}`, money(row.taxMinor)));
    }
  } else {
    out.push(pair('IVA', money(Number(sale.taxMinor))));
  }

  if (Number(sale.tipMinor) > 0) out.push(pair('Gorjeta', money(Number(sale.tipMinor))));
  out.push(rule('='));
  out.push(pair('TOTAL', money(Number(sale.totalMinor) + Number(sale.tipMinor))));
  out.push(rule('='));

  const payments = sale.payments ?? [];
  if (payments.length) {
    out.push('PAGAMENTO');
    for (const payment of payments) {
      const label =
        payment.label ??
        PAYMENT_METHOD_LABELS[payment.method as PaymentMethod]?.pt ??
        payment.method;
      out.push(pair(label, money(Number(payment.amountMinor))));
      if (payment.tenderedMinor != null) {
        out.push(pair('Entregue', money(Number(payment.tenderedMinor)), 2));
      }
      if (payment.changeMinor != null && Number(payment.changeMinor) > 0) {
        out.push(pair('Troco', money(Number(payment.changeMinor)), 2));
      }
      if (payment.reference) out.push(pair('Ref.', payment.reference, 2));
    }
    if (Number(sale.changeMinor) > 0) {
      out.push(pair('TROCO TOTAL', money(Number(sale.changeMinor))));
    }
    out.push(rule());
  }

  if (sale.note) {
    out.push(...wrap(sale.note));
    out.push(rule());
  }

  if (settings.receiptFooter?.trim()) {
    for (const row of settings.receiptFooter.split('\n')) out.push(center(row.trim()));
  }
  out.push(center('Processado por POS'));

  return out.join('\n');
}

/** wa.me deep link carrying the rendered receipt as the pre-filled message. */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  const encoded = encodeURIComponent(text);
  return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}
