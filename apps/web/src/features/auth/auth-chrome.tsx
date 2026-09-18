import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ShoppingBag, WifiOff } from 'lucide-react';
import type { Locale } from '@pos/shared';

import { Button } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { setLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * The bits both entry screens share: the brand-tinted backdrop, the logo block,
 * the PT/EN switch and one honest way to render an authentication failure.
 */

export function AuthBackdrop({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Decoration only - the brand accent lands here through --primary. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-background" />
        <div className="absolute -left-32 -top-32 size-[30rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 size-[34rem] rounded-full bg-primary/10 blur-3xl" />
      </div>
      <div className={cn('relative flex min-h-screen flex-col', className)}>{children}</div>
    </div>
  );
}

export function BrandMark({
  subtitle,
  align = 'center',
}: {
  subtitle?: string;
  align?: 'center' | 'start';
}) {
  return (
    <div
      className={cn(
        'flex gap-3',
        align === 'center' ? 'flex-col items-center text-center' : 'flex-row items-center text-left',
      )}
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
        <ShoppingBag className="size-7" aria-hidden="true" />
      </span>
      <div>
        <p className="text-2xl font-extrabold leading-none tracking-tight text-foreground">POS</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {subtitle ?? 'Sistema de Ponto de Venda'}
        </p>
      </div>
    </div>
  );
}

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'pt-PT', label: 'PT' },
  { value: 'en', label: 'EN' },
];

/** Two 44px keys, not a dropdown: the toggle has to work with a thumb. */
export function LocaleToggle({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const current: Locale = i18n.language === 'en' ? 'en' : 'pt-PT';

  return (
    <div
      role="group"
      aria-label="Idioma / Language"
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-border bg-card/80 p-1 shadow-sm backdrop-blur',
        className,
      )}
    >
      {LOCALES.map((locale) => {
        const active = locale.value === current;
        return (
          <button
            key={locale.value}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(locale.value)}
            className={cn(
              'h-11 min-w-11 rounded-lg px-4 text-sm font-bold transition-colors',
              'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {locale.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Turns whatever the mutation threw into something a cashier can act on.
 * A 401 from /login is deliberately vague server-side, so we say it plainly.
 */
export function authErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    if (error.isOffline) return 'Sem ligacao ao servidor. Verifique a rede e tente novamente.';
    if (error.status === 429) {
      return 'Demasiadas tentativas. Aguarde um momento antes de tentar de novo.';
    }
    if (error.status === 401) return fallback;
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.isOffline;
}

export interface ErrorNoticeProps {
  message: string;
  offline?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorNotice({ message, offline, onRetry, retryLabel, className }: ErrorNoticeProps) {
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="font-medium leading-snug">{message}</p>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="self-start">
          {retryLabel ?? 'Tentar novamente'}
        </Button>
      )}
    </div>
  );
}
