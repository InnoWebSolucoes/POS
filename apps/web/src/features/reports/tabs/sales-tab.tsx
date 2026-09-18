import * as React from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { formatDate, formatDateTime } from '@/lib/format';

import {
  ChartFrame,
  ChartLegend,
  INK,
  countTick,
  moneyTick,
  seriesTooltip,
} from '../chart-kit';
import { ExportButtons } from '../export-buttons';
import { HourlyHeatmap } from '../hourly-heatmap';
import {
  GRANULARITIES,
  GRANULARITY_LABELS,
  defaultGranularity,
  useSalesByDayOfWeek,
  useSalesHeatmap,
  useSalesSeries,
  type Granularity,
  type ReportFilterState,
} from '../report-api';

/** Turns "2026-09-18" / "2026-09-18T14:00" / "2026-09" into a readable tick. */
export function bucketLabel(bucket: string, granularity: Granularity): string {
  if (granularity === 'hour') return formatDateTime(bucket);
  if (granularity === 'month') {
    const [year, month] = bucket.split('-');
    return `${month ?? ''}/${year ?? ''}`;
  }
  return formatDate(bucket);
}

export function SalesTab({ filters }: { filters: ReportFilterState }) {
  const can = useAuth((state) => state.can);
  const showFinancial = can('report:financial');

  const [granularity, setGranularity] = React.useState<Granularity>(() =>
    defaultGranularity(filters.range),
  );

  // A new date range implies a new sensible bucket size.
  const rangeKey = `${filters.range.from}:${filters.range.to}`;
  const lastRange = React.useRef(rangeKey);
  React.useEffect(() => {
    if (lastRange.current !== rangeKey) {
      lastRange.current = rangeKey;
      setGranularity(defaultGranularity(filters.range));
    }
  }, [rangeKey, filters.range]);

  const series = useSalesSeries(filters, granularity);
  const dayOfWeek = useSalesByDayOfWeek(filters);
  const heatmap = useSalesHeatmap(filters);

  const points = React.useMemo(
    () =>
      (series.data?.data ?? []).map((point) => ({
        ...point,
        label: bucketLabel(point.bucket, granularity),
      })),
    [series.data, granularity],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ExportButtons report="sales" filters={filters} options={{ granularity }} />
      </div>

      <ChartFrame
        title="Receita ao longo do tempo"
        description={
          showFinancial
            ? 'Eixo vertical em Kwanza. A area e a receita liquida; a linha e o lucro bruto.'
            : 'Eixo vertical em Kwanza. Receita liquida de devolucoes e descontos.'
        }
        height={320}
        loading={series.isLoading}
        error={series.error}
        onRetry={() => void series.refetch()}
        empty={points.length === 0}
        actions={
          <div
            className="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1"
            role="group"
            aria-label="Granularidade"
          >
            {GRANULARITIES.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={granularity === option ? 'default' : 'ghost'}
                aria-pressed={granularity === option}
                onClick={() => setGranularity(option)}
              >
                {GRANULARITY_LABELS[option]}
              </Button>
            ))}
          </div>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 28, left: 8 }}>
            <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              stroke={INK.axis}
              tickLine={false}
              axisLine={{ stroke: INK.grid }}
              tick={{ fontSize: 12, fill: INK.axis }}
              minTickGap={24}
              label={{ value: 'Periodo', position: 'insideBottom', offset: -16, fill: INK.axis, fontSize: 12 }}
            />
            <YAxis
              stroke={INK.axis}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={moneyTick}
              tick={{ fontSize: 12, fill: INK.axis }}
            />
            <Tooltip
              cursor={{ stroke: INK.axis, strokeWidth: 1 }}
              content={seriesTooltip({
                fallback: 'money',
                footer: (row) => {
                  const count = typeof row.transactions === 'number' ? row.transactions : 0;
                  return `${countTick(count)} transaccoes`;
                },
              })}
            />
            <Area
              type="monotone"
              dataKey="revenueMinor"
              name="Receita"
              stroke={INK.revenue}
              strokeWidth={2}
              fill={INK.revenue}
              fillOpacity={0.14}
              isAnimationActive={false}
              dot={false}
            />
            {showFinancial && (
              <Line
                type="monotone"
                dataKey="profitMinor"
                name="Lucro bruto"
                stroke={INK.profit}
                strokeWidth={2}
                isAnimationActive={false}
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartLegend
        items={[
          { label: 'Receita', color: INK.revenue },
          ...(showFinancial ? [{ label: 'Lucro bruto', color: INK.profit }] : []),
        ]}
      />

      <ChartFrame
        title="Vendas por dia da semana"
        description="Receita acumulada em cada dia da semana dentro do periodo."
        height={280}
        loading={dayOfWeek.isLoading}
        error={dayOfWeek.error}
        onRetry={() => void dayOfWeek.refetch()}
        empty={(dayOfWeek.data?.data ?? []).every((row) => row.revenueMinor === 0)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={dayOfWeek.data?.data ?? []}
            margin={{ top: 8, right: 8, bottom: 28, left: 8 }}
          >
            <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              stroke={INK.axis}
              tickLine={false}
              axisLine={{ stroke: INK.grid }}
              tick={{ fontSize: 12, fill: INK.axis }}
              label={{ value: 'Dia da semana', position: 'insideBottom', offset: -16, fill: INK.axis, fontSize: 12 }}
            />
            <YAxis
              stroke={INK.axis}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={moneyTick}
              tick={{ fontSize: 12, fill: INK.axis }}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))' }}
              content={seriesTooltip({
                kinds: { revenueMinor: 'money' },
                footer: (row) => {
                  const count = typeof row.transactions === 'number' ? row.transactions : 0;
                  return `${countTick(count)} transaccoes`;
                },
              })}
            />
            <Bar
              dataKey="revenueMinor"
              name="Receita"
              fill={INK.revenue}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Mapa de calor horario"
        description="Onde o movimento esta, hora a hora. Use-o para montar as escalas: as celulas mais escuras sao as horas que precisam de mais gente ao balcao."
        height="auto"
        loading={heatmap.isLoading}
        error={heatmap.error}
        onRetry={() => void heatmap.refetch()}
        empty={(heatmap.data?.data ?? []).every((cell) => cell.revenueMinor === 0)}
      >
        <HourlyHeatmap cells={heatmap.data?.data ?? []} />
      </ChartFrame>
    </div>
  );
}

export default SalesTab;
