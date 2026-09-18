import * as React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudOff, Languages, Monitor, Moon, Sun, Wifi, WifiOff } from 'lucide-react';
import {
  ROLE_LABELS,
  type EntityDto,
  type EntitySettings,
  type Locale,
  type Permission,
} from '@pos/shared';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatTime } from '@/lib/format';
import i18n, { setLocale } from '@/lib/i18n';
import { queuedCount, startAutoSync } from '@/lib/offline';
import { qk } from '@/lib/query';
import { useTheme, type Theme } from '@/lib/theme';
import { cn, colorForLabel, contrastText, initials } from '@/lib/utils';
import { useOnlineStatus, useSocketStatus } from '@/hooks/use-socket';

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  toast,
} from '@/components/ui';

import { isPathActive, posMoreItems, posTabs, type NavItem, type NavVisibility, type PosTab } from './nav-config';

/**
 * The register chrome: the frame around the tablet surfaces (checkout, floor
 * plan, table order, returns).
 *
 * Rules of this screen: it fills the viewport exactly and never scrolls as a
 * page - only the inner panes do, so the check panel and the tab bar stay put
 * while a cashier's thumb drags a long product list. Nothing here depends on
 * hover, and every target clears 44px.
 */

const TICK_MS = 30_000;
const QUEUE_POLL_MS = 15_000;

function useNavVisibility(): NavVisibility {
  const can = useAuth((s) => s.can);
  const user = useAuth((s) => s.user);
  const entity = useAuth((s) => s.entity);

  return React.useMemo<NavVisibility>(
    () => ({
      mode: entity?.mode ?? null,
      role: user?.role ?? null,
      can: (permission: Permission) => can(permission),
    }),
    [can, entity?.mode, user?.role],
  );
}

/** Live count of sales sitting in IndexedDB waiting for the line to come back. */
function useQueuedSales(): { count: number; refresh: () => void } {
  const [count, setCount] = React.useState(0);
  const alive = React.useRef(true);

  const refresh = React.useCallback(() => {
    void queuedCount()
      .then((value) => {
        if (alive.current) setCount(value);
      })
      .catch(() => {
        /* IndexedDB blocked (private mode) - the chip just stays at zero */
      });
  }, []);

  React.useEffect(() => {
    alive.current = true;
    refresh();
    const timer = window.setInterval(refresh, QUEUE_POLL_MS);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { count, refresh };
}

/* -------------------------------------------------------------------------- */
/* Top bar                                                                     */
/* -------------------------------------------------------------------------- */

function StatusChip({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'ok' | 'warn' | 'bad';
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        tone === 'ok' && 'border-success/30 bg-success/10 text-success',
        tone === 'warn' && 'border-warning/40 bg-warning/15 text-warning',
        tone === 'bad' && 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </span>
  );
}

function PosTopBar({ queued }: { queued: number }) {
  const entity = useAuth((s) => s.entity);
  const user = useAuth((s) => s.user);
  const online = useOnlineStatus();
  const { connected } = useSocketStatus();
  const { i18n: instance } = useTranslation();
  const english = instance.language === 'en';

  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const name = entity?.name ?? 'POS';
  const accent = entity?.accentColor || colorForLabel(name);
  const roleLabel = user ? (english ? ROLE_LABELS[user.role].en : ROLE_LABELS[user.role].pt) : '';

  return (
    <header className="safe-top flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
        style={{ backgroundColor: accent, color: contrastText(accent) }}
      >
        {initials(name) || 'P'}
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">{name}</p>
        {user && (
          <p className="truncate text-xs leading-tight text-muted-foreground">
            {user.name}
            <span className="hidden sm:inline"> - {roleLabel}</span>
          </p>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {!online ? (
          <StatusChip tone="bad" icon={WifiOff}>
            <span className="sr-only sm:not-sr-only">Sem ligacao</span>
          </StatusChip>
        ) : connected ? (
          <StatusChip tone="ok" icon={Wifi}>
            <span className="sr-only sm:not-sr-only">Ligado</span>
          </StatusChip>
        ) : (
          <StatusChip tone="warn" icon={WifiOff}>
            <span className="sr-only sm:not-sr-only">A ligar...</span>
          </StatusChip>
        )}

        {queued > 0 && (
          <StatusChip tone="warn" icon={CloudOff}>
            <span className="tabular">{queued}</span>
            <span className="sr-only sm:not-sr-only">por sincronizar</span>
          </StatusChip>
        )}

        <span className="tabular text-sm font-semibold text-foreground">{formatTime(now)}</span>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* "Mais" sheet                                                                */
/* -------------------------------------------------------------------------- */

function SegmentedChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ComponentType<{ className?: string }> }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex gap-2" role="group" aria-label={label}>
        {options.map((option) => {
          const Icon = option.icon;
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={cn(
                'flex min-h-touch flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              {Icon && <Icon className="size-4" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MoreSheet({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavItem[];
}) {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const [locale, setCurrentLocale] = React.useState<Locale>(() => (i18n.language === 'en' ? 'en' : 'pt-PT'));

  const changeLocale = (next: Locale) => {
    setLocale(next);
    setCurrentLocale(next);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" size="lg" className="safe-bottom">
        <SheetHeader>
          <SheetTitle>Mais</SheetTitle>
          <SheetDescription>Outros destinos e preferencias deste terminal.</SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {items.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      onClick={() => onOpenChange(false)}
                      className={cn(
                        'flex min-h-touch-lg flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-4',
                        'text-center text-sm font-semibold text-foreground transition-transform active:scale-[0.97]',
                        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                      )}
                    >
                      <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
                      <span className="leading-tight">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <SegmentedChoice<Theme>
            label="Tema"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Claro', icon: Sun },
              { value: 'dark', label: 'Escuro', icon: Moon },
              { value: 'system', label: 'Sistema', icon: Monitor },
            ]}
          />

          <SegmentedChoice<Locale>
            label="Idioma"
            value={locale}
            onChange={changeLocale}
            options={[
              { value: 'pt-PT', label: 'Portugues', icon: Languages },
              { value: 'en', label: 'English', icon: Languages },
            ]}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Bottom tab bar                                                              */
/* -------------------------------------------------------------------------- */

const TAB_CLASS = [
  'flex min-h-[3.5rem] flex-1 select-none flex-col items-center justify-center gap-1 px-1 py-2',
  'transition-transform duration-75 active:scale-[0.97]',
  'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
].join(' ');

function BottomTabBar({
  tabs,
  onLogout,
  onMore,
}: {
  tabs: PosTab[];
  onLogout: () => void;
  onMore: () => void;
}) {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Navegacao do terminal"
      className="safe-bottom flex shrink-0 items-stretch border-t border-border bg-card"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.to ? isPathActive(tab.to, pathname, tab.exact) : false;
        const label = (
          <span className="text-center text-[11px] font-semibold leading-tight">{tab.label}</span>
        );
        const tone = active ? 'text-primary' : 'text-muted-foreground';

        if (tab.to) {
          return (
            <Link
              key={tab.key}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className={cn(TAB_CLASS, tone)}
            >
              <Icon className="size-6" aria-hidden="true" />
              {label}
            </Link>
          );
        }

        return (
          <button
            key={tab.key}
            type="button"
            onClick={tab.action === 'logout' ? onLogout : onMore}
            className={cn(TAB_CLASS, tone)}
          >
            <Icon className="size-6" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

export interface PosShellProps {
  children: React.ReactNode;
}

export default function PosShell({ children }: PosShellProps) {
  const visibility = useNavVisibility();
  const can = useAuth((s) => s.can);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSurface = useTheme((s) => s.setSurface);
  const setTheme = useTheme((s) => s.setTheme);

  const [moreOpen, setMoreOpen] = React.useState(false);
  const { count: queued, refresh: refreshQueue } = useQueuedSales();

  const tabs = React.useMemo(() => posTabs(visibility), [visibility]);
  const moreItems = React.useMemo(() => posMoreItems(visibility), [visibility]);

  /*
   * The POS palette. If the tenant forces a terminal theme we put the previous
   * one back on the way out, so a dark register does not darken the back office
   * too - but a theme the operator picked here stays picked.
   */
  const previousTheme = React.useRef<Theme | null>(null);
  const forcedTheme = React.useRef(false);

  React.useEffect(() => {
    previousTheme.current = useTheme.getState().theme;
    setSurface('pos');
    return () => {
      setSurface('app');
      if (forcedTheme.current && previousTheme.current) setTheme(previousTheme.current);
      forcedTheme.current = false;
    };
  }, [setSurface, setTheme]);

  /* The terminal may be configured to run dark whatever the browser prefers. */
  const settings = useQuery({
    queryKey: qk.settings(),
    queryFn: () => api.get<{ entity: EntityDto; settings: EntitySettings }>('/api/settings'),
    enabled: can('settings:read'),
    staleTime: 5 * 60_000,
  });

  const posTheme = settings.data?.settings.posTheme;
  React.useEffect(() => {
    if (!posTheme) return;
    forcedTheme.current = true;
    setTheme(posTheme);
  }, [posTheme, setTheme]);

  /* Queued sales replay themselves the moment the line comes back. */
  React.useEffect(() => {
    const stop = startAutoSync((result) => {
      refreshQueue();
      if (result.synced.length > 0) {
        toast.success(
          result.synced.length === 1 ? '1 venda sincronizada' : `${result.synced.length} vendas sincronizadas`,
          'As vendas guardadas localmente foram enviadas para o servidor.',
        );
        void queryClient.invalidateQueries({ queryKey: ['sales'] });
        void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      }
      if (result.blocked > 0) {
        toast.error(
          result.blocked === 1 ? '1 venda rejeitada' : `${result.blocked} vendas rejeitadas`,
          'O servidor recusou estas vendas. Precisam de revisao manual.',
        );
      }
    });
    return stop;
  }, [queryClient, refreshQueue]);

  const signOut = React.useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <PosTopBar queued={queued} />

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

      <BottomTabBar tabs={tabs} onLogout={() => void signOut()} onMore={() => setMoreOpen(true)} />

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} items={moreItems} />
    </div>
  );
}
