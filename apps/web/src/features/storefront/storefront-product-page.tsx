import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, ShoppingBag } from 'lucide-react';

import { Badge, Button, QuantityStepper, Separator, Skeleton, toast } from '@/components/ui';
import { computeLine, FRACTIONAL_UNITS, UNIT_LABELS } from '@pos/shared';
import { money, percent } from '@/lib/format';

import { loadProduct, storefrontKeys } from './api';
import { ProductCard } from './components/product-card';
import { ProductGallery } from './components/product-gallery';
import { ShopClosed, ShopError, ShopLayout } from './components/shop-layout';
import { VariantPicker, matchVariant } from './components/variant-picker';
import { errorMessage, useCart, useShop } from './hooks';
import { resolveProductInStock, resolveVariantInStock, useLiveStock, useStockOverrides } from './live-stock';
import type { StorefrontProductDto } from './types';

/**
 * Product detail at /loja/:entitySlug/produto/:productId.
 *
 * The id in the URL may be the product id or its online slug - the API accepts
 * either, so a shared link keeps working after a rename.
 */
export default function StorefrontProductPage() {
  const { entitySlug = '', productId = '' } = useParams<{ entitySlug: string; productId: string }>();
  const { t } = useTranslation();

  const shopQuery = useShop(entitySlug);
  const shop = shopQuery.data ?? null;
  const live = useLiveStock(shop?.id, entitySlug);
  const overrides = useStockOverrides();
  const cart = useCart(entitySlug, Boolean(shop));

  const productQuery = useQuery({
    queryKey: storefrontKeys.product(entitySlug, productId),
    queryFn: () => loadProduct(entitySlug, productId),
    enabled: Boolean(shop) && Boolean(productId),
  });
  const product = productQuery.data ?? null;

  const [options, setOptions] = React.useState<Record<string, string>>({});
  const [variantId, setVariantId] = React.useState<string | null>(null);
  const [quantity, setQuantity] = React.useState(1);
  const [adding, setAdding] = React.useState(false);
  const [added, setAdded] = React.useState(false);

  React.useEffect(() => {
    setOptions({});
    setVariantId(null);
    setQuantity(1);
    setAdded(false);
  }, [productId]);

  const variant = React.useMemo(() => {
    if (!product) return null;
    return (
      matchVariant(product.variants, options) ??
      product.variants.find((row) => row.id === variantId) ??
      null
    );
  }, [product, options, variantId]);

  const hasVariants = (product?.variants.length ?? 0) > 0;
  const mustChoose = hasVariants && !variant;

  const inStock = React.useMemo(() => {
    if (!product) return false;
    if (variant) return resolveVariantInStock(product.id, variant, overrides);
    return resolveProductInStock(product, overrides);
  }, [product, variant, overrides]);

  const priceMinor = variant?.priceMinor ?? product?.priceMinor ?? 0;
  const fractional = product ? FRACTIONAL_UNITS.includes(product.unit) : false;

  // The published price already carries tax, so the running total is the
  // shared line calculation in inclusive mode - never a multiplication here.
  const lineTotalMinor = computeLine({
    unitPriceMinor: priceMinor,
    quantity,
    taxRateBps: product?.taxRateBps ?? 0,
    pricingMode: 'inclusive',
  }).grossMinor;

  const handleAdd = async () => {
    if (!product) return;
    setAdding(true);
    try {
      await cart.add({ productId: product.id, variantId: variant?.id ?? null, quantity });
      setAdded(true);
      toast.success('Adicionado ao carrinho', product.namePt);
    } catch (error) {
      toast.error('Nao foi possivel adicionar', errorMessage(error, 'Tente novamente.'));
    } finally {
      setAdding(false);
    }
  };

  if (shopQuery.isError) {
    return (
      <ShopLayout slug={entitySlug} shop={null}>
        <ShopClosed slug={entitySlug} />
      </ShopLayout>
    );
  }

  return (
    <ShopLayout
      slug={entitySlug}
      shop={shop}
      loading={shopQuery.isLoading}
      cartCount={cart.itemCount}
      backTo={`/loja/${encodeURIComponent(entitySlug)}`}
      backLabel="Continuar a comprar"
      live={live}
    >
      {productQuery.isError ? (
        <ShopError
          message={errorMessage(productQuery.error, 'Produto nao encontrado.')}
          onRetry={() => void productQuery.refetch()}
        />
      ) : productQuery.isLoading || !product ? (
        <ProductSkeleton />
      ) : (
        <div className="space-y-10">
          <div className="grid gap-6 md:grid-cols-2 md:gap-10">
            <ProductGallery
              images={product.images}
              name={product.namePt}
              overrideUrl={variant?.imageUrl ?? null}
              soldOut={!inStock}
              soldOutLabel={t('store.outOfStock')}
            />

            <div className="space-y-5">
              <div className="space-y-2">
                {product.category && (
                  <p className="text-sm text-muted-foreground">{product.category.namePt}</p>
                )}
                <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{product.namePt}</h1>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="tabular text-3xl font-bold">{money(priceMinor)}</p>
                  <Badge variant={inStock ? 'success' : 'destructive'}>
                    {inStock ? t('store.inStock') : t('store.outOfStock')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Preco por {UNIT_LABELS[product.unit].pt.toLowerCase()}, IVA de {percent(product.taxRateBps)} incluido.
                </p>
              </div>

              {hasVariants && (
                <VariantPicker
                  productId={product.id}
                  variants={product.variants}
                  selected={options}
                  onSelect={setOptions}
                  selectedId={variantId}
                  onSelectId={setVariantId}
                  overrides={overrides}
                />
              )}

              <Separator />

              <div className="flex flex-wrap items-center gap-4">
                <QuantityStepper
                  value={quantity}
                  onChange={setQuantity}
                  min={fractional ? 0.1 : 1}
                  step={fractional ? 0.1 : 1}
                  unit={product.unit}
                  editable={fractional}
                  size="lg"
                  aria-label="Quantidade"
                />
                <p className="tabular text-sm text-muted-foreground">
                  Total {money(lineTotalMinor)}
                </p>
              </div>

              {mustChoose && (
                <p className="text-sm text-muted-foreground">
                  Escolha uma opcao para continuar.
                </p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  size="xl"
                  className="flex-1"
                  disabled={!inStock || mustChoose}
                  loading={adding}
                  onClick={() => void handleAdd()}
                >
                  {added ? <Check /> : <ShoppingBag />}
                  {inStock ? t('store.addToCart') : t('store.outOfStock')}
                </Button>
                {added && (
                  <Button asChild size="xl" variant="outline" className="flex-1">
                    <Link to={`/loja/${encodeURIComponent(entitySlug)}/carrinho`}>
                      {t('store.checkout')}
                    </Link>
                  </Button>
                )}
              </div>

              {product.descriptionPt && (
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Descricao
                  </h2>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                    {product.descriptionPt}
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">Referencia {product.sku}</p>
            </div>
          </div>

          {product.related.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">{t('store.relatedProducts')}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {product.related.map((related: StorefrontProductDto) => (
                  <ProductCard
                    key={related.id}
                    product={related}
                    slug={entitySlug}
                    inStock={resolveProductInStock(related, overrides)}
                    onAdd={async (item) => {
                      try {
                        await cart.add({ productId: item.id, quantity: 1 });
                        toast.success('Adicionado ao carrinho', item.namePt);
                      } catch (error) {
                        toast.error('Nao foi possivel adicionar', errorMessage(error));
                      }
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </ShopLayout>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-10">
      <Skeleton className="aspect-square w-full rounded-2xl" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
