import type { CreateSaleRequest, ProductDto, SaleDto } from '@pos/shared';
import { api, ApiRequestError } from './api';

/**
 * Offline mode.
 *
 * Internet in Angola is not a given, and a register that stops selling when the
 * line drops is worse than no register at all. So the checkout keeps working:
 * the catalogue is mirrored into IndexedDB for lookups, and completed sales are
 * queued locally and replayed when connectivity returns.
 *
 * The replay is safe because every queued sale carries an idempotencyKey, and
 * the server returns the already-posted sale instead of creating a second one.
 */

const DB_NAME = 'pos-offline';
const DB_VERSION = 1;
const QUEUE_STORE = 'sale-queue';
const CATALOG_STORE = 'catalog';
const META_STORE = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        const store = db.createObjectStore(CATALOG_STORE, { keyPath: 'id' });
        store.createIndex('barcode', 'barcode');
        store.createIndex('sku', 'sku');
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

/* -------------------------------------------------------------------------- */
/* Queued sales                                                                */
/* -------------------------------------------------------------------------- */

export interface QueuedSale {
  id: string;
  payload: CreateSaleRequest;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** A permanent rejection (e.g. a deleted product) needs a human. */
  blocked?: boolean;
}

export async function enqueueSale(payload: CreateSaleRequest): Promise<QueuedSale> {
  const id = payload.idempotencyKey ?? crypto.randomUUID();
  const entry: QueuedSale = {
    id,
    payload: { ...payload, idempotencyKey: id },
    createdAt: Date.now(),
    attempts: 0,
  };
  await tx(QUEUE_STORE, 'readwrite', (store) => store.put(entry) as IDBRequest<IDBValidKey>);
  return entry;
}

export async function queuedSales(): Promise<QueuedSale[]> {
  const all = await tx<QueuedSale[]>(QUEUE_STORE, 'readonly', (store) => store.getAll());
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function queuedCount(): Promise<number> {
  const all = await queuedSales();
  return all.filter((entry) => !entry.blocked).length;
}

export async function removeQueued(id: string): Promise<void> {
  await tx(QUEUE_STORE, 'readwrite', (store) => store.delete(id) as unknown as IDBRequest<undefined>);
}

async function updateQueued(entry: QueuedSale): Promise<void> {
  await tx(QUEUE_STORE, 'readwrite', (store) => store.put(entry) as IDBRequest<IDBValidKey>);
}

export interface FlushResult {
  synced: SaleDto[];
  failed: number;
  blocked: number;
}

let flushing = false;

/**
 * Replays the queue oldest-first. Stops at the first network failure so sales
 * are posted in the order they were made; a permanent rejection is flagged and
 * skipped rather than blocking everything behind it.
 */
export async function flushQueue(): Promise<FlushResult> {
  if (flushing) return { synced: [], failed: 0, blocked: 0 };
  flushing = true;

  const result: FlushResult = { synced: [], failed: 0, blocked: 0 };

  try {
    const pending = (await queuedSales()).filter((entry) => !entry.blocked);

    for (const entry of pending) {
      try {
        const sale = await api.post<SaleDto>('/api/sales', entry.payload);
        result.synced.push(sale);
        await removeQueued(entry.id);
      } catch (error) {
        const apiError = error instanceof ApiRequestError ? error : null;

        if (apiError?.isOffline) {
          // Still no connection - leave the rest queued and try again later.
          result.failed += 1;
          break;
        }

        entry.attempts += 1;
        entry.lastError = apiError?.message ?? 'Erro desconhecido';

        // 4xx other than auth means the server will never accept this payload.
        if (apiError && apiError.status >= 400 && apiError.status < 500 && apiError.status !== 401) {
          entry.blocked = true;
          result.blocked += 1;
        } else {
          result.failed += 1;
        }
        await updateQueued(entry);
      }
    }
  } finally {
    flushing = false;
  }

  return result;
}

/** Discards a permanently-rejected sale after a human has reviewed it. */
export async function discardQueued(id: string): Promise<void> {
  await removeQueued(id);
}

/* -------------------------------------------------------------------------- */
/* Catalogue mirror                                                            */
/* -------------------------------------------------------------------------- */

export async function cacheCatalog(products: ProductDto[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([CATALOG_STORE, META_STORE], 'readwrite');
    const store = transaction.objectStore(CATALOG_STORE);
    store.clear();
    for (const product of products) store.put(product);
    transaction.objectStore(META_STORE).put({ key: 'catalogSyncedAt', value: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function cachedProducts(): Promise<ProductDto[]> {
  return tx<ProductDto[]>(CATALOG_STORE, 'readonly', (store) => store.getAll());
}

/** Offline barcode lookup: exact barcode, then variant barcode, then SKU. */
export async function findCachedByCode(code: string): Promise<ProductDto | null> {
  const products = await cachedProducts();
  const normalised = code.trim();

  return (
    products.find((p) => p.barcode === normalised) ??
    products.find((p) => p.variants?.some((v) => v.barcode === normalised)) ??
    products.find((p) => p.sku === normalised) ??
    null
  );
}

export async function catalogSyncedAt(): Promise<Date | null> {
  const row = await tx<{ key: string; value: number } | undefined>(META_STORE, 'readonly', (store) =>
    store.get('catalogSyncedAt'),
  );
  return row ? new Date(row.value) : null;
}

/* -------------------------------------------------------------------------- */
/* Auto-sync                                                                   */
/* -------------------------------------------------------------------------- */

let autoSyncStarted = false;

/**
 * Starts replaying the queue whenever the browser regains connectivity, plus a
 * slow poll for the case where `online` fires but the server is still down.
 */
export function startAutoSync(onFlush?: (result: FlushResult) => void): () => void {
  if (autoSyncStarted) return () => undefined;
  autoSyncStarted = true;

  const run = async () => {
    if (!navigator.onLine) return;
    const count = await queuedCount();
    if (count === 0) return;
    const result = await flushQueue();
    if (result.synced.length || result.blocked) onFlush?.(result);
  };

  window.addEventListener('online', () => void run());
  const timer = window.setInterval(() => void run(), 30_000);
  void run();

  return () => {
    window.clearInterval(timer);
    autoSyncStarted = false;
  };
}
