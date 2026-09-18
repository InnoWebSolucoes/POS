import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Coins,
  Percent,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { SOCKET_EVENTS } from '@pos/shared';

import { PageHeader } from '@/components/layout/page-header';
import {
  Badge,
  Button,
  DateRangePicker,
  StatCard,
  rangeForPreset,
  type DateRange,
} from '@/components/ui';
import { useSocketEvent } from '@/hooks/use-socket';
import { useAuth } from '@/lib/auth-store';
import { formatDate, money, number as formatNumber, percent, quantity as formatQuantity } from '@/lib/format';
import { qk, queryClient } from '@/lib/query';

import { NoPermission, RetryButton, deltaPercent } from '@/features/reports/chart-kit';
import {
  defaultGranularity,
  useDashboardReport,
  type ReportFilterState,
  type ReportSummary,
} from '@/features/reports/report-api';

import { AttentionPanel } from './attention-panel';
import { CategoryBars, RevenueChart, TopProducts } from './dashboard-charts';
import { OnlinePanel, RestaurantPanel } from './mode-panels';

/**
 * The landing screen for an owner or a manager.
 *
 * One date range drives everything on the page, and every KPI carries its
 * change against the immediately preceding period of the same length - a
 * number with nothing to compare it to is decoration. Profit and margin are
 * behind `report:financial`; the API strips those fields for anyone else, so
 * the cards are simply not rendered rather than showing zeros.
 */
export default function DashboardPage() {
  const can = useAuth((state) => state.can);
  const entity = useAuth((state) => state.entity);
  const user = useAuth((state) => state.user);

  const canReport = can('report:read');
  const showFinancial = can('report:financial');

  const [range, setRange] = React.useState<DateRange>(() => rangeForPreset('mes'));
  const filters = React.useMemo<ReportFilterState>(() => ({ range }), [range]);
  const granularity = defaultGranularity(range);

  const today = React.useMemo(() => rangeForPreset('hoje'), []);

  const report = useDashboardReport(filters, canReport);

  // A completed sale moves every figure on this page. Refetching on each one
  // would hammer the API on a busy Saturday, so the invalidation is throttled
  // and React Query coalesces whatever is actually on screen.
  const lastRefresh = React.useRef(0);
  useSocketEvent(
    SOCKET_EVENTS.SALE_COMPLETED,
    () => {
      const now = Date.now();
      if (now - lastRefresh.current < 4000) return;
      lastRefresh.current = now;
      // qk.reports() always carries a params slot, so a prefix array would not
      // match. The predicate matches on the namespace qk itself defines.
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === qk.reports('')[0],
      });
    },
    canReport,
  );

  if (!canReport) {
    return (
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <PageHeader title="Painel" />
        <NoPermission description="Nao tem permissao para ver o painel de gestao. Use a caixa a partir do menu." />
      </div>
    );
  }

  const summary = report.data;
  const previous = report.data?.previous;

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6">
      <PageHeader
        title="Painel"
        description={
          user?.name
            ? `Bem-vindo, ${user.name}. Resumo de ${formatDate(range.from)} a ${formatDate(range.to)}.`
            : `Resumo de ${formatDate(range.from)} a ${formatDate(range.to)}.`
        }
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangePicker value={range} onChange={setRange} />
            <Button variant="outline" asChild leftIcon={<BarChart3 />}>
              <Link to="/relatorios">Relatorios</Link>
            </Button>
          </div>
        }
      />

      {report.error ? (
        <div className="panel flex flex-col items-start gap-3 p-6">
          <p className="text-sm font-medium text-foreground">Nao foi possivel carregar o resumo.</p>
          <p className="text-sm text-muted-foreground">
            Verifique a ligacao e tente novamente. Os restantes paineis continuam a funcionar.
          </p>
          <RetryButton onRetry={() => void report.refetch()} />
        </div>
      ) : (
        <KpiRow
          summary={summary}
          previous={previous}
          loading={report.isLoading}
          showFinancial={showFinancial}
        />
      )}

      {summary?.meta.truncated && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="warning" size="sm">
            Resultados parciais
          </Badge>
          {'O periodo excede o limite de '}
          <span className="tabular">{formatNumber(summary.meta.maxRows, 0)}</span>
          {' vendas por relatorio. Escolha um intervalo mais curto para valores exactos.'}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <RevenueChart filters={filters} granularity={granularity} />
        <CategoryBars filters={filters} />
      </div>

      <TopProducts filters={filters} />

      <AttentionPanel todayRange={today} />

      {entity?.mode === 'restaurant' && <RestaurantPanel />}
      {entity?.mode === 'online' && <OnlinePanel />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* KPIs                                                                        */
/* -------------------------------------------------------------------------- */

function KpiRow({
  summary,
  previous,
  loading,
  showFinancial,
}: {
  summary: ReportSummary | undefined;
  previous: ReportSummary | undefined;
  loading: boolean;
  showFinancial: boolean;
}) {
  const hint = 'vs. periodo anterior';

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <StatCard
        label="Receita"
        value={money(summary?.revenueMinor ?? 0)}
        delta={deltaPercent(summary?.revenueMinor ?? 0, previous?.revenueMinor)}
        deltaHint={hint}
        icon={Coins}
        tone="primary"
        loading={loading}
      />

      {showFinancial && (
        <StatCard
          label="Lucro Bruto"
          value={money(summary?.grossProfitMinor ?? 0)}
          delta={deltaPercent(summary?.grossProfitMinor ?? 0, previous?.grossProfitMinor)}
          deltaHint={hint}
          icon={TrendingUp}
          tone={(summary?.grossProfitMinor ?? 0) < 0 ? 'destructive' : 'success'}
          loading={loading}
        />
      )}

      {showFinancial && (
        <StatCard
          label="Margem Bruta"
          value={percent(summary?.grossMarginBps ?? 0)}
          delta={deltaPercent(summary?.grossMarginBps ?? 0, previous?.grossMarginBps)}
          deltaHint={hint}
          icon={Percent}
          loading={loading}
        />
      )}

      <StatCard
        label="Transaccoes"
        value={formatNumber(summary?.transactionCount ?? 0, 0)}
        delta={deltaPercent(summary?.transactionCount ?? 0, previous?.transactionCount)}
        deltaHint={hint}
        icon={Receipt}
        loading={loading}
      />

      <StatCard
        label="Ticket Medio"
        value={money(summary?.averageTicketMinor ?? 0)}
        delta={deltaPercent(summary?.averageTicketMinor ?? 0, previous?.averageTicketMinor)}
        deltaHint={hint}
        icon={Wallet}
        loading={loading}
      />

      <StatCard
        label="Artigos Vendidos"
        value={formatQuantity(summary?.itemsSold ?? 0)}
        delta={deltaPercent(summary?.itemsSold ?? 0, previous?.itemsSold)}
        deltaHint={hint}
        icon={ShoppingBag}
        loading={loading}
      />
    </div>
  );
}
