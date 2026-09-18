import { Router, type Request } from 'express';

import { auditRequest } from '../../lib/audit.js';
import {
  ApiError,
  asyncHandler,
  pageParams,
  paginated,
  parsedQuery,
  validateQuery,
} from '../../lib/http.js';
import { requireAuth, requireAuthContext, requireEntity, requirePermission } from '../../lib/middleware.js';
import { prisma } from '../../lib/prisma.js';

import { buildExportDocument } from './documents.js';
import {
  contentDisposition,
  exportFilename,
  renderCsv,
  renderPdf,
} from './exporters.js';
import {
  byProductQuerySchema,
  deadStockQuerySchema,
  EXPORT_REPORTS,
  exportQuerySchema,
  movementsQuerySchema,
  reportFiltersSchema,
  seriesQuerySchema,
  topCustomersQuerySchema,
  valuationQuerySchema,
  type ByProductQuery,
  type DeadStockQuery,
  type ExportQuery,
  type ExportReport,
  type MovementsQuery,
  type ReportFiltersQuery,
  type SeriesQuery,
  type TopCustomersQuery,
  type ValuationQuery,
} from './schemas.js';
import {
  breakdownByCategory,
  breakdownByDayOfWeek,
  breakdownByPaymentMethod,
  breakdownByProduct,
  breakdownByStaff,
  buildHeatmap,
  buildSeries,
  customerRetention,
  dashboard,
  deadStock,
  inventoryValuation,
  loadSalesDataset,
  metaOf,
  profitAndLoss,
  stockMovementsReport,
  stripFinancial,
  stripFinancialRows,
  summarise,
  topCustomers,
} from './service.js';

const router = Router();

/**
 * Reports. Volume-only numbers need `report:read`; anything that exposes cost,
 * COGS or margin additionally needs `report:financial`, and the cost fields are
 * removed from the payload rather than zeroed when the caller lacks it.
 */

/** True when this caller may be shown cost, COGS and margin. */
function financialAllowed(req: Request): boolean {
  return requireAuthContext(req).permissions.includes('report:financial');
}

const COST_KEYS = [
  'cogsMinor',
  'profitMinor',
  'marginBps',
  'grossProfitMinor',
  'grossMarginBps',
  'unitCostMinor',
  'tiedUpCapitalMinor',
  'costValueMinor',
  'potentialProfitMinor',
  'valueMinor',
];

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

router.get(
  '/dashboard',
  requireAuth,
  requirePermission('report:read'),
  validateQuery(reportFiltersSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const filters = parsedQuery<ReportFiltersQuery>(res);
    const report = await dashboard(prisma, entityId, filters);

    if (financialAllowed(req)) {
      res.json(report);
      return;
    }
    res.json({
      ...stripFinancial(report, COST_KEYS),
      previous: stripFinancial(report.previous, COST_KEYS),
      meta: report.meta,
    });
  }),
);

/* -------------------------------------------------------------------------- */
/* Sales analytics                                                             */
/* -------------------------------------------------------------------------- */

router.get(
  '/sales/series',
  requireAuth,
  requirePermission('report:read'),
  validateQuery(seriesQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<SeriesQuery>(res);
    const dataset = await loadSalesDataset(prisma, entityId, query);
    const points = buildSeries(dataset, query.granularity);

    res.json({
      granularity: query.granularity,
      data: financialAllowed(req) ? points : stripFinancialRows(points, COST_KEYS),
      meta: metaOf(dataset),
    });
  }),
);

router.get(
  '/sales/by-category',
  requireAuth,
  requirePermission('report:read'),
  validateQuery(reportFiltersSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const dataset = await loadSalesDataset(prisma, entityId, parsedQuery<ReportFiltersQuery>(res));
    const rows = breakdownByCategory(dataset);
    res.json({
      data: financialAllowed(req) ? rows : stripFinancialRows(rows, COST_KEYS),
      meta: metaOf(dataset),
    });
  }),
);

router.get(
  '/sales/by-product',
  requireAuth,
  requirePermission('report:read'),
  validateQuery(byProductQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<ByProductQuery>(res);
    const allowed = financialAllowed(req);
    if (!allowed && (query.sort === 'profit' || query.sort === 'margin')) {
      throw ApiError.forbidden('Ordenacao por lucro ou margem exige a permissao report:financial.');
    }
    const dataset = await loadSalesDataset(prisma, entityId, query);
    const rows = breakdownByProduct(dataset, { limit: query.limit, sort: query.sort });
    res.json({
      sort: query.sort,
      limit: query.limit,
      data: allowed ? rows : stripFinancialRows(rows, COST_KEYS),
      meta: metaOf(dataset),
    });
  }),
);

router.get(
  '/sales/by-staff',
  requireAuth,
  requirePermission('report:read'),
  validateQuery(reportFiltersSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const dataset = await loadSalesDataset(prisma, entityId, parsedQuery<ReportFiltersQuery>(res));
    const rows = breakdownByStaff(dataset);
    res.json({
      data: financialAllowed(req) ? rows : stripFinancialRows(rows, COST_KEYS),
      meta: metaOf(dataset),
    });
  }),
);

router.get(
  '/sales/by-payment-method',
  requireAuth,
  requirePermission('report:read'),
  validateQuery(reportFiltersSchema),
  asyncHandler(async (_req, res) => {
    const entityId = requireEntity(_req);
    const dataset = await loadSalesDataset(prisma, entityId, parsedQuery<ReportFiltersQuery>(res));
    res.json({ data: breakdownByPaymentMethod(dataset), meta: metaOf(dataset) });
  }),
);

router.get(
  '/sales/heatmap',
  requireAuth,
  requirePermission('report:read'),
  validateQuery(reportFiltersSchema),
  asyncHandler(async (_req, res) => {
    const entityId = requireEntity(_req);
    const dataset = await loadSalesDataset(prisma, entityId, parsedQuery<ReportFiltersQuery>(res));
    res.json({ data: buildHeatmap(dataset), meta: metaOf(dataset) });
  }),
);

router.get(
  '/sales/by-day-of-week',
  requireAuth,
  requirePermission('report:read'),
  validateQuery(reportFiltersSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const dataset = await loadSalesDataset(prisma, entityId, parsedQuery<ReportFiltersQuery>(res));
    const rows = breakdownByDayOfWeek(dataset);
    res.json({
      data: financialAllowed(req) ? rows : stripFinancialRows(rows, COST_KEYS),
      meta: metaOf(dataset),
    });
  }),
);

/* -------------------------------------------------------------------------- */
/* Profit and loss                                                             */
/* -------------------------------------------------------------------------- */

router.get(
  '/profit-loss',
  requireAuth,
  requirePermission('report:read', 'report:financial'),
  validateQuery(seriesQuerySchema),
  asyncHandler(async (_req, res) => {
    const entityId = requireEntity(_req);
    const query = parsedQuery<SeriesQuery>(res);
    res.json(await profitAndLoss(prisma, entityId, query, { granularity: query.granularity }));
  }),
);

/* -------------------------------------------------------------------------- */
/* Inventory                                                                   */
/* -------------------------------------------------------------------------- */

router.get(
  '/inventory/valuation',
  requireAuth,
  requirePermission('report:read', 'report:financial'),
  validateQuery(valuationQuerySchema),
  asyncHandler(async (_req, res) => {
    const entityId = requireEntity(_req);
    const query = parsedQuery<ValuationQuery>(res);
    res.json(await inventoryValuation(prisma, entityId, query, { includeZero: query.includeZero }));
  }),
);

router.get(
  '/inventory/movements',
  requireAuth,
  requirePermission('report:read', 'inventory:read'),
  validateQuery(movementsQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<MovementsQuery>(res);
    const params = pageParams(query);
    const { rows, total } = await stockMovementsReport(prisma, entityId, query, {
      type: query.type,
      reason: query.reason,
      skip: params.skip,
      take: params.take,
    });
    res.json(
      paginated(financialAllowed(req) ? rows : stripFinancialRows(rows, COST_KEYS), total, params),
    );
  }),
);

router.get(
  '/inventory/dead-stock',
  requireAuth,
  requirePermission('report:read', 'report:financial'),
  validateQuery(deadStockQuerySchema),
  asyncHandler(async (_req, res) => {
    const entityId = requireEntity(_req);
    const query = parsedQuery<DeadStockQuery>(res);
    res.json(await deadStock(prisma, entityId, query, { days: query.days, limit: query.limit }));
  }),
);

/* -------------------------------------------------------------------------- */
/* Customers                                                                   */
/* -------------------------------------------------------------------------- */

router.get(
  '/customers/top',
  requireAuth,
  requirePermission('report:read', 'customer:read'),
  validateQuery(topCustomersQuerySchema),
  asyncHandler(async (_req, res) => {
    const entityId = requireEntity(_req);
    const query = parsedQuery<TopCustomersQuery>(res);
    const dataset = await loadSalesDataset(prisma, entityId, query);
    res.json({
      data: await topCustomers(prisma, entityId, dataset, query.limit),
      meta: metaOf(dataset),
    });
  }),
);

router.get(
  '/customers/retention',
  requireAuth,
  requirePermission('report:read', 'customer:read'),
  validateQuery(reportFiltersSchema),
  asyncHandler(async (_req, res) => {
    const entityId = requireEntity(_req);
    const dataset = await loadSalesDataset(prisma, entityId, parsedQuery<ReportFiltersQuery>(res));
    const retention = await customerRetention(prisma, entityId, dataset);
    res.json({ ...retention, summary: summarise(dataset), meta: metaOf(dataset) });
  }),
);

/* -------------------------------------------------------------------------- */
/* Exports                                                                     */
/* -------------------------------------------------------------------------- */

router.get(
  '/export/:report',
  requireAuth,
  requirePermission('report:read'),
  validateQuery(exportQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<ExportQuery>(res);

    const name = String(req.params.report ?? '');
    if (!(EXPORT_REPORTS as readonly string[]).includes(name)) {
      throw ApiError.notFound(
        `Relatorio desconhecido: ${name}. Disponiveis: ${EXPORT_REPORTS.join(', ')}.`,
      );
    }
    const report = name as ExportReport;

    const allowed = financialAllowed(req);
    if (!allowed && (report === 'profit-loss' || report === 'inventory')) {
      throw ApiError.forbidden('Permissao em falta: report:financial.');
    }

    const document = await buildExportDocument(prisma, entityId, report, query, allowed);
    const filename = exportFilename(
      document.filenameBase,
      document.periodFrom,
      document.periodTo,
      query.format,
    );

    const body = query.format === 'pdf' ? await renderPdf(document) : renderCsv(document);

    await auditRequest(req, {
      action: 'report.export',
      targetType: 'report',
      targetId: report,
      details: { format: query.format, from: query.from ?? null, to: query.to ?? null },
    });

    res.setHeader(
      'Content-Type',
      query.format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8',
    );
    res.setHeader('Content-Disposition', contentDisposition(filename));
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  }),
);

export default router;
