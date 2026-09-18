import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import type { EntitySettings, Paginated } from '@pos/shared';

import { AUDIT_ACTIONS, auditRequest } from '../../lib/audit.js';
import {
  ApiError,
  asyncHandler,
  pageParams,
  paginated,
  parsedQuery,
  validateBody,
  validateQuery,
} from '../../lib/http.js';
import { requireAuth, requireAuthContext, requireEntity, requirePermission } from '../../lib/middleware.js';
import { prisma, TX_OPTIONS } from '../../lib/prisma.js';
import { getSettings, setSettings } from '../../lib/settings.js';

import { toAuditLogDto, toEntityDto, toNotificationDto, type AuditLogDto } from './mappers.js';
import { renderReceipt, sampleReceiptContext } from './receipt.js';
import {
  auditQuerySchema,
  importPayloadSchema,
  notificationQuerySchema,
  putTaxRatesSchema,
  receiptPreviewSchema,
  settingsPatchSchema,
  type AuditQuery,
  type ImportPayload,
  type NotificationQuery,
  type PutTaxRatesBody,
  type ReceiptPreviewBody,
  type SettingsPatch,
} from './schemas.js';
import {
  countExportableProducts,
  diffSettings,
  EXPORT_FORMAT,
  EXPORT_PRODUCT_CHUNK,
  EXPORT_VERSION,
  exportCategories,
  exportCustomers,
  exportEntityRecord,
  exportLocations,
  exportProductPage,
  exportPromotions,
  exportSuppliers,
  importCatalogue,
  productCountsByTaxRate,
  readTaxRates,
  writeTaxRates,
  TAX_RATES_KEY,
} from './service.js';

/** Actions the shared AUDIT_ACTIONS table does not carry. */
const AUDIT_TAX_RATES_UPDATE = 'settings.tax_rates_update';
const AUDIT_EXPORT = 'settings.export';
const AUDIT_IMPORT = 'settings.import';

const router = Router();

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/settings
 * The whole configuration screen in one call: the entity record carries
 * currency, pricing mode, default tax and branding; the settings blob carries
 * everything stored key-by-key.
 */
router.get(
  '/',
  requireAuth,
  requirePermission('settings:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);

    const [entity, settings] = await Promise.all([
      prisma.entity.findFirst({ where: { id: entityId, deletedAt: null } }),
      getSettings(entityId),
    ]);
    if (!entity) throw ApiError.notFound('Entidade nao encontrada.');

    res.json({ entity: toEntityDto(entity), settings });
  }),
);

/**
 * PATCH /api/settings
 * A partial EntitySettings. Unknown keys are ignored so the client may send
 * back whatever GET handed it.
 */
router.patch(
  '/',
  requireAuth,
  requirePermission('settings:write'),
  validateBody(settingsPatchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);
    const patch = req.body as SettingsPatch;

    const before = await getSettings(entityId);
    const effective = { ...before, ...patch } as EntitySettings;

    // Cross-field rules can only be judged against the merged result, because
    // the patch may move either side of the comparison.
    if (!effective.enabledPaymentMethods.includes(effective.defaultPaymentMethod)) {
      throw ApiError.unprocessable('Dados invalidos.', {
        defaultPaymentMethod: ['O metodo por omissao tem de estar entre os metodos activos.'],
      });
    }
    if (effective.kdsWarnAfterMinutes > effective.kdsAlertAfterMinutes) {
      throw ApiError.unprocessable('Dados invalidos.', {
        kdsWarnAfterMinutes: ['O aviso da cozinha tem de vir antes do alerta.'],
      });
    }

    const diff = diffSettings(
      before as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
    );

    if (diff.changedKeys.length === 0) {
      res.json({ settings: before, changed: [] });
      return;
    }

    const settings = await setSettings(entityId, patch as Partial<EntitySettings>);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      targetType: 'entity',
      targetId: entityId,
      details: { changed: diff.changedKeys, before: diff.before, after: diff.after },
    });

    res.json({ settings, changed: diff.changedKeys });
  }),
);

/* -------------------------------------------------------------------------- */
/* Tax catalogue                                                               */
/* -------------------------------------------------------------------------- */

/** GET /api/settings/tax-rates - what the product editor offers in its dropdown. */
router.get(
  '/tax-rates',
  requireAuth,
  requirePermission('settings:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);

    const [entity, rates, counts] = await Promise.all([
      prisma.entity.findFirst({
        where: { id: entityId, deletedAt: null },
        select: { defaultTaxRateBps: true },
      }),
      readTaxRates(entityId),
      productCountsByTaxRate(entityId),
    ]);
    if (!entity) throw ApiError.notFound('Entidade nao encontrada.');

    res.json({
      defaultTaxRateBps: entity.defaultTaxRateBps,
      rates: rates.map((rate) => ({
        ...rate,
        isDefault: rate.rateBps === entity.defaultTaxRateBps,
        productCount: counts.get(rate.rateBps) ?? 0,
      })),
    });
  }),
);

/**
 * PUT /api/settings/tax-rates
 * Replaces the list. A rate whose value is still stamped on a product cannot be
 * dropped - the response says how many products would be orphaned.
 */
router.put(
  '/tax-rates',
  requireAuth,
  requirePermission('settings:write'),
  validateBody(putTaxRatesSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);
    const { rates } = req.body as PutTaxRatesBody;

    const entity = await prisma.entity.findFirst({
      where: { id: entityId, deletedAt: null },
      select: { defaultTaxRateBps: true },
    });
    if (!entity) throw ApiError.notFound('Entidade nao encontrada.');

    const current = await readTaxRates(entityId);
    const keptValues = new Set(rates.map((rate) => rate.rateBps));
    const counts = await productCountsByTaxRate(entityId);

    const blocked: Array<{ id: string; namePt: string; rateBps: number; productCount: number }> = [];
    for (const rate of current) {
      if (keptValues.has(rate.rateBps)) continue;
      // The entity default is always a legal value, named or not.
      if (rate.rateBps === entity.defaultTaxRateBps) continue;
      const productCount = counts.get(rate.rateBps) ?? 0;
      if (productCount > 0) blocked.push({ ...rate, productCount });
    }

    if (blocked.length > 0) {
      const details: Record<string, string[]> = {};
      for (const rate of blocked) {
        details[rate.id] = [
          `${rate.productCount} produto(s) ainda utilizam "${rate.namePt}" (${rate.rateBps / 100}%).`,
        ];
      }
      throw new ApiError(
        409,
        'tax_rate_in_use',
        'Nao e possivel remover taxas ainda utilizadas por produtos.',
        details,
      );
    }

    await writeTaxRates(entityId, rates);

    await auditRequest(req, {
      action: AUDIT_TAX_RATES_UPDATE,
      targetType: 'settings',
      targetId: TAX_RATES_KEY,
      details: { before: current, after: rates },
    });

    res.json({
      defaultTaxRateBps: entity.defaultTaxRateBps,
      rates: rates.map((rate) => ({
        ...rate,
        isDefault: rate.rateBps === entity.defaultTaxRateBps,
        productCount: counts.get(rate.rateBps) ?? 0,
      })),
    });
  }),
);

/* -------------------------------------------------------------------------- */
/* Receipt preview                                                             */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/settings/receipt-preview
 * Renders the real receipt template against sample data. The optional settings
 * override lets the screen preview unsaved changes.
 */
router.post(
  '/receipt-preview',
  requireAuth,
  requirePermission('settings:read'),
  validateBody(receiptPreviewSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);
    const body = req.body as ReceiptPreviewBody;

    const [entity, stored] = await Promise.all([
      prisma.entity.findFirst({ where: { id: entityId, deletedAt: null } }),
      getSettings(entityId),
    ]);
    if (!entity) throw ApiError.notFound('Entidade nao encontrada.');

    const settings = { ...stored, ...(body.settings ?? {}) } as EntitySettings;
    const dto = toEntityDto(entity);

    const text = renderReceipt({
      entity: dto,
      settings,
      context: sampleReceiptContext(entity.defaultTaxRateBps),
    });

    res.json({ text, width: 42, lines: text.split('\n') });
  }),
);

/* -------------------------------------------------------------------------- */
/* Audit log - APPEND ONLY                                                     */
/* -------------------------------------------------------------------------- */
/*
 * There is deliberately no PATCH, PUT or DELETE route for /audit anywhere in
 * this module. The trail is written by lib/audit.ts and is read-only forever;
 * a log that can be edited is not evidence of anything.
 */

/** GET /api/settings/audit - newest first, filtered, paginated. */
router.get(
  '/audit',
  requireAuth,
  requirePermission('audit:read'),
  validateQuery(auditQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<AuditQuery>(res);
    const params = pageParams(query);

    const where: Prisma.AuditLogWhereInput = { entityId };
    if (query.action) where.action = query.action;
    if (query.userId) where.userId = query.userId;
    if (query.targetType) where.targetType = query.targetType;
    if (query.targetId) where.targetId = query.targetId;

    if (query.from || query.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.from) createdAt.gte = query.from;
      if (query.to) createdAt.lte = query.to;
      where.createdAt = createdAt;
    }

    if (query.search) {
      // SQLite has no case-insensitive mode; contains is the portable filter.
      where.OR = [
        { action: { contains: query.search } },
        { userName: { contains: query.search } },
        { targetType: { contains: query.search } },
        { targetId: { contains: query.search } },
        { details: { contains: query.search } },
        { ipAddress: { contains: query.search } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const body: Paginated<AuditLogDto> = paginated(rows.map(toAuditLogDto), total, params);
    res.json(body);
  }),
);

/** GET /api/settings/audit/actions - the values present, for the filter dropdown. */
router.get(
  '/audit/actions',
  requireAuth,
  requirePermission('audit:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);

    const groups = await prisma.auditLog.groupBy({
      by: ['action'],
      where: { entityId },
      _count: { _all: true },
      orderBy: { action: 'asc' },
    });

    res.json({
      data: groups.map((group) => ({ action: group.action, count: group._count._all })),
    });
  }),
);

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Notifications belong to the tenant, optionally narrowed to one role. Every
 * signed-in role can read its own, so the gate is entity:read rather than a
 * settings permission the kitchen screen would never hold.
 */
function visibleTo(entityId: string, role: string): Prisma.NotificationWhereInput {
  return { entityId, OR: [{ role: null }, { role }] };
}

/** GET /api/settings/notifications?unreadOnly=true */
router.get(
  '/notifications',
  requireAuth,
  requirePermission('entity:read'),
  validateQuery(notificationQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const query = parsedQuery<NotificationQuery>(res);

    const where: Prisma.NotificationWhereInput = visibleTo(entityId, auth.role);
    if (query.unreadOnly) where.readAt = null;

    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 50,
      }),
      prisma.notification.count({ where: { ...visibleTo(entityId, auth.role), readAt: null } }),
    ]);

    res.json({ data: rows.map(toNotificationDto), unreadCount });
  }),
);

/** POST /api/settings/notifications/read-all */
router.post(
  '/notifications/read-all',
  requireAuth,
  requirePermission('entity:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);

    const result = await prisma.notification.updateMany({
      where: { ...visibleTo(entityId, auth.role), readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ updated: result.count });
  }),
);

/** POST /api/settings/notifications/:id/read */
router.post(
  '/notifications/:id/read',
  requireAuth,
  requirePermission('entity:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const id = String(req.params.id);

    const existing = await prisma.notification.findFirst({
      where: { id, ...visibleTo(entityId, auth.role) },
    });
    if (!existing) throw ApiError.notFound('Notificacao nao encontrada.');

    const row = existing.readAt
      ? existing
      : await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });

    res.json(toNotificationDto(row));
  }),
);

/** DELETE /api/settings/notifications/:id */
router.delete(
  '/notifications/:id',
  requireAuth,
  requirePermission('entity:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const id = String(req.params.id);

    const existing = await prisma.notification.findFirst({
      where: { id, ...visibleTo(entityId, auth.role) },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Notificacao nao encontrada.');

    await prisma.notification.delete({ where: { id } });
    res.status(204).end();
  }),
);

/* -------------------------------------------------------------------------- */
/* Backup / portability                                                        */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/settings/export
 * The data portability escape hatch: everything that describes how this tenant
 * is configured and what it sells. No users, no password hashes, no sales.
 * Written section by section so a large catalogue never has to exist as one
 * giant string in memory.
 */
router.get(
  '/export',
  requireAuth,
  requirePermission('settings:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);

    const entity = await exportEntityRecord(entityId);
    if (!entity) throw ApiError.notFound('Entidade nao encontrada.');

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `pos-export-${entity.slug}-${stamp}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    let first = true;
    const write = (key: string, value: unknown): void => {
      res.write(`${first ? '' : ','}${JSON.stringify(key)}:${JSON.stringify(value)}`);
      first = false;
    };

    res.write('{');
    write('format', EXPORT_FORMAT);
    write('version', EXPORT_VERSION);
    write('exportedAt', new Date().toISOString());
    write('entity', entity);
    write('locations', await exportLocations(entityId));
    write('categories', await exportCategories(entityId));
    write('suppliers', await exportSuppliers(entityId));

    // Products stream a page at a time.
    res.write(`${first ? '' : ','}"products":[`);
    first = false;
    const total = await countExportableProducts(entityId);
    let written = 0;
    for (let skip = 0; skip < total; skip += EXPORT_PRODUCT_CHUNK) {
      const page = await exportProductPage(entityId, skip, EXPORT_PRODUCT_CHUNK);
      if (page.length === 0) break;
      for (const product of page) {
        res.write(`${written === 0 ? '' : ','}${JSON.stringify(product)}`);
        written++;
      }
    }
    res.write(']');

    write('customers', await exportCustomers(entityId));
    write('promotions', await exportPromotions(entityId));
    write('settings', await getSettings(entityId));
    write('taxRates', await readTaxRates(entityId));
    res.write('}');
    res.end();

    await auditRequest(req, {
      action: AUDIT_EXPORT,
      targetType: 'entity',
      targetId: entityId,
      details: { products: written, filename },
    });
  }),
);

/**
 * POST /api/settings/import
 * Accepts an export file and adds whatever is missing. Everything runs in one
 * transaction, old ids are mapped to new ones, and nothing that already exists
 * is overwritten.
 */
router.post(
  '/import',
  requireAuth,
  requirePermission('settings:write'),
  validateBody(importPayloadSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entityId = requireEntity(req);
    const payload = req.body as ImportPayload;

    if (payload.format && payload.format !== EXPORT_FORMAT) {
      throw ApiError.badRequest(`Formato de ficheiro desconhecido: ${payload.format}.`);
    }

    const hasContent =
      (payload.categories?.length ?? 0) +
        (payload.suppliers?.length ?? 0) +
        (payload.products?.length ?? 0) +
        (payload.customers?.length ?? 0) +
        (payload.promotions?.length ?? 0) +
        (payload.locations?.length ?? 0) >
        0 ||
      payload.settings !== undefined ||
      payload.taxRates !== undefined;

    if (!hasContent) throw ApiError.badRequest('O ficheiro nao contem dados para importar.');

    const summary = await prisma.$transaction(
      (tx) => importCatalogue(entityId, payload, tx),
      TX_OPTIONS,
    );

    await auditRequest(req, {
      action: AUDIT_IMPORT,
      targetType: 'entity',
      targetId: entityId,
      details: summary,
    });

    res.status(201).json({ summary });
  }),
);

export default router;
