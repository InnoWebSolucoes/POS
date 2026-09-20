import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { FulfilmentMethod, PaymentGateway } from '@pos/shared';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Label,
  Skeleton,
  Textarea,
  toast,
} from '@/components/ui';
import { ApiRequestError, getToken } from '@/lib/api';
import { money } from '@/lib/format';

import { loadPickupPoints, placeOrder, storefrontKeys } from './api';
import {
  AddressForm,
  ContactForm,
  EMPTY_ADDRESS,
  EMPTY_CONTACT,
  type AddressFormValue,
  type ContactFormValue,
  type FieldErrors,
} from './components/checkout-forms';
import { FulfilmentStep, ReviewStep } from './components/checkout-steps';
import { CHECKOUT_STEPS, CheckoutStepper } from './components/checkout-stepper';
import { OrderTotals } from './components/order-totals';
import { GATEWAY_OPTIONS, PaymentPicker } from './components/payment-picker';
import { ShopClosed, ShopError, ShopLayout } from './components/shop-layout';
import { errorMessage, useCart, useShop } from './hooks';
import { useLiveStock } from './live-stock';

/**
 * Checkout at /loja/:entitySlug/checkout.
 *
 * Four steps, guest-friendly, and honest about what the shop can actually take
 * money with. The order is priced by the server on POST - nothing on this page
 * tells it what anything costs.
 */
export default function StorefrontCheckoutPage() {
  const { entitySlug = '' } = useParams<{ entitySlug: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const shopQuery = useShop(entitySlug);
  const shop = shopQuery.data ?? null;
  const live = useLiveStock(shop?.id, entitySlug);
  const cart = useCart(entitySlug, Boolean(shop));

  const [step, setStep] = React.useState(0);
  const [method, setMethod] = React.useState<FulfilmentMethod>('delivery');
  const [pickupId, setPickupId] = React.useState<string | null>(null);
  const [address, setAddress] = React.useState<AddressFormValue>(EMPTY_ADDRESS);
  const [contact, setContact] = React.useState<ContactFormValue>(EMPTY_CONTACT);
  const [gateway, setGateway] = React.useState<PaymentGateway | null>('bank_transfer');
  const [note, setNote] = React.useState('');
  const [errors, setErrors] = React.useState<FieldErrors>({});

  /*
   * There is no public endpoint for the store list, so this reads the staff one
   * and only when a staff session actually exists. Fired anonymously it is a
   * guaranteed 401, and a 401 on a non-anonymous call makes the api client tear
   * down whatever session the browser did have - a public page must never be
   * able to do that. Without a session the checkout goes straight to the
   * "combine com a loja" branch instead.
   */
  const hasStaffSession = Boolean(getToken());

  const pickupQuery = useQuery({
    queryKey: storefrontKeys.pickupPoints(entitySlug),
    queryFn: () => loadPickupPoints(shop?.id ?? ''),
    enabled: Boolean(shop?.id) && method === 'pickup' && hasStaffSession,
    retry: false,
  });

  const shopHome = `/loja/${encodeURIComponent(entitySlug)}`;
  const cartHref = `${shopHome}/carrinho`;

  const placement = useMutation({
    mutationFn: () => {
      if (!cart.cart) throw new Error('Carrinho indisponivel.');
      return placeOrder({
        entitySlug,
        cartId: cart.cart.id,
        fulfilmentMethod: method,
        pickupLocationId: method === 'pickup' ? pickupId ?? undefined : undefined,
        shippingAddress:
          method === 'delivery'
            ? {
                recipient: address.recipient.trim(),
                phone: address.phone.trim(),
                line1: address.line1.trim(),
                line2: address.line2.trim() || null,
                city: address.city.trim(),
                province: address.province || null,
              }
            : undefined,
        guestName: contact.name.trim(),
        guestEmail: contact.email.trim() || undefined,
        guestPhone: contact.phone.trim() || undefined,
        paymentGateway: gateway as PaymentGateway,
        note: note.trim() || null,
      });
    },
    onSuccess: (response) => {
      cart.refetch();
      const params = new URLSearchParams();
      if (contact.email.trim()) params.set('email', contact.email.trim());
      else if (contact.phone.trim()) params.set('phone', contact.phone.trim());

      navigate(
        `${shopHome}/encomenda/${encodeURIComponent(response.data.orderNumber)}?${params.toString()}`,
        { state: { payment: response.payment, justPlaced: true } },
      );
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError && error.details) {
        const mapped: FieldErrors = {};
        for (const [key, messages] of Object.entries(error.details)) mapped[key] = messages[0];
        setErrors(mapped);
        if (mapped['shippingAddress.recipient'] || mapped['shippingAddress.line1']) setStep(1);
        else if (mapped.guestName || mapped.guestEmail || mapped.guestPhone) setStep(1);
      }
      toast.error('Nao foi possivel concluir', errorMessage(error, 'Tente novamente.'));
    },
  });

  const contactOk = contact.name.trim().length > 0 && (contact.email.trim() || contact.phone.trim());
  const addressOk =
    address.recipient.trim() && address.phone.trim() && address.line1.trim() && address.city.trim();

  const stepValid = (index: number): boolean => {
    if (index === 0) return method === 'delivery' || Boolean(pickupId);
    if (index === 1) return Boolean(contactOk) && (method === 'pickup' || Boolean(addressOk));
    if (index === 2) {
      const option = GATEWAY_OPTIONS.find((row) => row.gateway === gateway);
      return Boolean(option?.available);
    }
    return true;
  };

  /** Why "Continuar" is greyed out. A disabled button with no reason is a wall. */
  const blockingHint = (index: number): string | null => {
    if (index === 0) {
      if (stepValid(0)) return null;
      return 'Escolha onde quer levantar, ou volte a entrega ao domicilio.';
    }
    if (index === 1) {
      const missing: string[] = [];
      if (!contact.name.trim()) missing.push('o seu nome');
      if (!contact.email.trim() && !contact.phone.trim()) missing.push('um email ou telefone');
      if (method === 'delivery' && !addressOk) missing.push('a morada de entrega');
      return missing.length > 0 ? `Falta indicar ${missing.join(', ')}.` : null;
    }
    if (index === 2) {
      return stepValid(2) ? null : 'Escolha um metodo de pagamento disponivel.';
    }
    for (let earlier = 0; earlier < 3; earlier += 1) {
      const hint = blockingHint(earlier);
      if (hint) return `${hint} Toque em Voltar para completar.`;
    }
    return null;
  };

  const hint = blockingHint(step);

  if (shopQuery.isError) {
    return (
      <ShopLayout slug={entitySlug} shop={null}>
        <ShopClosed slug={entitySlug} />
      </ShopLayout>
    );
  }

  const lines = cart.cart?.lines ?? [];

  return (
    <ShopLayout
      slug={entitySlug}
      shop={shop}
      loading={shopQuery.isLoading}
      cartCount={cart.itemCount}
      backTo={cartHref}
      backLabel={t('store.cart')}
      live={live}
    >
      <h1 className="mb-4 text-2xl font-semibold">{t('store.checkout')}</h1>

      {cart.error ? (
        <ShopError message={errorMessage(cart.error)} onRetry={cart.refetch} />
      ) : cart.loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : lines.length === 0 || !cart.cart ? (
        <EmptyState
          title="O carrinho esta vazio"
          description="Adicione produtos antes de finalizar a compra."
          action={{ label: t('store.continueShopping'), onClick: () => navigate(shopHome) }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div>
            <CheckoutStepper step={step} />

            <Card>
              <CardContent className="space-y-5 p-4 sm:p-6">
                {step === 0 && (
                  <FulfilmentStep
                    method={method}
                    onMethod={(next) => {
                      setMethod(next);
                      if (next === 'delivery') setPickupId(null);
                    }}
                    pickupId={pickupId}
                    onPickup={setPickupId}
                    pickupPoints={pickupQuery.data ?? []}
                    pickupLoading={pickupQuery.isFetching}
                    pickupFailed={pickupQuery.isError || !hasStaffSession}
                    shopPhone={shop?.phone ?? null}
                  />
                )}

                {step === 1 && (
                  <div className="space-y-6">
                    {method === 'delivery' && (
                      <section className="space-y-3">
                        <h2 className="text-base font-semibold">Morada de entrega</h2>
                        <AddressForm value={address} onChange={setAddress} errors={errors} />
                      </section>
                    )}
                    <section className="space-y-3">
                      <h2 className="text-base font-semibold">Os seus contactos</h2>
                      <p className="text-sm text-muted-foreground">
                        Nao precisa de conta. Guarde o numero da encomenda e este contacto para
                        seguir o estado.
                      </p>
                      <ContactForm value={contact} onChange={setContact} errors={errors} />
                    </section>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-5">
                    <h2 className="text-base font-semibold">Como quer pagar?</h2>
                    <PaymentPicker value={gateway} onChange={setGateway} />
                    <div className="space-y-1.5">
                      <Label htmlFor="order-note">Nota para a loja</Label>
                      <Textarea
                        id="order-note"
                        value={note}
                        rows={3}
                        maxLength={500}
                        placeholder="Ponto de referencia, horario preferido..."
                        onChange={(event) => setNote(event.target.value)}
                      />
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <ReviewStep
                    method={method}
                    address={address}
                    contact={contact}
                    gateway={gateway}
                    note={note}
                    pickupName={
                      pickupQuery.data?.find((point) => point.id === pickupId)?.name ?? null
                    }
                  />
                )}

                {hint && (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {hint}
                  </p>
                )}

                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  {step > 0 && (
                    <Button
                      variant="outline"
                      size="lg"
                      className="sm:w-40"
                      onClick={() => setStep((current) => current - 1)}
                      disabled={placement.isPending}
                    >
                      Voltar
                    </Button>
                  )}

                  {step < CHECKOUT_STEPS.length - 1 ? (
                    <Button
                      size="lg"
                      className="flex-1"
                      disabled={!stepValid(step)}
                      onClick={() => setStep((current) => current + 1)}
                    >
                      Continuar
                    </Button>
                  ) : (
                    <Button
                      size="xl"
                      /*
                       * Buttons are whitespace-nowrap, and "Confirmar encomenda
                       * 1 234 567,89 Kz" at text-lg with px-8 is wider than a
                       * phone. Two centred lines below sm, one row above it.
                       */
                      className="h-auto min-h-16 flex-1 flex-col gap-1 px-4 py-3 text-base sm:flex-row sm:gap-3 sm:text-lg"
                      loading={placement.isPending}
                      disabled={!stepValid(0) || !stepValid(1) || !stepValid(2)}
                      onClick={() => placement.mutate()}
                    >
                      <span>Confirmar encomenda</span>
                      <span className="tabular">{money(cart.cart.totalMinor)}</span>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="lg:sticky lg:top-28">
            <CardContent className="space-y-4 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                A sua encomenda
              </h2>
              {/* A 30-line basket used to push the totals - the whole point of
                  this column - below the fold of a card that is stuck there. */}
              <ul className="space-y-2 lg:max-h-72 lg:overflow-y-auto lg:pr-1">
                {lines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="tabular text-muted-foreground">{line.quantity}x </span>
                      <span className="line-clamp-1">{line.name}</span>
                    </span>
                    <span className="tabular shrink-0">{money(line.lineTotalMinor)}</span>
                  </li>
                ))}
              </ul>
              <OrderTotals
                subtotalMinor={cart.cart.subtotalMinor}
                discountMinor={cart.cart.discountMinor}
                taxMinor={cart.cart.taxMinor}
                totalMinor={cart.cart.totalMinor}
                pricingMode={shop?.pricingMode}
              />
              {method === 'delivery' && (
                <p className="text-xs text-muted-foreground">
                  Se a loja cobrar entrega, o valor e somado ao confirmar a encomenda.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </ShopLayout>
  );
}
