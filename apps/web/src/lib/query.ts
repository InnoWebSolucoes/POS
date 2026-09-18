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

/** Query keys in one place, so invalidation never misses a screen. */
export const qk = {
  me: ['me'] as const,
  entities: (params?: unknown) => ['entities', params] as const,
  entity: (id: string) => ['entity', id] as const,
  users: (params?: unknown) => ['users', params] as const,
  categories: (params?: unknown) => ['categories', params] as const,
  products: (params?: unknown) => ['products', params] as const,
  product: (id: string) => ['product', id] as const,
  menu: () => ['menu'] as const,
  inventory: (params?: unknown) => ['inventory', params] as const,
  movements: (params?: unknown) => ['movements', params] as const,
  lowStock: () => ['low-stock'] as const,
  suppliers: (params?: unknown) => ['suppliers', params] as const,
  purchaseOrders: (params?: unknown) => ['purchase-orders', params] as const,
  sales: (params?: unknown) => ['sales', params] as const,
  sale: (id: string) => ['sale', id] as const,
  heldSales: () => ['held-sales'] as const,
  customers: (params?: unknown) => ['customers', params] as const,
  customer: (id: string) => ['customer', id] as const,
  promotions: (params?: unknown) => ['promotions', params] as const,
  floorAreas: () => ['floor-areas'] as const,
  tables: (params?: unknown) => ['tables', params] as const,
  orders: (params?: unknown) => ['orders', params] as const,
  order: (id: string) => ['order', id] as const,
  tickets: (station?: string | null) => ['kds-tickets', station ?? 'all'] as const,
  onlineOrders: (params?: unknown) => ['online-orders', params] as const,
  storefront: (slug: string, params?: unknown) => ['storefront', slug, params] as const,
  reports: (report: string, params?: unknown) => ['reports', report, params] as const,
  settings: () => ['settings'] as const,
  audit: (params?: unknown) => ['audit', params] as const,
  notifications: (params?: unknown) => ['notifications', params] as const,
};
