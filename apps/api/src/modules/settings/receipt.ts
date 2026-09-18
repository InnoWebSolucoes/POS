import {
  applyBps,
  computeSale,
  formatBps,
  formatMoney,
  suggestTenders,
  type EntityDto,
  type EntitySettings,
  type LineInput,
} from '@pos/shared';

/**
 * Plain-text receipt renderer.
 *
 * Thermal printers are column devices: 42 characters is the usual width of an
 * 80mm roll at font A. Rendering to text (rather than to a canvas) means the
 * settings screen can show exactly what the printer will emit, and the same
 * function can later feed an ESC/POS driver.
 */
export const RECEIPT_WIDTH = 42;

export interface ReceiptLine {
  name: string;
  quantity: number;
  unit: string;
  unitPriceMinor: number;
  taxRateBps: number;
  discountBps?: number;
}

export interface ReceiptContext {
  receiptNumber: string;
  issuedAt: Date;
  cashierName: string;
  customerName?: string | null;
  locationName?: string | null;
  lines: ReceiptLine[];
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
}

function center(text: string, width = RECEIPT_WIDTH): string {
  const trimmed = text.length > width ? text.slice(0, width) : text;
  const left = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return ' '.repeat(left) + trimmed;
}

function rule(char = '-', width = RECEIPT_WIDTH): string {
  return char.repeat(width);
}

/** Left label, right value, dots of space between. */
function row(left: string, right: string, width = RECEIPT_WIDTH): string {
  const space = Math.max(1, width - left.length - right.length);
  if (space === 1 && left.length + right.length + 1 > width) {
    return `${left.slice(0, Math.max(0, width - right.length - 1))} ${right}`;
  }
  return left + ' '.repeat(space) + right;
}

function wrap(text: string, width = RECEIPT_WIDTH): string[] {
  const out: string[] = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    if (paragraph.trim() === '') {
      out.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      if (current === '') {
        current = word.slice(0, width);
      } else if (current.length + 1 + word.length <= width) {
        current += ` ${word}`;
      } else {
        out.push(current);
        current = word.slice(0, width);
      }
    }
    if (current) out.push(current);
  }
  return out;
}

/** 1 -> "1", 1.35 -> "1,35" (pt-PT decimal comma, kept ASCII). */
function formatQuantity(quantity: number): string {
  const rounded = Math.round(quantity * 1000) / 1000;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, '');
  return text.replace('.', ',');
}

function formatDateTime(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()} ${p(
    date.getHours(),
  )}:${p(date.getMinutes())}`;
}

/** The basket the preview prints - representative of a mixed retail sale. */
export function sampleReceiptContext(defaultTaxRateBps: number): ReceiptContext {
  return {
    receiptNumber: 'FR2026/000123',
    issuedAt: new Date(),
    cashierName: 'Maria Antonio',
    customerName: 'Cliente Exemplo',
    locationName: 'Loja Principal',
    lines: [
      {
        name: 'Agua Mineral 1,5L',
        quantity: 2,
        unit: 'un',
        unitPriceMinor: 45_000,
        taxRateBps: defaultTaxRateBps,
      },
      {
        name: 'Bananas',
        quantity: 1.35,
        unit: 'kg',
        unitPriceMinor: 32_000,
        taxRateBps: defaultTaxRateBps,
      },
      {
        name: 'Pao de Forma Integral',
        quantity: 1,
        unit: 'un',
        unitPriceMinor: 78_000,
        taxRateBps: 0,
        discountBps: 1_000,
      },
    ],
  };
}

export interface RenderReceiptInput {
  entity: Pick<
    EntityDto,
    'name' | 'nif' | 'address' | 'phone' | 'currency' | 'locale' | 'pricingMode' | 'logoUrl'
  >;
  settings: EntitySettings;
  context: ReceiptContext;
}

/**
 * Renders the receipt template. Everything the settings screen can change -
 * header, footer, logo slot, tips, service charge, loyalty - is reflected here,
 * so the preview is the real template and not a mock-up of it.
 */
export function renderReceipt({ entity, settings, context }: RenderReceiptInput): string {
  const currency = entity.currency || 'AOA';
  const money = (minor: number) => formatMoney(minor, { currency, locale: 'pt-PT' });
  const out: string[] = [];

  if (settings.receiptShowLogo) {
    out.push(center(entity.logoUrl ? '[ LOGOTIPO ]' : '[ LOGOTIPO NAO DEFINIDO ]'));
    out.push('');
  }

  out.push(center(entity.name.toUpperCase()));
  if (entity.nif) out.push(center(`NIF: ${entity.nif}`));
  if (entity.address) for (const l of wrap(entity.address)) out.push(center(l));
  if (entity.phone) out.push(center(`Tel: ${entity.phone}`));

  if (settings.receiptHeader.trim()) {
    out.push('');
    for (const l of wrap(settings.receiptHeader)) out.push(center(l));
  }

  out.push(rule('='));
  out.push(row('Factura/Recibo', context.receiptNumber));
  out.push(row('Data', formatDateTime(context.issuedAt)));
  out.push(row('Operador', context.cashierName));
  if (context.locationName) out.push(row('Loja', context.locationName));
  if (context.customerName) out.push(row('Cliente', context.customerName));
  out.push(rule('='));

  const lineInputs: LineInput[] = context.lines.map((line) => ({
    unitPriceMinor: line.unitPriceMinor,
    quantity: line.quantity,
    taxRateBps: line.taxRateBps,
    pricingMode: entity.pricingMode,
    discount: line.discountBps ? { type: 'percentage', value: line.discountBps } : null,
  }));

  const totals = computeSale(lineInputs);

  context.lines.forEach((line, index) => {
    const computed = lineInputs[index]!;
    const subtotal = Math.round(computed.unitPriceMinor * computed.quantity);
    for (const l of wrap(line.name)) out.push(l);
    out.push(
      row(
        `  ${formatQuantity(line.quantity)} ${line.unit} x ${money(line.unitPriceMinor)}`,
        money(subtotal),
      ),
    );
    if (line.discountBps) {
      const discountMinor = applyBps(subtotal, line.discountBps);
      out.push(row(`  Desconto ${formatBps(line.discountBps)}`, `-${money(discountMinor)}`));
    }
  });

  out.push(rule('-'));
  out.push(row('Subtotal', money(totals.subtotalMinor)));
  if (totals.discountMinor > 0) out.push(row('Descontos', `-${money(totals.discountMinor)}`));

  const serviceChargeMinor = settings.serviceChargeBps
    ? applyBps(totals.totalMinor, settings.serviceChargeBps)
    : 0;
  if (serviceChargeMinor > 0) {
    out.push(row(`Servico ${formatBps(settings.serviceChargeBps)}`, money(serviceChargeMinor)));
  }

  const tipMinor =
    settings.tipsEnabled && settings.tipPresetsBps.length > 0
      ? applyBps(totals.totalMinor, settings.tipPresetsBps[0]!)
      : 0;
  if (tipMinor > 0) {
    out.push(row(`Gorjeta ${formatBps(settings.tipPresetsBps[0]!)}`, money(tipMinor)));
  }

  const grandTotal = totals.totalMinor + serviceChargeMinor + tipMinor;
  out.push(rule('='));
  out.push(row('TOTAL', money(grandTotal)));
  out.push(rule('='));

  // Tax summary - the part the tax office cares about.
  if (totals.taxBreakdown.length > 0) {
    out.push('');
    out.push(row(pad('Taxa', 10) + pad('Incidencia', 16), 'Imposto'));
    for (const bucket of totals.taxBreakdown) {
      out.push(
        row(
          pad(formatBps(bucket.rateBps), 10) + pad(money(bucket.netMinor), 16),
          money(bucket.taxMinor),
        ),
      );
    }
    out.push(row('Total sem imposto', money(totals.netMinor)));
    out.push(row('Total imposto', money(totals.taxMinor)));
  }

  // Payment. The preview always pays cash so the change line is exercised.
  const tenders = suggestTenders(grandTotal, currency);
  const tendered = tenders.find((value) => value > grandTotal) ?? grandTotal;
  out.push('');
  out.push(row('Numerario', money(tendered)));
  out.push(row('Troco', money(tendered - grandTotal)));

  if (settings.loyaltyEarnPerMinor > 0) {
    const points = Math.floor(grandTotal / settings.loyaltyEarnPerMinor);
    out.push('');
    out.push(row('Pontos ganhos', String(points)));
    out.push(
      row('Valor por ponto', money(settings.loyaltyPointValueMinor)),
    );
  }

  if (settings.receiptFooter.trim()) {
    out.push('');
    for (const l of wrap(settings.receiptFooter)) out.push(center(l));
  }

  out.push('');
  for (const l of wrap('Os bens foram colocados a disposicao do adquirente na data do documento.')) {
    out.push(center(l));
  }
  out.push('');

  // Intl groups thousands with a narrow no-break space, which most thermal
  // printers render as a blank box. Swapping it for a plain space keeps every
  // column exactly where it was measured (same character count).
  return out.join('\n').replace(/[\u00a0\u202f\u2009]/g, ' ');
}
