import { useState, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ScanBarcode, X } from 'lucide-react';
import type { ProductDto } from '@pos/shared';

import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { useKeepFocus } from '@/hooks/use-scanner';
import { cn } from '@/lib/utils';
import { QuickGrid } from './quick-grid';

export interface LookupPanelProps {
  barcodeRef: RefObject<HTMLInputElement>;
  /** Armed quantity multiplier, shown so the cashier can see it is loaded. */
  pendingQuantity: number | null;
  onArmQuantity: (value: number | null) => void;
  onSubmitCode: (code: string) => void;
  onPick: (product: ProductDto) => void;
  busy: boolean;
}

/**
 * The right-hand column: the always-focused barcode field, a product search and
 * the quick-access tile grid. Everything a cashier needs when the scanner is
 * not the answer.
 */
export function LookupPanel({
  barcodeRef,
  pendingQuantity,
  onArmQuantity,
  onSubmitCode,
  onPick,
  busy,
}: LookupPanelProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  // Keeps the scanner working no matter where the last tap landed.
  useKeepFocus(barcodeRef);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    const raw = field.value.trim();

    if (event.key === 'Escape') {
      event.preventDefault();
      field.value = '';
      onArmQuantity(null);
      return;
    }

    // "5" then "*" arms a multiplier: the next scan rings up five units.
    if ((event.key === '*' || event.key === 'x' || event.key === 'X') && /^\d{1,4}$/.test(raw)) {
      event.preventDefault();
      const value = Number(raw);
      if (value > 0) onArmQuantity(value);
      field.value = '';
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (!raw) return;
      field.value = '';
      onSubmitCode(raw);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background" aria-label="Procura de artigos">
      <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
        <div className="relative">
          <Input
            ref={barcodeRef}
            onKeyDown={handleKeyDown}
            placeholder={t('pos.scanPrompt', 'Leia ou introduza o codigo de barras')}
            aria-label={t('pos.scanPrompt', 'Leia ou introduza o codigo de barras')}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            startAdornment={<ScanBarcode className="size-5" />}
            className={cn('h-14 text-base', pendingQuantity ? 'pr-28' : 'pr-4', busy && 'opacity-70')}
          />
          {pendingQuantity !== null && (
            <button
              type="button"
              onClick={() => onArmQuantity(null)}
              aria-label="Cancelar multiplicador"
              className={cn(
                'absolute inset-y-1.5 right-1.5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3',
                'text-primary-foreground shadow-sm transition-colors active:scale-[0.97]',
              )}
            >
              <span className="tabular text-xl font-bold leading-none">x {pendingQuantity}</span>
              <X className="size-4 opacity-80" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Uncontrolled on purpose: the debounce inside SearchInput is what
            keeps the catalogue query off the critical path of every keystroke. */}
        <SearchInput
          onSearch={setSearch}
          delay={250}
          placeholder={t('pos.searchProducts', 'Pesquisar produtos')}
          aria-label={t('pos.searchProducts', 'Pesquisar produtos')}
        />
      </div>

      <QuickGrid
        search={search}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        onPick={onPick}
      />
    </section>
  );
}

export default LookupPanel;
