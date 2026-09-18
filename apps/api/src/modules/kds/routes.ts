import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  PREP_STATIONS,
  PREP_STATION_LABELS,
  TICKET_STATUSES,
  type PrepStation,
  type TicketStatus,
} from '@pos/shared';

import { auditRequest } from '../../lib/audit.js';
import { asyncHandler, parsedQuery, validateBody, validateQuery } from '../../lib/http.js';
import { requireAuth, requireEntity, requirePermission } from '../../lib/middleware.js';
import { prisma } from '../../lib/prisma.js';

import { ageSeconds, ticketSelect, toStation, toTicketDto } from './mappers.js';
import {
  eightySixSchema,
  itemStatusSchema,
  summaryQuerySchema,
  ticketListQuerySchema,
  type EightySixInput,
  type ItemStatusInput,
  type SummaryQuery,
  type TicketListQuery,
} from './schemas.js';
import {
  ACTIVE_TICKET_STATUSES,
  publishAvailability,
  publishTicketMutation,
  readyTicket,
  recallTicket,
  serveTicket,
  setItemStatus,
  setProductAvailability,
  startTicket,
} from './service.js';

/**
 * Kitchen Display System.
 *
 * Read-only boards plus five taps: start, ready, served, recall and 86. There
 * is no money anywhere in this module, so there is nothing to gate on
 * canSeeCost - the kitchen sees dishes, quantities and the clock.
 */
const router = Router();

router.use(requireAuth);

const AUDIT = {
  TICKET_RECALL: 'kds.ticket_recall',
  PRODUCT_86: 'kds.product_86',
} as const;

/** Tickets that still count as work in progress, plus the pass. */
const BOARD_STATUSES: TicketStatus[] = [...ACTIVE_TICKET_STATUSES, 'ready'];

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/* -------------------------------------------------------------------------- */
/* Board                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/kds/tickets
 * ?station=grill|fry|salad|bar|dessert|pastry|expo  one prep station
 *                                                   (omit for the expo/pass view)
 * ?status=new,in_progress   defaults to the active board
 * ?course=, ?orderId=, ?limit=
 *
 * Oldest first: the kitchen works a queue.
 */
router.get(
  '/tickets',
  requirePermission('restaurant:kds'),
  validateQuery(ticketListQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<TicketListQuery>(res);

    const where: Prisma.KitchenTicketWhereInput = {
      entityId,
      status: { in: query.status },
    };
    if (query.station) where.station = query.station;
    if (query.orderId) where.orderId = query.orderId;
    if (query.course !== undefined) where.course = query.course;

    const rows = await prisma.kitchenTicket.findMany({
      where,
      select: ticketSelect,
      orderBy: [{ createdAt: 'asc' }, { ticketNumber: 'asc' }],
      take: query.limit,
    });

    const now = new Date();
    res.json({ data: rows.map((row) => toTicketDto(row, now)) });
  }),
);

/**
 * GET /api/kds/stations
 * The station tabs: every prep station with its live workload. Tickets without
 * a station land in the `unassigned` bucket rather than being lost.
 */
router.get(
  '/stations',
  requirePermission('restaurant:kds'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);

    const rows = await prisma.kitchenTicket.findMany({
      where: { entityId, status: { in: BOARD_STATUSES } },
      select: {
        station: true,
        status: true,
        createdAt: true,
        items: {
          where: { status: { notIn: ['cancelled', 'served'] } },
          select: { id: true },
        },
      },
    });

    interface Bucket {
      station: PrepStation | null;
      labelPt: string;
      labelEn: string;
      /** Tickets still to cook (new + in_progress). */
      ticketCount: number;
      /** Tickets sitting on the pass. */
      readyCount: number;
      itemCount: number;
      oldestAgeSeconds: number | null;
    }

    const buckets = new Map<PrepStation, Bucket>();
    for (const station of PREP_STATIONS) {
      buckets.set(station, {
        station,
        labelPt: PREP_STATION_LABELS[station].pt,
        labelEn: PREP_STATION_LABELS[station].en,
        ticketCount: 0,
        readyCount: 0,
        itemCount: 0,
        oldestAgeSeconds: null,
      });
    }

    const unassigned: Bucket = {
      station: null,
      labelPt: 'Sem posto',
      labelEn: 'Unassigned',
      ticketCount: 0,
      readyCount: 0,
      itemCount: 0,
      oldestAgeSeconds: null,
    };

    const now = new Date();
    for (const row of rows) {
      const station = toStation(row.station);
      const bucket = station ? buckets.get(station)! : unassigned;

      if (row.status === 'ready') {
        bucket.readyCount += 1;
        continue;
      }

      bucket.ticketCount += 1;
      bucket.itemCount += row.items.length;

      const age = ageSeconds(row.createdAt, now);
      if (bucket.oldestAgeSeconds === null || age > bucket.oldestAgeSeconds) {
        bucket.oldestAgeSeconds = age;
      }
    }

    const data = [...buckets.values()];
    res.json({
      data,
      unassigned,
      totals: {
        ticketCount: data.reduce((sum, b) => sum + b.ticketCount, 0) + unassigned.ticketCount,
        readyCount: data.reduce((sum, b) => sum + b.readyCount, 0) + unassigned.readyCount,
        itemCount: data.reduce((sum, b) => sum + b.itemCount, 0) + unassigned.itemCount,
      },
    });
  }),
);

/**
 * GET /api/kds/summary   ?station= &since=
 * Header counters. Open statuses are counted in full; served and cancelled are
 * counted inside the window (today by default) so yesterday's service does not
 * inflate the numbers. `oldestAgeSeconds` drives the colour alarm on the client.
 */
router.get(
  '/summary',
  requirePermission('restaurant:kds'),
  validateQuery(summaryQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<SummaryQuery>(res);
    const since = query.since ?? startOfToday();

    const scope: Prisma.KitchenTicketWhereInput = { entityId };
    if (query.station) scope.station = query.station;

    const [openRows, windowGroups] = await Promise.all([
      prisma.kitchenTicket.findMany({
        where: { ...scope, status: { in: BOARD_STATUSES } },
        select: { id: true, status: true, station: true, createdAt: true, order: { select: { orderNumber: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.kitchenTicket.groupBy({
        by: ['status'],
        where: { ...scope, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const counts = Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0])) as Record<
      TicketStatus,
      number
    >;
    for (const group of windowGroups) {
      if (group.status in counts) counts[group.status as TicketStatus] = group._count._all;
    }
    // Open tickets count in full, however long they have been hanging.
    for (const status of BOARD_STATUSES) counts[status] = 0;
    for (const row of openRows) {
      if (row.status in counts) counts[row.status as TicketStatus] += 1;
    }

    const now = new Date();
    const oldestRow = openRows.find((row) =>
      (ACTIVE_TICKET_STATUSES as string[]).includes(row.status),
    );
    const oldestAgeSeconds = oldestRow ? ageSeconds(oldestRow.createdAt, now) : null;

    res.json({
      data: {
        station: query.station ?? null,
        since: since.toISOString(),
        generatedAt: now.toISOString(),
        counts,
        activeTickets: counts.new + counts.in_progress,
        readyTickets: counts.ready,
        oldestAgeSeconds,
        oldest: oldestRow
          ? {
              ticketId: oldestRow.id,
              orderNumber: oldestRow.order?.orderNumber ?? null,
              station: toStation(oldestRow.station),
              status: oldestRow.status,
              createdAt: oldestRow.createdAt.toISOString(),
              ageSeconds: oldestAgeSeconds,
            }
          : null,
      },
    });
  }),
);

/* -------------------------------------------------------------------------- */
/* Ticket transitions                                                          */
/* -------------------------------------------------------------------------- */

/** POST /api/kds/tickets/:id/start - 'new' -> 'in_progress'. */
router.post(
  '/tickets/:id/start',
  requirePermission('restaurant:kds'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const result = await startTicket(entityId, req.params.id);
    publishTicketMutation(entityId, result);
    res.json({ data: result.ticket });
  }),
);

/** POST /api/kds/tickets/:id/ready - food on the pass; may call the waiter. */
router.post(
  '/tickets/:id/ready',
  requirePermission('restaurant:kds'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const result = await readyTicket(entityId, req.params.id);
    publishTicketMutation(entityId, result);
    res.json({ data: result.ticket, orderReady: result.orderBecameReady });
  }),
);

/** POST /api/kds/tickets/:id/served - the waiter took it to the table. */
router.post(
  '/tickets/:id/served',
  requirePermission('restaurant:kds'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const result = await serveTicket(entityId, req.params.id);
    publishTicketMutation(entityId, result);
    res.json({ data: result.ticket });
  }),
);

/** POST /api/kds/tickets/:id/recall - 'ready' -> 'in_progress'. */
router.post(
  '/tickets/:id/recall',
  requirePermission('restaurant:kds'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const result = await recallTicket(entityId, req.params.id);

    // Rare enough to be worth a trail: it undoes something the floor was told.
    await auditRequest(req, {
      action: AUDIT.TICKET_RECALL,
      targetType: 'kitchen_ticket',
      targetId: result.ticket.id,
      details: {
        orderNumber: result.ticket.orderNumber,
        ticketNumber: result.ticket.ticketNumber,
        station: result.ticket.station,
      },
    });

    publishTicketMutation(entityId, result);
    res.json({ data: result.ticket });
  }),
);

/* -------------------------------------------------------------------------- */
/* Single line                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/kds/items/:id/status  { status }
 * Advances one line; the parent ticket's status is recomputed from all lines.
 */
router.post(
  '/items/:id/status',
  requirePermission('restaurant:kds'),
  validateBody(itemStatusSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as ItemStatusInput;

    const result = await setItemStatus(entityId, req.params.id, body.status);
    publishTicketMutation(entityId, result);

    res.json({
      data: result.ticket,
      item: { id: result.itemId, status: result.itemStatus },
      orderReady: result.orderBecameReady,
    });
  }),
);

/**
 * POST /api/kds/items/:id/86  { available: false, productId?, note? }
 * Kills a dish for the rest of service (or puts it back with available: true).
 * :id may be an order item id or the product id itself; body.productId wins.
 */
router.post(
  '/items/:id/86',
  requirePermission('restaurant:kds'),
  validateBody(eightySixSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as EightySixInput;

    const result = await setProductAvailability(entityId, req.params.id, {
      productId: body.productId,
      available: body.available,
    });

    await auditRequest(req, {
      action: AUDIT.PRODUCT_86,
      targetType: 'product',
      targetId: result.productId,
      details: {
        name: result.name,
        available: result.available,
        note: body.note ?? null,
      },
    });

    publishAvailability(entityId, result, body.note);
    res.json({
      data: {
        productId: result.productId,
        name: result.name,
        available: result.available,
        changed: result.changed,
      },
    });
  }),
);

export default router;
