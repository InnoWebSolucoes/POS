import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { formatMoney } from '@pos/shared';

import { lineTotalMinor, parseOptions } from './mappers.js';

/* -------------------------------------------------------------------------- */
/* Latin-1 safety                                                              */
/* -------------------------------------------------------------------------- */

/**
 * pdfkit's built-in fonts (Helvetica & co.) are WinAnsi/Latin-1 only: anything
 * above U+00FF is drawn as garbage or throws. Accented Portuguese letters are
 * inside Latin-1, so they survive; everything else is folded down to its base
 * letter and, failing that, replaced.
 */
const LITERAL_REPLACEMENTS: Array<[string, string]> = [
  ['\u20AC', 'EUR'],
  ['\u2013', '-'],
  ['\u2014', '-'],
  ['\u2018', "'"],
  ['\u2019', "'"],
  ['\u201A', "'"],
  ['\u201C', '"'],
  ['\u201D', '"'],
  ['\u2026', '...'],
  ['\u2022', '-'],
  ['\u2212', '-'],
];

/** Thin/narrow/no-break spaces used by Intl number formatting. */
const SPACE_LIKE = /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g;

export function latin1(input: unknown): string {
  let text = input == null ? '' : String(input);
  for (const [from, to] of LITERAL_REPLACEMENTS) text = text.split(from).join(to);
  text = text.replace(SPACE_LIKE, ' ').replace(/[\r\t]/g, ' ');

  let out = '';
  for (const char of text) {
    if (char.codePointAt(0)! <= 0xff) {
      out += char;
      continue;
    }
    const folded = char.normalize('NFD').replace(/[\u0300-\u036F]/g, '');
    out += [...folded].every((c) => c.codePointAt(0)! <= 0xff) ? folded : '?';
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Input shapes                                                                */
/* -------------------------------------------------------------------------- */

export interface PdfEntity {
  name: string;
  nif: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
}

export interface PdfSupplier {
  name: string;
  contactName: string | null;
  nif: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTerms: string | null;
}

export interface PdfLine {
  quantity: number;
  unitCostMinor: bigint | number;
  product?: { sku: string; namePt: string; unit: string } | null;
  variant?: { sku: string; options: string } | null;
}

export interface PdfOrder {
  reference: string;
  status: string;
  note: string | null;
  createdAt: Date;
  sentAt: Date | null;
  expectedDate: Date | null;
  totalCostMinor: bigint | number;
  supplier: PdfSupplier | null;
  lines: PdfLine[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviada',
  partially_received: 'Parcialmente recebida',
  received: 'Recebida',
  cancelled: 'Cancelada',
};

const MARGIN = 40;
const PAGE_WIDTH = 595.28;
const PAGE_BOTTOM = 841.89 - MARGIN - 24;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLUMNS = {
  sku: { x: MARGIN, width: 74 },
  description: { x: MARGIN + 78, width: 191 },
  quantity: { x: MARGIN + 273, width: 58 },
  unitCost: { x: MARGIN + 335, width: 84 },
  total: { x: MARGIN + 423, width: 92 },
};

function formatDate(value: Date | null | undefined): string {
  if (!value) return '-';
  const dd = String(value.getDate()).padStart(2, '0');
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${value.getFullYear()}`;
}

function formatQuantity(value: number, unit: string): string {
  const body = Number.isInteger(value) ? String(value) : String(round3(value));
  return unit ? `${body} ${unit}` : body;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * pdfkit always wraps when a width is given, so single-line cells are clipped
 * by hand to keep a long name from colliding with the row underneath.
 */
function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 3))}...`;
}

export function pdfFileName(reference: string): string {
  const safe = reference.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `encomenda-${safe || 'compra'}.pdf`;
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

export function streamPurchaseOrderPdf(res: Response, entity: PdfEntity, order: PdfOrder): void {
  const money = (minor: number | bigint) =>
    latin1(formatMoney(Number(minor), { currency: entity.currency }));

  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: latin1(`Encomenda ${order.reference}`),
      Author: latin1(entity.name),
      Subject: latin1(`Encomenda de compra para ${order.supplier?.name ?? 'fornecedor'}`),
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName(order.reference)}"`);
  res.setHeader('Cache-Control', 'no-store');
  doc.pipe(res);

  const write = (
    text: string,
    x: number,
    y: number,
    options: PDFKit.Mixins.TextOptions = {},
  ): void => {
    doc.text(latin1(text), x, y, options);
  };

  /** One-line cell: clipped rather than wrapped. */
  const cell = (
    text: string,
    x: number,
    y: number,
    width: number,
    align: 'left' | 'right' | 'center' = 'left',
    max = 48,
  ): void => {
    doc.text(latin1(clip(text, max)), x, y, { width, align });
  };

  /* ---------------------------------------------------------------- header */
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#111111');
  write(entity.name, MARGIN, MARGIN, { width: CONTENT_WIDTH * 0.6, lineBreak: true });

  doc.font('Helvetica').fontSize(9).fillColor('#444444');
  const headerLines = [
    entity.nif ? `NIF: ${entity.nif}` : null,
    entity.address,
    [entity.phone, entity.email].filter(Boolean).join('  |  ') || null,
  ].filter((v): v is string => !!v);

  let y = MARGIN + 24;
  for (const line of headerLines) {
    cell(line, MARGIN, y, CONTENT_WIDTH * 0.6, 'left', 64);
    y += 12;
  }

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111');
  write('ENCOMENDA DE COMPRA', MARGIN + CONTENT_WIDTH * 0.55, MARGIN, {
    width: CONTENT_WIDTH * 0.45,
    align: 'right',
  });
  doc.font('Helvetica').fontSize(10).fillColor('#444444');
  write(order.reference, MARGIN + CONTENT_WIDTH * 0.55, MARGIN + 20, {
    width: CONTENT_WIDTH * 0.45,
    align: 'right',
  });
  write(
    `Estado: ${STATUS_LABELS[order.status] ?? order.status}`,
    MARGIN + CONTENT_WIDTH * 0.55,
    MARGIN + 34,
    { width: CONTENT_WIDTH * 0.45, align: 'right' },
  );
  write(`Data: ${formatDate(order.createdAt)}`, MARGIN + CONTENT_WIDTH * 0.55, MARGIN + 48, {
    width: CONTENT_WIDTH * 0.45,
    align: 'right',
  });

  y = Math.max(y, MARGIN + 66) + 10;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor('#CCCCCC').lineWidth(1).stroke();
  y += 14;

  /* -------------------------------------------------------------- supplier */
  const supplier = order.supplier;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111');
  write('FORNECEDOR', MARGIN, y);
  doc.font('Helvetica-Bold').fontSize(10);
  write('ENTREGA', MARGIN + CONTENT_WIDTH * 0.55, y, { width: CONTENT_WIDTH * 0.45 });
  y += 14;

  doc.font('Helvetica').fontSize(9).fillColor('#333333');
  const supplierLines = [
    supplier?.name ?? 'Sem fornecedor',
    supplier?.contactName ? `A/C: ${supplier.contactName}` : null,
    supplier?.nif ? `NIF: ${supplier.nif}` : null,
    [supplier?.phone, supplier?.email].filter(Boolean).join('  |  ') || null,
    supplier?.address ?? null,
    supplier?.paymentTerms ? `Condicoes: ${supplier.paymentTerms}` : null,
  ].filter((v): v is string => !!v);

  const deliveryLines = [
    `Data prevista: ${formatDate(order.expectedDate)}`,
    `Enviada em: ${formatDate(order.sentAt)}`,
    entity.address ? `Local: ${entity.address}` : null,
  ].filter((v): v is string => !!v);

  const blockTop = y;
  let leftY = y;
  for (const line of supplierLines) {
    cell(line, MARGIN, leftY, CONTENT_WIDTH * 0.5, 'left', 58);
    leftY += 12;
  }
  let rightY = blockTop;
  for (const line of deliveryLines) {
    cell(line, MARGIN + CONTENT_WIDTH * 0.55, rightY, CONTENT_WIDTH * 0.45, 'left', 52);
    rightY += 12;
  }
  y = Math.max(leftY, rightY) + 12;

  /* ----------------------------------------------------------------- table */
  const drawTableHeader = (top: number): number => {
    doc.rect(MARGIN, top - 4, CONTENT_WIDTH, 18).fill('#F0F2F5');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111');
    cell('SKU', COLUMNS.sku.x, top, COLUMNS.sku.width);
    cell('Descricao', COLUMNS.description.x, top, COLUMNS.description.width);
    cell('Qtd', COLUMNS.quantity.x, top, COLUMNS.quantity.width, 'right');
    cell('Custo unit.', COLUMNS.unitCost.x, top, COLUMNS.unitCost.width, 'right');
    cell('Total', COLUMNS.total.x, top, COLUMNS.total.width, 'right');
    return top + 18;
  };

  y = drawTableHeader(y);

  let computedTotal = 0;
  doc.font('Helvetica').fontSize(9).fillColor('#222222');

  for (const line of order.lines) {
    const unitCost = Number(line.unitCostMinor);
    const total = lineTotalMinor(line.quantity, unitCost);
    computedTotal += total;

    const options = parseOptions(line.variant?.options);
    const optionText = options
      ? Object.entries(options)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      : '';
    const description = optionText
      ? `${line.product?.namePt ?? ''} (${optionText})`
      : line.product?.namePt ?? '';

    const descriptionHeight = doc.heightOfString(latin1(description), {
      width: COLUMNS.description.width,
    });
    const rowHeight = Math.max(14, descriptionHeight + 4);

    if (y + rowHeight > PAGE_BOTTOM) {
      doc.addPage();
      y = drawTableHeader(MARGIN);
      doc.font('Helvetica').fontSize(9).fillColor('#222222');
    }

    cell(line.variant?.sku ?? line.product?.sku ?? '', COLUMNS.sku.x, y, COLUMNS.sku.width, 'left', 14);
    write(description, COLUMNS.description.x, y, { width: COLUMNS.description.width });
    cell(
      formatQuantity(line.quantity, line.product?.unit ?? ''),
      COLUMNS.quantity.x,
      y,
      COLUMNS.quantity.width,
      'right',
      12,
    );
    cell(money(unitCost), COLUMNS.unitCost.x, y, COLUMNS.unitCost.width, 'right', 18);
    cell(money(total), COLUMNS.total.x, y, COLUMNS.total.width, 'right', 20);

    y += rowHeight;
    doc
      .moveTo(MARGIN, y - 3)
      .lineTo(MARGIN + CONTENT_WIDTH, y - 3)
      .strokeColor('#EEEEEE')
      .lineWidth(0.5)
      .stroke();
  }

  /* ---------------------------------------------------------------- totals */
  if (y + 60 > PAGE_BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }
  y += 8;

  const stored = Number(order.totalCostMinor);
  const totalMinor = stored || computedTotal;

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111');
  cell('TOTAL', COLUMNS.unitCost.x, y, COLUMNS.unitCost.width, 'right');
  cell(money(totalMinor), COLUMNS.total.x, y, COLUMNS.total.width, 'right', 24);
  y += 22;

  if (order.note) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111');
    write('Observacoes', MARGIN, y);
    y += 12;
    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    doc.text(latin1(order.note), MARGIN, y, { width: CONTENT_WIDTH });
  }

  doc.font('Helvetica').fontSize(8).fillColor('#888888');
  cell(
    `${entity.name} - documento gerado em ${formatDate(new Date())}`,
    MARGIN,
    PAGE_BOTTOM + 8,
    CONTENT_WIDTH,
    'center',
    90,
  );

  doc.end();
}
