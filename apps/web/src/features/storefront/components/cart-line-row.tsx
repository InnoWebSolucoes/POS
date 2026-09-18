import * as React from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, Trash2 } from 'lucide-react';

import { Badge, Button, QuantityStepper } from '@/components/ui';
import { FRACTIONAL_UNITS } from '@pos/shared';
import { money } from '@/lib/format';

import type { CartLineDto } from '../types';

/**
 * One basket line.
 *
 * Tapping the stepper four times must not fire four PATCHes, so the quantity
 * is held locally and committed once the shopper stops tapping. The line total
 * still comes from the server's pricing - the basket is never priced here.
 */
export interface CartLineRowProps {
  line: CartLineDto;
  slug: string;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export function CartLineRow({
  line,
  slug,
  onQuantityChange,
  onRemove,
  disabled = false,
}: CartLineRowProps) {
  const [quantity, setQuantity] = React.useState(line.quantity);
  const committed = React.useRef(line.quantity);
  const commit = React.useRef(onQuantityChange);

  React.useEffect(() => {
    commit.current = onQuantityChange;
  }, [onQuantityChange]);

  React.useEffect(() => {
    committed.current = line.quantity;
    setQuantity(line.quantity);
  }, [line.quantity]);

  React.useEffect(() => {
    if (quantity === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = quantity;
      commit.current(quantity);
    }, 450);
    return () => clearTimeout(timer);
  }, [quantity]);

  const fractional = FRACTIONAL_UNITS.includes(line.unit);
  const options = Object.entries(line.options);
  const to = `/loja/${encodeURIComponent(slug)}/produto/${encodeURIComponent(line.slug)}`;

  return (
    <li className="flex gap-3 border-b border-border py-4 last:border-b-0 sm:gap-4">
      <Link
        to={to}
        className="size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-24"
      >
        {line.imageUrl ? (
          <img src={line.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden="true" />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link to={to} className="line-clamp-2 font-medium outline-none focus-visible:underline">
              {line.name}
            </Link>
            {options.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {options.map(([key, value]) => `${key}: ${value}`).join(' - ')}
              </p>
            )}
            <p className="tabular mt-0.5 text-xs text-muted-foreground">
              {money(line.unitPriceMinor)} / un
            </p>
          </div>

          <p className="tabular shrink-0 font-semibold">{money(line.lineTotalMinor)}</p>
        </div>

        {!line.inStock && (
          <Badge variant="destructive" size="sm" className="self-start">
            {line.availabilityLabel}
          </Badge>
        )}

        <div className="mt-auto flex items-center gap-2">
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            min={fractional ? 0.1 : 1}
            step={fractional ? 0.1 : 1}
            unit={line.unit}
            editable={fractional}
            disabled={disabled}
            aria-label={`Quantidade de ${line.name}`}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remover ${line.name}`}
            className="ml-auto text-muted-foreground"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </li>
  );
}

export default CartLineRow;
