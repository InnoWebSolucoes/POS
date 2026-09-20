import { useTranslation } from 'react-i18next';
import { Maximize2, Minimize2, RefreshCw, WifiOff } from 'lucide-react';

import { Badge, Button, Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { elapsed, number } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  ageTier,
  stationLabel,
  type AgeThresholds,
  type KdsStationsResponse,
  type KdsSummary,
  type StationFilter,
} from './kds-types';

/**
 * The rail across the top: which station you are cooking for, how much work is
 * on the board, and how long the oldest ticket has been hanging.
 */

export interface KdsHeaderProps {
  station: StationFilter;
  onStationChange: (station: StationFilter) => void;
  stations: KdsStationsResponse | undefined;
  stationsLoading: boolean;
  summary: KdsSummary | undefined;
  /** Client clock when `summary` arrived, so its oldest-age can tick locally. */
  summaryBaseMs: number;
  nowMs: number;
  thresholds: AgeThresholds;
  connected: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

interface CounterProps {
  label: string;
  value: number;
  tone: 'default' | 'warning' | 'success';
}

const COUNTER_TONE: Record<CounterProps['tone'], string> = {
  default: 'text-foreground',
  warning: 'text-warning',
  success: 'text-success',
};

function Counter({ label, value, tone }: CounterProps) {
  return (
    <div className="flex min-w-[5.5rem] flex-col items-center rounded-xl border-2 border-border bg-card px-4 py-2">
      <span className={cn('tabular text-kds-lg leading-none', COUNTER_TONE[tone])}>
        {number(value)}
      </span>
      <span className="mt-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function KdsHeader({
  station,
  onStationChange,
  stations,
  stationsLoading,
  summary,
  summaryBaseMs,
  nowMs,
  thresholds,
  connected,
  isFullscreen,
  onToggleFullscreen,
  onRefresh,
  refreshing,
}: KdsHeaderProps) {
  const { t, i18n } = useTranslation();
  const english = i18n.language.startsWith('en');

  const drift = Math.max(0, Math.floor((nowMs - summaryBaseMs) / 1000));
  const oldest = summary?.oldestAgeSeconds != null ? summary.oldestAgeSeconds + drift : null;
  const oldestTier = oldest === null ? 'normal' : ageTier(oldest, thresholds);

  const buckets = stations?.data ?? [];
  const unassigned = stations?.unassigned;
  const totalActive = stations?.totals.ticketCount ?? summary?.activeTickets ?? 0;

  return (
    <header className="flex flex-col gap-3 border-b-4 border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-kds leading-none text-foreground">{t('kds.title', 'Ecra de Cozinha')}</h1>
          {!connected && (
            <Badge variant="destructive" size="lg" className="gap-2">
              <WifiOff className="size-5" aria-hidden="true" />
              {t('kds.offline', 'Sem ligacao')}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Counter label={t('kds.newTickets', 'Novos')} value={summary?.counts.new ?? 0} tone="default" />
          <Counter
            label={t('kds.inProgress', 'Em Preparacao')}
            value={summary?.counts.in_progress ?? 0}
            tone="warning"
          />
          <Counter label={t('kds.ready', 'Pronto')} value={summary?.counts.ready ?? 0} tone="success" />

          <div
            className={cn(
              'flex min-w-[8rem] flex-col items-center rounded-xl border-2 px-4 py-2',
              oldestTier === 'alert' && 'border-destructive bg-destructive/15',
              oldestTier === 'warning' && 'border-warning bg-warning/10',
              oldestTier === 'normal' && 'border-border bg-card',
            )}
          >
            <span
              className={cn(
                'tabular text-kds-lg leading-none',
                oldestTier === 'alert' && 'text-destructive',
                oldestTier === 'warning' && 'text-warning',
                oldestTier === 'normal' && 'text-foreground',
              )}
            >
              {oldest === null ? '-' : elapsed(oldest)}
            </span>
            <span className="mt-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('kds.oldestTicket', 'Pedido mais antigo')}
            </span>
          </div>

          <Button
            variant="outline"
            size="icon-lg"
            onClick={onRefresh}
            aria-label={t('common.retry', 'Tentar novamente')}
          >
            <RefreshCw className={cn(refreshing && 'animate-spin')} aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-lg"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Sair do ecra inteiro' : 'Ecra inteiro'}
          >
            {isFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </Button>
        </div>
      </div>

      {stationsLoading && buckets.length === 0 ? (
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {/*
           * min-w-0 is load-bearing: without it this wrapper keeps its
           * min-content width, the list inside never gets to scroll, and with
           * every station open the last tabs hang off a viewport the KDS root
           * clips with overflow-hidden.
           */}
          <Tabs
            value={station}
            onValueChange={(value) => onStationChange(value as StationFilter)}
            className="min-w-0 max-w-full"
          >
            <TabsList className="gap-2 p-1.5">
              <TabsTrigger value="all" className="min-h-touch-lg gap-3 px-5 text-xl">
                {t('kds.allStations', 'Todos os Postos')}
                <span className="tabular rounded-md bg-background/60 px-2 py-0.5 text-lg">
                  {number(totalActive)}
                </span>
              </TabsTrigger>

              {buckets.map((bucket) =>
                bucket.station ? (
                  <TabsTrigger
                    key={bucket.station}
                    value={bucket.station}
                    className="min-h-touch-lg gap-3 px-5 text-xl"
                  >
                    {stationLabel(bucket.station, english)}
                    <span className="tabular rounded-md bg-background/60 px-2 py-0.5 text-lg">
                      {number(bucket.ticketCount)}
                    </span>
                    {bucket.readyCount > 0 && (
                      <span className="tabular rounded-md bg-success/20 px-2 py-0.5 text-lg text-success">
                        {number(bucket.readyCount)}
                      </span>
                    )}
                  </TabsTrigger>
                ) : null,
              )}
            </TabsList>
          </Tabs>

          {unassigned && unassigned.ticketCount + unassigned.readyCount > 0 && (
            <Badge variant="warning" size="lg">
              {t('kds.unassigned', 'Sem posto')}: {number(unassigned.ticketCount + unassigned.readyCount)}
            </Badge>
          )}
        </div>
      )}
    </header>
  );
}

export default KdsHeader;
