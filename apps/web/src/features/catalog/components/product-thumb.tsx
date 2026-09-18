import * as React from 'react';
import { ImageOff } from 'lucide-react';

import { cn, colorForLabel, contrastText, initials } from '@/lib/utils';

export interface ProductThumbProps {
  url: string | null | undefined;
  name: string;
  /** Falls back to a coloured monogram so a row is never an empty box. */
  tileColor?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'size-10 text-xs',
  md: 'size-14 text-sm',
  lg: 'size-20 text-base',
};

export function ProductThumb({ url, name, tileColor, size = 'sm', className }: ProductThumbProps) {
  const [failed, setFailed] = React.useState(false);
  const background = tileColor ?? colorForLabel(name);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-lg border border-border object-cover', SIZES[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg border border-border font-semibold',
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: background, color: contrastText(background) }}
    >
      {name ? initials(name) : <ImageOff className="size-4" />}
    </span>
  );
}

export default ProductThumb;
