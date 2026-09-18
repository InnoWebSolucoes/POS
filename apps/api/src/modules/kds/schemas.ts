import { z } from 'zod';
import {
  COURSE_MAX,
  PREP_STATIONS,
  TICKET_STATUSES,
  type PrepStation,
  type TicketStatus,
} from '@pos/shared';

/**
 * Validation for the kitchen display. Messages are European Portuguese written
 * without accents so the source stays ASCII-safe.
 */

const idField = z
  .string()
  .trim()
  .min(1, 'Identificador invalido.')
  .max(64, 'Identificador invalido.');

const stationValues = [...PREP_STATIONS] as [PrepStation, ...PrepStation[]];

export const stationField = z.enum(stationValues, {
  errorMap: () => ({ message: `Posto invalido. Use: ${PREP_STATIONS.join(', ')}.` }),
});

/** The active board - what still has to be cooked. */
export const DEFAULT_BOARD_STATUSES: TicketStatus[] = ['new', 'in_progress'];

const TICKET_STATUS_SET = new Set<string>(TICKET_STATUSES);

/** "?status=new,in_progress" or repeated "?status=" params. */
const statusListField = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return DEFAULT_BOARD_STATUSES;

    const raw = (Array.isArray(value) ? value : [value])
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

    if (raw.length === 0) return DEFAULT_BOARD_STATUSES;

    const out: TicketStatus[] = [];
    for (const candidate of raw) {
      if (!TICKET_STATUS_SET.has(candidate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Estado invalido: ${candidate}. Use: ${TICKET_STATUSES.join(', ')}.`,
        });
        return z.NEVER;
      }
      if (!out.includes(candidate as TicketStatus)) out.push(candidate as TicketStatus);
    }
    return out;
  });

const boolField = z.union([z.boolean(), z.string()]).transform((value) => {
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'sim', 'on'].includes(value.trim().toLowerCase());
});

export const ticketListQuerySchema = z.object({
  /** Omit for the expo / pass view: every station at once. */
  station: stationField.optional(),
  status: statusListField,
  course: z.coerce
    .number({ invalid_type_error: 'Prato invalido.' })
    .int('Prato invalido.')
    .min(0, 'Prato invalido.')
    .max(COURSE_MAX, 'Prato invalido.')
    .optional(),
  orderId: idField.optional(),
  limit: z.coerce
    .number({ invalid_type_error: 'Limite invalido.' })
    .int('Limite invalido.')
    .min(1, 'Limite invalido.')
    .max(300, 'Limite maximo: 300.')
    .optional()
    .default(200),
});

export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

export const summaryQuerySchema = z.object({
  station: stationField.optional(),
  /** Window for the closed counters (served / cancelled). Default: today. */
  since: z.coerce.date({ invalid_type_error: 'Data invalida.' }).optional(),
});

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

/**
 * A single item may only be walked forward along the kitchen ladder. Cancelling
 * a line belongs to the order module - it has price and stock consequences the
 * KDS has no business applying.
 */
export const ITEM_STATUS_CHOICES = ['sent', 'in_progress', 'ready', 'served'] as const;
export type KdsItemStatus = (typeof ITEM_STATUS_CHOICES)[number];

export const itemStatusSchema = z.object({
  status: z.enum(ITEM_STATUS_CHOICES, {
    errorMap: () => ({ message: `Estado invalido. Use: ${ITEM_STATUS_CHOICES.join(', ')}.` }),
  }),
});

export type ItemStatusInput = z.infer<typeof itemStatusSchema>;

/** "86 an item": kill it for the rest of service (or put it back on). */
export const eightySixSchema = z.object({
  available: boolField.optional().default(false),
  /** Alternative to the :id path param, which is otherwise an order item id. */
  productId: idField.optional(),
  note: z.string().trim().max(200, 'Nota demasiado longa.').optional(),
});

export type EightySixInput = z.infer<typeof eightySixSchema>;
