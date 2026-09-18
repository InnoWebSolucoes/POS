import * as React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronLeft, ShoppingBag, Store } from 'lucide-react';

import { Badge, Button, SearchInput, Skeleton } from '@/components/ui';
import { setLocale } from '@/lib/i18n';
import { formatPhone } from '@/lib/format';
import { cn, contrastText, initials } from '@/lib/utils';

import type { LiveStockState } from '../live-stock';
import type { StorefrontEntityDto } from '../types';

/**
 * The shop chrome: a customer-facing header, a phone-first content column and
 * a footer with the ways to reach the shop. Deliberately unlike the back
 * office - no sidebar, no density, one column until there is room for two.
 */

interface ShopLayoutProps {
  slug: string;
  shop: StorefrontEntityDto | null;
  loading?: boolean;
  error?: unknown;
  errorMessage?: string;
  onRetry?: () => void;
  cartCount?: number;
  /** Controlled catalogue search; leave out to hide the field. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** Fired once the typing stops, which is when the catalogue refetches. */
  onSearchCommit?: (value: string) => void;
  searchPlaceholder?: string;
  backTo?: string;
  backLabel?: string;
  live?: LiveStockState;
  children: React.ReactNode;
}

function ShopMark({ shop }: { shop: StorefrontEntityDto }) {
  if (shop.logoUrl) {
    return (
      <img
        src={shop.logoUrl}
        alt=""
        className="size-10 shrink-0 rounded-xl object-cover"
        loading="eager"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
      style={{ backgroundColor: shop.accentColor, color: contrastText(shop.accentColor) }}
    >
      {initials(shop.name)}
    </span>
  );
}

/** A pulse when the till moves stock, so the two-way sync is visible. */
function LiveBadge({ live }: { live: LiveStockState }) {
  const [flash, setFlash] = React.useState(false);

  React.useEffect(() => {
    if (!live.updatedAt) return;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 4000);
    return () => clearTimeout(timer);
  }, [live.updatedAt]);

  if (!live.connected && !flash) return null;

  return (
    <Badge
      variant={flash ? 'success' : 'muted'}
      size="sm"
      className="hidden sm:inline-flex"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full bg-current',
          flash ? 'animate-ticket-pulse' : 'opacity-60',
        )}
      />
      {flash ? 'Stock actualizado' : 'Stock em direto'}
    </Badge>
  );
}

function LocaleToggle() {
  const { i18n } = useTranslation();
  const current = i18n.language === 'en' ? 'en' : 'pt-PT';

  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setLocale('pt-PT')}
        aria-pressed={current === 'pt-PT'}
        className={cn(
          'min-h-11 px-4 text-sm font-semibold transition-colors',
          current === 'pt-PT' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
        )}
      >
        PT
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        aria-pressed={current === 'en'}
        className={cn(
          'min-h-11 px-4 text-sm font-semibold transition-colors',
          current === 'en' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
        )}
      >
        EN
      </button>
    </div>
  );
}

export function ShopLayout({
  slug,
  shop,
  loading = false,
  error,
  errorMessage,
  onRetry,
  cartCount = 0,
  search,
  onSearchChange,
  onSearchCommit,
  searchPlaceholder = 'Pesquisar na loja...',
  backTo,
  backLabel = 'Voltar',
  live,
  children,
}: ShopLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          {loading || !shop ? (
            <>
              <Skeleton className="size-10 rounded-xl" />
              <Skeleton className="h-5 w-40" />
            </>
          ) : (
            <Link
              to={`/loja/${encodeURIComponent(slug)}`}
              className="flex min-w-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ShopMark shop={shop} />
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold leading-tight">{shop.name}</span>
                <span className="block text-xs text-muted-foreground">Loja online</span>
              </span>
            </Link>
          )}

          <div className="ml-auto flex items-center gap-2">
            {live && <LiveBadge live={live} />}
            <Button asChild variant="outline" size="icon-lg" className="relative">
              <Link to={`/loja/${encodeURIComponent(slug)}/carrinho`} aria-label={t('store.cart')}>
                <ShoppingBag />
                {cartCount > 0 && (
                  <span className="tabular absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </Link>
            </Button>
          </div>
        </div>

        {onSearchChange && (
          <div className="mx-auto w-full max-w-6xl px-4 pb-3">
            <SearchInput
              value={search}
              onValueChange={onSearchChange}
              onSearch={onSearchCommit}
              placeholder={searchPlaceholder}
              aria-label="Pesquisar produtos"
            />
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:py-7">
        {backTo && (
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
            <Link to={backTo}>
              <ChevronLeft />
              {backLabel}
            </Link>
          </Button>
        )}

        {error ? (
          <ShopError message={errorMessage} onRetry={onRetry} />
        ) : (
          children
        )}
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">{shop?.name ?? 'Loja'}</p>
            {shop?.address && <p>{shop.address}</p>}
            <p className="flex flex-wrap gap-x-4">
              {shop?.phone && <span className="tabular">{formatPhone(shop.phone)}</span>}
              {shop?.email && <span>{shop.email}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link to={`/loja/${encodeURIComponent(slug)}/encomenda/seguir`}>
                {t('store.myOrders')}
              </Link>
            </Button>
            <LocaleToggle />
          </div>
        </div>
      </footer>
    </div>
  );
}

export function ShopError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-7" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-lg font-semibold">Nao foi possivel carregar</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {message ?? 'Ocorreu um erro ao falar com a loja.'}
        </p>
      </div>
      {onRetry && (
        <Button onClick={onRetry} size="lg">
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function ShopClosed({ slug }: { slug: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Store className="size-7" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-lg font-semibold">Loja nao encontrada</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Nao existe nenhuma loja online em &quot;{slug}&quot;, ou ainda nao tem produtos publicados.
        </p>
      </div>
    </div>
  );
}

export default ShopLayout;
