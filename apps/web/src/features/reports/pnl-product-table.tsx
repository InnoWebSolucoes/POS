import * as React from 'react';
import { AlertTriangle } from 'lucide-react';

import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from '@/components/ui';
import { amount, number as formatNumber, percent, quantity as formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { BreakdownRow } from './report-api';

/**
 * The per-product margin table - the reason the P&L screen exists.
 *
 * Two sorts, because they answer two different questions:
 *  - MARGEM finds the products that are priced wrong;
 *  - CONTRIBUICAO finds the products that actually pay the rent, which is
 *    usually a different list entirely (a 60% margin on four units a month is
 *    not what keeps the lights on).
 *
 * Negative-margin rows are called out in the destructive colour AND carry a
 * badge, because they are the whole point of opening this screen.
 */

export type MarginSort = 'margin' | 'contribution';

export function PnlProductTable({ rows }: { rows: BreakdownRow[] }) {
  const [sort, setSort] = React.useState<MarginSort>('contribution');
  const [onlyNegative, setOnlyNegative] = React.useState(false);

  const totalProfit = React.useMemo(
    () => rows.reduce((sum, row) => sum + (row.profitMinor ?? 0), 0),
    [rows],
  );

  const negativeCount = React.useMemo(
    () => rows.filter((row) => (row.profitMinor ?? 0) < 0).length,
    [rows],
  );

  const visible = React.useMemo(() => {
    const filtered = onlyNegative ? rows.filter((row) => (row.profitMinor ?? 0) < 0) : rows;
    const sorted = [...filtered];
    sorted.sort((a, b) =>
      sort === 'margin'
        ? (a.marginBps ?? 0) - (b.marginBps ?? 0)
        : (a.profitMinor ?? 0) - (b.profitMinor ?? 0),
    );
    // Worst first when hunting losses; best first otherwise.
    return onlyNegative ? sorted : sorted.reverse();
  }, [rows, sort, onlyNegative]);

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Margem por produto</h2>
          <p className="text-sm text-muted-foreground">
            {sort === 'margin'
              ? 'Ordenado pela margem: onde os precos estao errados.'
              : 'Ordenado pela contribuicao para o lucro total: onde o lucro e feito.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {negativeCount > 0 && (
            <Button
              variant={onlyNegative ? 'destructive' : 'outline'}
              size="sm"
              aria-pressed={onlyNegative}
              onClick={() => setOnlyNegative((value) => !value)}
              leftIcon={<AlertTriangle />}
            >
              {formatNumber(negativeCount, 0)} a perder dinheiro
            </Button>
          )}
          <div className="flex items-center gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Ordenar por">
            <Button
              size="sm"
              variant={sort === 'contribution' ? 'default' : 'ghost'}
              aria-pressed={sort === 'contribution'}
              onClick={() => setSort('contribution')}
            >
              Contribuicao
            </Button>
            <Button
              size="sm"
              variant={sort === 'margin' ? 'default' : 'ghost'}
              aria-pressed={sort === 'margin'}
              onClick={() => setSort('margin')}
            >
              Margem
            </Button>
          </div>
        </div>
      </header>

      <Table>
        <TableHeader sticky>
          <TableRow className="hover:bg-transparent">
            <TableHead>Produto</TableHead>
            <TableHead align="right">Qtd.</TableHead>
            <TableHead align="right">Receita</TableHead>
            <TableHead align="right">Custo</TableHead>
            <TableHead align="right">Lucro bruto</TableHead>
            <TableHead align="right">Margem</TableHead>
            <TableHead align="right">Contribuicao</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 && (
            <TableEmpty
              colSpan={7}
              message={onlyNegative ? 'Nenhum produto a perder dinheiro' : 'Sem vendas no periodo'}
              description={
                onlyNegative
                  ? 'Todos os artigos vendidos no periodo tiveram margem positiva.'
                  : 'Escolha outro intervalo de datas ou limpe os filtros.'
              }
            />
          )}

          {visible.map((row) => {
            const profit = row.profitMinor ?? 0;
            const negative = profit < 0;
            const contribution = totalProfit === 0 ? 0 : profit / totalProfit;

            return (
              <TableRow key={row.id} className={cn(negative && 'bg-destructive/5')}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className={cn('font-medium', negative ? 'text-destructive' : 'text-foreground')}>
                      {row.label}
                    </span>
                    {negative && (
                      <Badge variant="destructive" size="sm">
                        Margem negativa
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell align="right">
                  <span className="tabular">{formatQuantity(row.quantity)}</span>
                </TableCell>
                <TableCell align="right">
                  <span className="tabular">{amount(row.revenueMinor)}</span>
                </TableCell>
                <TableCell align="right">
                  <span className="tabular text-muted-foreground">{amount(row.cogsMinor ?? 0)}</span>
                </TableCell>
                <TableCell align="right">
                  <span className={cn('tabular font-semibold', negative && 'text-destructive')}>
                    {amount(profit)}
                  </span>
                </TableCell>
                <TableCell align="right">
                  <span className={cn('tabular font-semibold', negative && 'text-destructive')}>
                    {percent(row.marginBps ?? 0)}
                  </span>
                </TableCell>
                <TableCell align="right">
                  <span className={cn('tabular', negative ? 'text-destructive' : 'text-muted-foreground')}>
                    {formatNumber(contribution * 100, 1)}%
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

export default PnlProductTable;
