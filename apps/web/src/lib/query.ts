import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api';

/**
 * Shared query cache.
 *
 * Retrying is deliberately conservative: a 4xx is the server telling us the
 * request was wrong, and repeating it just delays the error the cashier needs
 * to see. Only network failures and 5xx are worth another attempt.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        if (error instanceof ApiRequestError) {
          if (error.isOffline) return failureCount < 2;
          if (error.status >= 400 && error.status < 500) return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Query keys in one place, so invalidation never misses a screen.
 *
 * The trailing parameter is DROPPED when it is undefined, which is what makes
 * partial matching work. React Query compares a filter key element by element,
 * so ['sales', undefined] does not match ['sales', { from, to }] - invalidating
 * after a checkout would silently leave a filtered transactions list stale.
 * Omitting the element instead makes qk.sales() a true prefix of every
 * qk.sales(filters), so one invalidation reaches them all.
 */
function key<const N extends string>(name: N, params?: unknown): readonly unknown[] {
  return params === undefined ? ([name] as const) : ([name, params] as const);
}

export const qk = {
  me: ['me'] as const,
  entities: (params?: unknown) => key('entities', params),
  entity: (id: string) => ['entity', id] as const,
  users: (params?: unknown) => key('users', params),
  categories: (params?: unknown) => key('categories', params),
  products: (params?: unknown) => key('products', params),
  product: (id: string) => ['product', id] as const,
  menu: () => ['menu'] as const,
  inventory: (params?: unknown) => key('inventory', params),
  movements: (params?: unknown) => key('movements', params),
  lowStock: () => ['low-stock'] as const,
  suppliers: (params?: unknown) => key('suppliers', params),
  purchaseOrders: (params?: unknown) => key('purchase-orders', params),
  sales: (params?: unknown) => key('sales', params),
  sale: (id: string) => ['sale', id] as const,
  heldSales: () => ['held-sales'] as const,
  customers: (params?: unknown) => key('customers', params),
  customer: (id: string) => ['customer', id] as const,
  promotions: (params?: unknown) => key('promotions', params),
  floorAreas: () => ['floor-areas'] as const,
  tables: (params?: unknown) => key('tables', params),
  orders: (params?: unknown) => key('orders', params),
  order: (id: string) => ['order', id] as const,
  tickets: (station?: string | null) => ['kds-tickets', station ?? 'all'] as const,
  onlineOrders: (params?: unknown) => key('online-orders', params),
  storefront: (slug: string, params?: unknown) =>
    params === undefined ? (['storefront', slug] as const) : (['storefront', slug, params] as const),
  reports: (report: string, params?: unknown) =>
    params === undefined ? (['reports', report] as const) : (['reports', report, params] as const),
  settings: () => ['settings'] as const,
  audit: (params?: unknown) => key('audit', params),
  notifications: (params?: unknown) => key('notifications', params),
};
