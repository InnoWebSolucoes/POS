import * as React from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { ApiRequestError } from '@/lib/api';
import { configureFormatting } from '@/lib/format';
import { useTheme } from '@/lib/theme';

import {
  addCartItem,
  createCart,
  loadCart,
  loadShop,
  removeCartItem,
  storefrontKeys,
  updateCartItem,
} from './api';
import { clearStoredCartId, setStoredCartId, storedCartId, storefrontSessionId } from './session';
import type { CartDto, StorefrontEntityDto } from './types';

/**
 * The shop, its money format and its brand colour.
 *
 * The storefront renders outside the staff app shell, so nothing has told
 * lib/format which currency this tenant sells in - that happens here, before
 * the first price is drawn.
 */
export function useShop(slug: string): UseQueryResult<StorefrontEntityDto> {
  const applyBrand = useTheme((state) => state.applyBrand);

  const query = useQuery({
    queryKey: storefrontKeys.shop(slug),
    queryFn: () => loadShop(slug),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const shop = query.data;

  React.useEffect(() => {
    if (!shop) return;
    configureFormatting(shop.currency, shop.locale);
    applyBrand(shop.accentColor);
    document.title = shop.name;
  }, [shop, applyBrand]);

  return query;
}

/** Finds the basket this browser already has, or opens a new one. */
async function ensureCart(slug: string): Promise<CartDto> {
  const existingId = storedCartId(slug);

  if (existingId) {
    try {
      return await loadCart(existingId);
    } catch (error) {
      const gone = error instanceof ApiRequestError && error.status === 404;
      if (!gone) throw error;
      clearStoredCartId(slug);
    }
  }

  const created = await createCart(slug, storefrontSessionId());
  setStoredCartId(slug, created.id);
  return created;
}

export interface CartController {
  cart: CartDto | null;
  itemCount: number;
  loading: boolean;
  error: unknown;
  refetch: () => void;
  add: (input: { productId: string; variantId?: string | null; quantity?: number }) => Promise<CartDto>;
  setQuantity: (itemId: string, quantity: number) => Promise<CartDto>;
  remove: (itemId: string) => Promise<CartDto>;
  busy: boolean;
}

export function useCart(slug: string, enabled = true): CartController {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: storefrontKeys.cart(slug),
    queryFn: () => ensureCart(slug),
    enabled,
    staleTime: 15_000,
  });

  const store = React.useCallback(
    (cart: CartDto) => {
      setStoredCartId(slug, cart.id);
      queryClient.setQueryData(storefrontKeys.cart(slug), cart);
      return cart;
    },
    [queryClient, slug],
  );

  const addMutation = useMutation({
    mutationFn: async (input: { productId: string; variantId?: string | null; quantity?: number }) => {
      const cart = query.data ?? (await ensureCart(slug));
      return addCartItem(cart.id, {
        productId: input.productId,
        variantId: input.variantId ?? null,
        quantity: input.quantity ?? 1,
      });
    },
    onSuccess: store,
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { itemId: string; quantity: number }) => {
      const cart = query.data ?? (await ensureCart(slug));
      return updateCartItem(cart.id, input.itemId, input.quantity);
    },
    onSuccess: store,
  });

  const removeMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const cart = query.data ?? (await ensureCart(slug));
      return removeCartItem(cart.id, itemId);
    },
    onSuccess: store,
  });

  const cart = query.data ?? null;

  return {
    cart,
    itemCount: cart ? cart.lines.length : 0,
    loading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
    add: (input) => addMutation.mutateAsync(input),
    setQuantity: (itemId, quantity) => updateMutation.mutateAsync({ itemId, quantity }),
    remove: (itemId) => removeMutation.mutateAsync(itemId),
    busy: addMutation.isPending || updateMutation.isPending || removeMutation.isPending,
  };
}

/** The message to show a shopper when a call fails, never a raw stack. */
export function errorMessage(error: unknown, fallback = 'Nao foi possivel carregar.'): string {
  if (error instanceof ApiRequestError) {
    if (error.isOffline) return 'Sem ligacao. Verifique a internet e tente novamente.';
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
