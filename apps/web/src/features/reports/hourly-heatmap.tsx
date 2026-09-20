import * as React from 'react';

import { minorToMajor, money, number as formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import { WEEKDAYS_PT, WEEKDAYS_SHORT_PT, type HeatmapCell } from './report-api';

/**
 * The staffing tool: 7 days x 24 hours, coloured by revenue.
 *
 * Deliberate choices:
 *  - SIX DISCRETE BINS, not a continuous ramp. A reader cannot tell 62% opacity
 *    from 71%, but they can read a six-step legend with real Kwanza ranges.
 *  - One hue, light to dark, straight off `--primary`, so the ramp inverts
 *    correctly in dark mode without a second palette.
 *  - Colour is never the only channel: the busiest two bins print the figure
 *    inside the cell, every cell is a button with a full aria-label, and
 *    tapping one fills the readout above the grid. Nothing here needs hover.
 */

const BIN_COUNT = 6;

/** Opacity per bin over the card surface: light -> dark, monotonic. */
const BIN_ALPHA = [0, 0.14, 0.3, 0.48, 0.68, 0.9];

export interface HourlyHeatmapProps {
  cells: HeatmapCell[];
  /** Renders values as transaction counts instead of revenue. */
  metric?: 'revenue' | 'transactions';
}

interface Bins {
  edges: number[];
  max: number;
  binOf: (value: number) => number;
}

/**
 * Equal-width bins over the positive range. Zero always lands in bin 0, so an
 * hour the shop was shut never picks up colour from rounding.
 */
function makeBins(values: number[]): Bins {
  const max = values.reduce((best, value) => Math.max(best, value), 0);
  const step = max / (BIN_COUNT - 1);
  const edges = Array.from({ length: BIN_COUNT - 1 }, (_, index) => step * (index + 1));

  return {
    edges,
    max,
    binOf(value) {
      if (value <= 0 || max <= 0) return 0;
      const index = edges.findIndex((edge) => value <= edge);
      return index === -1 ? BIN_COUNT - 1 : index + 1;
    },
  };
}

export function HourlyHeatmap({ cells, metric = 'revenue' }: HourlyHeatmapProps) {
  const [selected, setSelected] = React.useState<HeatmapCell | null>(null);

  const grid = React.useMemo(() => {
    const rows: HeatmapCell[][] = Array.from({ length: 7 }, (_, day) =>
      Array.from({ length: 24 }, (_, hour) => ({
        dayOfWeek: day,
        hour,
        revenueMinor: 0,
        transactions: 0,
      })),
    );
    for (const cell of cells) {
      const row = rows[cell.dayOfWeek];
      if (row && row[cell.hour]) row[cell.hour] = cell;
    }
    return rows;
  }, [cells]);

  const valueOf = React.useCallback(
    (cell: HeatmapCell) => (metric === 'revenue' ? cell.revenueMinor : cell.transactions),
    [metric],
  );

  const format = React.useCallback(
    (value: number) => (metric === 'revenue' ? money(value) : formatNumber(value, 0)),
    [metric],
  );

  const bins = React.useMemo(
    () => makeBins(grid.flat().map((cell) => valueOf(cell))),
    [grid, valueOf],
  );

  const busiest = React.useMemo(() => {
    let best: HeatmapCell | null = null;
    for (const cell of grid.flat()) {
      if (!best || valueOf(cell) > valueOf(best)) best = cell;
    }
    return best && valueOf(best) > 0 ? best : null;
  }, [grid, valueOf]);

  const readout = selected ?? busiest;

  return (
    <div className="flex flex-col gap-4">
      <div
        className="min-h-[3rem] rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm"
        aria-live="polite"
      >
        {readout ? (
          <span>
            <span className="font-semibold text-foreground">
              {WEEKDAYS_PT[readout.dayOfWeek]}, {String(readout.hour).padStart(2, '0')}h
            </span>
            <span className="text-muted-foreground"> &mdash; </span>
            <span className="tabular font-semibold text-foreground">
              {money(readout.revenueMinor)}
            </span>
            <span className="text-muted-foreground">
              {' em '}
              <span className="tabular">{formatNumber(readout.transactions, 0)}</span>
              {readout.transactions === 1 ? ' transaccao' : ' transaccoes'}
              {selected ? '' : ' (hora de maior movimento)'}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Toque numa celula para ver o detalhe.</span>
        )}
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <table className="w-full border-separate border-spacing-[2px]">
          <caption className="sr-only">
            Receita por dia da semana e hora do dia. Cada celula e um botao com o valor.
          </caption>
          <thead>
            <tr>
              {/*
                This cell must stay IN the table. `sr-only` sets
                position:absolute, which forces display:block on a table-cell
                and drops it out of the column model - the header row would
                then have 24 cells against the body's 25 and every hour label
                would sit one column left of the cells it names. Hide the text,
                keep the cell.
              */}
              <th scope="col" className="w-8 pb-1">
                <span className="sr-only">Dia</span>
              </th>
              {Array.from({ length: 24 }, (_, hour) => (
                <th
                  key={hour}
                  scope="col"
                  className="min-w-[2.75rem] pb-1 text-center text-[0.6875rem] font-medium tabular text-muted-foreground"
                >
                  {String(hour).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, day) => (
              <tr key={day}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card pr-2 text-right text-xs font-semibold text-muted-foreground"
                >
                  {WEEKDAYS_SHORT_PT[day]}
                </th>
                {row.map((cell) => {
                  const value = valueOf(cell);
                  const bin = bins.binOf(value);
                  const dark = bin >= 4;
                  const isSelected =
                    selected?.dayOfWeek === cell.dayOfWeek && selected?.hour === cell.hour;

                  return (
                    <td key={cell.hour} className="p-0">
                      <button
                        type="button"
                        onClick={() => setSelected(isSelected ? null : cell)}
                        aria-pressed={isSelected}
                        aria-label={`${WEEKDAYS_PT[day]} ${String(cell.hour).padStart(2, '0')} horas: ${format(value)}`}
                        className={cn(
                          'flex h-11 w-full min-w-[2.75rem] items-center justify-center rounded-md border text-[0.6875rem] font-semibold tabular',
                          'outline-none transition-[box-shadow,transform] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]',
                          bin === 0 ? 'border-border' : 'border-transparent',
                          dark ? 'text-primary-foreground' : 'text-foreground',
                          isSelected && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
                        )}
                        style={{
                          backgroundColor:
                            bin === 0 ? 'hsl(var(--muted))' : `hsl(var(--primary) / ${BIN_ALPHA[bin]})`,
                        }}
                      >
                        {bin >= 4 ? shortValue(value, metric) : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <HeatmapLegend bins={bins} format={format} />
    </div>
  );
}

/** "12k" fits in a 44px cell; the full figure lives in the readout and label. */
function shortValue(value: number, metric: 'revenue' | 'transactions'): string {
  if (value <= 0) return '';
  if (metric === 'transactions') return formatNumber(value, 0);
  const major = minorToMajor(value);
  if (major >= 1_000_000) return `${formatNumber(major / 1_000_000, 1)}M`;
  if (major >= 1_000) return `${formatNumber(major / 1_000, 0)}k`;
  return formatNumber(major, 0);
}

function HeatmapLegend({ bins, format }: { bins: Bins; format: (value: number) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="font-medium">Menos</span>
      <ul className="flex items-center gap-1">
        {BIN_ALPHA.map((alpha, index) => {
          // binOf() puts a value in bin n when edges[n-2] < value <= edges[n-1],
          // so the swatch for bin n is bounded by edges[n-2] and edges[n-1] -
          // reading edges[n-1]/edges[n] labelled every swatch with the NEXT
          // bin's range and made the darkest one claim the maximum twice.
          const lower = index <= 1 ? 0 : (bins.edges[index - 2] ?? 0);
          const upper = index === 0 ? 0 : (bins.edges[index - 1] ?? bins.max);
          // There is no hover on a tablet, so the range is an aria-label too,
          // not only a title the finger can never reach.
          const range =
            index === 0
              ? 'Sem vendas'
              : `${format(Math.round(lower))} a ${format(Math.round(upper))}`;
          return (
            <li
              key={index}
              className={cn('size-5 rounded-sm', index === 0 && 'border border-border')}
              style={{
                backgroundColor: index === 0 ? 'hsl(var(--muted))' : `hsl(var(--primary) / ${alpha})`,
              }}
              aria-label={range}
              title={range}
            />
          );
        })}
      </ul>
      <span className="font-medium">Mais</span>
      <span className="tabular">
        {'Maximo: '}
        {format(bins.max)}
      </span>
    </div>
  );
}

export default HourlyHeatmap;
