import { Activity, Database, RefreshCw } from 'lucide-react';

import { Button, Skeleton } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

import { usePlatformHealth } from '../platform-queries';
import { formatUptime } from '../platform-types';

/**
 * Platform health, which is what this console should be reporting: is the
 * service up, is the database answering. Colour never carries the meaning on
 * its own - every dot has a word beside it.
 */

type Tone = 'ok' | 'bad' | 'unknown';

const DOT: Record<Tone, string> = {
  ok: 'bg-success',
  bad: 'bg-destructive',
  unknown: 'bg-muted-foreground',
};

function StatusLine({
  icon: Icon,
  label,
  value,
  tone,
  loading,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone: Tone;
  loading: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-4 w-24" />
        ) : (
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', DOT[tone])} />
            <span className="truncate">{value}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export function SystemHealthPanel() {
  const health = usePlatformHealth();

  const data = health.data;
  const failed = health.isError;
  const offline = health.error instanceof ApiRequestError && health.error.isOffline;

  const serviceTone: Tone = health.isLoading ? 'unknown' : failed || data?.status !== 'ok' ? 'bad' : 'ok';
  const databaseTone: Tone = health.isLoading ? 'unknown' : failed || data?.database !== 'up' ? 'bad' : 'ok';

  const serviceValue = failed
    ? offline
      ? 'Sem ligacao ao servidor'
      : 'Servico degradado'
    : data?.status === 'ok'
      ? 'Operacional'
      : (data?.status ?? 'Desconhecido');

  const databaseValue = failed
    ? 'Nao foi possivel confirmar'
    : data?.database === 'up'
      ? 'Acessivel'
      : 'Inacessivel';

  const uptime = failed ? null : formatUptime(data?.uptime);
  const checkedAt = health.dataUpdatedAt ? formatTime(new Date(health.dataUpdatedAt)) : null;

  return (
    <section className="panel flex flex-col gap-4 p-5" aria-label="Saude do sistema">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Saude do sistema</h2>
          <p className="text-sm text-muted-foreground">
            Estado do servico que serve todos os clientes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RefreshCw />}
          loading={health.isFetching}
          onClick={() => void health.refetch()}
        >
          Actualizar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatusLine
          icon={Activity}
          label="Servico"
          value={serviceValue}
          tone={serviceTone}
          loading={health.isLoading}
        />
        <StatusLine
          icon={Database}
          label="Base de dados"
          value={databaseValue}
          tone={databaseTone}
          loading={health.isLoading}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {uptime && <>Activo ha {uptime}. </>}
        {checkedAt ? `Verificado as ${checkedAt}.` : 'A verificar...'}
      </p>
    </section>
  );
}

export default SystemHealthPanel;
