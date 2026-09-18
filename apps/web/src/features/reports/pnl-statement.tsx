import * as React from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';

import { amount, money, number as formatNumber, percent } from '@/lib/format';
import { cn } from '@/lib/utils';

import { deltaPercent } from './chart-kit';
import type { ReportSummary } from './report-api';

/**
 * The P&L reads as a statement, not a dashboard: one column of figures with a
 * rule under the subtotals, because that is the shape an owner already knows
 * how to read. Every row carries three things - the figure, what share of
 * revenue it is, and how it moved against the previous period of equal length.
 */

export type RowKind = 'line' | 'deduction' | 'subtotal' | 'ratio';

export interface StatementRow {
  key: string;
  label: string;
  hint?: string;
  /** Minor units, or basis points when kind is 'ratio'. */
  value: number;
  previous?: number;
  kind: RowKind;
  /** Share of revenue, 0..1. Omitted on the revenue row itself. */
  share?: number;
  /** A fall is the good news for costs and losses. */
  invertDelta?: boolean;
}

export function StatementTable({
  rows,
  caption,
}: {
  rows: StatementRow[];
  caption: string;
}) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rubrica
          </th>
          <th scope="col" className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Valor
          </th>
          <th scope="col" className="hidden py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">
            % da receita
          </th>
          <th scope="col" className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            vs. anterior
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <StatementLine key={row.key} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function StatementLine({ row }: { row: StatementRow }) {
  const subtotal = row.kind === 'subtotal';
  const ratio = row.kind === 'ratio';
  const deduction = row.kind === 'deduction';

  const figure = ratio ? percent(row.value) : amount(row.value);
  const delta = deltaPercent(row.value, row.previous);

  return (
    <tr
      className={cn(
        'border-b border-border last:border-0',
        subtotal && 'bg-muted/40 font-semibold',
      )}
    >
      <th
        scope="row"
        className={cn(
          'min-h-[3rem] py-3 pr-3 text-left align-middle font-normal',
          subtotal && 'font-semibold text-foreground',
          !subtotal && 'text-foreground',
          deduction && 'pl-4 text-muted-foreground',
        )}
      >
        <span className="block">{deduction ? `menos ${row.label}` : row.label}</span>
        {row.hint && <span className="block text-xs text-muted-foreground">{row.hint}</span>}
      </th>

      <td className="py-3 text-right align-middle">
        <span
          className={cn(
            'tabular',
            subtotal && 'text-base font-semibold',
            deduction && 'text-muted-foreground',
            !ratio && row.value < 0 && 'text-destructive',
          )}
        >
          {deduction && row.value !== 0 ? `(${figure})` : figure}
        </span>
      </td>

      <td className="hidden py-3 text-right align-middle sm:table-cell">
        {row.share === undefined ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span className="tabular text-muted-foreground">
            {formatNumber(row.share * 100, 1)}%
          </span>
        )}
      </td>

      <td className="py-3 text-right align-middle">
        <DeltaBadge delta={delta} invert={row.invertDelta} />
      </td>
    </tr>
  );
}

/** Arrow plus sign, never colour alone - the direction is in the glyph. */
export function DeltaBadge({ delta, invert = false }: { delta: number | null; invert?: boolean }) {
  if (delta === null || !Number.isFinite(delta)) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const direction = delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const good = direction === 'flat' ? null : invert ? direction === 'down' : direction === 'up';
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold',
        good === null && 'text-muted-foreground',
        good === true && 'text-success',
        good === false && 'text-destructive',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="tabular">{formatNumber(Math.abs(delta), 1)}%</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Row builders                                                                */
/* -------------------------------------------------------------------------- */

const shareOf = (value: number, revenue: number): number | undefined =>
  revenue === 0 ? undefined : value / revenue;

/** Receita -> COGS -> Lucro Bruto -> Margem Bruta. */
export function buildResultRows(
  summary: ReportSummary,
  previous: ReportSummary | undefined,
): StatementRow[] {
  const revenue = summary.revenueMinor;

  return [
    {
      key: 'revenue',
      label: 'Receita',
      hint: 'Vendas liquidas de devolucoes e descontos',
      value: revenue,
      previous: previous?.revenueMinor,
      kind: 'line',
      share: revenue === 0 ? undefined : 1,
    },
    {
      key: 'cogs',
      label: 'Custo das Vendas (COGS)',
      hint: 'Custo de aquisicao dos artigos vendidos',
      value: summary.cogsMinor ?? 0,
      previous: previous?.cogsMinor,
      kind: 'deduction',
      share: shareOf(summary.cogsMinor ?? 0, revenue),
      invertDelta: true,
    },
    {
      key: 'gross-profit',
      label: 'Lucro Bruto',
      value: summary.grossProfitMinor ?? 0,
      previous: previous?.grossProfitMinor,
      kind: 'subtotal',
      share: shareOf(summary.grossProfitMinor ?? 0, revenue),
    },
    {
      key: 'gross-margin',
      label: 'Margem Bruta',
      hint: 'Lucro bruto sobre a receita',
      value: summary.grossMarginBps ?? 0,
      previous: previous?.grossMarginBps,
      kind: 'ratio',
    },
  ];
}

/** Descontos, devolucoes, quebras - the three ways money leaves quietly. */
export function buildLossRows(
  summary: ReportSummary,
  losses: { discountsMinor: number; refundsMinor: number; wasteMinor: number },
  previous: ReportSummary | undefined,
): StatementRow[] {
  const revenue = summary.revenueMinor;
  const total = losses.discountsMinor + losses.refundsMinor + losses.wasteMinor;

  return [
    {
      key: 'discounts',
      label: 'Descontos concedidos',
      hint: 'Descontos de linha e de venda aplicados na caixa',
      value: losses.discountsMinor,
      previous: previous?.discountMinor,
      kind: 'line',
      share: shareOf(losses.discountsMinor, revenue),
      invertDelta: true,
    },
    {
      key: 'refunds',
      label: 'Devolucoes',
      hint: 'Valor reembolsado aos clientes',
      value: losses.refundsMinor,
      previous: previous?.refundMinor,
      kind: 'line',
      share: shareOf(losses.refundsMinor, revenue),
      invertDelta: true,
    },
    {
      key: 'waste',
      label: 'Quebras e desperdicio',
      hint: 'Danos, roubo e validade expirada, a preco de custo',
      value: losses.wasteMinor,
      kind: 'line',
      share: shareOf(losses.wasteMinor, revenue),
      invertDelta: true,
    },
    {
      key: 'losses-total',
      label: 'Total de perdas',
      value: total,
      kind: 'subtotal',
      share: shareOf(total, revenue),
      invertDelta: true,
    },
  ];
}

/** Small read-only figure used above the statement. */
export function KeyFigure({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'default' | 'success' | 'destructive';
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'stat-value mt-1',
          tone === 'success' && 'text-success',
          tone === 'destructive' && 'text-destructive',
        )}
      >
        {money(value)}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
