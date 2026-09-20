import * as React from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

import { number as formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

export type StatTone = 'default' | 'primary' | 'success' | 'warning' | 'destructive';

const TONE_ICON: Record<StatTone, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-accent text-accent-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
};

const TONE_LINE: Record<StatTone, string> = {
  default: 'hsl(var(--muted-foreground))',
  primary: 'hsl(var(--primary))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  destructive: 'hsl(var(--destructive))',
};

export interface StatCardProps {
  label: string;
  /** Pre-formatted - money() or quantity() did the work already. */
  value: React.ReactNode;
  /** Percentage change against the previous period, e.g. -4.2. */
  delta?: number | null;
  /** Overrides the "+4,2%" text without losing the arrow. */
  deltaLabel?: string;
  /** What the delta compares against: "vs semana passada". */
  deltaHint?: string;
  /** For costs and waste, where a fall is the good news. */
  invertDelta?: boolean;
  icon?: LucideIcon;
  /** Raw series, oldest first. Axes are deliberately absent. */
  sparkline?: number[];
  tone?: StatTone;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * A KPI tile: one number does the talking, the arrow says which way it moved
 * (never colour alone), and the sparkline is a shape, not a chart - no axes,
 * no hover-only data, because there is no hover on the floor.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  deltaHint,
  invertDelta = false,
  icon: Icon,
  sparkline,
  tone = 'default',
  loading = false,
  onClick,
  className,
}: StatCardProps) {
  const gradientId = `spark-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const direction = !hasDelta || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const good = direction === 'flat' ? null : invertDelta ? direction === 'down' : direction === 'up';
  const DeltaIcon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight;

  // Only a string can be measured; a custom node is the caller's problem.
  const valueLength = typeof value === 'string' ? value.length : 0;

  const series = React.useMemo(
    () => (sparkline ?? []).map((point, index) => ({ index, value: point })),
    [sparkline],
  );

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground" title={typeof label === 'string' ? label : undefined}>
          {label}
        </p>
        {Icon && (
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONE_ICON[tone])}>
            <Icon className="size-5" aria-hidden="true" />
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-8 w-32" />
      ) : (
        /*
          Kwanza figures run long - "1 904 162,44 Kz" is fifteen characters
          before the label even starts. A fixed type size overflows the tile, so
          step the size down as the string grows rather than letting it spill.
          The title attribute keeps the full value reachable either way.
        */
        <p
          className={cn(
            'stat-value mt-2 min-w-0 truncate text-foreground',
            valueLength > 11 && 'text-xl',
            valueLength > 17 && 'text-lg',
            valueLength > 24 && 'text-base',
          )}
          title={typeof value === 'string' ? value : undefined}
        >
          {value}
        </p>
      )}

      {(hasDelta || deltaHint) && !loading && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {hasDelta && (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-semibold',
                good === null && 'text-muted-foreground',
                good === true && 'text-success',
                good === false && 'text-destructive',
              )}
            >
              <DeltaIcon className="size-3.5" aria-hidden="true" />
              <span className="tabular">{deltaLabel ?? `${formatNumber(Math.abs(delta ?? 0), 1)}%`}</span>
            </span>
          )}
          {deltaHint && <span className="text-muted-foreground">{deltaHint}</span>}
        </div>
      )}

      {series.length > 1 && !loading && (
        <div className="mt-3 h-11 w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TONE_LINE[tone]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={TONE_LINE[tone]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={TONE_LINE[tone]}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                dot={false}
                activeDot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );

  const shell = cn(
    'panel flex w-full flex-col p-5 text-left',
    onClick &&
      'transition-colors hover:bg-muted/40 active:scale-[0.99] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shell}>
        {body}
      </button>
    );
  }

  return <div className={shell}>{body}</div>;
}

export default StatCard;
