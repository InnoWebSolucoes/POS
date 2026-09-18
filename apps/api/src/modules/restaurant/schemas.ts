import { z } from 'zod';
import {
  COURSE_MAX,
  DISCOUNT_TYPES,
  ORDER_STATUSES,
  TABLE_SHAPES,
  TABLE_STATUSES,
} from '@pos/shared';

/**
 * Every payload the restaurant module accepts. Kept in one file so the shapes
 * the floor-plan editor and the check panel post are easy to eyeball together.
 */

const id = z.string().trim().min(1).max(64);
const idList = z.array(id).min(1).max(200);

/* -------------------------------------------------------------------------- */
/* Floor plan                                                                  */
/* -------------------------------------------------------------------------- */

const canvasSize = z.number().int().min(200).max(8000);

export const areaCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  width: canvasSize.optional(),
  height: canvasSize.optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  backgroundUrl: z.string().trim().max(500).nullable().optional(),
});

export const areaUpdateSchema = areaCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para actualizar.' });

const coord = z.number().min(-10_000).max(10_000);
const size = z.number().min(10).max(4000);
const rotation = z.number().min(-360).max(360);
const seats = z.number().int().min(0).max(60);

export const tableCreateSchema = z.object({
  areaId: id,
  name: z.string().trim().min(1).max(30),
  shape: z.enum(TABLE_SHAPES),
  x: coord,
  y: coord,
  width: size,
  height: size,
  rotation: rotation.optional(),
  seats,
});

export const tableUpdateSchema = z
  .object({
    areaId: id,
    name: z.string().trim().min(1).max(30),
    shape: z.enum(TABLE_SHAPES),
    x: coord,
    y: coord,
    width: size,
    height: size,
    rotation,
    seats,
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para actualizar.' });

/** One row of the drag-and-drop editor's bulk save. */
export const layoutSchema = z.object({
  tables: z
    .array(
      z.object({
        id,
        areaId: id.optional(),
        x: coord.optional(),
        y: coord.optional(),
        width: size.optional(),
        height: size.optional(),
        rotation: rotation.optional(),
        shape: z.enum(TABLE_SHAPES).optional(),
        seats: seats.optional(),
        name: z.string().trim().min(1).max(30).optional(),
      }),
    )
    .min(1)
    .max(400),
});

export const tableStatusSchema = z.object({ status: z.enum(TABLE_STATUSES) });
export const tableMergeSchema = z.object({ intoTableId: id });
export const tableMoveSchema = z.object({ toTableId: id });

/** Query flags arrive as strings ("?includeInactive=true"). */
const boolParam = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return ['true', '1', 'yes', 'sim', 'on'].includes(value.toLowerCase());
    }
    return false;
  });

export const tableListQuerySchema = z.object({
  areaId: id.optional(),
  status: z.enum(TABLE_STATUSES).optional(),
  includeInactive: boolParam,
});

/* -------------------------------------------------------------------------- */
/* Orders                                                                      */
/* -------------------------------------------------------------------------- */

export const orderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  tableId: id.optional(),
  serverId: id.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

export const orderCreateSchema = z.object({
  tableId: id.nullable().optional(),
  guestCount: z.number().int().min(1).max(200).optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

const course = z.number().int().min(0).max(COURSE_MAX);
const seat = z.number().int().min(1).max(60);

export const addItemsSchema = z.object({
  items: z
    .array(
      z.object({
        productId: id,
        quantity: z.number().positive().max(9999).optional().default(1),
        course: course.optional().default(0),
        seat: seat.nullable().optional(),
        note: z.string().trim().max(240).nullable().optional(),
        modifiers: z.array(z.object({ modifierId: id })).max(40).optional().default([]),
      }),
    )
    .min(1)
    .max(100),
});

export const itemUpdateSchema = z
  .object({
    quantity: z.number().positive().max(9999),
    course,
    seat: seat.nullable(),
    note: z.string().trim().max(240).nullable(),
    modifiers: z.array(z.object({ modifierId: id })).max(40),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para actualizar.' });

export const sendSchema = z.object({
  itemIds: idList.optional(),
  course: course.optional(),
});

export const fireCourseSchema = z.object({ course });
export const holdSchema = z.object({ itemIds: idList });

export const orderUpdateSchema = z
  .object({
    guestCount: z.number().int().min(1).max(200),
    note: z.string().trim().max(500).nullable(),
    serverId: id.nullable(),
    discount: z
      .object({
        type: z.enum(DISCOUNT_TYPES),
        /** basis points when percentage, minor units when fixed */
        value: z.number().int().min(0).max(100_000_000),
      })
      .nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para actualizar.' });

export const cancelSchema = z.object({
  reason: z.string().trim().max(240).nullable().optional(),
});

export const splitSchema = z
  .object({
    orderId: id.optional(),
    mode: z.enum(['even', 'by_seat', 'by_item']),
    people: z.number().int().min(1).max(50).optional(),
    groups: z.array(z.array(id).min(1)).min(1).max(50).optional(),
  })
  .refine((v) => v.mode !== 'even' || (v.people ?? 0) >= 1, {
    message: 'Indique o numero de pessoas.',
    path: ['people'],
  })
  .refine((v) => v.mode !== 'by_item' || (v.groups?.length ?? 0) >= 1, {
    message: 'Indique os grupos de artigos.',
    path: ['groups'],
  });

export const tipSchema = z
  .object({
    tipMinor: z.number().int().min(0).max(1_000_000_000).optional(),
    tipBps: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((v) => v.tipMinor !== undefined || v.tipBps !== undefined, {
    message: 'Indique tipMinor ou tipBps.',
  });

export type AreaCreateInput = z.infer<typeof areaCreateSchema>;
export type AreaUpdateInput = z.infer<typeof areaUpdateSchema>;
export type TableCreateInput = z.infer<typeof tableCreateSchema>;
export type TableUpdateInput = z.infer<typeof tableUpdateSchema>;
export type LayoutInput = z.infer<typeof layoutSchema>;
export type TableStatusInput = z.infer<typeof tableStatusSchema>;
export type TableMergeInput = z.infer<typeof tableMergeSchema>;
export type TableMoveInput = z.infer<typeof tableMoveSchema>;
export type TableListQuery = z.infer<typeof tableListQuerySchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type AddItemsInput = z.infer<typeof addItemsSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
export type SendInput = z.infer<typeof sendSchema>;
export type FireCourseInput = z.infer<typeof fireCourseSchema>;
export type HoldInput = z.infer<typeof holdSchema>;
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;
export type CancelInput = z.infer<typeof cancelSchema>;
export type SplitInput = z.infer<typeof splitSchema>;
export type TipInput = z.infer<typeof tipSchema>;
