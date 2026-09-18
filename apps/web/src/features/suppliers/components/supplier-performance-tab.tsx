import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, ClipboardList, Wallet } from 'lucide-react';

import {
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatCard,
} from '@/components/ui';
import { money, number, percent, quantity } from '@/lib/format';
import { qk } from '@/lib/query';

import { getSupplierPerformance } from '../api';
import { CostTrendChart } from './cost-trend-chart';
import { QueryError } from './page-shell';
import { PO_STATUS_LABELS } from './po-status';

const MONTH_OPTIONS = [3, 6, 12, 24];

export function SupplierPerformanceTab({ supplierId }: { supplierId: string }) {
  const [months, setMonths] = React.useState(12);

  const query = useQuery({
    queryKey: qk.suppliers({ performance: supplierId, months }),
    queryFn: () => getSupplierPerformance(supplierId, months),
  });

  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;

  const data = query.data;
  const loading = query.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Desempenho dos ultimos meses</p>
        <Select value={String(months)} onValueChange={(value) => setMonths(Number(value))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option} meses
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Prazo medio de entrega"
          icon={CalendarClock}
          loading={loading}
          value={
            data?.leadTime.avgDays === null || data?.leadTime.avgDays === undefined
              ? 'Sem dados'
              : `${number(data.leadTime.avgDays, 1)} dias`
          }
          deltaHint={data ? `${data.leadTime.samples} entregas medidas` : undefined}
        />
        <StatCard
          label="Taxa de satisfacao"
          icon={CheckCircle2}
          loading={loading}
          tone={fillTone(data?.fillRate.fillRateBps)}
          value={percent(data?.fillRate.fillRateBps ?? 0)}
          deltaHint={
            data
              ? `${quantity(data.fillRate.receivedQuantity)} de ${quantity(data.fillRate.orderedQuantity)}`
              : undefined
          }
        />
        <StatCard
          label="Total gasto"
          icon={Wallet}
          loading={loading}
          value={money(data?.spend.totalSpendMinor ?? 0)}
          deltaHint={data ? `${data.spend.receiptCount} entradas de stock` : undefined}
        />
        <StatCard
          label="Encomendas"
          icon={ClipboardList}
          loading={loading}
          value={number(data?.purchaseOrders.total ?? 0)}
          deltaHint={data ? `${money(data.purchaseOrders.committedMinor)} comprometidos` : undefined}
        />
      </div>

      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Encomendas por estado</p>
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex flex-wrap gap-4">
            {Object.entries(data?.purchaseOrders.byStatus ?? {}).length === 0 && (
              <p className="text-sm text-muted-foreground">Sem encomendas no periodo.</p>
            )}
            {Object.entries(data?.purchaseOrders.byStatus ?? {}).map(([status, count]) => (
              <div key={status} className="min-w-24">
                <p className="tabular text-xl font-semibold text-foreground">{number(count ?? 0)}</p>
                <p className="text-xs text-muted-foreground">
                  {PO_STATUS_LABELS[status as keyof typeof PO_STATUS_LABELS] ?? status}
                </p>
              </div>
            ))}
            <div className="min-w-24">
              <p className="tabular text-xl font-semibold text-foreground">
                {percent(data?.leadTime.onTimeBps ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">Entregas dentro do prazo</p>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        {loading ? <Skeleton className="h-56 w-full" /> : <CostTrendChart entries={data?.costTrend ?? []} />}
      </Card>
    </div>
  );
}

function fillTone(bps: number | undefined): 'default' | 'success' | 'warning' | 'destructive' {
  if (bps === undefined) return 'default';
  if (bps >= 9500) return 'success';
  if (bps >= 8000) return 'warning';
  return 'destructive';
}
