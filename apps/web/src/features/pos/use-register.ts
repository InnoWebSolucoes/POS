import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DiscountType, EntitySettings, LineDiscount, PricingMode } from '@pos/shared';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { qk } from '@/lib/query';
import { uid } from '@/lib/utils';
import {
  POS_DEFAULT_SETTINGS,
  cartTotals,
  stepFor,
  type CartTotals,
  type LookupProductDto,
  type PosLine,
  type SettingsResponse,
} from './types';

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The beep profile and the enabled payment methods live in entity settings,
 * which a cashier is not allowed to read. The query is therefore only fired for
 * roles that hold `settings:read`, and every consumer gets the defaults
 * otherwise - the register must never be blocked by a 403.
 */
export function usePosSettings(): EntitySettings {
  const can = useAuth((s) => s.can);
  const allowed = can('settings:read');

  const { data } = useQuery({
    queryKey: qk.settings(),
    queryFn: () => api.get<SettingsResponse>('/api/settings'),
    enabled: allowed,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return data?.settings ?? POS_DEFAULT_SETTINGS;
}

/* -------------------------------------------------------------------------- */
/* Cart                                                                        */
/* -------------------------------------------------------------------------- */

export interface AddOptions {
  quantity?: number;
  /** Overrides the catalogue price; only honoured for weighted products. */
  unitPriceMinor?: number;
  note?: string | null;
  /** Force a new row instead of topping up the matching one. */
  separateLine?: boolean;
  variantId?: string | null;
  variantSku?: string | null;
  variantPriceMinor?: number | null;
}

export interface Register {
  lines: PosLine[];
  totals: CartTotals;
  pricingMode: PricingMode;

  orderDiscount: LineDiscount | null;
  setOrderDiscount: (discount: LineDiscount | null) => void;

  promotionCode: string | null;
  promotionDiscountMinor: number;
  setPromotion: (code: string | null, discountMinor: number) => void;

  /** Key of the row that just changed, so the eye can catch it. */
  flashKey: string | null;
  flash: (key: string) => void;

  addProduct: (product: LookupProductDto, options?: AddOptions) => string;
  setQuantity: (key: string, quantity: number) => void;
  setLineDiscount: (key: string, type: DiscountType | null, value: number | null) => void;
  setLineNote: (key: string, note: string | null) => void;
  removeLine: (key: string) => void;
  replaceLines: (lines: PosLine[]) => void;
  clear: () => void;
}

export function useRegister(): Register {
  const entity = useAuth((s) => s.entity);
  const pricingMode: PricingMode = entity?.pricingMode === 'exclusive' ? 'exclusive' : 'inclusive';

  const [lines, setLines] = useState<PosLine[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<LineDiscount | null>(null);
  const [promotionCode, setPromotionCode] = useState<string | null>(null);
  const [promotionDiscountMinor, setPromotionDiscountMinor] = useState(0);
  const [flashKey, setFlashKey] = useState<string | null>(null);

  const flash = useCallback((key: string) => {
    setFlashKey(key);
    // Long enough for the 0.5s animation, short enough not to linger.
    window.setTimeout(() => setFlashKey((current) => (current === key ? null : current)), 700);
  }, []);

  /**
   * A promotion is worth whatever the server said it was worth for the basket
   * that was validated. Touch the basket and that number is a lie, so it goes -
   * the cashier re-applies the code and gets a fresh figure. Keeping it would
   * mean the screen and the server disagreeing on the total.
   */
  const dropPromotion = useCallback(() => {
    setPromotionCode((current) => (current === null ? current : null));
    setPromotionDiscountMinor((current) => (current === 0 ? current : 0));
  }, []);

  const addProduct = useCallback(
    (product: LookupProductDto, options: AddOptions = {}): string => {
      const quantity = options.quantity ?? 1;
      const variantId = options.variantId ?? null;
      const weighted = product.type === 'weighted';
      const catalogue = options.variantPriceMinor ?? product.salePriceMinor;
      const unitPriceMinor =
        weighted && options.unitPriceMinor != null && options.unitPriceMinor > 0
          ? options.unitPriceMinor
          : catalogue;

      let key = '';

      dropPromotion();
      setLines((current) => {
        const existing = options.separateLine
          ? -1
          : current.findIndex(
              (line) =>
                line.productId === product.id &&
                line.variantId === variantId &&
                line.unitPriceMinor === unitPriceMinor &&
                !line.discountType &&
                !line.note,
            );

        if (existing >= 0) {
          const target = current[existing];
          key = target.key;
          const next = [...current];
          next[existing] = {
            ...target,
            quantity: Number((target.quantity + quantity).toFixed(3)),
          };
          return next;
        }

        key = uid('line');
        const line: PosLine = {
          key,
          productId: product.id,
          variantId,
          name: product.namePt,
          sku: options.variantSku ?? product.sku,
          unit: product.unit,
          type: product.type,
          quantity: Number(quantity.toFixed(3)),
          unitPriceMinor,
          taxRateBps: product.taxRateBps,
          discountType: null,
          discountValue: null,
          note: options.note ?? null,
          imageUrl: product.imageUrl,
          categoryId: product.categoryId,
        };
        return [...current, line];
      });

      return key;
    },
    [dropPromotion],
  );

  const setQuantity = useCallback((key: string, quantity: number) => {
    dropPromotion();
    setLines((current) =>
      current.flatMap((line) => {
        if (line.key !== key) return [line];
        const step = stepFor(line);
        const rounded = step < 1 ? Number(quantity.toFixed(3)) : Math.round(quantity);
        if (rounded <= 0) return [];
        return [{ ...line, quantity: rounded }];
      }),
    );
  }, [dropPromotion]);

  const setLineDiscount = useCallback(
    (key: string, type: DiscountType | null, value: number | null) => {
      dropPromotion();
      setLines((current) =>
        current.map((line) =>
          line.key === key
            ? { ...line, discountType: value && value > 0 ? type : null, discountValue: value && value > 0 ? value : null }
            : line,
        ),
      );
    },
    [dropPromotion],
  );

  const setLineNote = useCallback((key: string, note: string | null) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, note: note?.trim() ? note.trim() : null } : line)),
    );
  }, []);

  const removeLine = useCallback((key: string) => {
    dropPromotion();
    setLines((current) => current.filter((line) => line.key !== key));
  }, [dropPromotion]);

  const replaceLines = useCallback((next: PosLine[]) => {
    dropPromotion();
    setLines(next);
  }, [dropPromotion]);

  const setPromotion = useCallback((code: string | null, discountMinor: number) => {
    setPromotionCode(code);
    setPromotionDiscountMinor(Math.max(0, discountMinor));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setOrderDiscount(null);
    setPromotionCode(null);
    setPromotionDiscountMinor(0);
    setFlashKey(null);
  }, []);

  const totals = useMemo(
    () => cartTotals(lines, pricingMode, orderDiscount, promotionDiscountMinor),
    [lines, pricingMode, orderDiscount, promotionDiscountMinor],
  );

  return {
    lines,
    totals,
    pricingMode,
    orderDiscount,
    setOrderDiscount,
    promotionCode,
    promotionDiscountMinor,
    setPromotion,
    flashKey,
    flash,
    addProduct,
    setQuantity,
    setLineDiscount,
    setLineNote,
    removeLine,
    replaceLines,
    clear,
  };
}
