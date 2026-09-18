import * as React from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Armchair, Clock, PackageCheck, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SOCKET_EVENTS, type OnlineOrderStatus, type RestaurantTableDto } from '@pos/shared';

import { Button, StatCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { useSocketEvent } from '@/hooks/use-socket';
import { elapsed, money, number as formatNumber } from '@/lib/format';
import { qk, queryClient } from '@/lib/query';

import type { PageEnvelope } from '@/features/reports/report-api';

/**
 * The two mode-specific corners of the dashboard. A retail entity sees
 * neither; a restaurant sees its room, an online store sees its queue.
 */

/* -------------------------------------------------------------------------- */
/* Restaurant                                                                  */
/* -------------------------------------------------------------------------- */

const OCCUPIED_STATUSES = new Set(['occupied', 'attention']);

export function RestaurantPanel() {
  const can = useAuth((state) => state.can);
  const allowed = can('restaurant:table');

  const tables = useQuery({
    queryKey: qk.tables({ scope: 'dashboard' }),
    queryFn: () => api.get<{ data: RestaurantTableDto[] }>('/api/restaurant/tables'),
    enabled: allowed,
    refetchInterval: 60_000,
  });

  useSocketEvent(
    SOCKET_EVENTS.TABLE_UPDATED,
    () => {
      void queryClient.invalidateQueries({ queryKey: qk.tables({ scope: 'dashboard' }) });
    },
    allowed,
  );

  // "Turn time" here is how long the tables currently seated have been open:
  // the honest figure a manager can act on right now, not a historical mean.
  const stats = React.useMemo(() => {
    const rows = tables.data?.data ?? [];
    const open = rows.filter((table) => OCCUPIED_STATUSES.has(table.status));
    const now = Date.now();

    let totalSeconds = 0;
    let timed = 0;
    let openTotalMinor = 0;

    for (const table of open) {
      openTotalMinor += table.orderTotalMinor ?? 0;
      if (table.openedAt) {
        const opened = new Date(table.openedAt).getTime();
        if (Number.isFinite(opened)) {
          totalSeconds += Math.max(0, (now - opened) / 1000);
          timed += 1;
        }
      }
    }

    return {
      total: rows.length,
      open: open.length,
      averageSeconds: timed > 0 ? totalSeconds / timed : null,
      openTotalMinor,
    };
  }, [tables.data]);

  if (!allowed) return null;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="restaurant-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="restaurant-heading" className="text-lg font-semibold text-foreground">
          Sala
        </h2>
        <Button variant="outline" size="sm" asChild>
          <Link to="/restaurante/sala">Ver plano de sala</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Mesas abertas"
          value={`${formatNumber(stats.open, 0)} / ${formatNumber(stats.total, 0)}`}
          icon={Armchair}
          tone={stats.open > 0 ? 'primary' : 'default'}
          loading={tables.isLoading}
          deltaHint="mesas ocupadas agora"
        />
        <StatCard
          label="Tempo medio de mesa"
          value={stats.averageSeconds === null ? '-' : elapsed(stats.averageSeconds)}
          icon={Clock}
          loading={tables.isLoading}
          deltaHint="das mesas actualmente abertas"
        />
        <StatCard
          label="Em aberto na sala"
          value={money(stats.openTotalMinor)}
          loading={tables.isLoading}
          deltaHint="contas por fechar"
        />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Online store                                                                */
/* -------------------------------------------------------------------------- */

const AWAITING: OnlineOrderStatus[] = ['pending', 'processing'];

export function OnlinePanel() {
  const can = useAuth((state) => state.can);
  const allowed = can('online:order:read');

  const results = useQueries({
    queries: AWAITING.map((status) => ({
      queryKey: qk.onlineOrders({ scope: 'dashboard', status }),
      queryFn: () =>
        api.get<PageEnvelope<{ id: string }>>('/api/online/admin/orders', {
          status,
          pageSize: 1,
        }),
      enabled: allowed,
    })),
  });

  const refreshQueue = React.useCallback(() => {
    for (const status of AWAITING) {
      void queryClient.invalidateQueries({
        queryKey: qk.onlineOrders({ scope: 'dashboard', status }),
      });
    }
  }, []);

  useSocketEvent(SOCKET_EVENTS.ONLINE_ORDER_UPDATED, refreshQueue, allowed);
  useSocketEvent(SOCKET_EVENTS.ONLINE_ORDER_CREATED, refreshQueue, allowed);

  if (!allowed) return null;

  const loading = results.some((result) => result.isLoading);
  const pending = results[0]?.data?.total ?? 0;
  const processing = results[1]?.data?.total ?? 0;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="online-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="online-heading" className="text-lg font-semibold text-foreground">
          Loja online
        </h2>
        <Button variant="outline" size="sm" asChild>
          <Link to="/loja-online/encomendas">Ver encomendas</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Por processar"
          value={formatNumber(pending, 0)}
          icon={PackageCheck}
          tone={pending > 0 ? 'warning' : 'default'}
          loading={loading}
          deltaHint="encomendas novas"
        />
        <StatCard
          label="Em preparacao"
          value={formatNumber(processing, 0)}
          icon={Truck}
          loading={loading}
          deltaHint="ja aceites, por expedir"
        />
        <StatCard
          label="A aguardar expedicao"
          value={formatNumber(pending + processing, 0)}
          tone={pending + processing > 0 ? 'primary' : 'default'}
          loading={loading}
          deltaHint="total da fila"
        />
      </div>
    </section>
  );
}
