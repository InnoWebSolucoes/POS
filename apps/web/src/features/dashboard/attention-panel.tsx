import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, PackageX, RotateCcw, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { money, number as formatNumber, quantity as formatQuantity } from '@/lib/format';
import { qk } from '@/lib/query';
import { cn } from '@/lib/utils';

import { RetryButton } from '@/features/reports/chart-kit';
import {
  useDashboardReport,
  type PageEnvelope,
  type ReportFilterState,
} from '@/features/reports/report-api';

/**
 * "Precisa de atencao" - the three things worth walking away from the desk
 * for. Each block states the problem, shows the worst few offenders, and links
 * straight through to the screen where it gets fixed. A block the user has no
 * permission for is simply not rendered; a block with nothing wrong says so.
 */

interface LowStockRow {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  minStockLevel: number;
  outOfStock: boolean;
}

interface DeadStockRow {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  daysSinceLastSale: number | null;
  stockValueMinor?: number;
}

export function AttentionPanel({ todayRange }: { todayRange: { from: string; to: string } }) {
  const can = useAuth((state) => state.can);
  const canInventory = can('inventory:read');

  const lowStock = useQuery({
    queryKey: qk.lowStock(),
    queryFn: () => api.get<PageEnvelope<LowStockRow>>('/api/inventory/low-stock', { pageSize: 5 }),
    enabled: canInventory,
  });

  const deadStock = useQuery({
    queryKey: qk.inventory({ scope: 'dead-stock-dashboard' }),
    queryFn: () =>
      api.get<PageEnvelope<DeadStockRow>>('/api/inventory/dead-stock', { pageSize: 5, days: 90 }),
    enabled: canInventory,
  });

  const todayFilters: ReportFilterState = React.useMemo(
    () => ({ range: todayRange }),
    [todayRange],
  );
  const today = useDashboardReport(todayFilters, can('report:read'));

  return (
    <section className="flex flex-col gap-4" aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="text-lg font-semibold text-foreground">
        Precisa de atencao
      </h2>

      <div className="grid gap-4 lg:grid-cols-3">
        {canInventory && (
          <AttentionCard
            icon={TriangleAlert}
            tone="warning"
            title="Stock baixo"
            to="/stock"
            linkLabel="Ver stock"
            count={lowStock.data?.total}
            loading={lowStock.isLoading}
            error={lowStock.error}
            onRetry={() => void lowStock.refetch()}
            emptyLabel="Nenhum artigo abaixo do minimo."
          >
            {(lowStock.data?.data ?? []).map((row) => (
              <AttentionRow
                key={row.productId}
                primary={row.name}
                secondary={row.sku}
                trailing={
                  row.outOfStock ? (
                    <Badge variant="destructive" size="sm">
                      Esgotado
                    </Badge>
                  ) : (
                    <span className="tabular text-sm text-warning">
                      {formatQuantity(row.quantity)}
                    </span>
                  )
                }
              />
            ))}
          </AttentionCard>
        )}

        {can('report:read') && (
          <AttentionCard
            icon={RotateCcw}
            tone="destructive"
            title="Devolucoes de hoje"
            to="/transaccoes"
            linkLabel="Ver transaccoes"
            loading={today.isLoading}
            error={today.error}
            onRetry={() => void today.refetch()}
            emptyLabel="Sem devolucoes hoje."
            empty={(today.data?.refundMinor ?? 0) === 0}
          >
            <div className="px-4 py-3">
              <p className="stat-value text-destructive">{money(today.data?.refundMinor ?? 0)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {'Em '}
                <span className="tabular">{formatNumber(today.data?.transactionCount ?? 0, 0)}</span>
                {' transaccoes hoje.'}
              </p>
            </div>
          </AttentionCard>
        )}

        {canInventory && (
          <AttentionCard
            icon={PackageX}
            tone="default"
            title="Stock morto"
            to="/stock"
            linkLabel="Ver stock"
            count={deadStock.data?.total}
            loading={deadStock.isLoading}
            error={deadStock.error}
            onRetry={() => void deadStock.refetch()}
            emptyLabel="Tudo o que esta em stock vendeu nos ultimos 90 dias."
          >
            {(deadStock.data?.data ?? []).map((row) => (
              <AttentionRow
                key={row.productId}
                primary={row.name}
                secondary={
                  row.daysSinceLastSale === null
                    ? 'Nunca vendeu'
                    : `${formatNumber(row.daysSinceLastSale, 0)} dias sem vender`
                }
                trailing={
                  row.stockValueMinor === undefined ? (
                    <span className="tabular text-sm text-muted-foreground">
                      {formatQuantity(row.quantity)}
                    </span>
                  ) : (
                    <span className="tabular text-sm text-muted-foreground">
                      {money(row.stockValueMinor)}
                    </span>
                  )
                }
              />
            ))}
          </AttentionCard>
        )}
      </div>
    </section>
  );
}

const TONE_ICON: Record<'default' | 'warning' | 'destructive', string> = {
  default: 'bg-muted text-muted-foreground',
  warning: 'bg-warning/20 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
};

interface AttentionCardProps {
  icon: LucideIcon;
  tone: 'default' | 'warning' | 'destructive';
  title: string;
  to: string;
  linkLabel: string;
  count?: number;
  loading?: boolean;
  error?: unknown;
  onRetry: () => void;
  emptyLabel: string;
  empty?: boolean;
  children: React.ReactNode;
}

function AttentionCard({
  icon: Icon,
  tone,
  title,
  to,
  linkLabel,
  count,
  loading = false,
  error,
  onRetry,
  emptyLabel,
  empty,
  children,
}: AttentionCardProps) {
  const isEmpty = empty ?? (count !== undefined && count === 0);
  const childArray = React.Children.toArray(children);

  return (
    <section className="panel flex flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONE_ICON[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h3 className="flex-1 text-sm font-semibold text-foreground">{title}</h3>
        {count !== undefined && count > 0 && (
          <Badge variant={tone === 'default' ? 'muted' : tone} size="sm">
            {formatNumber(count, 0)}
          </Badge>
        )}
      </header>

      <div className="flex-1">
        {loading && (
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        )}

        {!loading && Boolean(error) && (
          <div className="flex flex-col items-start gap-3 p-4">
            <p className="text-sm text-muted-foreground">Nao foi possivel carregar.</p>
            <RetryButton onRetry={onRetry} />
          </div>
        )}

        {!loading && !error && (isEmpty || childArray.length === 0) && (
          <p className="p-4 text-sm text-muted-foreground">{emptyLabel}</p>
        )}

        {!loading && !error && !isEmpty && childArray.length > 0 && (
          <ul className="divide-y divide-border">{childArray}</ul>
        )}
      </div>

      <Link
        to={to}
        className={cn(
          'flex min-h-[3rem] items-center justify-between gap-2 border-t border-border px-4 text-sm font-semibold text-primary',
          'transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
      >
        {linkLabel}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

function AttentionRow({
  primary,
  secondary,
  trailing,
}: {
  primary: string;
  secondary: string;
  trailing: React.ReactNode;
}) {
  return (
    <li className="flex min-h-[3rem] items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{primary}</p>
        <p className="truncate text-xs text-muted-foreground">{secondary}</p>
      </div>
      <div className="shrink-0">{trailing}</div>
    </li>
  );
}

export default AttentionPanel;
