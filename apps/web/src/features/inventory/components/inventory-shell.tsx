import * as React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeftRight, ClipboardList, Layers, PackagePlus, ScrollText, SlidersHorizontal } from 'lucide-react';
import type { Permission } from '@pos/shared';

import { Badge, Button, EmptyState, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useCategories, useLocations } from '../api';

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

interface NavItem {
  to: string;
  /** Key in the i18n dictionary, with the pt-PT wording as the fallback. */
  labelKey: string;
  label: string;
  icon: typeof Layers;
  permission: Permission;
}

const NAV: NavItem[] = [
  { to: '/stock', labelKey: 'inventory.levels', label: 'Niveis', icon: Layers, permission: 'inventory:read' },
  {
    to: '/stock/entrada',
    labelKey: 'inventory.receiveStock',
    label: 'Entrada de Stock',
    icon: PackagePlus,
    permission: 'inventory:receive',
  },
  {
    to: '/stock/ajuste',
    labelKey: 'inventory.adjustStock',
    label: 'Ajuste de Stock',
    icon: SlidersHorizontal,
    permission: 'inventory:adjust',
  },
  {
    to: '/stock/inventario',
    labelKey: 'inventory.stockTake',
    label: 'Inventario Fisico',
    icon: ClipboardList,
    permission: 'inventory:stocktake',
  },
  {
    to: '/stock/transferencias',
    labelKey: 'inventory.transfers',
    label: 'Transferencias',
    icon: ArrowLeftRight,
    permission: 'inventory:transfer',
  },
  {
    to: '/stock/movimentos',
    labelKey: 'inventory.movements',
    label: 'Movimentos',
    icon: ScrollText,
    permission: 'inventory:read',
  },
];

export interface InventoryShellProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The back-office shell is a bare outlet, so each inventory screen carries its
 * own header and the sub-navigation between the six stock workflows.
 */
export function InventoryShell({ title, description, actions, children }: InventoryShellProps) {
  const { t } = useTranslation();
  const can = useAuth((s) => s.can);
  const items = NAV.filter((item) => can(item.permission));

  return (
    <div className="mx-auto flex w-full max-w-[120rem] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>

        <nav className="-mx-1 overflow-x-auto">
          <ul className="flex min-w-max items-center gap-1 px-1">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/stock'}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-touch items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  <item.icon className="size-4" aria-hidden="true" />
                  {t(item.labelKey, item.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Error state                                                                 */
/* -------------------------------------------------------------------------- */

export function ErrorState({
  error,
  onRetry,
  title = 'Nao foi possivel carregar',
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
}) {
  const offline = error instanceof ApiRequestError && error.isOffline;
  const message =
    error instanceof ApiRequestError
      ? error.message
      : 'Ocorreu um erro inesperado. Tente novamente dentro de momentos.';

  return (
    <EmptyState
      icon={AlertTriangle}
      title={offline ? 'Sem ligacao ao servidor' : title}
      description={message}
      action={{ label: 'Tentar novamente', onClick: onRetry }}
    />
  );
}

/** The message under a form field, or nothing. */
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="text-sm font-medium text-destructive">{message}</p>;
}

/* -------------------------------------------------------------------------- */
/* Small shared pieces                                                         */
/* -------------------------------------------------------------------------- */

export function StockStatusBadge({ quantity, minStockLevel }: { quantity: number; minStockLevel: number }) {
  if (quantity <= 0) {
    return (
      <Badge variant="destructive" dot>
        Esgotado
      </Badge>
    );
  }
  if (minStockLevel > 0 && quantity <= minStockLevel) {
    return (
      <Badge variant="warning" dot>
        Stock baixo
      </Badge>
    );
  }
  return (
    <Badge variant="success" dot>
      OK
    </Badge>
  );
}

export const ALL_VALUE = '__all__';

export function LocationSelect({
  value,
  onChange,
  allLabel = 'Todas as localizacoes',
  includeAll = true,
  disabled = false,
  exclude,
  className,
  placeholder = 'Localizacao',
  onOpenChange,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  allLabel?: string;
  includeAll?: boolean;
  disabled?: boolean;
  exclude?: string;
  className?: string;
  placeholder?: string;
  /** Lets a scan-driven screen stop stealing focus while the list is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const { data, isLoading } = useLocations();
  const options = (data ?? []).filter((location) => location.id !== exclude);

  return (
    <Select
      value={value ?? (includeAll ? ALL_VALUE : undefined)}
      onValueChange={(next) => onChange(next === ALL_VALUE ? undefined : next)}
      onOpenChange={onOpenChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={cn('min-w-[12rem]', className)} aria-label="Localizacao">
        <SelectValue placeholder={isLoading ? 'A carregar...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>}
        {options.map((location) => (
          <SelectItem key={location.id} value={location.id}>
            {location.name}
            {location.isDefault ? ' (principal)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CategorySelect({
  value,
  onChange,
  allLabel = 'Todas as categorias',
  className,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  allLabel?: string;
  className?: string;
}) {
  const { data, isLoading } = useCategories();

  return (
    <Select
      value={value ?? ALL_VALUE}
      onValueChange={(next) => onChange(next === ALL_VALUE ? undefined : next)}
      disabled={isLoading}
    >
      <SelectTrigger className={cn('min-w-[12rem]', className)} aria-label="Categoria">
        <SelectValue placeholder={isLoading ? 'A carregar...' : 'Categoria'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
        {(data ?? []).map((category) => (
          <SelectItem key={category.id} value={category.id}>
            {category.namePt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A filter row that wraps cleanly on a tablet held in portrait. */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3', className)}>
      {children}
    </div>
  );
}

export function ClearFiltersButton({ onClick, show }: { onClick: () => void; show: boolean }) {
  if (!show) return null;
  return (
    <Button variant="ghost" onClick={onClick}>
      Limpar filtros
    </Button>
  );
}

export default InventoryShell;
