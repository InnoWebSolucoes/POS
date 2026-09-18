import * as React from 'react';
import { AlertTriangle, CheckCheck, ClipboardCheck } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  DataTable,
  EmptyState,
  StatCard,
  type DataTableColumn,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { amount, money, number as formatNumber, quantity as formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { StockTakeDto, StockTakeLineDto } from '../types';

export interface StockTakeReviewProps {
  stockTake: StockTakeDto;
  approving: boolean;
  onApprove: () => void;
  onBackToCount: () => void;
}

/**
 * Step 3 and 4: only the lines that disagree with the system, biggest loss
 * first, and an approval that says out loud what it is about to write.
 */
export function StockTakeReview({ stockTake, approving, onApprove, onBackToCount }: StockTakeReviewProps) {
  const showCost = useAuth((s) => s.can)('product:cost');
  const [confirming, setConfirming] = React.useState(false);

  const variances = React.useMemo(() => {
    const rows = stockTake.lines.filter((line) => line.hasVariance);
    return rows.sort((a, b) => {
      const aValue = a.varianceValueMinor ?? a.variance ?? 0;
      const bValue = b.varianceValueMinor ?? b.variance ?? 0;
      return aValue - bValue;
    });
  }, [stockTake.lines]);

  const totalUnits = variances.reduce((sum, line) => sum + (line.variance ?? 0), 0);
  const totalValueMinor = variances.reduce((sum, line) => sum + (line.varianceValueMinor ?? 0), 0);
  const uncounted = stockTake.lineCount - stockTake.countedCount;
  const approved = stockTake.status === 'approved';

  const columns: Array<DataTableColumn<StockTakeLineDto>> = [
    {
      key: 'productName',
      header: 'Produto',
      width: '24rem',
      cell: (line) => (
        <div>
          <span className="block truncate font-medium text-foreground">
            {line.productName}
            {line.variantName ? ` - ${line.variantName}` : ''}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{line.sku}</span>
        </div>
      ),
    },
    {
      key: 'expectedQuantity',
      header: 'Esperado',
      numeric: true,
      cell: (line) => <span className="tabular">{formatQuantity(line.expectedQuantity, line.unit)}</span>,
    },
    {
      key: 'countedQuantity',
      header: 'Contado',
      numeric: true,
      cell: (line) => (
        <span className="tabular font-semibold">
          {line.countedQuantity === null ? '-' : formatQuantity(line.countedQuantity, line.unit)}
        </span>
      ),
    },
    {
      key: 'variance',
      header: 'Diferenca',
      numeric: true,
      cell: (line) => (
        <span
          className={cn(
            'tabular font-semibold',
            (line.variance ?? 0) < 0 ? 'text-destructive' : 'text-success',
          )}
        >
          {(line.variance ?? 0) > 0 ? '+' : ''}
          {formatNumber(line.variance ?? 0, (line.variance ?? 0) % 1 === 0 ? 0 : 3)}
        </span>
      ),
    },
  ];

  if (showCost) {
    columns.push({
      key: 'varianceValueMinor',
      header: 'Valor',
      numeric: true,
      cell: (line) =>
        line.varianceValueMinor === null ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span
            className={cn('tabular font-semibold', line.varianceValueMinor < 0 ? 'text-destructive' : 'text-success')}
          >
            {amount(line.varianceValueMinor)}
          </span>
        ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Artigos contados" value={`${formatNumber(stockTake.countedCount)} / ${formatNumber(stockTake.lineCount)}`} icon={ClipboardCheck} />
        <StatCard label="Linhas com diferenca" value={formatNumber(variances.length)} icon={AlertTriangle} tone={variances.length ? 'warning' : 'default'} />
        <StatCard
          label="Diferenca em unidades"
          value={`${totalUnits > 0 ? '+' : ''}${formatNumber(totalUnits, totalUnits % 1 === 0 ? 0 : 3)}`}
          tone={totalUnits < 0 ? 'destructive' : 'default'}
        />
        {showCost && (
          <StatCard
            label="Diferenca em valor"
            value={money(totalValueMinor)}
            tone={totalValueMinor < 0 ? 'destructive' : 'success'}
          />
        )}
      </section>

      {uncounted > 0 && !approved && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          <span className="tabular font-semibold">{formatNumber(uncounted)}</span> artigos ainda nao foram contados.
          Ao aprovar, esses artigos ficam com a quantidade actual - nenhum movimento e escrito para eles.
        </p>
      )}

      {variances.length === 0 ? (
        <EmptyState
          icon={CheckCheck}
          title="Sem diferencas"
          description="Todas as contagens coincidem com o sistema. Aprovar nao altera nenhuma quantidade."
        />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <DataTable
            columns={columns}
            rows={variances}
            rowKey={(line) => line.id}
            stickyHeader
            emptyTitle="Sem diferencas"
          />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {approved ? (
          <Badge variant="success" size="lg" dot>
            Aprovado - os movimentos ja foram escritos
          </Badge>
        ) : (
          <Button variant="outline" onClick={onBackToCount}>
            Voltar a contagem
          </Button>
        )}
        {!approved && (
          <Button size="lg" onClick={() => setConfirming(true)} loading={approving}>
            Aprovar inventario
          </Button>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar {stockTake.reference}?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto escreve <span className="tabular font-semibold">{formatNumber(variances.length)}</span> movimentos de
              stock e passa as quantidades do sistema a serem as contadas
              {showCost ? (
                <>
                  , com um impacto de <span className="tabular font-semibold">{money(totalValueMinor)}</span> no valor
                  do stock
                </>
              ) : null}
              . O livro de movimentos e definitivo: depois de aprovado, so um novo ajuste corrige uma contagem errada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Rever mais uma vez</AlertDialogCancel>
            <AlertDialogAction
              variant="success"
              onClick={() => {
                setConfirming(false);
                onApprove();
              }}
            >
              Aprovar e escrever movimentos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default StockTakeReview;
