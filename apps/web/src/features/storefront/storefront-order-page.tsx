import * as React from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, PackageSearch, Truck } from 'lucide-react';

import { Badge, Button, Card, CardContent, Input, Label, Skeleton } from '@/components/ui';
import { formatDateTime, money } from '@/lib/format';

import { lookupOrder, storefrontKeys } from './api';
import { ShopClosed, ShopError, ShopLayout } from './components/shop-layout';
import {
  PAYMENT_STATUS_LABELS,
  StatusTimeline,
  paymentBadgeVariant,
} from './components/status-timeline';
import { errorMessage, useShop } from './hooks';
import type { PaymentIntentDto } from './types';

/**
 * Order confirmation and public status lookup at
 * /loja/:entitySlug/encomenda/:orderNumber.
 *
 * The order number alone proves nothing, so the email or phone on the order
 * travels with it - exactly what the API demands before it says a word about
 * an order.
 */
export default function StorefrontOrderPage() {
  const { entitySlug = '', orderNumber = '' } = useParams<{
    entitySlug: string;
    orderNumber: string;
  }>();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as { payment?: PaymentIntentDto; justPlaced?: boolean } | null;

  const shopQuery = useShop(entitySlug);
  const shop = shopQuery.data ?? null;

  // "seguir" is the footer's tracking link: an order page with nothing filled in.
  const initialNumber = orderNumber === 'seguir' ? '' : orderNumber;
  const email = searchParams.get('email') ?? '';
  const phone = searchParams.get('phone') ?? '';

  const [formNumber, setFormNumber] = React.useState(initialNumber);
  const [formContact, setFormContact] = React.useState(email || phone);

  const contact = email ? { email } : phone ? { phone } : null;
  /*
   * "Has a lookup to do" and "can run it yet" are different questions. Mixing
   * them showed the tracking form - and a shopper who had just paid saw it
   * under "Encomenda Confirmada" - for as long as the shop query was in flight.
   */
  const wantsLookup = Boolean(initialNumber) && Boolean(contact);
  const enabled = Boolean(shop) && wantsLookup;

  const orderQuery = useQuery({
    queryKey: storefrontKeys.order(entitySlug, initialNumber, email || phone),
    queryFn: () => lookupOrder(entitySlug, initialNumber, contact ?? {}),
    enabled,
    retry: false,
  });

  const submitLookup = (event: React.FormEvent) => {
    event.preventDefault();
    const number = formNumber.trim();
    const value = formContact.trim();
    if (!number || !value) return;

    const params = new URLSearchParams();
    if (value.includes('@')) params.set('email', value);
    else params.set('phone', value);

    // The number lives in the path and the contact in the query, so the link
    // the shopper bookmarks is the same one the API answers.
    navigate(
      `/loja/${encodeURIComponent(entitySlug)}/encomenda/${encodeURIComponent(number)}?${params.toString()}`,
      { replace: true },
    );
  };

  if (shopQuery.isError) {
    return (
      <ShopLayout slug={entitySlug} shop={null}>
        <ShopClosed slug={entitySlug} />
      </ShopLayout>
    );
  }

  const order = orderQuery.data ?? null;

  return (
    <ShopLayout
      slug={entitySlug}
      shop={shop}
      loading={shopQuery.isLoading}
      backTo={`/loja/${encodeURIComponent(entitySlug)}`}
      backLabel={t('store.continueShopping')}
    >
      {state?.justPlaced && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-success/40 bg-success/10 p-4">
          <CheckCircle2 className="size-6 shrink-0 text-success" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">{t('store.orderConfirmed')}</p>
            {state.payment && (
              <p className="text-sm text-muted-foreground">{state.payment.instructionsPt}</p>
            )}
            {state.payment?.redirectUrl && (
              <Button asChild size="sm" className="mt-2">
                <a href={state.payment.redirectUrl}>Continuar para o pagamento</a>
              </Button>
            )}
          </div>
        </div>
      )}

      {!wantsLookup ? (
        <Card className="mx-auto max-w-lg">
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Seguir encomenda</h1>
              <p className="text-sm text-muted-foreground">
                Indique o numero da encomenda e o email ou telefone que usou na compra.
              </p>
            </div>

            <form className="space-y-4" onSubmit={submitLookup}>
              <div className="space-y-1.5">
                <Label htmlFor="order-number">Numero da encomenda</Label>
                <Input
                  id="order-number"
                  value={formNumber}
                  placeholder="WEB2026/000123"
                  onChange={(event) => setFormNumber(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-contact">Email ou telefone</Label>
                <Input
                  id="order-contact"
                  value={formContact}
                  onChange={(event) => setFormContact(event.target.value)}
                />
              </div>
              <Button type="submit" size="lg" block disabled={!formNumber.trim() || !formContact.trim()}>
                Ver estado
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : orderQuery.isError ? (
        <ShopError
          message={errorMessage(
            orderQuery.error,
            'Nao encontramos essa encomenda com esse contacto.',
          )}
          onRetry={() => void orderQuery.refetch()}
        />
      ) : orderQuery.isPending || !order ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="tabular text-2xl font-semibold">{order.orderNumber}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{order.statusLabelPt}</Badge>
                <Badge variant={paymentBadgeVariant(order.paymentStatus)}>
                  {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                </Badge>
                <span className="tabular text-sm text-muted-foreground">
                  {formatDateTime(order.placedAt)}
                </span>
              </div>
            </div>

            <Card>
              <CardContent className="p-5">
                <StatusTimeline
                  status={order.status}
                  fulfilmentMethod={order.fulfilmentMethod}
                  placedAt={order.placedAt}
                  shippedAt={order.shippedAt}
                  deliveredAt={order.deliveredAt}
                />
              </CardContent>
            </Card>

            {(order.trackingNumber || order.pickupLocation) && (
              <Card>
                <CardContent className="space-y-2 p-5">
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    {order.fulfilmentMethod === 'delivery' ? (
                      <>
                        <Truck className="size-5" aria-hidden="true" /> Seguimento
                      </>
                    ) : (
                      <>
                        <PackageSearch className="size-5" aria-hidden="true" /> Levantamento
                      </>
                    )}
                  </h2>

                  {order.fulfilmentMethod === 'delivery' ? (
                    <dl className="grid gap-1 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Transportadora</dt>
                        <dd className="font-medium">{order.carrier ?? '-'}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Numero de seguimento</dt>
                        <dd className="tabular font-medium">{order.trackingNumber ?? '-'}</dd>
                      </div>
                    </dl>
                  ) : (
                    <div className="text-sm">
                      <p className="font-medium">{order.pickupLocation?.name}</p>
                      {order.pickupLocation?.address && (
                        <p className="text-muted-foreground">{order.pickupLocation.address}</p>
                      )}
                      {order.pickupLocation?.phone && (
                        <p className="tabular text-muted-foreground">{order.pickupLocation.phone}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="lg:sticky lg:top-28">
            <CardContent className="space-y-4 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Artigos
              </h2>
              {/* Capped where the column is sticky, so a long order cannot push
                  the Total out of the bottom of a card that is stuck there. */}
              <ul className="space-y-3 lg:max-h-80 lg:overflow-y-auto lg:pr-1">
                {order.lines.map((line, index) => (
                  <li key={`${line.name}-${index}`} className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="tabular text-muted-foreground">{line.quantity}x </span>
                      {line.name}
                    </span>
                    <span className="tabular shrink-0">{money(line.totalMinor)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between border-t border-border pt-3 text-lg font-bold">
                <span>Total</span>
                <span className="tabular">{money(order.totalMinor)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </ShopLayout>
  );
}
