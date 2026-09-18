import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingCart } from 'lucide-react';

import { Button, Card, CardContent, EmptyState, Skeleton, toast } from '@/components/ui';

import { CartLineRow } from './components/cart-line-row';
import { OrderTotals } from './components/order-totals';
import { ShopClosed, ShopError, ShopLayout } from './components/shop-layout';
import { errorMessage, useCart, useShop } from './hooks';
import { useLiveStock } from './live-stock';

/**
 * The basket at /loja/:entitySlug/carrinho.
 *
 * The cart id lives in localStorage against a generated session id, so a guest
 * who closes the tab still finds their basket - and the server, not this page,
 * decides what any of it costs.
 */
export default function StorefrontCartPage() {
  const { entitySlug = '' } = useParams<{ entitySlug: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const shopQuery = useShop(entitySlug);
  const shop = shopQuery.data ?? null;
  const live = useLiveStock(shop?.id, entitySlug);
  const cart = useCart(entitySlug, Boolean(shop));

  const shopHome = `/loja/${encodeURIComponent(entitySlug)}`;

  const handleQuantity = async (itemId: string, quantity: number) => {
    try {
      await cart.setQuantity(itemId, quantity);
    } catch (error) {
      toast.error('Nao foi possivel actualizar', errorMessage(error));
      cart.refetch();
    }
  };

  const handleRemove = async (itemId: string, name: string) => {
    try {
      await cart.remove(itemId);
      toast.show('Removido do carrinho', name);
    } catch (error) {
      toast.error('Nao foi possivel remover', errorMessage(error));
    }
  };

  if (shopQuery.isError) {
    return (
      <ShopLayout slug={entitySlug} shop={null}>
        <ShopClosed slug={entitySlug} />
      </ShopLayout>
    );
  }

  const lines = cart.cart?.lines ?? [];
  const blocked = lines.some((line) => !line.inStock);

  return (
    <ShopLayout
      slug={entitySlug}
      shop={shop}
      loading={shopQuery.isLoading}
      cartCount={cart.itemCount}
      backTo={shopHome}
      backLabel={t('store.continueShopping')}
      live={live}
    >
      <h1 className="mb-4 text-2xl font-semibold">{t('store.cart')}</h1>

      {cart.error ? (
        <ShopError message={errorMessage(cart.error)} onRetry={cart.refetch} />
      ) : cart.loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex gap-4">
              <Skeleton className="size-20 rounded-xl sm:size-24" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-12 w-40 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : lines.length === 0 || !cart.cart ? (
        <EmptyState
          icon={ShoppingCart}
          title="O carrinho esta vazio"
          description="Ainda nao adicionou nada. Veja o que a loja tem disponivel."
          action={{ label: t('store.continueShopping'), onClick: () => navigate(shopHome) }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <ul className="rounded-2xl border border-border bg-card px-4">
            {lines.map((line) => (
              <CartLineRow
                key={line.id}
                line={line}
                slug={entitySlug}
                disabled={cart.busy}
                onQuantityChange={(quantity) => void handleQuantity(line.id, quantity)}
                onRemove={() => void handleRemove(line.id, line.name)}
              />
            ))}
          </ul>

          <Card className="lg:sticky lg:top-28">
            <CardContent className="space-y-4 p-4">
              <OrderTotals
                subtotalMinor={cart.cart.subtotalMinor}
                discountMinor={cart.cart.discountMinor}
                taxMinor={cart.cart.taxMinor}
                totalMinor={cart.cart.totalMinor}
                pricingMode={shop?.pricingMode}
              />

              {blocked && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Ha artigos esgotados no carrinho. Remova-os para continuar.
                </p>
              )}

              {blocked ? (
                <Button size="xl" block disabled>
                  {t('store.checkout')}
                </Button>
              ) : (
                <Button asChild size="xl" block>
                  <Link to={`/loja/${encodeURIComponent(entitySlug)}/checkout`}>
                    {t('store.checkout')}
                  </Link>
                </Button>
              )}

              <Button asChild variant="ghost" block>
                <Link to={shopHome}>{t('store.continueShopping')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </ShopLayout>
  );
}
