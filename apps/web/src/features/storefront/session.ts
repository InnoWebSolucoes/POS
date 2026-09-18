/**
 * Guest identity for the shop front.
 *
 * A shopper who never logs in still needs a basket that survives a page
 * reload, so the browser keeps a generated session id and the cart id the API
 * handed back for it. Private-mode browsers throw on localStorage, so every
 * access falls back to an in-memory map and the shop keeps working for the
 * length of the visit.
 */

const SESSION_KEY = 'pos.storefront.session';

const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    /* storage blocked - fall through to the in-memory copy */
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked - the in-memory copy is all this visit gets */
  }
}

function drop(key: string): void {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

function cartKey(slug: string): string {
  return `pos.storefront.cart.${slug}`;
}

/** Matches the API's sessionId rule: 8-120 chars of [A-Za-z0-9._:-]. */
function newSessionId(): string {
  const random = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `loja-${Date.now().toString(36)}-${random}`.slice(0, 100);
}

export function storefrontSessionId(): string {
  const existing = read(SESSION_KEY);
  if (existing && existing.length >= 8) return existing;

  const created = newSessionId();
  write(SESSION_KEY, created);
  return created;
}

export function storedCartId(slug: string): string | null {
  return read(cartKey(slug));
}

export function setStoredCartId(slug: string, cartId: string): void {
  write(cartKey(slug), cartId);
}

export function clearStoredCartId(slug: string): void {
  drop(cartKey(slug));
}
