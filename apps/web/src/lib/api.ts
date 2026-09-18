import type { ApiErrorBody } from '@pos/shared';

/**
 * The one place the app talks to the server.
 *
 * Responsibilities: attach the bearer token and the active entity, normalise
 * errors into something the UI can render, and transparently refresh an expired
 * access token exactly once before giving up.
 */

const BASE = import.meta.env.VITE_API_URL || '';

export const TOKEN_KEY = 'pos.token';
export const REFRESH_KEY = 'pos.refreshToken';
export const ENTITY_KEY = 'pos.entityId';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** First validation message for a given field, for inline form errors. */
  fieldError(path: string): string | undefined {
    return this.details?.[path]?.[0];
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
  get isOffline(): boolean {
    return this.status === 0;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function getEntityId(): string | null {
  return localStorage.getItem(ENTITY_KEY);
}

export function setTokens(token: string | null, refreshToken?: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);

  if (refreshToken !== undefined) {
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    else localStorage.removeItem(REFRESH_KEY);
  }
}

export function setEntityId(entityId: string | null): void {
  if (entityId) localStorage.setItem(ENTITY_KEY, entityId);
  else localStorage.removeItem(ENTITY_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(ENTITY_KEY);
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** The auth store subscribes here so a dead session logs the user out once. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, unknown>;
  /** Skip the Authorization header (storefront / login calls). */
  anonymous?: boolean;
  /** Return the raw Response instead of parsed JSON (downloads). */
  raw?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = path.startsWith('http') ? path : `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight refresh: ten parallel 401s must not fire ten refresh calls. */
async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(buildUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { token: string; refreshToken: string };
      setTokens(data.token, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function parseError(response: Response): Promise<ApiRequestError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    /* not JSON - fall through to a generic message */
  }
  return new ApiRequestError(
    response.status,
    body?.error?.code ?? 'http_error',
    body?.error?.message ?? `Erro ${response.status}`,
    body?.error?.details ?? null,
  );
}

async function performRequest(path: string, options: RequestOptions, retry = true): Promise<Response> {
  const { body, query, anonymous, raw: _raw, headers, ...rest } = options;

  const finalHeaders = new Headers(headers as HeadersInit);
  const isFormData = body instanceof FormData;

  if (!isFormData && body !== undefined) finalHeaders.set('Content-Type', 'application/json');
  if (!anonymous) {
    const token = getToken();
    if (token) finalHeaders.set('Authorization', `Bearer ${token}`);
    const entityId = getEntityId();
    if (entityId) finalHeaders.set('X-Entity-Id', entityId);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      headers: finalHeaders,
      body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network failure - status 0 lets callers branch on "offline" explicitly.
    throw new ApiRequestError(0, 'offline', 'Sem ligacao ao servidor.');
  }

  if (response.status === 401 && retry && !anonymous) {
    const refreshed = await refreshSession();
    if (refreshed) return performRequest(path, options, false);
    clearSession();
    unauthorizedListeners.forEach((listener) => listener());
  }

  return response;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await performRequest(path, options);

  if (!response.ok) throw await parseError(response);
  if (options.raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return (await response.text()) as unknown as T;

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown>, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'GET', query }),

  post: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  put: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'PUT', body }),

  delete: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'DELETE', body }),

  /** Triggers a browser download for CSV/PDF report exports. */
  async download(path: string, query?: Record<string, unknown>, fallbackName = 'export'): Promise<void> {
    const response = await performRequest(path, { method: 'GET', query });
    if (!response.ok) throw await parseError(response);

    const disposition = response.headers.get('content-disposition') ?? '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]!) : fallbackName;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },

  async upload<T>(path: string, files: File | File[], field = 'file'): Promise<T> {
    const form = new FormData();
    if (Array.isArray(files)) files.forEach((file) => form.append(field, file));
    else form.append(field, files);
    return request<T>(path, { method: 'POST', body: form });
  },
};
