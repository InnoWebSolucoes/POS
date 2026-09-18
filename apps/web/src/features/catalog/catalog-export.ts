import { margin } from '@pos/shared';

import { minorToMajor } from '@/lib/format';
import { catalogApi, type ProductFull, type ProductListParams } from './catalog-api';
import { PRODUCT_TYPE_LABELS, unitShort } from './catalog-labels';

/**
 * Catalogue export.
 *
 * The API has no catalogue CSV route (reports/export/:report is the sales-side
 * report), so the current filter is replayed page by page and written to a file
 * in the browser. Money is exported in MAJOR units because that is what a
 * spreadsheet and an accountant expect; the conversion happens here, once, and
 * never inside a component.
 */

const PAGE_SIZE = 200;
const MAX_ROWS = 10_000;

export async function fetchAllProducts(params: ProductListParams): Promise<ProductFull[]> {
  const rows: ProductFull[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await catalogApi.listProducts({ ...params, page, pageSize: PAGE_SIZE });
    rows.push(...response.data);
    totalPages = response.totalPages;
    page += 1;
  } while (page <= totalPages && rows.length < MAX_ROWS);

  return rows;
}

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Semicolon separated: Excel in a pt-PT locale reads commas as decimals. */
function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(cell).join(';')).join('\r\n');
}

export function buildProductCsv(products: ProductFull[], includeCost: boolean): string {
  const header = [
    'SKU',
    'Codigo de barras',
    'Nome',
    'Categoria',
    'Tipo',
    'Unidade',
    'Preco de venda',
    ...(includeCost ? ['Preco de custo', 'Margem %'] : []),
    'Taxa de imposto %',
    'Stock',
    'Stock minimo',
    'Activo',
  ];

  const rows: Array<Array<string | number | null | undefined>> = [header];

  for (const product of products) {
    const cost = product.costPriceMinor;
    const marginPct =
      includeCost && cost !== undefined
        ? (margin(product.salePriceMinor, cost).marginBps / 100).toFixed(2)
        : '';

    rows.push([
      product.sku,
      product.barcode ?? '',
      product.namePt,
      product.category?.namePt ?? '',
      PRODUCT_TYPE_LABELS[product.type],
      unitShort(product.unit),
      minorToMajor(product.salePriceMinor).toFixed(2),
      ...(includeCost
        ? [cost === undefined ? '' : minorToMajor(cost).toFixed(2), marginPct]
        : []),
      (product.taxRateBps / 100).toFixed(2),
      product.trackStock ? product.stockQuantity : '',
      product.trackStock ? product.minStockLevel : '',
      product.active ? 'Sim' : 'Nao',
    ]);
  }

  return toCsv(rows);
}

export function downloadCsv(filename: string, csv: string): void {
  // The BOM is what makes Excel open a UTF-8 CSV without mangling it.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportFilename(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return `catalogo-${stamp}.csv`;
}
