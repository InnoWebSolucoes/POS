import * as React from 'react';
import { AlertTriangle, BarChart3, Lock } from 'lucide-react';
import type { TooltipProps } from 'recharts';

import { Button, EmptyState, Skeleton } from '@/components/ui';
import { amount, minorToMajor, money, number as formatNumber, percent } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The shared chart vocabulary for the reporting screens.
 *
 * Two palettes, and only two:
 *
 *  - MEASURE tokens (`hsl(var(--primary))`, `--success`, `--destructive`...)
 *    for anything where the colour means a quantity or a verdict. These follow
 *    the theme automatically, light and dark.
 *  - SERIES, below, for the categorical case, where colour means *identity*
 *    (a category, a payment method). Those need fixed hues that do not move
 *    when the theme flips, so they come from the `tile` palette in
 *    tailwind.config.js - the documented exception to the no-hex rule.
 *
 * SERIES was validated for colour-vision deficiency and for contrast against
 * both the light (#FFFFFF) and dark (hsl(222 20% 13%)) card surfaces: every
 * adjacent pair clears deltaE 10 under deuteranopia and 16 under normal vision,
 * and every swatch sits inside the L 0.48-0.67 band both modes share. The order
 * is fixed and is never cycled - past the seventh slice everything folds into
 * "Outras". Identity is never colour alone: every categorical chart here ships
 * with direct labels and the same numbers in a table underneath.
 */
export const SERIES = [
  '#2F80ED', // tile.blue
  '#d46934', // tile.orange, darkened into the shared lightness band
  '#0E9F9F', // tile.teal
  '#7C4DFF', // tile.purple
  '#16A34A', // tile.green
  '#D6499B', // tile.magenta
  '#A8213C', // tile.maroon
] as const;

export const SERIES_OTHER = 'hsl(var(--muted-foreground))';

/** Colour for the nth slice of a categorical chart; never generates a new hue. */
export function seriesColor(index: number): string {
  return SERIES[index] ?? SERIES_OTHER;
}

/* Measure colours - these are semantic tokens, so dark mode is free. */
export const INK = {
  revenue: 'hsl(var(--primary))',
  profit: 'hsl(var(--success))',
  cost: 'hsl(var(--warning))',
  loss: 'hsl(var(--destructive))',
  axis: 'hsl(var(--muted-foreground))',
  grid: 'hsl(var(--border))',
  surface: 'hsl(var(--card))',
} as const;

/* -------------------------------------------------------------------------- */
/* Tick and tooltip formatting                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Axis ticks have about six characters to play with, so money is abbreviated.
 * minorToMajor() does the only centimos-to-kwanza conversion; the thousands
 * step after it is pure display scaling.
 */
export function moneyTick(minor: number): string {
  const major = minorToMajor(minor);
  const size = Math.abs(major);
  if (size >= 1_000_000) return `${formatNumber(major / 1_000_000, 1)}M`;
  if (size >= 10_000) return `${formatNumber(major / 1_000, 0)}k`;
  if (size >= 1_000) return `${formatNumber(major / 1_000, 1)}k`;
  return formatNumber(major, 0);
}

export function countTick(value: number): string {
  return formatNumber(value, 0);
}

/* -------------------------------------------------------------------------- */
/* Chart frame                                                                 */
/* -------------------------------------------------------------------------- */

export interface ChartFrameProps {
  title: string;
  /** What the reader should take away, or what the axes mean. */
  description?: string;
  /** Legend chips, a granularity switch, an export button. */
  actions?: React.ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Plot height; Recharts needs an explicit one. 'auto' for plain markup. */
  height?: number | 'auto';
  className?: string;
  children: React.ReactNode;
}

/**
 * Every chart on these screens sits in one of these. It owns the accessible
 * title (a real <figcaption>, not a floating <p>) and the three states a
 * screen that loads data has to answer for: loading, error, empty.
 */
export function ChartFrame({
  title,
  description,
  actions,
  loading = false,
  error,
  onRetry,
  empty = false,
  emptyTitle = 'Sem dados no periodo',
  emptyDescription = 'Escolha outro intervalo de datas ou limpe os filtros.',
  height = 300,
  className,
  children,
}: ChartFrameProps) {
  const titleId = React.useId();

  return (
    <figure
      className={cn('panel flex flex-col gap-4 p-5', className)}
      role="group"
      aria-labelledby={titleId}
    >
      <figcaption className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 id={titleId} className="text-base font-semibold text-foreground">
            {title}
          </h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </figcaption>

      <ReportState
        loading={loading}
        error={error}
        onRetry={onRetry}
        empty={empty}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        skeleton={<Skeleton style={{ height: height === 'auto' ? 260 : height }} className="w-full" />}
      >
        <div style={height === 'auto' ? undefined : { height }} className="w-full">
          {children}
        </div>
      </ReportState>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading / error / empty                                                     */
/* -------------------------------------------------------------------------- */

export interface ReportStateProps {
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  skeleton?: React.ReactNode;
  children: React.ReactNode;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Nao foi possivel carregar os dados.';
}

/** Loading, error-with-a-way-out, empty. A blank panel is a bug. */
export function ReportState({
  loading = false,
  error,
  onRetry,
  empty = false,
  emptyTitle = 'Sem resultados',
  emptyDescription,
  skeleton,
  children,
}: ReportStateProps) {
  if (loading) return <>{skeleton ?? <Skeleton className="h-40 w-full" />}</>;

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Erro ao carregar"
        description={errorMessage(error)}
        size="sm"
        action={onRetry ? { label: 'Tentar novamente', onClick: onRetry } : undefined}
      />
    );
  }

  if (empty) {
    return (
      <EmptyState
        icon={BarChart3}
        title={emptyTitle}
        description={emptyDescription}
        size="sm"
      />
    );
  }

  return <>{children}</>;
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                     */
/* -------------------------------------------------------------------------- */

export type TooltipKind = 'money' | 'count' | 'percent';

export interface SeriesTooltipOptions {
  /** How to format each value, keyed by the series dataKey. */
  kinds?: Record<string, TooltipKind>;
  /** Default when a dataKey is not listed. */
  fallback?: TooltipKind;
  labelFormatter?: (label: string) => string;
  /** An extra line under the values, e.g. "34% do total". */
  footer?: (row: Record<string, unknown>) => React.ReactNode;
}

function formatValue(value: number, kind: TooltipKind): string {
  if (kind === 'money') return money(value);
  if (kind === 'percent') return percent(value);
  return formatNumber(value, 0);
}

/**
 * Recharts' default tooltip renders raw minor units, which on this product
 * means "1250000" where the reader expects "12 500,00 Kz". Always pass this.
 */
export function seriesTooltip(options: SeriesTooltipOptions = {}) {
  const { kinds = {}, fallback = 'money', labelFormatter, footer } = options;

  return function SeriesTooltip(props: TooltipProps<number, string>): React.ReactElement | null {
    const { active, payload, label } = props;
    if (!active || !payload || payload.length === 0) return null;

    const rawLabel = typeof label === 'string' || typeof label === 'number' ? String(label) : '';
    const heading = labelFormatter ? labelFormatter(rawLabel) : rawLabel;
    const row = (payload[0]?.payload ?? {}) as Record<string, unknown>;

    return (
      <div className="min-w-[11rem] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md">
        {heading && <p className="mb-2 text-xs font-semibold uppercase tracking-wide">{heading}</p>}
        <ul className="space-y-1.5">
          {payload.map((entry, index) => {
            const key = String(entry.dataKey ?? index);
            const kind = kinds[key] ?? fallback;
            const value = typeof entry.value === 'number' ? entry.value : 0;
            return (
              <li key={key} className="flex items-center justify-between gap-4 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: entry.color ?? INK.axis }}
                  />
                  {entry.name ?? key}
                </span>
                <span className="tabular font-semibold text-foreground">
                  {formatValue(value, kind)}
                </span>
              </li>
            );
          })}
        </ul>
        {footer && <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">{footer(row)}</div>}
      </div>
    );
  };
}

/* -------------------------------------------------------------------------- */
/* Legend                                                                      */
/* -------------------------------------------------------------------------- */

export interface LegendItem {
  label: string;
  color: string;
  value?: string;
}

/**
 * A plain HTML legend rather than Recharts', so the swatches are real DOM the
 * screen reader can reach and the text wears text tokens, never the hue.
 */
export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  if (items.length < 2) return null;
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.label}</span>
          {item.value && <span className="tabular font-semibold text-foreground">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Small helpers screens share                                                 */
/* -------------------------------------------------------------------------- */

/** Percentage change between two periods, or null when the base was zero. */
export function deltaPercent(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** A share of the total (0..1) rendered as "34,2%". */
export function shareLabel(share: number): string {
  return `${formatNumber(share * 100, 1)}%`;
}

/** Money in a right-aligned column: bare digits, monospace. */
export function MoneyCell({
  minor,
  tone = 'default',
}: {
  minor: number | null | undefined;
  tone?: 'default' | 'muted' | 'signed';
}) {
  if (minor === null || minor === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <span
      className={cn(
        'tabular',
        tone === 'muted' && 'text-muted-foreground',
        tone === 'signed' && minor < 0 && 'text-destructive',
      )}
    >
      {amount(minor)}
    </span>
  );
}

/** Cost-gated cell: the API omits the field entirely for a cashier. */
export function RestrictedCell({ value }: { value: React.ReactNode }) {
  if (value === null || value === undefined) {
    return (
      <span className="text-muted-foreground" title="Sem permissao para ver custos">
        --
      </span>
    );
  }
  return <>{value}</>;
}

/**
 * What a screen shows when the API would refuse it anyway. Hiding the panel
 * outright leaves the reader wondering where the number went; saying so does
 * not - and the server is still the thing enforcing it.
 */
export function NoPermission({
  title = 'Sem permissao',
  description = 'Esta informacao exige a permissao de relatorios financeiros. Fale com o administrador da conta.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      icon={Lock}
      title={title}
      description={description}
      size="sm"
      className="rounded-xl border border-dashed border-border"
    />
  );
}

/** Retry affordance for a panel that is not a chart. */
export function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onRetry}>
      Tentar novamente
    </Button>
  );
}
