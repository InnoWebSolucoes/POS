import * as React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';

import {
  Badge,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { amount, formatDate, money, percent, quantity } from '@/lib/format';

import type { CostTrendEntry } from '../types';

interface ChartPoint {
  label: string;
  reference: string;
  unitCostMinor: number;
  qty: number;
}

/**
 * One product at a time: a cost trend is a single series, so it needs no legend
 * and no second axis - the heading names what is being plotted.
 */
export function CostTrendChart({ entries }: { entries: CostTrendEntry[] }) {
  const usable = entries.filter((entry) => entry.points.length > 1);
  const [productId, setProductId] = React.useState<string>(() => usable[0]?.productId ?? '');

  const selected = usable.find((entry) => entry.productId === productId) ?? usable[0];

  if (!selected) {
    return (
      <EmptyState
        size="sm"
        title="Sem historico de custos"
        description="E preciso mais do que uma entrada de stock por produto para desenhar a tendencia."
      />
    );
  }

  const data: ChartPoint[] = selected.points.map((point) => ({
    label: formatDate(point.date),
    reference: point.reference,
    unitCostMinor: point.unitCostMinor,
    qty: point.quantity,
  }));

  const up = selected.changeBps > 0;
  const flat = selected.changeBps === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Custo unitario por entrada</p>
          <p className="tabular text-xs text-muted-foreground">
            {money(selected.firstUnitCostMinor)} para {money(selected.lastUnitCostMinor)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!flat && (
            <Badge variant={up ? 'destructive' : 'success'}>
              {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              <span className="tabular">{percent(Math.abs(selected.changeBps))}</span>
            </Badge>
          )}
          <Select value={selected.productId} onValueChange={setProductId}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {usable.map((entry) => (
                <SelectItem key={entry.productId} value={entry.productId}>
                  {entry.name || entry.sku}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            />
            <YAxis
              width={72}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => amount(value)}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
              content={<CostTooltip />}
            />
            <Line
              type="monotone"
              dataKey="unitCostMinor"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 0, fill: 'hsl(var(--primary))' }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CostTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">
        {point.label} - {point.reference}
      </p>
      <p className="tabular text-sm font-semibold text-foreground">{money(point.unitCostMinor)}</p>
      <p className="tabular text-xs text-muted-foreground">{quantity(point.qty)}</p>
    </div>
  );
}
