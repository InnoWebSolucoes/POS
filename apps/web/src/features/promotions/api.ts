/** Every call this feature makes, plus the react-query hooks around them. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryDto, Paginated, ProductDto, PromotionType } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

import type { PromotionDto, PromotionEvaluationDto, PromotionPayload } from './types';

/**
 * Prefix root derived from `qk`, so invalidateQueries reaches every promotions
 * list regardless of the params that screen happens to be holding.
 */
export const promotionsRoot = [qk.promotions()[0]] as const;

export interface PromotionListParams {
  page: number;
  pageSize: number;
  search?: string;
  type?: PromotionType;
  active?: boolean;
  running?: boolean;
}

export interface ValidateBasketLine {
  productId: string;
  quantity: number;
  unitPriceMinor: number;
  categoryId?: string | null;
}

export interface ValidateBasketBody {
  code: string;
  lines: ValidateBasketLine[];
  subtotalMinor?: number;
}

/* -------------------------------------------------------------------------- */
/* Raw calls                                                                   */
/* -------------------------------------------------------------------------- */

export const listPromotions = (params: PromotionListParams) =>
  api.get<Paginated<PromotionDto>>('/api/promotions', { ...params });

export const createPromotion = (body: PromotionPayload) => api.post<PromotionDto>('/api/promotions', body);

export const updatePromotion = (id: string, body: Partial<PromotionPayload>) =>
  api.patch<PromotionDto>(`/api/promotions/${id}`, body);

export const deletePromotion = (id: string) => api.delete<void>(`/api/promotions/${id}`);

export const validateBasket = (body: ValidateBasketBody) =>
  api.post<PromotionEvaluationDto>('/api/promotions/validate', body);

const listCategories = () =>
  api.get<{ data: CategoryDto[] }>('/api/categories', { includeInactive: true });

const searchProducts = (search: string) =>
  api.get<Paginated<ProductDto>>('/api/products', {
    page: 1,
    pageSize: 25,
    search: search || undefined,
    active: true,
    sort: 'name',
    order: 'asc',
  });

const getProduct = (id: string) => api.get<ProductDto>(`/api/products/${id}`);

/* -------------------------------------------------------------------------- */
/* Hooks                                                                       */
/* -------------------------------------------------------------------------- */

export function usePromotionList(params: PromotionListParams, enabled: boolean) {
  return useQuery({
    queryKey: qk.promotions({ list: params }),
    queryFn: () => listPromotions(params),
    enabled,
  });
}

export function useCategoryOptions(enabled: boolean) {
  return useQuery({
    queryKey: qk.categories({ picker: 'promotions' }),
    queryFn: async () => (await listCategories()).data,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useProductSearch(search: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.products({ picker: 'promotions', search }),
    queryFn: async () => (await searchProducts(search)).data,
    enabled,
    staleTime: 60_000,
  });
}

/**
 * The scope of a saved promotion is a bare list of ids, and there is no
 * batch-by-id endpoint - so the chips are resolved one product at a time and a
 * product that has since been deleted is simply dropped instead of exploding.
 */
export function useProductsByIds(ids: string[], enabled: boolean) {
  const sorted = [...ids].sort();
  return useQuery({
    queryKey: qk.products({ byIds: sorted }),
    queryFn: async () => {
      const settled = await Promise.allSettled(sorted.slice(0, 100).map((id) => getProduct(id)));
      return settled
        .filter((result): result is PromiseFulfilledResult<ProductDto> => result.status === 'fulfilled')
        .map((result) => result.value);
    },
    enabled: enabled && sorted.length > 0,
    staleTime: 60_000,
  });
}

export function useCreatePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PromotionPayload) => createPromotion(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: promotionsRoot });
    },
  });
}

export function useUpdatePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<PromotionPayload> }) => updatePromotion(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: promotionsRoot });
    },
  });
}

export function useDeletePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePromotion(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: promotionsRoot });
    },
  });
}

export function useValidateBasket() {
  return useMutation({
    mutationFn: (body: ValidateBasketBody) => validateBasket(body),
  });
}
