import PDFDocument from 'pdfkit';
import { currencyConfig } from '@pos/shared';

/**
 * Two renderers over one table model, so the CSV and the PDF can never present
 * different numbers: whatever `documents.ts` builds is what both draw.
 */

export type ColumnType = 'text' | 'money' | 'quantity' | 'integer' | 'percent' | 'share' | 'date';

export interface ExportColumn {
  key: string;
  label: string;
  type?: ColumnType;
  /** Relative width hint for the PDF table. */
  weight?: number;
}

export interface ExportTable {
  title?: string;
  columns: ExportColumn[];
  rows: readonly object[];
  totals?: Record<string, unknown> | null;
  /** Free-form "key: value" lines printed above the table. */
  facts?: Array<{ label: string; value: string }>;
}

export interface ExportDocument {
  title: string;
  filenameBase: string;
  entityName: string;
  entityNif: string | null;
  currency: string;
  periodFrom: Date;
  periodTo: Date;
  tables: ExportTable[];
  notes?: string[];
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

/** Minor units -> "1234,56". No thousands separator: Excel parses it cleanly. */
export function minorToDecimal(value: unknown, decimals: number): string {
  const raw = typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(raw)) return '0,00';
  const rounded = Math.round(raw);
  const negative = rounded < 0;
  const abs = Math.abs(rounded).toString().padStart(decimals + 1, '0');
  const whole = abs.slice(0, abs.length - decimals) || '0';
  const frac = decimals > 0 ? abs.slice(abs.length - decimals) : '';
  return `${negative ? '-' : ''}${whole}${decimals > 0 ? `,${frac}` : ''}`;
}

function quantityToText(value: unknown): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  const fixed = Math.abs(n % 1) < 1e-9 ? n.toFixed(0) : n.toFixed(3);
  return fixed.replace('.', ',');
}

function bpsToText(value: unknown): string {
  const n = Number(value ?? 0) / 100;
  if (!Number.isFinite(n)) return '0,00%';
  return `${n.toFixed(2).replace('.', ',')}%`;
}

function shareToText(value: unknown): string {
  const n = Number(value ?? 0) * 100;
  if (!Number.isFinite(n)) return '0,00%';
  return `${n.toFixed(2).replace('.', ',')}%`;
}

export function formatCell(value: unknown, type: ColumnType | undefined, decimals: number): string {
  if (value == null) return '';
  switch (type) {
    case 'money':
      return minorToDecimal(value, decimals);
    case 'quantity':
      return quantityToText(value);
    case 'integer':
      return String(Math.round(Number(value ?? 0)));
    case 'percent':
      return bpsToText(value);
    case 'share':
      return shareToText(value);
    case 'date':
      return formatDateTime(value);
    case 'text':
    default:
      return String(value);
  }
}

export function formatDateTime(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDate(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
}

export function fileDate(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

const CSV_SEPARATOR = ';';
const BOM = String.fromCharCode(0xfeff);

function csvCell(text: string): string {
  if (/[";\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(CSV_SEPARATOR);
}

/**
 * UTF-8 with a BOM and semicolon separators: what a pt-PT Excel expects when it
 * opens a file by double-click.
 */
export function renderCsv(doc: ExportDocument): Buffer {
  const decimals = currencyConfig(doc.currency).decimals;
  const lines: string[] = [];

  lines.push(csvRow([doc.title]));
  lines.push(csvRow([doc.entityName + (doc.entityNif ? ` (NIF ${doc.entityNif})` : '')]));
  lines.push(
    csvRow([`Periodo: ${formatDate(doc.periodFrom)} a ${formatDate(doc.periodTo)}`]),
  );
  lines.push(csvRow([`Moeda: ${doc.currency}`]));
  for (const note of doc.notes ?? []) lines.push(csvRow([note]));

  for (const table of doc.tables) {
    lines.push('');
    if (table.title) lines.push(csvRow([table.title]));
    for (const fact of table.facts ?? []) lines.push(csvRow([fact.label, fact.value]));
    if (table.facts?.length) lines.push('');

    lines.push(csvRow(table.columns.map((c) => c.label)));
    for (const row of table.rows) {
      const cells = row as Record<string, unknown>;
      lines.push(csvRow(table.columns.map((c) => formatCell(cells[c.key], c.type, decimals))));
    }
    if (table.totals) {
      const totals = table.totals;
      lines.push(
        csvRow(
          table.columns.map((c, index) =>
            totals[c.key] != null
              ? formatCell(totals[c.key], c.type, decimals)
              : index === 0
                ? 'TOTAL'
                : '',
          ),
        ),
      );
    }
  }

  return Buffer.from(BOM + lines.join('\r\n') + '\r\n', 'utf8');
}

/* -------------------------------------------------------------------------- */
/* PDF                                                                         */
/* -------------------------------------------------------------------------- */

/** Characters pdfkit's Latin-1 fonts cannot draw, and what to draw instead. */
const LATIN1_REPLACEMENTS = new Map<number, string>([
  [0x2018, "'"],
  [0x2019, "'"],
  [0x201c, '"'],
  [0x201d, '"'],
  [0x2013, '-'],
  [0x2014, '-'],
  [0x2026, '...'],
  [0x20ac, 'EUR'],
  [0x2022, '-'],
  [0x00a0, ' '],
  [0x202f, ' '],
]);

/** Combining diacritical marks - what is left over after an NFD decomposition. */
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
);

/**
 * pdfkit's built-in fonts are WinAnsi/Latin-1 only. Anything outside that range
 * is transliterated (accents decomposed and dropped) rather than left to become
 * a blank glyph in the middle of a number.
 */
export function toLatin1(input: unknown): string {
  const text = String(input ?? '');
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const replacement = LATIN1_REPLACEMENTS.get(code);
    if (replacement != null) {
      out += replacement;
      continue;
    }
    if (code <= 0xff) {
      out += char;
      continue;
    }
    const stripped = char.normalize('NFD').replace(COMBINING_MARKS, '');
    out += stripped && (stripped.codePointAt(0) ?? 0x100) <= 0xff ? stripped : '?';
  }
  return out;
}

const PAGE_MARGIN = 32;
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

function isNumeric(type: ColumnType | undefined): boolean {
  return type === 'money' || type === 'quantity' || type === 'integer' || type === 'percent' || type === 'share';
}

export function renderPdf(doc: ExportDocument): Promise<Buffer> {
  const decimals = currencyConfig(doc.currency).decimals;
  const widest = doc.tables.reduce((max, t) => Math.max(max, t.columns.length), 0);
  const landscape = widest > 5;

  return new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      layout: landscape ? 'landscape' : 'portrait',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: { Title: toLatin1(doc.title), Author: toLatin1(doc.entityName) },
    });

    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    try {
      drawDocument(pdf, doc, decimals);
      pdf.end();
    } catch (error) {
      reject(error as Error);
    }
  });
}

function drawDocument(pdf: PDFKit.PDFDocument, doc: ExportDocument, decimals: number): void {
  const left = PAGE_MARGIN;
  const right = pdf.page.width - PAGE_MARGIN;
  const width = right - left;

  pdf.font(FONT_BOLD).fontSize(16).fillColor('#111111');
  pdf.text(toLatin1(doc.title), left, PAGE_MARGIN, { width });

  pdf.font(FONT).fontSize(10).fillColor('#444444');
  pdf.text(toLatin1(doc.entityName), { width });
  if (doc.entityNif) pdf.text(toLatin1(`NIF: ${doc.entityNif}`), { width });
  pdf.text(
    toLatin1(`Periodo: ${formatDate(doc.periodFrom)} a ${formatDate(doc.periodTo)}`),
    { width },
  );
  pdf.text(toLatin1(`Moeda: ${doc.currency}`), { width });
  for (const note of doc.notes ?? []) pdf.text(toLatin1(note), { width });

  pdf.moveDown(0.6);

  for (const table of doc.tables) {
    drawTable(pdf, table, decimals);
    pdf.moveDown(1);
  }
}

function drawTable(pdf: PDFKit.PDFDocument, table: ExportTable, decimals: number): void {
  const left = PAGE_MARGIN;
  const right = pdf.page.width - PAGE_MARGIN;
  const width = right - left;
  const bottom = pdf.page.height - PAGE_MARGIN - 18;

  if (table.title) {
    ensureSpace(pdf, 40, bottom);
    pdf.font(FONT_BOLD).fontSize(12).fillColor('#111111');
    pdf.text(toLatin1(table.title), left, pdf.y, { width });
    pdf.moveDown(0.3);
  }

  if (table.facts?.length) {
    pdf.font(FONT).fontSize(9).fillColor('#333333');
    for (const fact of table.facts) {
      ensureSpace(pdf, 14, bottom);
      pdf.text(toLatin1(`${fact.label}: ${fact.value}`), left, pdf.y, { width });
    }
    pdf.moveDown(0.4);
  }

  if (!table.columns.length) return;

  const weights = table.columns.map((c) => c.weight ?? (isNumeric(c.type) ? 1 : 1.8));
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const widths = weights.map((w) => (w / weightSum) * width);

  const rowHeight = 14;
  const drawHeader = () => {
    const y = pdf.y;
    pdf.save();
    pdf.rect(left, y - 2, width, rowHeight + 2).fill('#EFF3F8');
    pdf.restore();
    pdf.font(FONT_BOLD).fontSize(8).fillColor('#111111');
    let x = left;
    table.columns.forEach((column, index) => {
      pdf.text(toLatin1(column.label), x + 3, y + 2, {
        width: widths[index]! - 6,
        align: isNumeric(column.type) ? 'right' : 'left',
        lineBreak: false,
        ellipsis: true,
      });
      x += widths[index]!;
    });
    pdf.y = y + rowHeight + 2;
  };

  ensureSpace(pdf, rowHeight * 3, bottom);
  drawHeader();

  pdf.font(FONT).fontSize(8).fillColor('#222222');
  table.rows.forEach((row, rowIndex) => {
    if (pdf.y + rowHeight > bottom) {
      pdf.addPage();
      pdf.y = PAGE_MARGIN;
      drawHeader();
      pdf.font(FONT).fontSize(8).fillColor('#222222');
    }
    const y = pdf.y;
    if (rowIndex % 2 === 1) {
      pdf.save();
      pdf.rect(left, y - 1, width, rowHeight).fill('#F8FAFC');
      pdf.restore();
      pdf.fillColor('#222222');
    }
    const cells = row as Record<string, unknown>;
    let x = left;
    table.columns.forEach((column, index) => {
      pdf.text(toLatin1(formatCell(cells[column.key], column.type, decimals)), x + 3, y + 2, {
        width: widths[index]! - 6,
        align: isNumeric(column.type) ? 'right' : 'left',
        lineBreak: false,
        ellipsis: true,
      });
      x += widths[index]!;
    });
    pdf.y = y + rowHeight;
  });

  if (table.totals) {
    if (pdf.y + rowHeight + 4 > bottom) {
      pdf.addPage();
      pdf.y = PAGE_MARGIN;
      drawHeader();
    }
    const totals = table.totals;
    const y = pdf.y;
    pdf.save();
    pdf
      .moveTo(left, y)
      .lineTo(right, y)
      .lineWidth(0.7)
      .strokeColor('#94A3B8')
      .stroke();
    pdf.restore();
    pdf.font(FONT_BOLD).fontSize(8).fillColor('#111111');
    let x = left;
    table.columns.forEach((column, index) => {
      const value =
        totals[column.key] != null
          ? formatCell(totals[column.key], column.type, decimals)
          : index === 0
            ? 'TOTAL'
            : '';
      pdf.text(toLatin1(value), x + 3, y + 3, {
        width: widths[index]! - 6,
        align: isNumeric(column.type) ? 'right' : 'left',
        lineBreak: false,
        ellipsis: true,
      });
      x += widths[index]!;
    });
    pdf.y = y + rowHeight + 3;
  }
}

function ensureSpace(pdf: PDFKit.PDFDocument, needed: number, bottom: number): void {
  if (pdf.y + needed > bottom) {
    pdf.addPage();
    pdf.y = PAGE_MARGIN;
  }
}

/* -------------------------------------------------------------------------- */
/* HTTP helpers                                                                */
/* -------------------------------------------------------------------------- */

/** ASCII-safe, lowercase, dash-joined. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function exportFilename(base: string, from: Date, to: Date, extension: string): string {
  return `${slugify(base)}-${fileDate(from)}-a-${fileDate(to)}.${extension}`;
}

export function contentDisposition(filename: string): string {
  const ascii = slugify(filename.replace(/\.[a-z0-9]+$/i, '')) + filename.slice(filename.lastIndexOf('.'));
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
