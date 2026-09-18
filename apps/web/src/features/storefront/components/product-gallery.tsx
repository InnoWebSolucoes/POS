import * as React from 'react';
import { ImageOff } from 'lucide-react';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

import type { StorefrontImageDto } from '../types';

/**
 * The product gallery: one big picture and a strip of thumbnails, each of them
 * a proper 64px tap target rather than a decorative dot.
 */
export interface ProductGalleryProps {
  images: StorefrontImageDto[];
  name: string;
  /** A chosen variant's photo wins over the product's own. */
  overrideUrl?: string | null;
  soldOut?: boolean;
  soldOutLabel?: string;
}

export function ProductGallery({
  images,
  name,
  overrideUrl,
  soldOut = false,
  soldOutLabel = 'Esgotado',
}: ProductGalleryProps) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setIndex(0);
  }, [images]);

  const active = overrideUrl ?? images[index]?.url ?? null;

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
        {active ? (
          <img src={active} alt={name} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-10" aria-hidden="true" />
          </span>
        )}

        {soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Badge variant="destructive" size="lg">
              {soldOutLabel}
            </Badge>
          </span>
        )}
      </div>

      {images.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {images.map((image, position) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setIndex(position)}
              aria-label={`Imagem ${position + 1}`}
              aria-pressed={!overrideUrl && position === index}
              className={cn(
                'size-16 shrink-0 overflow-hidden rounded-xl border-2 bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !overrideUrl && position === index ? 'border-primary' : 'border-border',
              )}
            >
              <img
                src={image.url}
                alt={image.alt ?? ''}
                loading="lazy"
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProductGallery;
