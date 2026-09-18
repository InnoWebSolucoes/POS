import type { OnlineOrderDto } from './mappers.js';
import type { StorefrontEntity } from './service.js';

/**
 * Packing slip, rendered as a self-contained HTML document meant to be opened
 * and sent straight to the browser print dialog. No prices: the picker needs
 * what to pull off the shelf and a box to tick, nothing else.
 */

function esc(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '');
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale || 'pt-PT');
  } catch {
    return iso;
  }
}

function optionsText(options: Record<string, string>): string {
  const entries = Object.entries(options);
  if (entries.length === 0) return '';
  return entries.map(([key, value]) => `${key}: ${value}`).join(' | ');
}

function addressBlock(order: OnlineOrderDto): string {
  if (order.fulfilmentMethod === 'pickup') {
    const location = order.pickupLocation;
    return [
      '<h2>Levantamento em loja</h2>',
      `<p><strong>${esc(location?.name ?? 'Loja')}</strong></p>`,
      location?.address ? `<p>${esc(location.address)}</p>` : '',
      location?.phone ? `<p>Tel: ${esc(location.phone)}</p>` : '',
      `<p>Cliente: ${esc(order.customerName ?? '-')}</p>`,
      order.contactPhone ? `<p>Contacto: ${esc(order.contactPhone)}</p>` : '',
    ].join('\n');
  }

  const address = order.shippingAddress;
  return [
    '<h2>Morada de entrega</h2>',
    `<p><strong>${esc(address?.recipient ?? order.customerName ?? '-')}</strong></p>`,
    address ? `<p>${esc(address.line1)}</p>` : '',
    address?.line2 ? `<p>${esc(address.line2)}</p>` : '',
    address
      ? `<p>${esc([address.postalCode, address.city].filter(Boolean).join(' '))}${
          address.province ? `, ${esc(address.province)}` : ''
        }</p>`
      : '',
    address?.country ? `<p>${esc(address.country)}</p>` : '',
    address?.phone ? `<p>Tel: ${esc(address.phone)}</p>` : '',
  ].join('\n');
}

export function renderPackingSlip(entity: StorefrontEntity, order: OnlineOrderDto): string {
  const rows = order.lines
    .map((line) => {
      const options = optionsText(line.options);
      return `
        <tr>
          <td class="tick"></td>
          <td class="sku">${esc(line.sku)}</td>
          <td>
            ${esc(line.name)}
            ${options ? `<span class="options">${esc(options)}</span>` : ''}
          </td>
          <td class="qty">${esc(formatQuantity(line.quantity))} ${esc(line.unit)}</td>
        </tr>`;
    })
    .join('');

  const accent = /^#[0-9a-fA-F]{3,6}$/.test(entity.accentColor) ? entity.accentColor : '#006AFF';

  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Guia de expedicao ${esc(order.orderNumber)}</title>
<style>
  :root { color-scheme: light; --accent: ${esc(accent)}; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: #fff;
    color: #111;
    font: 14px/1.5 "Helvetica Neue", Arial, sans-serif;
  }
  .sheet { max-width: 820px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
           border-bottom: 3px solid var(--accent); padding-bottom: 12px; margin-bottom: 20px; gap: 24px; }
  header img { max-height: 64px; max-width: 200px; object-fit: contain; }
  header .entity h1 { margin: 0 0 4px; font-size: 20px; }
  header .entity p { margin: 0; font-size: 12px; color: #555; }
  header .doc { text-align: right; }
  header .doc .number { font-size: 22px; font-weight: 700; color: var(--accent); }
  header .doc p { margin: 2px 0; font-size: 12px; color: #555; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
  .meta h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
             color: #666; margin: 0 0 6px; }
  .meta p { margin: 0 0 2px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
             color: #666; border-bottom: 2px solid #111; padding: 6px 8px; }
  tbody td { border-bottom: 1px solid #ddd; padding: 10px 8px; vertical-align: top; }
  td.tick, th.tick { width: 34px; }
  td.tick::before { content: ""; display: block; width: 18px; height: 18px;
                    border: 2px solid #111; border-radius: 3px; }
  td.sku, th.sku { width: 140px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; }
  td.qty, th.qty { width: 110px; text-align: right; font-weight: 700; white-space: nowrap; }
  .options { display: block; font-size: 12px; color: #666; }
  .note { margin-top: 18px; padding: 10px 12px; border-left: 3px solid var(--accent); background: #f6f8fb; }
  footer { margin-top: 32px; display: flex; justify-content: space-between; gap: 32px; font-size: 12px; color: #555; }
  footer .sign { flex: 1; border-top: 1px solid #999; padding-top: 6px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
    tbody tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="sheet">
  <header>
    <div class="entity">
      ${entity.logoUrl ? `<img src="${esc(entity.logoUrl)}" alt="${esc(entity.name)}" />` : ''}
      <h1>${esc(entity.name)}</h1>
      ${entity.address ? `<p>${esc(entity.address)}</p>` : ''}
      ${entity.phone ? `<p>Tel: ${esc(entity.phone)}</p>` : ''}
      ${entity.nif ? `<p>NIF: ${esc(entity.nif)}</p>` : ''}
    </div>
    <div class="doc">
      <p>Guia de expedicao</p>
      <div class="number">${esc(order.orderNumber)}</div>
      <p>${esc(formatDate(order.createdAt, entity.locale))}</p>
      <p>${esc(order.statusLabelPt)}</p>
    </div>
  </header>

  <section class="meta">
    <div>${addressBlock(order)}</div>
    <div>
      <h2>Expedicao</h2>
      <p>Metodo: ${order.fulfilmentMethod === 'pickup' ? 'Levantamento em loja' : 'Entrega ao domicilio'}</p>
      ${order.carrier ? `<p>Transportadora: ${esc(order.carrier)}</p>` : ''}
      ${order.trackingNumber ? `<p>Seguimento: ${esc(order.trackingNumber)}</p>` : ''}
      <p>Artigos: ${esc(formatQuantity(order.itemCount))}</p>
    </div>
  </section>

  <table>
    <thead>
      <tr>
        <th class="tick"></th>
        <th class="sku">SKU</th>
        <th>Artigo</th>
        <th class="qty">Quantidade</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${order.note ? `<div class="note"><strong>Nota:</strong> ${esc(order.note)}</div>` : ''}

  <footer>
    <div class="sign">Preparado por</div>
    <div class="sign">Conferido por</div>
    <div class="sign">Data</div>
  </footer>
</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });</script>
</body>
</html>`;
}
