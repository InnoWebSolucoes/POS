import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { SOCKET_EVENTS } from '@pos/shared';

import { connectPublicSocket } from '@/lib/socket';

import type { InventoryUpdateEvent, StorefrontProductDto, StorefrontVariantDto } from './types';

/**
 * Live availability.
 *
 * A till at the counter sells the last box of the shelf and the shopper looking
 * at the same box on their phone must see "Esgotado" without reloading. The
 * public socket room carries inventory:updated for exactly that, and the flags
 * it delivers are kept here so every tile, the detail page and the cart all
 * flip at the same instant, ahead of the refetch that follows.
 */

export function stockKey(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}:${variantId}` : productId;
}

interface StockState {
  /** true = still buyable. Keyed by product id, or "productId:variantId". */
  overrides: Record<string, boolean>;
  /** Timestamp of the last event, which drives the "em direto" pulse. */
  updatedAt: number | null;
  apply: (event: InventoryUpdateEvent) => void;
  reset: () => void;
}

export const useStockStore = create<StockState>((set) => ({
  overrides: {},
  updatedAt: null,

  apply(event) {
    const key = stockKey(event.productId, event.variantId);
    const available = event.available && event.stockQuantity > 0;
    set((state) => ({
      overrides: { ...state.overrides, [key]: available },
      updatedAt: Date.now(),
    }));
  },

  reset() {
    set({ overrides: {}, updatedAt: null });
  },
}));

export type StockOverrides = Record<string, boolean>;

export function resolveVariantInStock(
  productId: string,
  variant: StorefrontVariantDto,
  overrides: StockOverrides,
): boolean {
  return overrides[stockKey(productId, variant.id)] ?? variant.inStock;
}

/**
 * The server emits one event per product, or one per variant when the product
 * has them - so a product with variants is available while any variant is.
 */
export function resolveProductInStock(
  product: Pick<StorefrontProductDto, 'id' | 'inStock' | 'variants'>,
  overrides: StockOverrides,
): boolean {
  if (product.variants.length > 0) {
    return product.variants.some((variant) => resolveVariantInStock(product.id, variant, overrides));
  }
  return overrides[product.id] ?? product.inStock;
}

export function useStockOverrides(): StockOverrides {
  return useStockStore((state) => state.overrides);
}

export interface LiveStockState {
  connected: boolean;
  updatedAt: number | null;
}

/**
 * Joins the shop's public room. Nothing is sent, nothing is authenticated: the
 * room only ever carries availability.
 */
export function useLiveStock(entityId: string | null | undefined, slug: string): LiveStockState {
  const [connected, setConnected] = React.useState(false);
  const updatedAt = useStockStore((state) => state.updatedAt);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!entityId) return;

    // Flags belong to one shop; never carry them into another storefront.
    useStockStore.getState().reset();

    const socket = connectPublicSocket(entityId);
    let refresh: ReturnType<typeof setTimeout> | null = null;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onInventory = (payload: InventoryUpdateEvent) => {
      if (payload?.entityId && payload.entityId !== entityId) return;
      useStockStore.getState().apply(payload);

      // The flag above is instant; this catches price and listing changes a
      // moment later, without a refetch storm while a shift is being tilled.
      if (refresh) clearTimeout(refresh);
      refresh = setTimeout(() => {
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            if (!Array.isArray(key) || key[0] !== 'storefront' || key[1] !== slug) return false;
            const part = (key[2] as { part?: string } | undefined)?.part;
            return part === 'products' || part === 'product' || part === 'cart';
          },
        });
      }, 1500);
    };

    setConnected(socket.connected);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(SOCKET_EVENTS.INVENTORY_UPDATED, onInventory);

    return () => {
      if (refresh) clearTimeout(refresh);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(SOCKET_EVENTS.INVENTORY_UPDATED, onInventory);
    };
  }, [entityId, slug, queryClient]);

  return { connected, updatedAt };
}
