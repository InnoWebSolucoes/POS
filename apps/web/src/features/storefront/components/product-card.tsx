import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ImageOff, Plus, SlidersHorizontal } from 'lucide-react';

import { Badge, Button, Skeleton } from '@/components/ui';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { StorefrontProductDto } from '../types';

/**
 * One product in the grid. Tap anywhere for the detail page; the button adds
 * it straight to the basket, unless the product has variants - then the
 * shopper has to pick a size or a colour first, so the card sends them on.
 */

export interface ProductCardProps {
  product: StorefrontProductDto;
  slug: string;
  inStock: boolean;
  onAdd: (product: StorefrontProductDto) => void;
  adding?: boolean;
}

export function ProductCard({ product, slug, inStock, onAdd, adding = false }: ProductCardProps) {
  const { t } = useTranslation();
  const hasVariants = product.variants.length > 0;
  const to = `/loja/${encodeURIComponent(slug)}/produto/${encodeURIComponent(product.slug)}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <Link
        to={to}
        className="relative block aspect-square overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={product.namePt}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.namePt}
            loading="lazy"
            className={cn('size-full object-cover', !inStock && 'opacity-50')}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" aria-hidden="true" />
          </span>
        )}

        {!inStock && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Badge variant="destructive" size="lg">
              {t('store.outOfStock')}
            </Badge>
          </span>
        )}

        {inStock && hasVariants && (
          <span className="absolute left-2 top-2">
            <Badge variant="secondary" size="sm">
              {product.variants.length} opcoes
            </Badge>
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link to={to} className="outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{product.namePt}</h3>
        </Link>

        {product.category && (
          <p className="truncate text-xs text-muted-foreground">{product.category.namePt}</p>
        )}

        <p className="tabular mt-auto text-base font-bold">{money(product.priceMinor)}</p>

        {hasVariants ? (
          inStock ? (
            <Button asChild variant="outline" block size="sm">
              <Link to={to}>
                <SlidersHorizontal />
                Escolher opcoes
              </Link>
            </Button>
          ) : (
            <Button variant="outline" block size="sm" disabled>
              {t('store.outOfStock')}
            </Button>
          )
        ) : (
          <Button
            block
            size="sm"
            disabled={!inStock}
            loading={adding}
            onClick={() => onAdd(product)}
          >
            <Plus />
            {t('store.addToCart')}
          </Button>
        )}
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <Skeleton className="aspect-square rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default ProductCard;
