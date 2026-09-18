import * as React from 'react';
import { Barcode, PackageSearch } from 'lucide-react';
import type { ProductDto, Unit } from '@pos/shared';

import { Badge, Input, Spinner, toast } from '@/components/ui';
import { useKeepFocus, useScanner } from '@/hooks/use-scanner';
import { quantity as formatQuantity } from '@/lib/format';
import { beep, errorBeep } from '@/lib/sound';
import { cn } from '@/lib/utils';
import { lookupByCode, useProductSearch } from '../api';

export interface PickedProduct {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  barcode: string | null;
  unit: Unit;
  stockQuantity: number;
  /** Last recorded cost, in minor units. Null for roles without product:cost. */
  unitCostMinor: number | null;
  /** Weight decoded from a scale barcode, when the scan carried one. */
  scannedQuantity?: number;
}

function fromProduct(product: ProductDto): PickedProduct {
  return {
    productId: product.id,
    variantId: null,
    name: product.namePt,
    sku: product.sku,
    barcode: product.barcode,
    unit: product.unit,
    stockQuantity: product.stockQuantity,
    unitCostMinor: product.costPriceMinor ?? null,
  };
}

export interface ProductPickerProps {
  onPick: (product: PickedProduct) => void;
  /** Holds focus in the field the way a register does - for scan workflows. */
  keepFocused?: boolean;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Scan or search. A barcode goes straight through /api/products/lookup (which
 * also resolves variant barcodes and scale labels); typing shows the catalogue
 * search underneath, where only the parent product can be picked - a variant
 * is chosen by scanning its own barcode.
 */
export function ProductPicker({
  onPick,
  keepFocused = false,
  placeholder = 'Digitalizar codigo de barras ou procurar produto...',
  disabled = false,
  autoFocus = false,
  className,
}: ProductPickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [term, setTerm] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [looking, setLooking] = React.useState(false);

  useKeepFocus(inputRef as React.RefObject<HTMLInputElement>, keepFocused && !disabled);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  const { data: results, isFetching } = useProductSearch(debounced, !disabled && debounced.length >= 2);

  const submitCode = React.useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || disabled) return;

      setLooking(true);
      try {
        const result = await lookupByCode(trimmed);
        if (!result.found || !result.product) {
          errorBeep();
          toast.error('Produto nao encontrado', `Nenhum artigo corresponde a "${trimmed}".`);
          return;
        }
        const product = result.product;
        const variant = result.variant ?? null;
        beep();
        const picked: PickedProduct = {
          productId: product.id,
          variantId: variant?.id ?? null,
          name: variant ? `${product.namePt} - ${Object.values(variant.options ?? {}).join(' / ') || variant.sku}` : product.namePt,
          sku: variant?.sku ?? product.sku,
          barcode: product.barcode,
          unit: product.unit,
          stockQuantity: variant ? variant.stockQuantity : product.stockQuantity,
          unitCostMinor: variant?.costPriceMinor ?? product.costPriceMinor ?? null,
        };
        if (result.quantity !== undefined) picked.scannedQuantity = result.quantity;
        onPick(picked);
        setTerm('');
        setDebounced('');
      } catch {
        errorBeep();
        toast.error('Falha na leitura', 'Nao foi possivel consultar o produto. Verifique a ligacao.');
      } finally {
        setLooking(false);
      }
    },
    [disabled, onPick],
  );

  useScanner({ onScan: (code) => void submitCode(code), enabled: !disabled });

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Input
        ref={inputRef}
        value={term}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="search"
        autoComplete="off"
        placeholder={placeholder}
        aria-label="Codigo de barras ou nome do produto"
        startAdornment={<Barcode className="size-5" aria-hidden="true" />}
        endAdornment={looking || isFetching ? <Spinner className="size-4" /> : undefined}
        className="h-14 text-base"
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submitCode(term);
          }
        }}
      />

      {debounced.length >= 2 && (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-card">
          {(results ?? []).length === 0 && !isFetching && (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <PackageSearch className="size-4" aria-hidden="true" />
              Sem resultados para "{debounced}"
            </p>
          )}
          <ul className="divide-y divide-border">
            {(results ?? []).map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  className="flex min-h-touch w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => {
                    beep();
                    onPick(fromProduct(product));
                    setTerm('');
                    setDebounced('');
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{product.namePt}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {product.sku}
                      {product.barcode ? ` - ${product.barcode}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {product.trackStock ? (
                      <Badge variant={product.stockQuantity > 0 ? 'muted' : 'destructive'}>
                        <span className="tabular">{formatQuantity(product.stockQuantity, product.unit)}</span>
                      </Badge>
                    ) : (
                      <Badge variant="outline">Sem controlo</Badge>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ProductPicker;
