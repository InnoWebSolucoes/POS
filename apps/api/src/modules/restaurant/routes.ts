import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  applyBps,
  computeLine,
  computeLineDiscount,
  roundHalfUp,
  type CartModifier,
  type OrderDto,
  type RestaurantTableDto,
} from '@pos/shared';

import { auditRequest, AUDIT_ACTIONS } from '../../lib/audit.js';
import { ApiError, asyncHandler, parsedQuery, validateBody, validateQuery } from '../../lib/http.js';
import {
  canSeeCost,
  requireAuth,
  requireAuthContext,
  requireEntity,
  requirePermission,
} from '../../lib/middleware.js';
import { prisma, TX_OPTIONS, type Tx } from '../../lib/prisma.js';
import { nextDocumentNumber } from '../../lib/sequence.js';

import {
  areaSelect,
  orderSelect,
  serializeModifiers,
  tableSelect,
  toAreaDto,
  toTableDto,
  type OrderItemRow,
  type TableRollup,
} from './mappers.js';
import {
  addItemsSchema,
  areaCreateSchema,
  areaUpdateSchema,
  cancelSchema,
  fireCourseSchema,
  holdSchema,
  itemUpdateSchema,
  layoutSchema,
  orderCreateSchema,
  orderListQuerySchema,
  orderUpdateSchema,
  sendSchema,
  splitSchema,
  tableCreateSchema,
  tableListQuerySchema,
  tableMergeSchema,
  tableMoveSchema,
  tableStatusSchema,
  tableUpdateSchema,
  tipSchema,
  type AddItemsInput,
  type AreaCreateInput,
  type AreaUpdateInput,
  type CancelInput,
  type FireCourseInput,
  type HoldInput,
  type ItemUpdateInput,
  type LayoutInput,
  type OrderCreateInput,
  type OrderListQuery,
  type OrderUpdateInput,
  type SendInput,
  type SplitInput,
  type TableCreateInput,
  type TableListQuery,
  type TableMergeInput,
  type TableMoveInput,
  type TableStatusInput,
  type TableUpdateInput,
  type TipInput,
} from './schemas.js';
import {
  allocateBills,
  assertOrderEditable,
  billLines,
  computeOrderTotals,
  createTicketsForItems,
  emitOrderUpdated,
  emitTableUpdated,
  emitTicketsCreated,
  evenBills,
  isLiveItem,
  isPending,
  loadMenuProducts,
  loadOrderContext,
  loadOrderOrThrow,
  loadTickets,
  OPEN_ORDER_STATUSES,
  orderDto,
  priceItem,
  recomputeOrder,
  resolveModifiers,
  round3,
  ticketDtos,
  type Bill,
  type OrderMoney,
} from './service.js';

const router = Router();

/** Every route in this module is authenticated and tenant-scoped. */
router.use(requireAuth);

const AUDIT = {
  AREA_CREATE: 'restaurant.area_create',
  AREA_UPDATE: 'restaurant.area_update',
  AREA_DELETE: 'restaurant.area_delete',
  TABLE_CREATE: 'restaurant.table_create',
  TABLE_UPDATE: 'restaurant.table_update',
  TABLE_DELETE: 'restaurant.table_delete',
  TABLE_LAYOUT: 'restaurant.table_layout',
  TABLE_MERGE: 'restaurant.table_merge',
  TABLE_MOVE: 'restaurant.table_move',
  ORDER_CREATE: 'restaurant.order_create',
  ORDER_CANCEL: 'restaurant.order_cancel',
  ORDER_DISCOUNT: 'restaurant.order_discount',
  ORDER_TIP: 'restaurant.order_tip',
} as const;

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Live rollup of the open order sitting on each table. */
async function tableRollups(
  entityId: string,
  tableIds?: string[],
  client: Tx = prisma,
): Promise<Map<string, TableRollup>> {
  const rows = await client.order.findMany({
    where: {
      entityId,
      status: { in: OPEN_ORDER_STATUSES },
      tableId: tableIds ? { in: tableIds } : { not: null },
    },
    select: {
      id: true,
      tableId: true,
      totalMinor: true,
      openedAt: true,
      serverName: true,
      guestCount: true,
    },
    orderBy: { openedAt: 'asc' },
  });

  const map = new Map<string, TableRollup>();
  for (const row of rows) {
    if (!row.tableId || map.has(row.tableId)) continue;
    map.set(row.tableId, {
      activeOrderId: row.id,
      orderTotalMinor: Number(row.totalMinor),
      openedAt: row.openedAt.toISOString(),
      serverName: row.serverName,
      guestCount: row.guestCount,
    });
  }
  return map;
}

async function findTableOrThrow(entityId: string, tableId: string, client: Tx = prisma) {
  const row = await client.restaurantTable.findFirst({
    where: { id: tableId, entityId },
    select: tableSelect,
  });
  if (!row) throw ApiError.notFound('Mesa nao encontrada.');
  return row;
}

async function findAreaOrThrow(entityId: string, areaId: string, client: Tx = prisma) {
  const row = await client.floorArea.findFirst({
    where: { id: areaId, entityId },
    select: areaSelect,
  });
  if (!row) throw ApiError.notFound('Zona nao encontrada.');
  return row;
}

/** The order currently occupying a table, if any. */
async function openOrderForTable(entityId: string, tableId: string, client: Tx = prisma) {
  return client.order.findFirst({
    where: { entityId, tableId, status: { in: OPEN_ORDER_STATUSES } },
    orderBy: { openedAt: 'asc' },
    select: { id: true, orderNumber: true, status: true, discountMinor: true },
  });
}

/** Reloads the order, pushes it to every tablet and hands the DTO back. */
async function publishOrder(entityId: string, orderId: string): Promise<OrderDto> {
  const row = await loadOrderOrThrow(entityId, orderId);
  const dto = orderDto(row);
  emitOrderUpdated(entityId, dto);
  return dto;
}

async function publishTable(
  entityId: string,
  tableId: string | null | undefined,
): Promise<RestaurantTableDto | null> {
  if (!tableId) return null;
  const row = await prisma.restaurantTable.findFirst({
    where: { id: tableId, entityId },
    select: tableSelect,
  });
  if (!row) return null;
  const rollups = await tableRollups(entityId, [tableId]);
  const dto = toTableDto(row, rollups.get(tableId) ?? null);
  emitTableUpdated(entityId, dto);
  return dto;
}

function liveItems(items: OrderItemRow[]): OrderItemRow[] {
  return items.filter((item) => isLiveItem(item.status));
}

/** Sum of line values before any discount - the weight base for allocations. */
function afterLineDiscountValue(items: OrderItemRow[]): number {
  return liveItems(items).reduce(
    (sum, item) =>
      sum +
      roundHalfUp(Number(item.unitPriceMinor) * item.quantity) -
      Number(item.discountMinor),
    0,
  );
}

/* -------------------------------------------------------------------------- */
/* Floor plan - areas                                                          */
/* -------------------------------------------------------------------------- */

/** GET /api/restaurant/areas - the floor plan, tables included, with live rollups. */
router.get(
  '/areas',
  requirePermission('restaurant:table'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);

    const [areas, tables, rollups] = await Promise.all([
      prisma.floorArea.findMany({
        where: { entityId },
        select: areaSelect,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.restaurantTable.findMany({
        where: { entityId, active: true },
        select: tableSelect,
        orderBy: [{ name: 'asc' }],
      }),
      tableRollups(entityId),
    ]);

    const byArea = new Map<string, RestaurantTableDto[]>();
    for (const table of tables) {
      const dto = toTableDto(table, rollups.get(table.id) ?? null);
      const bucket = byArea.get(table.areaId);
      if (bucket) bucket.push(dto);
      else byArea.set(table.areaId, [dto]);
    }

    res.json({ data: areas.map((area) => toAreaDto(area, byArea.get(area.id) ?? [])) });
  }),
);

/** POST /api/restaurant/areas */
router.post(
  '/areas',
  requirePermission('restaurant:floorplan'),
  validateBody(areaCreateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as AreaCreateInput;

    const sortOrder =
      body.sortOrder ?? (await prisma.floorArea.count({ where: { entityId } }));

    const created = await prisma.floorArea.create({
      data: {
        entityId,
        name: body.name,
        sortOrder,
        width: body.width ?? 1200,
        height: body.height ?? 800,
        backgroundUrl: body.backgroundUrl ?? null,
      },
      select: areaSelect,
    });

    await auditRequest(req, {
      action: AUDIT.AREA_CREATE,
      targetType: 'floor_area',
      targetId: created.id,
      details: { name: created.name },
    });

    res.status(201).json(toAreaDto(created, []));
  }),
);

/** PATCH /api/restaurant/areas/:id */
router.patch(
  '/areas/:id',
  requirePermission('restaurant:floorplan'),
  validateBody(areaUpdateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as AreaUpdateInput;
    await findAreaOrThrow(entityId, req.params.id);

    const updated = await prisma.floorArea.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.width !== undefined ? { width: body.width } : {}),
        ...(body.height !== undefined ? { height: body.height } : {}),
        ...(body.backgroundUrl !== undefined ? { backgroundUrl: body.backgroundUrl } : {}),
      },
      select: areaSelect,
    });

    const tables = await prisma.restaurantTable.findMany({
      where: { entityId, areaId: updated.id, active: true },
      select: tableSelect,
      orderBy: [{ name: 'asc' }],
    });
    const rollups = await tableRollups(
      entityId,
      tables.map((t) => t.id),
    );

    await auditRequest(req, {
      action: AUDIT.AREA_UPDATE,
      targetType: 'floor_area',
      targetId: updated.id,
      details: body,
    });

    res.json(
      toAreaDto(
        updated,
        tables.map((t) => toTableDto(t, rollups.get(t.id) ?? null)),
      ),
    );
  }),
);

/** DELETE /api/restaurant/areas/:id - refused while the area still has tables. */
router.delete(
  '/areas/:id',
  requirePermission('restaurant:floorplan'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    await findAreaOrThrow(entityId, req.params.id);

    const tableCount = await prisma.restaurantTable.count({
      where: { entityId, areaId: req.params.id },
    });
    if (tableCount > 0) {
      throw ApiError.conflict(
        `A zona ainda tem ${tableCount} mesa(s). Mova ou elimine as mesas primeiro.`,
      );
    }

    await prisma.floorArea.delete({ where: { id: req.params.id } });

    await auditRequest(req, {
      action: AUDIT.AREA_DELETE,
      targetType: 'floor_area',
      targetId: req.params.id,
    });

    res.json({ id: req.params.id, deleted: true });
  }),
);

/* -------------------------------------------------------------------------- */
/* Floor plan - tables                                                         */
/* -------------------------------------------------------------------------- */

/** GET /api/restaurant/tables?areaId=&status= */
router.get(
  '/tables',
  requirePermission('restaurant:table'),
  validateQuery(tableListQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<TableListQuery>(res);

    const where: Prisma.RestaurantTableWhereInput = { entityId };
    if (!query.includeInactive) where.active = true;
    if (query.areaId) where.areaId = query.areaId;
    if (query.status) where.status = query.status;

    const rows = await prisma.restaurantTable.findMany({
      where,
      select: tableSelect,
      orderBy: [{ areaId: 'asc' }, { name: 'asc' }],
    });
    const rollups = await tableRollups(
      entityId,
      rows.map((r) => r.id),
    );

    res.json({ data: rows.map((row) => toTableDto(row, rollups.get(row.id) ?? null)) });
  }),
);

/** POST /api/restaurant/tables */
router.post(
  '/tables',
  requirePermission('restaurant:floorplan'),
  validateBody(tableCreateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as TableCreateInput;

    await findAreaOrThrow(entityId, body.areaId);

    const clash = await prisma.restaurantTable.findFirst({
      where: { entityId, name: body.name },
      select: { id: true },
    });
    if (clash) throw ApiError.conflict(`Ja existe uma mesa com o nome "${body.name}".`);

    const created = await prisma.restaurantTable.create({
      data: {
        entityId,
        areaId: body.areaId,
        name: body.name,
        shape: body.shape,
        x: body.x,
        y: body.y,
        width: body.width,
        height: body.height,
        rotation: body.rotation ?? 0,
        seats: body.seats,
        status: 'available',
      },
      select: tableSelect,
    });

    await auditRequest(req, {
      action: AUDIT.TABLE_CREATE,
      targetType: 'restaurant_table',
      targetId: created.id,
      details: { name: created.name, areaId: created.areaId },
    });

    const dto = toTableDto(created, null);
    emitTableUpdated(entityId, dto);
    res.status(201).json(dto);
  }),
);

/**
 * POST /api/restaurant/tables/layout - the floor plan editor's bulk save.
 * Declared before /tables/:id so the literal path always wins.
 */
router.post(
  '/tables/layout',
  requirePermission('restaurant:floorplan'),
  validateBody(layoutSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as LayoutInput;

    const ids = body.tables.map((t) => t.id);
    if (new Set(ids).size !== ids.length) {
      throw ApiError.unprocessable('A mesma mesa aparece duas vezes no esquema.');
    }

    const existing = await prisma.restaurantTable.findMany({
      where: { entityId, id: { in: ids } },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      const known = new Set(existing.map((t) => t.id));
      const missing = ids.filter((id) => !known.has(id));
      throw ApiError.notFound(`Mesas inexistentes: ${missing.join(', ')}.`);
    }

    const areaIds = [...new Set(body.tables.map((t) => t.areaId).filter(Boolean))] as string[];
    if (areaIds.length) {
      const areas = await prisma.floorArea.count({
        where: { entityId, id: { in: areaIds } },
      });
      if (areas !== areaIds.length) throw ApiError.notFound('Zona inexistente no esquema.');
    }

    const names = body.tables.map((t) => t.name).filter(Boolean) as string[];
    if (new Set(names).size !== names.length) {
      throw ApiError.conflict('Nomes de mesa repetidos no esquema.');
    }

    await prisma.$transaction(async (tx) => {
      for (const table of body.tables) {
        await tx.restaurantTable.update({
          where: { id: table.id },
          data: {
            ...(table.areaId !== undefined ? { areaId: table.areaId } : {}),
            ...(table.x !== undefined ? { x: table.x } : {}),
            ...(table.y !== undefined ? { y: table.y } : {}),
            ...(table.width !== undefined ? { width: table.width } : {}),
            ...(table.height !== undefined ? { height: table.height } : {}),
            ...(table.rotation !== undefined ? { rotation: table.rotation } : {}),
            ...(table.shape !== undefined ? { shape: table.shape } : {}),
            ...(table.seats !== undefined ? { seats: table.seats } : {}),
            ...(table.name !== undefined ? { name: table.name } : {}),
          },
        });
      }
    }, TX_OPTIONS);

    const rows = await prisma.restaurantTable.findMany({
      where: { entityId, id: { in: ids } },
      select: tableSelect,
    });
    const rollups = await tableRollups(entityId, ids);
    const dtos = rows.map((row) => toTableDto(row, rollups.get(row.id) ?? null));

    for (const dto of dtos) emitTableUpdated(entityId, dto);

    await auditRequest(req, {
      action: AUDIT.TABLE_LAYOUT,
      targetType: 'restaurant_table',
      targetId: null,
      details: { count: dtos.length },
    });

    res.json({ data: dtos });
  }),
);

/** PATCH /api/restaurant/tables/:id - drag-and-drop geometry and naming. */
router.patch(
  '/tables/:id',
  requirePermission('restaurant:floorplan'),
  validateBody(tableUpdateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as TableUpdateInput;
    await findTableOrThrow(entityId, req.params.id);

    if (body.areaId) await findAreaOrThrow(entityId, body.areaId);

    if (body.name) {
      const clash = await prisma.restaurantTable.findFirst({
        where: { entityId, name: body.name, id: { not: req.params.id } },
        select: { id: true },
      });
      if (clash) throw ApiError.conflict(`Ja existe uma mesa com o nome "${body.name}".`);
    }

    const updated = await prisma.restaurantTable.update({
      where: { id: req.params.id },
      data: {
        ...(body.areaId !== undefined ? { areaId: body.areaId } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.shape !== undefined ? { shape: body.shape } : {}),
        ...(body.x !== undefined ? { x: body.x } : {}),
        ...(body.y !== undefined ? { y: body.y } : {}),
        ...(body.width !== undefined ? { width: body.width } : {}),
        ...(body.height !== undefined ? { height: body.height } : {}),
        ...(body.rotation !== undefined ? { rotation: body.rotation } : {}),
        ...(body.seats !== undefined ? { seats: body.seats } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
      select: tableSelect,
    });

    const rollups = await tableRollups(entityId, [updated.id]);
    const dto = toTableDto(updated, rollups.get(updated.id) ?? null);
    emitTableUpdated(entityId, dto);

    await auditRequest(req, {
      action: AUDIT.TABLE_UPDATE,
      targetType: 'restaurant_table',
      targetId: updated.id,
      details: body,
    });

    res.json(dto);
  }),
);

/** DELETE /api/restaurant/tables/:id - refused while an order is open on it. */
router.delete(
  '/tables/:id',
  requirePermission('restaurant:floorplan'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const table = await findTableOrThrow(entityId, req.params.id);

    const open = await openOrderForTable(entityId, table.id);
    if (open) {
      throw ApiError.conflict(
        `A mesa ${table.name} tem o pedido ${open.orderNumber} em aberto.`,
      );
    }

    await prisma.restaurantTable.delete({ where: { id: table.id } });

    await auditRequest(req, {
      action: AUDIT.TABLE_DELETE,
      targetType: 'restaurant_table',
      targetId: table.id,
      details: { name: table.name },
    });

    res.json({ id: table.id, deleted: true });
  }),
);

/** POST /api/restaurant/tables/:id/status */
router.post(
  '/tables/:id/status',
  requirePermission('restaurant:table'),
  validateBody(tableStatusSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as TableStatusInput;
    const table = await findTableOrThrow(entityId, req.params.id);

    if (body.status === 'available') {
      const open = await openOrderForTable(entityId, table.id);
      if (open) {
        throw ApiError.conflict(
          `Nao e possivel libertar a mesa ${table.name}: o pedido ${open.orderNumber} continua aberto.`,
        );
      }
    }

    const updated = await prisma.restaurantTable.update({
      where: { id: table.id },
      data: {
        status: body.status,
        ...(body.status === 'available' ? { activeOrderId: null, mergedIntoId: null } : {}),
      },
      select: tableSelect,
    });

    const rollups = await tableRollups(entityId, [updated.id]);
    const dto = toTableDto(updated, rollups.get(updated.id) ?? null);
    emitTableUpdated(entityId, dto);

    res.json(dto);
  }),
);

/**
 * POST /api/restaurant/tables/:id/merge
 * Joins this table into another: the items of any open order move onto the
 * target's order and this table is flagged as merged.
 */
router.post(
  '/tables/:id/merge',
  requirePermission('restaurant:table'),
  validateBody(tableMergeSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as TableMergeInput;
    if (body.intoTableId === req.params.id) {
      throw ApiError.unprocessable('Nao e possivel unir uma mesa a si propria.');
    }

    const ctx = await loadOrderContext(entityId);

    const result = await prisma.$transaction(async (tx) => {
      const source = await findTableOrThrow(entityId, req.params.id, tx);
      const target = await findTableOrThrow(entityId, body.intoTableId, tx);
      if (target.mergedIntoId) {
        throw ApiError.conflict(`A mesa ${target.name} ja esta unida a outra mesa.`);
      }

      const sourceOrder = await openOrderForTable(entityId, source.id, tx);
      const targetOrder = await openOrderForTable(entityId, target.id, tx);

      let keptOrderId: string | null = targetOrder?.id ?? null;

      if (sourceOrder && targetOrder) {
        // Two live checks: fold the source items into the target and close it.
        await tx.orderItem.updateMany({
          where: { orderId: sourceOrder.id },
          data: { orderId: targetOrder.id },
        });
        await tx.kitchenTicket.updateMany({
          where: { orderId: sourceOrder.id },
          data: { orderId: targetOrder.id },
        });
        await tx.order.update({
          where: { id: sourceOrder.id },
          data: {
            status: 'cancelled',
            closedAt: new Date(),
            subtotalMinor: BigInt(0),
            discountMinor: BigInt(0),
            taxMinor: BigInt(0),
            serviceChargeMinor: BigInt(0),
            totalMinor: BigInt(0),
            note: `Unido ao pedido ${targetOrder.orderNumber}.`,
          },
        });
        await recomputeOrder(tx, targetOrder.id, {
          pricingMode: ctx.pricingMode,
          orderDiscountMinor: Number(targetOrder.discountMinor),
          serviceChargeBps: ctx.serviceChargeBps,
        });
      } else if (sourceOrder && !targetOrder) {
        // Only the source has a check: it simply moves to the target table.
        await tx.order.update({
          where: { id: sourceOrder.id },
          data: { tableId: target.id },
        });
        keptOrderId = sourceOrder.id;
      }

      await tx.restaurantTable.update({
        where: { id: source.id },
        data: { mergedIntoId: target.id, status: 'occupied', activeOrderId: keptOrderId },
      });
      await tx.restaurantTable.update({
        where: { id: target.id },
        data: {
          status: keptOrderId ? 'occupied' : target.status,
          activeOrderId: keptOrderId,
        },
      });

      return { sourceId: source.id, targetId: target.id, orderId: keptOrderId };
    }, TX_OPTIONS);

    await publishTable(entityId, result.sourceId);
    const targetDto = await publishTable(entityId, result.targetId);
    const order = result.orderId ? await publishOrder(entityId, result.orderId) : null;

    await auditRequest(req, {
      action: AUDIT.TABLE_MERGE,
      targetType: 'restaurant_table',
      targetId: result.sourceId,
      details: { intoTableId: result.targetId, orderId: result.orderId },
    });

    res.json({ table: targetDto, order });
  }),
);

/** POST /api/restaurant/tables/:id/move - carries the open order to another table. */
router.post(
  '/tables/:id/move',
  requirePermission('restaurant:table'),
  validateBody(tableMoveSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as TableMoveInput;
    if (body.toTableId === req.params.id) {
      throw ApiError.unprocessable('A mesa de destino e a mesma.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const source = await findTableOrThrow(entityId, req.params.id, tx);
      const target = await findTableOrThrow(entityId, body.toTableId, tx);

      const sourceOrder = await openOrderForTable(entityId, source.id, tx);
      if (!sourceOrder) throw ApiError.conflict(`A mesa ${source.name} nao tem pedido aberto.`);

      const targetOrder = await openOrderForTable(entityId, target.id, tx);
      if (targetOrder) {
        throw ApiError.conflict(
          `A mesa ${target.name} ja tem o pedido ${targetOrder.orderNumber} aberto.`,
        );
      }
      if (target.mergedIntoId) {
        throw ApiError.conflict(`A mesa ${target.name} esta unida a outra mesa.`);
      }

      await tx.order.update({ where: { id: sourceOrder.id }, data: { tableId: target.id } });
      await tx.kitchenTicket.updateMany({
        where: { orderId: sourceOrder.id },
        data: { tableName: target.name },
      });
      await tx.restaurantTable.update({
        where: { id: source.id },
        data: { status: 'available', activeOrderId: null, mergedIntoId: null },
      });
      await tx.restaurantTable.update({
        where: { id: target.id },
        data: { status: 'occupied', activeOrderId: sourceOrder.id },
      });

      return { sourceId: source.id, targetId: target.id, orderId: sourceOrder.id };
    }, TX_OPTIONS);

    await publishTable(entityId, result.sourceId);
    const targetDto = await publishTable(entityId, result.targetId);
    const order = await publishOrder(entityId, result.orderId);

    await auditRequest(req, {
      action: AUDIT.TABLE_MOVE,
      targetType: 'order',
      targetId: result.orderId,
      details: { fromTableId: result.sourceId, toTableId: result.targetId },
    });

    res.json({ table: targetDto, order });
  }),
);

/* -------------------------------------------------------------------------- */
/* Orders                                                                      */
/* -------------------------------------------------------------------------- */

/** GET /api/restaurant/orders?status=&tableId=&serverId= */
router.get(
  '/orders',
  requirePermission('restaurant:order'),
  validateQuery(orderListQuerySchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const query = parsedQuery<OrderListQuery>(res);

    const where: Prisma.OrderWhereInput = { entityId };
    if (query.status) where.status = query.status;
    else where.status = { in: OPEN_ORDER_STATUSES };
    if (query.tableId) where.tableId = query.tableId;
    if (query.serverId) where.serverId = query.serverId;

    const rows = await prisma.order.findMany({
      where,
      select: orderSelect,
      orderBy: { openedAt: 'desc' },
      take: query.limit,
    });

    res.json({ data: rows.map(orderDto) });
  }),
);

/** POST /api/restaurant/orders - opens a check, seating the table. */
router.post(
  '/orders',
  requirePermission('restaurant:order'),
  validateBody(orderCreateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const body = req.body as OrderCreateInput;

    const orderId = await prisma.$transaction(async (tx) => {
      let tableId: string | null = null;

      if (body.tableId) {
        const table = await findTableOrThrow(entityId, body.tableId, tx);
        if (table.mergedIntoId) {
          throw ApiError.conflict(
            `A mesa ${table.name} esta unida a outra mesa. Abra o pedido na mesa principal.`,
          );
        }
        const existing = await openOrderForTable(entityId, table.id, tx);
        if (existing) {
          throw ApiError.conflict(
            `A mesa ${table.name} ja tem o pedido ${existing.orderNumber} em aberto.`,
          );
        }
        tableId = table.id;
      }

      const orderNumber = await nextDocumentNumber(entityId, 'order', { client: tx });

      const created = await tx.order.create({
        data: {
          entityId,
          tableId,
          orderNumber,
          status: 'open',
          serverId: auth.userId,
          serverName: auth.name,
          guestCount: body.guestCount ?? 1,
          note: body.note ?? null,
        },
        select: { id: true },
      });

      if (tableId) {
        await tx.restaurantTable.update({
          where: { id: tableId },
          data: { status: 'occupied', activeOrderId: created.id },
        });
      }

      return created.id;
    }, TX_OPTIONS);

    const dto = await publishOrder(entityId, orderId);
    await publishTable(entityId, dto.tableId);

    await auditRequest(req, {
      action: AUDIT.ORDER_CREATE,
      targetType: 'order',
      targetId: orderId,
      details: { orderNumber: dto.orderNumber, tableId: dto.tableId },
    });

    res.status(201).json(dto);
  }),
);

/** GET /api/restaurant/orders/:id - items come back ordered by course. */
router.get(
  '/orders/:id',
  requirePermission('restaurant:order'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const row = await loadOrderOrThrow(entityId, req.params.id);
    res.json(orderDto(row));
  }),
);

/** POST /api/restaurant/orders/:id/items - the menu grid's "add to check". */
router.post(
  '/orders/:id/items',
  requirePermission('restaurant:order'),
  validateBody(addItemsSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as AddItemsInput;
    const ctx = await loadOrderContext(entityId);

    const products = await loadMenuProducts(
      entityId,
      body.items.map((item) => item.productId),
    );

    await prisma.$transaction(async (tx) => {
      const order = await loadOrderOrThrow(entityId, req.params.id, tx);
      assertOrderEditable(order);

      for (const input of body.items) {
        const product = products.get(input.productId);
        if (!product) throw ApiError.notFound('Produto nao encontrado.');
        if (!product.active) throw ApiError.unprocessable(`${product.namePt} esta inactivo.`);
        if (!product.available) {
          throw ApiError.unprocessable(`${product.namePt} esta indisponivel.`);
        }

        const modifiers = resolveModifiers(product, input.modifiers);
        const quantity = round3(input.quantity);
        const priced = priceItem(product, modifiers, quantity, ctx.pricingMode);

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: product.id,
            name: product.namePt,
            quantity,
            unitPriceMinor: BigInt(Math.round(priced.unitPriceMinor)),
            unitCostMinor: BigInt(Math.round(priced.unitCostMinor)),
            taxRateBps: priced.taxRateBps,
            discountMinor: BigInt(0),
            totalMinor: BigInt(Math.round(priced.totalMinor)),
            status: 'unsent',
            course: input.course,
            seat: input.seat ?? null,
            prepStation: product.prepStation,
            note: input.note ?? null,
            modifiers: serializeModifiers(modifiers),
          },
        });
      }

      await recomputeOrder(tx, order.id, {
        pricingMode: ctx.pricingMode,
        orderDiscountMinor: Number(order.discountMinor),
        serviceChargeBps: ctx.serviceChargeBps,
      });
    }, TX_OPTIONS);

    const dto = await publishOrder(entityId, req.params.id);
    res.status(201).json(dto);
  }),
);

/**
 * PATCH /api/restaurant/orders/:id/items/:itemId
 * Freely editable while pending; once the kitchen has it, only a bigger
 * quantity and a note may change.
 */
router.patch(
  '/orders/:id/items/:itemId',
  requirePermission('restaurant:order'),
  validateBody(itemUpdateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as ItemUpdateInput;
    const ctx = await loadOrderContext(entityId);

    await prisma.$transaction(async (tx) => {
      const order = await loadOrderOrThrow(entityId, req.params.id, tx);
      assertOrderEditable(order);

      const item = order.items.find((row) => row.id === req.params.itemId);
      if (!item) throw ApiError.notFound('Artigo do pedido nao encontrado.');
      if (item.status === 'cancelled') throw ApiError.conflict('Artigo ja cancelado.');

      const pending = isPending(item.status);
      if (!pending) {
        if (body.course !== undefined || body.seat !== undefined || body.modifiers !== undefined) {
          throw ApiError.conflict(
            'Artigo ja enviado para a cozinha: so pode aumentar a quantidade ou alterar a nota.',
          );
        }
        if (body.quantity !== undefined && body.quantity < item.quantity) {
          throw ApiError.conflict(
            'Artigo ja enviado para a cozinha: a quantidade so pode aumentar.',
          );
        }
      }

      let unitPriceMinor = Number(item.unitPriceMinor);
      let modifiersJson: string | undefined;

      if (body.modifiers !== undefined) {
        const products = await loadMenuProducts(entityId, [item.productId], tx);
        const product = products.get(item.productId);
        if (!product) throw ApiError.notFound('Produto nao encontrado.');
        const modifiers: CartModifier[] = resolveModifiers(product, body.modifiers);
        modifiersJson = serializeModifiers(modifiers);
        unitPriceMinor = priceItem(product, modifiers, 1, ctx.pricingMode).unitPriceMinor;
      }

      const quantity = body.quantity !== undefined ? round3(body.quantity) : item.quantity;
      const line = computeLine({
        unitPriceMinor,
        quantity,
        taxRateBps: item.taxRateBps,
        pricingMode: ctx.pricingMode,
        discount: Number(item.discountMinor)
          ? { type: 'fixed', value: Number(item.discountMinor) }
          : null,
      });

      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          quantity,
          unitPriceMinor: BigInt(Math.round(unitPriceMinor)),
          totalMinor: BigInt(Math.round(line.grossMinor)),
          ...(modifiersJson !== undefined ? { modifiers: modifiersJson } : {}),
          ...(body.course !== undefined ? { course: body.course } : {}),
          ...(body.seat !== undefined ? { seat: body.seat } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
        },
      });

      await recomputeOrder(tx, order.id, {
        pricingMode: ctx.pricingMode,
        orderDiscountMinor: Number(order.discountMinor),
        serviceChargeBps: ctx.serviceChargeBps,
      });
    }, TX_OPTIONS);

    const dto = await publishOrder(entityId, req.params.id);
    res.json(dto);
  }),
);

/** DELETE /api/restaurant/orders/:id/items/:itemId - only before the kitchen sees it. */
router.delete(
  '/orders/:id/items/:itemId',
  requirePermission('restaurant:order'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const ctx = await loadOrderContext(entityId);

    await prisma.$transaction(async (tx) => {
      const order = await loadOrderOrThrow(entityId, req.params.id, tx);
      assertOrderEditable(order);

      const item = order.items.find((row) => row.id === req.params.itemId);
      if (!item) throw ApiError.notFound('Artigo do pedido nao encontrado.');
      if (!isPending(item.status)) {
        throw ApiError.conflict('Artigo ja enviado para a cozinha; anule-o com o gerente.');
      }

      await tx.orderItem.delete({ where: { id: item.id } });

      await recomputeOrder(tx, order.id, {
        pricingMode: ctx.pricingMode,
        orderDiscountMinor: Number(order.discountMinor),
        serviceChargeBps: ctx.serviceChargeBps,
      });
    }, TX_OPTIONS);

    const dto = await publishOrder(entityId, req.params.id);
    res.json(dto);
  }),
);

/* -------------------------------------------------------------------------- */
/* Firing the kitchen                                                          */
/* -------------------------------------------------------------------------- */

interface FireResult {
  ticketIds: string[];
  sent: number;
  held: number;
}

async function fireItems(
  entityId: string,
  orderId: string,
  pick: (items: OrderItemRow[]) => { toSend: OrderItemRow[]; toHold: OrderItemRow[] },
  ctx: { pricingMode: 'inclusive' | 'exclusive'; serviceChargeBps: number },
): Promise<FireResult> {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrderOrThrow(entityId, orderId, tx);
    assertOrderEditable(order);

    const { toSend, toHold } = pick(order.items);

    if (toHold.length) {
      await tx.orderItem.updateMany({
        where: { id: { in: toHold.map((item) => item.id) } },
        data: { status: 'held' },
      });
    }

    if (!toSend.length) {
      if (toHold.length) {
        return { ticketIds: [], sent: 0, held: toHold.length };
      }
      throw ApiError.conflict('Nao ha artigos por enviar para a cozinha.');
    }

    const ticketIds = await createTicketsForItems(
      tx,
      entityId,
      {
        id: order.id,
        serverName: order.serverName,
        tableName: order.table?.name ?? null,
      },
      toSend,
    );

    await tx.order.update({ where: { id: order.id }, data: { status: 'sent' } });

    await recomputeOrder(tx, order.id, {
      pricingMode: ctx.pricingMode,
      orderDiscountMinor: Number(order.discountMinor),
      serviceChargeBps: ctx.serviceChargeBps,
    });

    return { ticketIds, sent: toSend.length, held: toHold.length };
  }, TX_OPTIONS);
}

/** POST /api/restaurant/orders/:id/send - the blue SEND button. */
router.post(
  '/orders/:id/send',
  requirePermission('restaurant:order'),
  validateBody(sendSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as SendInput;
    const ctx = await loadOrderContext(entityId);

    const result = await fireItems(
      entityId,
      req.params.id,
      (items) => {
        let candidates = items.filter((item) => item.status === 'unsent');
        if (body.itemIds) {
          const wanted = new Set(body.itemIds);
          candidates = candidates.filter((item) => wanted.has(item.id));
        }
        if (body.course === undefined) return { toSend: candidates, toHold: [] };
        return {
          toSend: candidates.filter((item) => item.course <= body.course!),
          toHold: candidates.filter((item) => item.course > body.course!),
        };
      },
      ctx,
    );

    const tickets = ticketDtos(await loadTickets(entityId, result.ticketIds));
    emitTicketsCreated(entityId, tickets);
    const dto = await publishOrder(entityId, req.params.id);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.ORDER_SEND,
      targetType: 'order',
      targetId: req.params.id,
      details: {
        orderNumber: dto.orderNumber,
        sent: result.sent,
        held: result.held,
        tickets: tickets.map((t) => t.station),
      },
    });

    res.json({ data: dto, tickets, sent: result.sent, held: result.held });
  }),
);

/** POST /api/restaurant/orders/:id/fire-course - releases a held course. */
router.post(
  '/orders/:id/fire-course',
  requirePermission('restaurant:order'),
  validateBody(fireCourseSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as FireCourseInput;
    const ctx = await loadOrderContext(entityId);

    const result = await fireItems(
      entityId,
      req.params.id,
      (items) => ({
        toSend: items.filter(
          (item) => item.course === body.course && isPending(item.status),
        ),
        toHold: [],
      }),
      ctx,
    );

    const tickets = ticketDtos(await loadTickets(entityId, result.ticketIds));
    emitTicketsCreated(entityId, tickets);
    const dto = await publishOrder(entityId, req.params.id);

    await auditRequest(req, {
      action: AUDIT_ACTIONS.ORDER_SEND,
      targetType: 'order',
      targetId: req.params.id,
      details: { orderNumber: dto.orderNumber, course: body.course, sent: result.sent },
    });

    res.json({ data: dto, tickets, sent: result.sent });
  }),
);

/** POST /api/restaurant/orders/:id/hold - keeps items out of the kitchen. */
router.post(
  '/orders/:id/hold',
  requirePermission('restaurant:order'),
  validateBody(holdSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as HoldInput;

    await prisma.$transaction(async (tx) => {
      const order = await loadOrderOrThrow(entityId, req.params.id, tx);
      assertOrderEditable(order);

      const wanted = new Set(body.itemIds);
      const targets = order.items.filter(
        (item) => wanted.has(item.id) && item.status === 'unsent',
      );
      if (!targets.length) {
        throw ApiError.conflict('Nenhum dos artigos indicados pode ser retido.');
      }

      await tx.orderItem.updateMany({
        where: { id: { in: targets.map((item) => item.id) } },
        data: { status: 'held' },
      });
    }, TX_OPTIONS);

    const dto = await publishOrder(entityId, req.params.id);
    res.json(dto);
  }),
);

/** PATCH /api/restaurant/orders/:id - guests, note, server, order discount. */
router.patch(
  '/orders/:id',
  requirePermission('restaurant:order'),
  validateBody(orderUpdateSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const auth = requireAuthContext(req);
    const body = req.body as OrderUpdateInput;
    const ctx = await loadOrderContext(entityId);

    if (body.discount !== undefined && !auth.permissions.includes('sale:discount')) {
      throw ApiError.forbidden('Permissao em falta: sale:discount.');
    }

    await prisma.$transaction(async (tx) => {
      const order = await loadOrderOrThrow(entityId, req.params.id, tx);
      assertOrderEditable(order);

      let serverName: string | null | undefined;
      if (body.serverId !== undefined) {
        if (body.serverId === null) {
          serverName = null;
        } else {
          const user = await tx.user.findFirst({
            where: { id: body.serverId, entityId, deletedAt: null, active: true },
            select: { name: true },
          });
          if (!user) throw ApiError.notFound('Empregado nao encontrado.');
          serverName = user.name;
        }
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          ...(body.guestCount !== undefined ? { guestCount: body.guestCount } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
          ...(body.serverId !== undefined ? { serverId: body.serverId, serverName } : {}),
        },
      });

      let orderDiscountMinor = Number(order.discountMinor);
      if (body.discount !== undefined) {
        orderDiscountMinor = body.discount
          ? computeLineDiscount(afterLineDiscountValue(order.items), {
              type: body.discount.type,
              value: body.discount.value,
            })
          : 0;
      }

      await recomputeOrder(tx, order.id, {
        pricingMode: ctx.pricingMode,
        orderDiscountMinor,
        serviceChargeBps: ctx.serviceChargeBps,
      });
    }, TX_OPTIONS);

    const dto = await publishOrder(entityId, req.params.id);

    if (body.discount !== undefined) {
      await auditRequest(req, {
        action: AUDIT.ORDER_DISCOUNT,
        targetType: 'order',
        targetId: dto.id,
        details: { discount: body.discount, discountMinor: dto.discountMinor },
      });
    }

    res.json(dto);
  }),
);

/** POST /api/restaurant/orders/:id/cancel - voids the check and frees the table. */
router.post(
  '/orders/:id/cancel',
  requirePermission('restaurant:bill'),
  validateBody(cancelSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as CancelInput;

    const tableId = await prisma.$transaction(async (tx) => {
      const order = await loadOrderOrThrow(entityId, req.params.id, tx);
      assertOrderEditable(order);

      await tx.orderItem.updateMany({
        where: { orderId: order.id, status: { not: 'cancelled' } },
        data: { status: 'cancelled' },
      });
      await tx.kitchenTicket.updateMany({
        where: { orderId: order.id, status: { notIn: ['served', 'cancelled'] } },
        data: { status: 'cancelled' },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'cancelled',
          closedAt: new Date(),
          subtotalMinor: BigInt(0),
          discountMinor: BigInt(0),
          taxMinor: BigInt(0),
          serviceChargeMinor: BigInt(0),
          totalMinor: BigInt(0),
          ...(body.reason ? { note: body.reason } : {}),
        },
      });

      if (order.tableId) {
        await tx.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: 'available', activeOrderId: null, mergedIntoId: null },
        });
        await tx.restaurantTable.updateMany({
          where: { entityId, mergedIntoId: order.tableId },
          data: { mergedIntoId: null, status: 'available', activeOrderId: null },
        });
      }

      return order.tableId;
    }, TX_OPTIONS);

    const dto = await publishOrder(entityId, req.params.id);
    await publishTable(entityId, tableId);

    await auditRequest(req, {
      action: AUDIT.ORDER_CANCEL,
      targetType: 'order',
      targetId: dto.id,
      details: { orderNumber: dto.orderNumber, reason: body.reason ?? null },
    });

    res.json(dto);
  }),
);

/* -------------------------------------------------------------------------- */
/* Bill                                                                        */
/* -------------------------------------------------------------------------- */

function orderMoney(order: {
  items: OrderItemRow[];
  discountMinor: bigint;
  tipMinor: bigint;
}, ctx: { pricingMode: 'inclusive' | 'exclusive'; serviceChargeBps: number }): {
  money: OrderMoney;
  totals: ReturnType<typeof computeOrderTotals>;
} {
  const totals = computeOrderTotals(order.items, {
    pricingMode: ctx.pricingMode,
    orderDiscountMinor: Number(order.discountMinor),
    serviceChargeBps: ctx.serviceChargeBps,
  });

  return {
    totals,
    money: {
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      taxMinor: totals.taxMinor,
      serviceChargeMinor: totals.serviceChargeMinor,
      tipMinor: Number(order.tipMinor),
      totalMinor: totals.totalMinor,
    },
  };
}

/** GET /api/restaurant/orders/:id/bill - the read-only pre-bill. */
router.get(
  '/orders/:id/bill',
  requirePermission('restaurant:order'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const ctx = await loadOrderContext(entityId);
    const order = await loadOrderOrThrow(entityId, req.params.id);

    const items = liveItems(order.items);
    const { totals, money } = orderMoney(order, ctx);
    const lines = billLines(items, ctx.pricingMode);

    const payload: Record<string, unknown> = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      tableName: order.table?.name ?? null,
      serverName: order.serverName,
      guestCount: order.guestCount,
      openedAt: order.openedAt.toISOString(),
      currency: ctx.currency,
      pricingMode: ctx.pricingMode,
      lines,
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      netMinor: totals.netMinor,
      taxMinor: totals.taxMinor,
      taxBreakdown: totals.taxBreakdown,
      serviceChargeBps: ctx.serviceChargeBps,
      serviceChargeMinor: totals.serviceChargeMinor,
      tipMinor: money.tipMinor,
      totalMinor: totals.totalMinor,
      dueMinor: totals.totalMinor + money.tipMinor,
    };

    // Cost never reaches a waiter or a cashier.
    if (canSeeCost(req)) {
      payload.costMinor = items.reduce(
        (sum, item) => sum + Math.round(Number(item.unitCostMinor) * item.quantity),
        0,
      );
    }

    res.json(payload);
  }),
);

/** POST /api/restaurant/orders/:id/split - what the register should charge. */
router.post(
  '/orders/:id/split',
  requirePermission('restaurant:order'),
  validateBody(splitSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as SplitInput;
    const ctx = await loadOrderContext(entityId);
    const order = await loadOrderOrThrow(entityId, req.params.id);

    const items = liveItems(order.items);
    if (!items.length) throw ApiError.conflict('O pedido nao tem artigos para dividir.');

    const { money } = orderMoney(order, ctx);
    let bills: Bill[];

    if (body.mode === 'even') {
      bills = evenBills(money, body.people ?? 1);
    } else if (body.mode === 'by_seat') {
      const bySeat = new Map<number, OrderItemRow[]>();
      const shared: OrderItemRow[] = [];
      for (const item of items) {
        if (item.seat === null || item.seat === undefined) {
          shared.push(item);
          continue;
        }
        const bucket = bySeat.get(item.seat);
        if (bucket) bucket.push(item);
        else bySeat.set(item.seat, [item]);
      }

      const groups = [...bySeat.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([seat, seatItems]) => ({
          label: `Lugar ${seat}`,
          seat,
          items: seatItems,
        }));

      if (shared.length) {
        groups.push({ label: 'Partilhado', seat: 0, items: shared });
      }
      if (!groups.length) throw ApiError.conflict('Nenhum artigo tem lugar atribuido.');

      bills = allocateBills(
        groups.map((g) => ({ label: g.label, seat: g.seat || null, items: g.items })),
        money,
        ctx.pricingMode,
      );
    } else {
      const byId = new Map(items.map((item) => [item.id, item]));
      const used = new Set<string>();
      const groups: Array<{ label: string; seat: number | null; items: OrderItemRow[] }> = [];

      (body.groups ?? []).forEach((ids, index) => {
        const groupItems: OrderItemRow[] = [];
        for (const id of ids) {
          const item = byId.get(id);
          if (!item) throw ApiError.unprocessable(`Artigo ${id} nao pertence a este pedido.`);
          if (used.has(id)) throw ApiError.unprocessable(`Artigo ${id} indicado duas vezes.`);
          used.add(id);
          groupItems.push(item);
        }
        groups.push({ label: `Conta ${index + 1}`, seat: null, items: groupItems });
      });

      const leftovers = items.filter((item) => !used.has(item.id));
      if (leftovers.length) {
        groups.push({ label: `Conta ${groups.length + 1}`, seat: null, items: leftovers });
      }

      bills = allocateBills(groups, money, ctx.pricingMode);
    }

    res.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      mode: body.mode,
      currency: ctx.currency,
      orderTotalMinor: money.totalMinor,
      tipMinor: money.tipMinor,
      bills,
    });
  }),
);

/** POST /api/restaurant/orders/:id/tip - carried onto the sale at payment time. */
router.post(
  '/orders/:id/tip',
  requirePermission('restaurant:bill'),
  validateBody(tipSchema),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);
    const body = req.body as TipInput;
    const ctx = await loadOrderContext(entityId);

    const tipMinor = await prisma.$transaction(async (tx) => {
      const order = await loadOrderOrThrow(entityId, req.params.id, tx);
      assertOrderEditable(order);

      const { totals } = orderMoney(order, ctx);
      const value =
        body.tipMinor !== undefined
          ? body.tipMinor
          : applyBps(totals.totalMinor, body.tipBps ?? 0);

      await tx.order.update({
        where: { id: order.id },
        data: { tipMinor: BigInt(Math.round(value)) },
      });

      return value;
    }, TX_OPTIONS);

    const dto = await publishOrder(entityId, req.params.id);

    await auditRequest(req, {
      action: AUDIT.ORDER_TIP,
      targetType: 'order',
      targetId: dto.id,
      details: { tipMinor },
    });

    res.json({ data: dto, tipMinor });
  }),
);

export default router;
