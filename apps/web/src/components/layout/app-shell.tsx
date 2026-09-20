import * as React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  Check,
  ChevronsUpDown,
  Languages,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  WifiOff,
} from 'lucide-react';
import {
  ROLE_LABELS,
  type EntityDto,
  type Locale,
  type NotificationPayload,
  type Paginated,
  type Permission,
} from '@pos/shared';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { relativeTime } from '@/lib/format';
import i18n, { setLocale } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { useTheme, type Theme } from '@/lib/theme';
import { cn, colorForLabel, contrastText, initials } from '@/lib/utils';
import { useOnlineStatus } from '@/hooks/use-socket';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  SearchInput,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SimpleTooltip,
  Spinner,
  UserAvatar,
} from '@/components/ui';

import { SetupChecklist, TourButton } from '@/features/onboarding';

import {
  MODE_LABELS,
  isNavItemActive,
  titleForPath,
  visibleNavGroups,
  visibleNavItems,
  type NavItem,
  type NavVisibility,
} from './nav-config';
import { PageTitleProvider, usePageTitle } from './page-header';

/**
 * The back office.
 *
 * A collapsible sidebar, a top bar and the page. Everything an operator needs
 * to reach is one tap away on a tablet and one click away on a desktop, and a
 * link they have no permission for is never rendered at all.
 */

const SIDEBAR_KEY = 'pos.sidebarCollapsed';
const RAIL_WIDTH = 'w-[4.75rem]';
const PANEL_WIDTH = 'w-64';

type ShellNotification = NotificationPayload & { read: boolean };
interface NotificationsResponse {
  data: ShellNotification[];
  unreadCount: number;
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    /* private browsing - the rail simply forgets between sessions */
  }
}

/** One hook so every piece of chrome filters the same way. */
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

/* -------------------------------------------------------------------------- */
/* Sidebar                                                                     */
/* -------------------------------------------------------------------------- */

function Brand({ collapsed }: { collapsed: boolean }) {
  const entity = useAuth((s) => s.entity);
  const name = entity?.name ?? 'POS';
  const accent = entity?.accentColor || colorForLabel(name);

  return (
    <Link
      to="/dashboard"
      className={cn(
        'flex min-h-touch items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        collapsed && 'justify-center px-0',
      )}
      aria-label={name}
    >
      {entity?.logoUrl ? (
        <img
          src={entity.logoUrl}
          alt=""
          className="size-10 shrink-0 rounded-lg border border-border object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
          style={{ backgroundColor: accent, color: contrastText(accent) }}
        >
          {initials(name) || 'P'}
        </span>
      )}
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {entity ? MODE_LABELS[entity.mode] : 'A carregar...'}
          </span>
        </span>
      )}
    </Link>
  );
}

function SidebarLink({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        'flex min-h-touch items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        active
          ? 'bg-accent font-semibold text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  // The tooltip is an enhancement on the rail; aria-label already names the link.
  return collapsed ? (
    <SimpleTooltip label={item.label} side="right">
      {link}
    </SimpleTooltip>
  ) : (
    link
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const visibility = useNavVisibility();
  const { pathname } = useLocation();
  const groups = React.useMemo(() => visibleNavGroups(visibility), [visibility]);

  return (
    <nav aria-label="Navegacao principal" className={cn('flex flex-col gap-5 px-3 pb-4', collapsed && 'px-2')}>
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          {collapsed ? (
            <Separator className="my-1" />
          ) : (
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
          )}
          {group.items.map((item) => (
            <SidebarLink
              key={item.key}
              item={item}
              collapsed={collapsed}
              active={isNavItemActive(item, pathname)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({
  collapsed,
  onNavigate,
  headerClassName,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  /** Extra padding when the drawer's close button sits over the header. */
  headerClassName?: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className={cn('shrink-0 px-3 py-3', collapsed && 'px-2', headerClassName)}>
        <Brand collapsed={collapsed} />
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <div className="pt-4">
          <SidebarNav collapsed={collapsed} onNavigate={onNavigate} />
        </div>
      </ScrollArea>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Command palette                                                             */
/* -------------------------------------------------------------------------- */

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const visibility = useNavVisibility();
  const navigate = useNavigate();
  const [query, setQuery] = React.useState('');

  const items = React.useMemo(() => visibleNavItems(visibility), [visibility]);
  const results = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items.slice(0, 12);
    return items.filter((item) => item.label.toLowerCase().includes(needle)).slice(0, 12);
  }, [items, query]);

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="default" className="top-[12%] translate-y-0 gap-0 p-0">
        <DialogHeader>
          <DialogTitle>Procurar</DialogTitle>
          <DialogDescription>Salte para qualquer ecra a que tenha acesso.</DialogDescription>
        </DialogHeader>
        <div className="border-b border-border p-3">
          <SearchInput
            autoFocus
            placeholder="Procurar um ecra..."
            value={query}
            onValueChange={setQuery}
            delay={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results[0]) {
                event.preventDefault();
                go(results[0].to);
              }
            }}
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">Sem resultados</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {results.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => go(item.to)}
                      className={cn(
                        'flex w-full min-h-touch items-center gap-3 rounded-lg px-3 text-left text-sm font-medium',
                        'text-foreground transition-colors hover:bg-muted',
                        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      )}
                    >
                      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">{item.to}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Top bar pieces                                                              */
/* -------------------------------------------------------------------------- */

function OfflineIndicator() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <Badge variant="destructive" dot pulse className="gap-1.5">
      <WifiOff className="size-3.5" aria-hidden="true" />
      Sem ligacao
    </Badge>
  );
}

function NotificationsBell() {
  const can = useAuth((s) => s.can);
  const status = useAuth((s) => s.status);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { i18n: instance } = useTranslation();
  const english = instance.language === 'en';
  const [open, setOpen] = React.useState(false);

  const enabled = status === 'authenticated' && can('entity:read');

  const notifications = useQuery({
    queryKey: qk.notifications({ limit: 20 }),
    queryFn: () => api.get<NotificationsResponse>('/api/settings/notifications', { limit: 20 }),
    enabled,
    refetchInterval: 60_000,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post<{ updated: number }>('/api/settings/notifications/read-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post<ShellNotification>(`/api/settings/notifications/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  if (!enabled) return null;

  const unread = notifications.data?.unreadCount ?? 0;
  const rows = notifications.data?.data ?? [];

  const openNotification = (notification: ShellNotification) => {
    if (!notification.read) markRead.mutate(notification.id);
    if (notification.link) {
      setOpen(false);
      navigate(notification.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notificacoes, ${unread} por ler` : 'Notificacoes'}
        >
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="tabular absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] font-bold text-destructive-foreground"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Notificacoes</p>
          {unread > 0 && (
            <Button
              variant="link"
              size="sm"
              onClick={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
              className="text-xs"
            >
              Marcar todas como lidas
            </Button>
          )}
        </div>

        <div className="max-h-[22rem] overflow-y-auto">
          {notifications.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Spinner /> A carregar...
            </div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Sem notificacoes</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((notification) => {
                const title = english ? notification.titleEn : notification.titlePt;
                const body = english ? notification.bodyEn : notification.bodyPt;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className={cn(
                        'flex w-full min-h-touch flex-col items-start gap-1 px-4 py-3 text-left transition-colors',
                        'hover:bg-muted outline-none focus-visible:bg-muted',
                        !notification.read && 'bg-accent/40',
                      )}
                    >
                      <span className="flex w-full items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            notification.level === 'error' && 'bg-destructive',
                            notification.level === 'warning' && 'bg-warning',
                            notification.level === 'success' && 'bg-success',
                            notification.level === 'info' && 'bg-primary',
                            notification.read && 'opacity-30',
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                          {title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {relativeTime(notification.createdAt)}
                        </span>
                      </span>
                      {body && <span className="pl-4 text-sm text-muted-foreground">{body}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LanguageToggle() {
  const [locale, setCurrent] = React.useState<Locale>(() => (i18n.language === 'en' ? 'en' : 'pt-PT'));

  const change = (next: Locale) => {
    setLocale(next);
    setCurrent(next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Idioma">
          <Languages />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Idioma</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={(value) => change(value as Locale)}>
          <DropdownMenuRadioItem value="pt-PT">Portugues (PT)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">English (EN)</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const theme = useTheme((s) => s.theme);
  const resolved = useTheme((s) => s.resolved);
  const setTheme = useTheme((s) => s.setTheme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Tema">
          {resolved === 'dark' ? <Moon /> : <Sun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Claro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Escuro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> Sistema
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Super admins work inside other tenants; nobody else sees this control. */
function EntitySwitcher() {
  const user = useAuth((s) => s.user);
  const entity = useAuth((s) => s.entity);
  const switchEntity = useAuth((s) => s.switchEntity);
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  const entities = useQuery({
    queryKey: qk.entities({ pageSize: 100, active: true }),
    queryFn: () => api.get<Paginated<EntityDto>>('/api/entities', { pageSize: 100, active: true }),
    enabled: isSuperAdmin && open,
  });

  if (!isSuperAdmin) return null;

  const pick = async (id: string) => {
    setOpen(false);
    if (id === entity?.id) return;
    await switchEntity(id);
    // Every cache entry belongs to the old tenant now.
    queryClient.clear();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="default" className="hidden max-w-[14rem] md:inline-flex">
          <Building2 className="shrink-0" />
          <span className="truncate">{entity?.name ?? 'Entidade'}</span>
          <ChevronsUpDown className="ml-1 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Entidade activa</DropdownMenuLabel>
        {entities.isLoading && (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Spinner /> A carregar...
          </div>
        )}
        {entities.data?.data.map((row) => (
          <DropdownMenuItem key={row.id} onSelect={() => void pick(row.id)}>
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
            {row.id === entity?.id && <Check className="ml-auto text-primary" />}
          </DropdownMenuItem>
        ))}
        {entities.data && entities.data.data.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground">Sem entidades</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const { i18n: instance } = useTranslation();
  const english = instance.language === 'en';

  if (!user) return null;

  const roleLabel = english ? ROLE_LABELS[user.role].en : ROLE_LABELS[user.role].pt;

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex min-h-touch items-center gap-2 rounded-lg px-2 transition-colors hover:bg-muted',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
          )}
          aria-label={`Conta de ${user.name}`}
        >
          <UserAvatar name={user.name} src={user.avatarUrl} size="sm" />
          <span className="hidden min-w-0 text-left lg:block">
            <span className="block truncate text-sm font-semibold leading-tight text-foreground">{user.name}</span>
            <span className="block truncate text-xs leading-tight text-muted-foreground">{roleLabel}</span>
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <div className="flex items-center gap-3 px-3 py-3">
          <UserAvatar name={user.name} src={user.avatarUrl} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{roleLabel}</span>
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/definicoes">
            <Settings /> Definicoes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut /> Terminar Sessao
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

function TopBar({
  collapsed,
  onToggleCollapsed,
  onOpenMobileNav,
  onOpenSearch,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenMobileNav: () => void;
  onOpenSearch: () => void;
}) {
  const { pathname } = useLocation();
  const override = usePageTitle();
  const title = override ?? titleForPath(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card px-3 lg:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Abrir navegacao">
        <Menu />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expandir menu lateral' : 'Reduzir menu lateral'}
        aria-pressed={collapsed}
      >
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>

      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground lg:text-lg">{title}</h1>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <OfflineIndicator />

        <Button
          variant="outline"
          onClick={onOpenSearch}
          className="hidden w-56 justify-start gap-2 px-3 font-normal text-muted-foreground xl:inline-flex"
        >
          <Search className="shrink-0" />
          <span className="truncate">Procurar...</span>
          <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[0.625rem] font-semibold 2xl:inline-block">
            Ctrl K
          </kbd>
        </Button>
        <Button variant="ghost" size="icon" className="xl:hidden" onClick={onOpenSearch} aria-label="Procurar">
          <Search />
        </Button>

        <TourButton />

        <NotificationsBell />
        <LanguageToggle />
        <ThemeToggle />
        <EntitySwitcher />

        <Separator orientation="vertical" className="mx-1 hidden h-8 sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}

export default function AppShell() {
  const [collapsed, setCollapsed] = React.useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const { pathname } = useLocation();

  const toggleCollapsed = React.useCallback(() => setCollapsed((previous) => !previous), []);

  React.useEffect(() => {
    writeCollapsed(collapsed);
  }, [collapsed]);

  // Navigating on a phone closes the drawer behind you.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <PageTitleProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        <aside
          className={cn(
            'hidden shrink-0 border-r border-border transition-[width] duration-200 lg:block',
            collapsed ? RAIL_WIDTH : PANEL_WIDTH,
          )}
        >
          <SidebarBody collapsed={collapsed} />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" size="sm" className="p-0 lg:hidden">
            <SheetTitle className="sr-only">Navegacao</SheetTitle>
            <SheetDescription className="sr-only">Menu principal do back office</SheetDescription>
            <div className="h-full pt-2">
              <SidebarBody
                collapsed={false}
                onNavigate={() => setMobileOpen(false)}
                headerClassName="pr-14"
              />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            onOpenMobileNav={() => setMobileOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
          />

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[110rem] px-4 py-6 lg:px-8">
              <SetupChecklist className="mb-6" />
              <Outlet />
            </div>
          </main>
        </div>

        <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </PageTitleProvider>
  );
}
