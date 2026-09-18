import { prisma, type Tx } from './prisma.js';

export type SequenceKey =
  | 'receipt'
  | 'order'
  | 'ticket'
  | 'refund'
  | 'purchase_order'
  | 'stock_receipt'
  | 'stock_take'
  | 'stock_transfer'
  | 'online_order'
  | 'internal_barcode'
  | 'loyalty_card';

const PREFIXES: Record<SequenceKey, string> = {
  receipt: 'FR',
  order: 'ORD',
  ticket: 'T',
  refund: 'NC',
  purchase_order: 'PO',
  stock_receipt: 'ENT',
  stock_take: 'INV',
  stock_transfer: 'TRF',
  online_order: 'WEB',
  internal_barcode: '',
  loyalty_card: '',
};

/**
 * Atomically reserves the next number in a sequence.
 *
 * The increment happens inside the database (`{ increment: 1 }`), so two
 * registers checking out at the same instant cannot be handed the same receipt
 * number. Call it inside the same transaction as the document it numbers.
 */
export async function nextSequence(
  entityId: string,
  key: SequenceKey,
  options: { scope?: string; client?: Tx } = {},
): Promise<number> {
  const client = options.client ?? prisma;
  const scope = options.scope ?? '';

  // Create-if-missing, then increment. The create races benignly: if another
  // request wins, the unique constraint sends us to the increment path.
  try {
    const created = await client.sequence.create({
      data: { entityId, key, scope, value: 1 },
    });
    return created.value;
  } catch {
    const updated = await client.sequence.update({
      where: { entityId_key_scope: { entityId, key, scope } },
      data: { value: { increment: 1 } },
    });
    return updated.value;
  }
}

export interface DocumentNumberOptions {
  /** Restart numbering each year (the default for fiscal documents). */
  yearly?: boolean;
  padding?: number;
  prefix?: string;
  client?: Tx;
  /** Supplied by the caller so the function stays deterministic. */
  now?: Date;
}

/**
 * Produces a human-facing document number, e.g. `FR2026/000123`.
 */
export async function nextDocumentNumber(
  entityId: string,
  key: SequenceKey,
  options: DocumentNumberOptions = {},
): Promise<string> {
  const { yearly = true, padding = 6, client, now = new Date() } = options;
  const year = now.getFullYear();
  const scope = yearly ? String(year) : '';

  const value = await nextSequence(entityId, key, { scope, client });
  const prefix = options.prefix ?? PREFIXES[key];
  const body = String(value).padStart(padding, '0');

  if (!prefix) return body;
  return yearly ? `${prefix}${year}/${body}` : `${prefix}/${body}`;
}

/** Short, human-readable sequence for kitchen tickets, e.g. "T-042". */
export async function nextTicketNumber(entityId: string, client?: Tx): Promise<string> {
  const value = await nextSequence(entityId, 'ticket', { scope: 'day', client });
  return `T-${String(value % 1000).padStart(3, '0')}`;
}
