import { RefreshCw, ShoppingBag, UserCheck, UserPlus, Users } from 'lucide-react';

import { useTranslation } from 'react-i18next';

import { Button, Progress, Skeleton, StatCard } from '@/components/ui';
import { formatDate, money, number as formatNumber } from '@/lib/format';
import { useAuth } from '@/lib/auth-store';

import {
  NEW_CUSTOMERS_SCAN,
  startOfMonth,
  useActiveCount,
  useNewThisMonth,
  useRetentionThisMonth,
  useTierConfig,
} from '../customer-queries';
import { TIER_LABELS, TierBadge } from './tier';

/** Head-count per tier, biggest tier first, with its share of the base. */
function TierDistribution() {
  const { t } = useTranslation();
  const tiers = useTierConfig();

  const rows = [...(tiers.data?.tiers ?? [])].sort((a, b) => b.thresholdMinor - a.thresholdMinor);
  const total = rows.reduce((sum, row) => sum + row.customerCount, 0);

  return (
    <div className="panel flex flex-col p-5">
      <p className="text-sm font-medium text-muted-foreground">Distribuicao por nivel</p>

      {tiers.isLoading && (
        <div className="mt-3 flex flex-col gap-3">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-5 w-full" />
          ))}
        </div>
      )}

      {tiers.isError && (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">Nao foi possivel carregar os niveis.</p>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<RefreshCw />}
            onClick={() => void tiers.refetch()}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}

      {!tiers.isLoading && !tiers.isError && (
        <ul className="mt-3 flex flex-col gap-2.5">
          {rows.map((row) => {
            const share = total > 0 ? (row.customerCount / total) * 100 : 0;
            return (
              <li key={row.tier} className="flex items-center gap-3">
                <span className="w-24 shrink-0">
                  <TierBadge tier={row.tier} />
                </span>
                <Progress value={share} size="sm" className="flex-1" aria-hidden="true" />
                <span className="tabular w-16 shrink-0 text-right text-sm font-semibold text-foreground">
                  {formatNumber(row.customerCount)}
                </span>
                <span className="tabular hidden w-14 shrink-0 text-right text-xs text-muted-foreground sm:inline">
                  {formatNumber(share, 0)}%
                </span>
                <span className="sr-only">{TIER_LABELS[row.tier]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The four tiles above the CRM list. */
export function CustomerStats() {
  const can = useAuth((s) => s.can);
  const canReport = can('report:read');

  const tiers = useTierConfig();
  const created = useNewThisMonth();
  const retention = useRetentionThisMonth(canReport);
  const activeCount = useActiveCount(!canReport);

  const totalCustomers = (tiers.data?.tiers ?? []).reduce(
    (sum, row) => sum + row.customerCount,
    0,
  );
  const since = formatDate(startOfMonth());

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Total de clientes"
        value={formatNumber(totalCustomers)}
        icon={Users}
        loading={tiers.isLoading}
        deltaHint={tiers.isError ? 'Sem dados' : undefined}
      />

      <StatCard
        label="Novos este mes"
        value={
          created.data
            ? `${created.data.capped ? '+' : ''}${formatNumber(created.data.count)}`
            : '-'
        }
        icon={UserPlus}
        tone="primary"
        loading={created.isLoading}
        deltaHint={
          created.data?.capped
            ? `Mais de ${NEW_CUSTOMERS_SCAN} registos desde ${since}`
            : `Registados desde ${since}`
        }
      />

      {canReport ? (
        <StatCard
          label="Valor medio por compra"
          value={money(retention.data?.totals.averageOrderValueMinor ?? 0)}
          icon={ShoppingBag}
          loading={retention.isLoading}
          deltaHint={
            retention.data
              ? `${formatNumber(retention.data.totals.orders)} vendas desde ${since}`
              : 'Sem dados'
          }
        />
      ) : (
        <StatCard
          label="Clientes activos"
          value={formatNumber(activeCount.data ?? 0)}
          icon={UserCheck}
          loading={activeCount.isLoading}
          deltaHint="Visiveis na pesquisa do registo"
        />
      )}

      <TierDistribution />
    </div>
  );
}

export default CustomerStats;
