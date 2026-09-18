import { ADJUSTMENT_REASON_LABELS, type AdjustmentReason } from '@pos/shared';

import type { Tx } from '../../lib/prisma.js';

import { minorToDecimal, type ExportColumn, type ExportDocument, type ExportTable } from './exporters.js';
import type { ExportQuery, ExportReport } from './schemas.js';
import {
  breakdownByCategory,
  breakdownByPaymentMethod,
  breakdownByProduct,
  breakdownByStaff,
  buildSeries,
  customerRetention,
  inventoryValuation,
  loadSalesDataset,
  loadWaste,
  MAX_DETAIL_ROWS,
  resolveWindow,
  stockMovementsReport,
  summarise,
  topCustomers,
  type ReportSummary,
  type SalesDataset,
} from './service.js';

/** Portuguese filename stems, so the download lands with a readable name. */
export const REPORT_FILENAMES: Record<ExportReport, string> = {
  sales: 'vendas',
  products: 'produtos',
  categories: 'categorias',
  staff: 'funcionarios',
  payments: 'pagamentos',
  'profit-loss': 'resultados',
  inventory: 'inventario',
  movements: 'movimentos',
  customers: 'clientes',
};

export const REPORT_TITLES: Record<ExportReport, string> = {
  sales: 'Relatorio de Vendas',
  products: 'Vendas por Produto',
  categories: 'Vendas por Categoria',
  staff: 'Vendas por Operador',
  payments: 'Vendas por Metodo de Pagamento',
  'profit-loss': 'Demonstracao de Resultados',
  inventory: 'Valorizacao de Inventario',
  movements: 'Movimentos de Stock',
  customers: 'Relatorio de Clientes',
};

const MOVEMENT_LABELS: Record<string, string> = {
  receipt: 'Recepcao',
  sale: 'Venda',
  refund: 'Devolucao',
  adjustment: 'Ajuste',
  transfer_in: 'Transferencia (entrada)',
  transfer_out: 'Transferencia (saida)',
  stocktake: 'Inventario',
  composite_consumption: 'Consumo de receita',
  waste: 'Quebra',
  initial: 'Saldo inicial',
};

export interface EntityHeader {
  name: string;
  nif: string | null;
  currency: string;
}

export async function loadEntityHeader(db: Tx, entityId: string): Promise<EntityHeader> {
  const entity = await db.entity.findFirst({
    where: { id: entityId },
    select: { name: true, nif: true, currency: true },
  });
  return {
    name: entity?.name ?? 'Entidade',
    nif: entity?.nif ?? null,
    currency: entity?.currency ?? 'AOA',
  };
}

/* -------------------------------------------------------------------------- */
/* Column helpers                                                              */
/* -------------------------------------------------------------------------- */

function costColumns(includeFinancial: boolean): ExportColumn[] {
  if (!includeFinancial) return [];
  return [
    { key: 'cogsMinor', label: 'Custo', type: 'money' },
    { key: 'profitMinor', label: 'Lucro', type: 'money' },
    { key: 'marginBps', label: 'Margem', type: 'percent' },
  ];
}

function sumKeys(rows: readonly object[], keys: string[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const key of keys) {
    totals[key] = rows.reduce(
      (sum, row) => sum + Number((row as Record<string, unknown>)[key] ?? 0),
      0,
    );
  }
  return totals;
}

function summaryFacts(
  summary: ReportSummary,
  currency: string,
  includeFinancial: boolean,
): Array<{ label: string; value: string }> {
  const decimals = 2;
  const money = (value: number) => `${minorToDecimal(value, decimals)} ${currency}`;
  const facts = [
    { label: 'Receita liquida', value: money(summary.revenueMinor) },
    { label: 'Transaccoes', value: String(summary.transactionCount) },
    { label: 'Ticket medio', value: money(summary.averageTicketMinor) },
    { label: 'Artigos vendidos', value: String(summary.itemsSold) },
    { label: 'Descontos', value: money(summary.discountMinor) },
    { label: 'Devolucoes', value: money(summary.refundMinor) },
    { label: 'Imposto', value: money(summary.taxMinor) },
  ];
  if (includeFinancial) {
    facts.splice(1, 0, { label: 'Custo das mercadorias', value: money(summary.cogsMinor) });
    facts.splice(2, 0, { label: 'Lucro bruto', value: money(summary.grossProfitMinor) });
    facts.splice(3, 0, {
      label: 'Margem bruta',
      value: `${(summary.grossMarginBps / 100).toFixed(2).replace('.', ',')}%`,
    });
  }
  return facts;
}

/* -------------------------------------------------------------------------- */
/* Table builders (shared with the JSON routes through service.ts)             */
/* -------------------------------------------------------------------------- */

function seriesTable(dataset: SalesDataset, query: ExportQuery, includeFinancial: boolean): ExportTable {
  const rows = buildSeries(dataset, query.granularity);
  const columns: ExportColumn[] = [
    { key: 'bucket', label: 'Periodo', type: 'text', weight: 1.5 },
    { key: 'revenueMinor', label: 'Receita', type: 'money' },
    ...(includeFinancial
      ? ([
          { key: 'cogsMinor', label: 'Custo', type: 'money' },
          { key: 'profitMinor', label: 'Lucro', type: 'money' },
        ] as ExportColumn[])
      : []),
    { key: 'transactions', label: 'Transaccoes', type: 'integer' },
  ];
  return {
    title: `Evolucao (${query.granularity})`,
    columns,
    rows,
    totals: sumKeys(rows, ['revenueMinor', 'cogsMinor', 'profitMinor', 'transactions']),
  };
}

function breakdownTable(
  title: string,
  labelHeader: string,
  rows: readonly object[],
  includeFinancial: boolean,
): ExportTable {
  const columns: ExportColumn[] = [
    { key: 'label', label: labelHeader, type: 'text', weight: 2.4 },
    { key: 'quantity', label: 'Quantidade', type: 'quantity' },
    { key: 'revenueMinor', label: 'Receita', type: 'money' },
    ...costColumns(includeFinancial),
    { key: 'share', label: 'Peso', type: 'share' },
  ];
  return {
    title,
    columns,
    rows,
    totals: sumKeys(rows, ['quantity', 'revenueMinor', 'cogsMinor', 'profitMinor']),
  };
}

/* -------------------------------------------------------------------------- */
/* Document builder                                                            */
/* -------------------------------------------------------------------------- */

export async function buildExportDocument(
  db: Tx,
  entityId: string,
  report: ExportReport,
  query: ExportQuery,
  includeFinancial: boolean,
): Promise<ExportDocument> {
  const header = await loadEntityHeader(db, entityId);
  const tables: ExportTable[] = [];
  const notes: string[] = [];

  let from: Date;
  let to: Date;

  if (report === 'inventory') {
    const valuation = await inventoryValuation(db, entityId, query, { limit: MAX_DETAIL_ROWS });
    const now = new Date();
    from = now;
    to = now;
    const columns: ExportColumn[] = [
      { key: 'label', label: 'Categoria', type: 'text', weight: 2.4 },
      { key: 'productCount', label: 'Produtos', type: 'integer' },
      { key: 'quantity', label: 'Quantidade', type: 'quantity' },
      ...(includeFinancial
        ? ([{ key: 'costValueMinor', label: 'Valor a custo', type: 'money' }] as ExportColumn[])
        : []),
      { key: 'retailValueMinor', label: 'Valor a venda', type: 'money' },
      ...(includeFinancial
        ? ([
            { key: 'potentialProfitMinor', label: 'Lucro potencial', type: 'money' },
            { key: 'marginBps', label: 'Margem', type: 'percent' },
          ] as ExportColumn[])
        : []),
    ];
    tables.push({
      title: 'Valorizacao por categoria',
      columns,
      rows: valuation.rows,
      totals: {
        label: 'TOTAL',
        productCount: valuation.total.productCount,
        quantity: valuation.total.quantity,
        costValueMinor: valuation.total.costValueMinor,
        retailValueMinor: valuation.total.retailValueMinor,
        potentialProfitMinor: valuation.total.potentialProfitMinor,
        marginBps: valuation.total.marginBps,
      },
    });
    if (valuation.truncated) notes.push(`Listagem truncada nos primeiros ${MAX_DETAIL_ROWS} produtos.`);

    return {
      title: REPORT_TITLES[report],
      filenameBase: REPORT_FILENAMES[report],
      entityName: header.name,
      entityNif: header.nif,
      currency: header.currency,
      periodFrom: from,
      periodTo: to,
      tables,
      notes,
    };
  }

  if (report === 'movements') {
    const movements = await stockMovementsReport(db, entityId, query, {
      type: query.type,
      reason: query.reason,
      skip: 0,
      take: Math.min(query.limit, MAX_DETAIL_ROWS),
    });
    const window = resolveWindow(query);
    from = window.from;
    to = window.to;
    const columns: ExportColumn[] = [
      { key: 'createdAt', label: 'Data', type: 'date', weight: 1.6 },
      { key: 'productName', label: 'Produto', type: 'text', weight: 2.4 },
      { key: 'typeLabel', label: 'Tipo', type: 'text', weight: 1.4 },
      { key: 'reasonLabel', label: 'Motivo', type: 'text', weight: 1.4 },
      { key: 'quantity', label: 'Quantidade', type: 'quantity' },
      { key: 'balanceAfter', label: 'Saldo', type: 'quantity' },
      ...(includeFinancial
        ? ([
            { key: 'unitCostMinor', label: 'Custo unit.', type: 'money' },
            { key: 'valueMinor', label: 'Valor', type: 'money' },
          ] as ExportColumn[])
        : []),
      { key: 'userName', label: 'Utilizador', type: 'text', weight: 1.6 },
    ];
    const rows = movements.rows.map((row) => ({
      ...row,
      typeLabel: MOVEMENT_LABELS[row.type] ?? row.type,
      reasonLabel: row.reason
        ? (ADJUSTMENT_REASON_LABELS[row.reason as AdjustmentReason]?.pt ?? row.reason)
        : '',
    }));
    tables.push({
      title: 'Movimentos de stock',
      columns,
      rows,
      totals: sumKeys(rows, ['quantity', 'valueMinor']),
      facts: [{ label: 'Total de movimentos no periodo', value: String(movements.total) }],
    });
    if (movements.total > rows.length) {
      notes.push(`Exportadas ${rows.length} de ${movements.total} linhas (limite ?limit=).`);
    }

    return {
      title: REPORT_TITLES[report],
      filenameBase: REPORT_FILENAMES[report],
      entityName: header.name,
      entityNif: header.nif,
      currency: header.currency,
      periodFrom: from,
      periodTo: to,
      tables,
      notes,
    };
  }

  // Everything else is built from the one sales dataset.
  const dataset = await loadSalesDataset(db, entityId, query);
  from = dataset.window.from;
  to = dataset.window.to;
  const summary = summarise(dataset);
  if (dataset.truncated) {
    notes.push(`Dados truncados nas primeiras ${dataset.maxRows} vendas do periodo.`);
  }

  switch (report) {
    case 'sales': {
      tables.push({
        title: 'Resumo',
        columns: [],
        rows: [],
        facts: summaryFacts(summary, header.currency, includeFinancial),
      });
      tables.push(seriesTable(dataset, query, includeFinancial));
      break;
    }
    case 'products': {
      const rows = breakdownByProduct(dataset, { limit: query.limit, sort: query.sort });
      tables.push(breakdownTable('Vendas por produto', 'Produto', rows, includeFinancial));
      break;
    }
    case 'categories': {
      const rows = breakdownByCategory(dataset);
      tables.push(breakdownTable('Vendas por categoria', 'Categoria', rows, includeFinancial));
      break;
    }
    case 'staff': {
      const rows = breakdownByStaff(dataset);
      const columns: ExportColumn[] = [
        { key: 'label', label: 'Operador', type: 'text', weight: 2.4 },
        { key: 'transactions', label: 'Transaccoes', type: 'integer' },
        { key: 'revenueMinor', label: 'Receita', type: 'money' },
        { key: 'averageTicketMinor', label: 'Ticket medio', type: 'money' },
        { key: 'itemsSold', label: 'Artigos', type: 'quantity' },
        { key: 'tipsMinor', label: 'Gorjetas', type: 'money' },
        ...costColumns(includeFinancial),
      ];
      tables.push({
        title: 'Vendas por operador',
        columns,
        rows,
        totals: sumKeys(rows, [
          'transactions',
          'revenueMinor',
          'itemsSold',
          'tipsMinor',
          'cogsMinor',
          'profitMinor',
        ]),
      });
      break;
    }
    case 'payments': {
      const rows = breakdownByPaymentMethod(dataset);
      const columns: ExportColumn[] = [
        { key: 'label', label: 'Metodo', type: 'text', weight: 2.4 },
        { key: 'transactions', label: 'Pagamentos', type: 'integer' },
        { key: 'revenueMinor', label: 'Valor liquido', type: 'money' },
        { key: 'refundMinor', label: 'Devolvido', type: 'money' },
        { key: 'share', label: 'Peso', type: 'share' },
      ];
      tables.push({
        title: 'Vendas por metodo de pagamento',
        columns,
        rows,
        totals: sumKeys(rows, ['transactions', 'revenueMinor', 'refundMinor']),
      });
      break;
    }
    case 'customers': {
      const [top, retention] = await Promise.all([
        topCustomers(db, entityId, dataset, query.limit),
        customerRetention(db, entityId, dataset),
      ]);
      const money = (value: number) => `${minorToDecimal(value, 2)} ${header.currency}`;
      tables.push({
        title: 'Retencao',
        columns: [],
        rows: [],
        facts: [
          { label: 'Clientes novos', value: String(retention.newCustomers) },
          { label: 'Clientes recorrentes', value: String(retention.returningCustomers) },
          { label: 'Receita de novos', value: money(retention.newRevenueMinor) },
          { label: 'Receita de recorrentes', value: money(retention.returningRevenueMinor) },
          { label: 'Vendas sem cliente', value: String(retention.guestTransactions) },
          {
            label: 'Taxa de retorno',
            value: `${(retention.repeatRateBps / 100).toFixed(2).replace('.', ',')}%`,
          },
        ],
      });
      tables.push({
        title: 'Melhores clientes',
        columns: [
          { key: 'name', label: 'Cliente', type: 'text', weight: 2.4 },
          { key: 'phone', label: 'Telefone', type: 'text', weight: 1.4 },
          { key: 'orderCount', label: 'Compras', type: 'integer' },
          { key: 'spendMinor', label: 'Total gasto', type: 'money' },
          { key: 'averageOrderMinor', label: 'Ticket medio', type: 'money' },
          { key: 'lastPurchaseAt', label: 'Ultima compra', type: 'date', weight: 1.6 },
        ],
        rows: top,
        totals: sumKeys(top, ['orderCount', 'spendMinor']),
      });
      break;
    }
    case 'profit-loss':
    default: {
      const waste = await loadWaste(db, entityId, dataset.window, query);
      tables.push({
        title: 'Resumo',
        columns: [],
        rows: [],
        facts: summaryFacts(summary, header.currency, includeFinancial),
      });
      tables.push({
        title: 'Perdas',
        columns: [],
        rows: [],
        facts: [
          { label: 'Descontos', value: `${minorToDecimal(summary.discountMinor, 2)} ${header.currency}` },
          { label: 'Devolucoes', value: `${minorToDecimal(summary.refundMinor, 2)} ${header.currency}` },
          { label: 'Quebras', value: `${minorToDecimal(waste.totalMinor, 2)} ${header.currency}` },
        ],
      });
      tables.push(seriesTable(dataset, query, includeFinancial));
      tables.push(
        breakdownTable('Por categoria', 'Categoria', breakdownByCategory(dataset), includeFinancial),
      );
      tables.push(
        breakdownTable(
          'Por produto',
          'Produto',
          breakdownByProduct(dataset, { limit: query.limit, sort: query.sort }),
          includeFinancial,
        ),
      );
      tables.push(
        breakdownTable('Por operador', 'Operador', breakdownByStaff(dataset), includeFinancial),
      );
      const payments = breakdownByPaymentMethod(dataset);
      tables.push({
        title: 'Por metodo de pagamento',
        columns: [
          { key: 'label', label: 'Metodo', type: 'text', weight: 2.4 },
          { key: 'transactions', label: 'Pagamentos', type: 'integer' },
          { key: 'revenueMinor', label: 'Valor liquido', type: 'money' },
          { key: 'refundMinor', label: 'Devolvido', type: 'money' },
          { key: 'share', label: 'Peso', type: 'share' },
        ],
        rows: payments,
        totals: sumKeys(payments, ['transactions', 'revenueMinor', 'refundMinor']),
      });
      break;
    }
  }

  return {
    title: REPORT_TITLES[report],
    filenameBase: REPORT_FILENAMES[report],
    entityName: header.name,
    entityNif: header.nif,
    currency: header.currency,
    periodFrom: from,
    periodTo: to,
    tables,
    notes,
  };
}
