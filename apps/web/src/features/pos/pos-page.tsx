import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSaleRequest,
  CustomerDto,
  DiscountType,
  Paginated,
  PaymentInput,
  ProductDto,
  SaleDto,
} from '@pos/shared';

import { toast } from '@/components/ui/use-toast';
import { useScanner } from '@/hooks/use-scanner';
import { useOnlineStatus } from '@/hooks/use-socket';
import { ApiRequestError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { cacheCatalog, enqueueSale, findCachedByCode, queuedCount, startAutoSync } from '@/lib/offline';
import { qk } from '@/lib/query';
import { beep, errorBeep, successChime, unlockAudio } from '@/lib/sound';
import { CartPanel } from './cart-panel';
import { HoldDialog, RecallSheet } from './hold-recall';
import { LineEditorSheet } from './line-editor-sheet';
import { LookupPanel } from './lookup-panel';
import { NotFoundDialog } from './not-found-dialog';
import { PaymentDialog } from './payment-dialog';
import { ReceiptDialog } from './receipt-dialog';
import { WeightDialog } from './weight-dialog';
import {
  fromSaleLines,
  keyFamily,
  productToLookup,
  toCartLines,
  type LookupProductDto,
  type LookupResponse,
  type PosLine,
} from './types';
import { usePosSettings, useRegister } from './use-register';

export default function PosPage() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const entity = useAuth((s) => s.entity);
  const can = useAuth((s) => s.can);

  const settings = usePosSettings();
  const register = useRegister();
  const online = useOnlineStatus();

  const barcodeRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<number | null>(null);

  const [pendingQuantity, setPendingQuantityState] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(0);

  const [weightTarget, setWeightTarget] = useState<LookupProductDto | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<PosLine | null>(null);
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [recallOpen, setRecallOpen] = useState(false);
  const [receipt, setReceipt] = useState<SaleDto | null>(null);

  const setPendingQuantity = useCallback((value: number | null) => {
    pendingRef.current = value;
    setPendingQuantityState(value);
  }, []);

  /* ---------------------------------------------------------------- offline */

  const refreshQueued = useCallback(() => {
    void queuedCount()
      .then(setQueued)
      .catch(() => setQueued(0));
  }, []);

  useEffect(() => {
    refreshQueued();
    const timer = window.setInterval(refreshQueued, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshQueued]);

  useEffect(
    () =>
      startAutoSync((result) => {
        if (result.synced.length > 0) {
          toast.success(
            'Vendas sincronizadas',
            `${result.synced.length} venda(s) guardada(s) localmente foram enviadas.`,
          );
        }
        if (result.blocked > 0) {
          toast.error('Vendas por resolver', `${result.blocked} venda(s) foram recusadas pelo servidor.`);
        }
        refreshQueued();
      }),
    [refreshQueued],
  );

  // The catalogue mirror is what keeps the register selling when the line drops.
  const catalogue = useQuery({
    queryKey: qk.products({ offlineMirror: true }),
    queryFn: () => api.get<Paginated<ProductDto>>('/api/products', { active: true, pageSize: 200 }),
    staleTime: 10 * 60_000,
    enabled: online,
  });

  useEffect(() => {
    if (!catalogue.data) return;
    void cacheCatalog(catalogue.data.data).catch(() => undefined);
  }, [catalogue.data]);

  /* --------------------------------------------------------------- scanning */

  /** Consumes the armed multiplier, or a numeric prefix typed before the scan. */
  const takeQuantity = useCallback(
    (code: string): number => {
      let value = pendingRef.current ?? 0;
      const field = barcodeRef.current;

      if (field) {
        const raw = field.value;
        if (!value && raw.length > code.length && raw.endsWith(code)) {
          const prefix = raw.slice(0, raw.length - code.length).trim();
          if (/^\d{1,4}$/.test(prefix)) value = Number(prefix);
        }
        field.value = '';
      }

      if (pendingRef.current !== null) setPendingQuantity(null);
      return value > 0 ? value : 1;
    },
    [setPendingQuantity],
  );

  const addLookup = useCallback(
    (result: LookupResponse, quantity: number) => {
      const product = result.product;
      if (!product) return;

      if (product.type !== 'weighted') {
        const key = register.addProduct(product, {
          quantity,
          variantId: result.variant?.id ?? null,
          variantSku: result.variant?.sku ?? null,
          variantPriceMinor: result.variant?.salePriceMinor ?? null,
        });
        register.flash(key);
        return;
      }

      // A scale barcode carries either the weight or the money, never both.
      if (result.quantity != null && result.quantity > 0) {
        const key = register.addProduct(product, { quantity: result.quantity, separateLine: true });
        register.flash(key);
        return;
      }
      if (result.priceMinor != null && result.priceMinor > 0) {
        const key = register.addProduct(product, {
          quantity: 1,
          unitPriceMinor: result.priceMinor,
          note: 'Preco lido do rotulo',
          separateLine: true,
        });
        register.flash(key);
        return;
      }

      setWeightTarget(product);
    },
    [register],
  );

  const handleScan = useCallback(
    async (code: string) => {
      // Feedback first, network second: the beep must never wait on a request.
      unlockAudio();
      beep({ sound: settings.beepSound, volume: settings.beepVolume });

      const quantity = takeQuantity(code);
      setBusy(true);
      try {
        const result = await api.get<LookupResponse>('/api/products/lookup', { code });
        if (!result.found || !result.product) {
          errorBeep(settings.beepVolume);
          setNotFoundCode(code);
          return;
        }
        addLookup(result, quantity);
      } catch (error) {
        if (error instanceof ApiRequestError && error.isOffline) {
          const cached = await findCachedByCode(code).catch(() => null);
          if (cached) {
            const key = register.addProduct(productToLookup(cached), { quantity });
            register.flash(key);
            return;
          }
          errorBeep(settings.beepVolume);
          setNotFoundCode(code);
          return;
        }
        errorBeep(settings.beepVolume);
        toast.error('Falha na leitura', error instanceof Error ? error.message : 'Erro desconhecido.');
      } finally {
        setBusy(false);
      }
    },
    [addLookup, register, settings.beepSound, settings.beepVolume, takeQuantity],
  );

  const onScan = useCallback((code: string) => void handleScan(code), [handleScan]);

  // A scan landing in the cart behind an open dialog would be invisible and
  // unpaid for, so the scanner only listens while the register is the screen.
  const modalOpen =
    paymentOpen ||
    holdOpen ||
    recallOpen ||
    receipt !== null ||
    weightTarget !== null ||
    notFoundCode !== null ||
    editingLine !== null;

  useScanner({ onScan, enabled: !modalOpen });

  // Escape anywhere disarms the multiplier - it must never fire by surprise.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pendingRef.current !== null) setPendingQuantity(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setPendingQuantity]);

  const pickProduct = useCallback(
    (product: ProductDto) => {
      unlockAudio();
      const quantity = pendingRef.current ?? 1;
      if (pendingRef.current !== null) setPendingQuantity(null);

      const lookup = productToLookup(product);
      if (lookup.type === 'weighted') {
        setWeightTarget(lookup);
        return;
      }
      const key = register.addProduct(lookup, { quantity });
      register.flash(key);
    },
    [register, setPendingQuantity],
  );

  /* -------------------------------------------------------------- checkout  */

  const buildPayload = (payments: PaymentInput[]): CreateSaleRequest => ({
    channel: 'pos',
    locationId: user?.locationId ?? null,
    customerId: customer?.id ?? null,
    lines: toCartLines(register.lines),
    payments,
    orderDiscountType: (register.orderDiscount?.type ?? null) as DiscountType | null,
    orderDiscountValue: register.orderDiscount?.value ?? null,
    promotionCode: register.promotionCode,
    tipMinor: 0,
    note: null,
    idempotencyKey: crypto.randomUUID(),
    loyaltyPointsRedeemed: 0,
  });

  const checkout = useMutation({
    mutationFn: async (payments: PaymentInput[]) => {
      const payload = buildPayload(payments);
      try {
        const sale = await api.post<SaleDto>('/api/sales', payload);
        return { sale, queued: false };
      } catch (error) {
        // Offline is not a failure: the sale is kept and replayed later.
        if (error instanceof ApiRequestError && error.isOffline) {
          await enqueueSale(payload);
          return { sale: null, queued: true };
        }
        throw error;
      }
    },
    onSuccess: ({ sale, queued: wasQueued }) => {
      successChime(settings.beepVolume);
      setPaymentOpen(false);
      register.clear();
      setCustomer(null);

      if (wasQueued) {
        refreshQueued();
        toast.success(
          'Venda guardada localmente',
          'Sem ligacao ao servidor. A venda sera sincronizada automaticamente.',
        );
        return;
      }

      setReceipt(sale);
      void queryClient.invalidateQueries({ queryKey: keyFamily(qk.sales()) });
      void queryClient.invalidateQueries({ queryKey: qk.heldSales() });
      void queryClient.invalidateQueries({ queryKey: keyFamily(qk.products()) });
      void queryClient.invalidateQueries({ queryKey: keyFamily(qk.inventory()) });
    },
    onError: (error) => {
      errorBeep(settings.beepVolume);
      toast.error('Nao foi possivel concluir', error instanceof Error ? error.message : 'Erro desconhecido.');
    },
  });

  const hold = useMutation({
    mutationFn: (holdLabel: string) =>
      api.post<SaleDto>('/api/sales/hold', {
        channel: 'pos',
        locationId: user?.locationId ?? null,
        customerId: customer?.id ?? null,
        lines: toCartLines(register.lines),
        orderDiscountType: register.orderDiscount?.type ?? null,
        orderDiscountValue: register.orderDiscount?.value ?? null,
        promotionCode: register.promotionCode,
        holdLabel,
      }),
    onSuccess: () => {
      setHoldOpen(false);
      register.clear();
      setCustomer(null);
      void queryClient.invalidateQueries({ queryKey: qk.heldSales() });
      toast.success('Venda suspensa');
    },
    onError: (error) =>
      toast.error('Nao foi possivel suspender', error instanceof Error ? error.message : 'Erro desconhecido.'),
  });

  const clearSale = () => {
    register.clear();
    setCustomer(null);
  };

  /* ------------------------------------------------------------------ view  */

  return (
    <div data-surface="pos" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-[1.62] flex-col">
          <CartPanel
            lines={register.lines}
            totals={register.totals}
            pricingMode={register.pricingMode}
            flashKey={register.flashKey}
            online={online}
            queued={queued}
            canHold={can('sale:hold')}
            onOpenLine={setEditingLine}
            onPay={() => setPaymentOpen(true)}
            onHold={() => setHoldOpen(true)}
            onRecall={() => setRecallOpen(true)}
            onClear={clearSale}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <LookupPanel
            barcodeRef={barcodeRef}
            pendingQuantity={pendingQuantity}
            onArmQuantity={setPendingQuantity}
            onSubmitCode={onScan}
            onPick={pickProduct}
            busy={busy}
          />
        </div>
      </div>

      <LineEditorSheet
        line={editingLine}
        pricingMode={register.pricingMode}
        canDiscount={can('sale:discount')}
        onOpenChange={(open) => !open && setEditingLine(null)}
        onApply={(key, patch) => {
          register.setQuantity(key, patch.quantity);
          register.setLineDiscount(key, patch.discountType, patch.discountValue);
          register.setLineNote(key, patch.note);
          register.flash(key);
        }}
        onRemove={register.removeLine}
      />

      <WeightDialog
        product={weightTarget}
        onOpenChange={(open) => !open && setWeightTarget(null)}
        onConfirm={(quantity) => {
          if (!weightTarget) return;
          const key = register.addProduct(weightTarget, { quantity, separateLine: true });
          register.flash(key);
        }}
      />

      <NotFoundDialog code={notFoundCode} onOpenChange={(open) => !open && setNotFoundCode(null)} />

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        lines={register.lines}
        totals={register.totals}
        settings={settings}
        orderDiscount={register.orderDiscount}
        onOrderDiscountChange={register.setOrderDiscount}
        promotionCode={register.promotionCode}
        promotionDiscountMinor={register.promotionDiscountMinor}
        onPromotionChange={register.setPromotion}
        customer={customer}
        onCustomerChange={setCustomer}
        submitting={checkout.isPending}
        onConfirm={(payments) => checkout.mutate(payments)}
      />

      <HoldDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        saving={hold.isPending}
        onConfirm={(label) => hold.mutate(label)}
      />

      <RecallSheet
        open={recallOpen}
        onOpenChange={setRecallOpen}
        onLoaded={(sale) => {
          register.replaceLines(fromSaleLines(sale.lines));
          register.setOrderDiscount(null);
          register.setPromotion(null, 0);
          toast.success('Venda recuperada');
        }}
      />

      <ReceiptDialog sale={receipt} entity={entity} settings={settings} onClose={() => setReceipt(null)} />
    </div>
  );
}
