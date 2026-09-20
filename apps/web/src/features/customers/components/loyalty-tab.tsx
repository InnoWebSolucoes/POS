import * as React from 'react';
import { Link } from 'react-router-dom';
import { Coins, Gift, History, Sparkles, Wallet } from 'lucide-react';
import type { LoyaltyTxType } from '@pos/shared';

import {
  Badge,
  Button,
  DataTable,
  type BadgeProps,
  type DataTableColumn,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { formatDateTime, money, number as formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { CustomerDetail, LoyaltyTransaction, TierConfig } from '../customer-types';
import { AdjustPointsDialog, StoreCreditDialog } from './loyalty-dialogs';

const TYPE_LABELS: Record<LoyaltyTxType, string> = {
  earn: 'Ganhos',
  redeem: 'Resgate',
  adjust: 'Ajuste',
  expire: 'Expirados',
};

const TYPE_VARIANT: Record<LoyaltyTxType, NonNullable<BadgeProps['variant']>> = {
  earn: 'success',
  redeem: 'secondary',
  adjust: 'warning',
  expire: 'muted',
};

export interface LoyaltyTabProps {
  customer: CustomerDetail;
  tierConfig: TierConfig | undefined;
}

/** Points balance, its cash value, the ledger and the two manual movements. */
export function LoyaltyTab({ customer, tierConfig }: LoyaltyTabProps) {
  const can = useAuth((s) => s.can);
  const canManage = can('loyalty:manage');

  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [creditOpen, setCreditOpen] = React.useState(false);

  const pointValueMinor = tierConfig?.loyaltyPointValueMinor ?? 0;
  const earnPerMinor = tierConfig?.loyaltyEarnPerMinor ?? 0;
  const redemptionMinor = customer.points * pointValueMinor;

  const columns: Array<DataTableColumn<LoyaltyTransaction>> = [
    {
      key: 'createdAt',
      header: 'Data',
      cell: (row) => <span className="tabular text-sm">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'type',
      header: 'Tipo',
      cell: (row) => (
        <Badge variant={TYPE_VARIANT[row.type]} size="sm">
          {TYPE_LABELS[row.type]}
        </Badge>
      ),
    },
    {
      key: 'points',
      header: 'Pontos',
      numeric: true,
      cell: (row) => (
        <span
          className={cn(
            'tabular font-semibold',
            row.points > 0 && 'text-success',
            row.points < 0 && 'text-destructive',
          )}
        >
          {row.points > 0 ? '+' : ''}
          {formatNumber(row.points)}
        </span>
      ),
    },
    {
      key: 'balanceAfter',
      header: 'Saldo',
      numeric: true,
      cell: (row) => <span className="tabular">{formatNumber(row.balanceAfter)}</span>,
    },
    {
      key: 'note',
      header: 'Nota',
      cell: (row) => (
        <span className="block max-w-[18rem] truncate text-sm text-muted-foreground">
          {row.note ?? '-'}
        </span>
      ),
    },
    {
      key: 'saleId',
      header: 'Venda',
      align: 'right',
      cell: (row) =>
        row.saleId ? (
          <Button asChild variant="link" size="sm">
            <Link to={`/transaccoes/${row.saleId}`}>Ver venda</Link>
          </Button>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Saldo de pontos</p>
              <p className="stat-value mt-1 truncate text-foreground">{formatNumber(customer.points)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Vale <span className="tabular font-semibold text-foreground">{money(redemptionMinor)}</span>{' '}
                em compras
              </p>
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
          </div>

          {earnPerMinor > 0 && (
            <p className="text-xs text-muted-foreground">
              1 ponto por cada {money(earnPerMinor)} em compras; cada ponto vale{' '}
              {money(pointValueMinor)}.
            </p>
          )}

          {canManage && (
            <Button
              variant="outline"
              size="lg"
              leftIcon={<Coins />}
              onClick={() => setAdjustOpen(true)}
            >
              Ajustar pontos
            </Button>
          )}
        </div>

        <div className="panel flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            {/* Without min-w-0 this block cannot shrink below the unbreakable
                Kwanza figure, so a large store credit pushed the icon beside it
                clean out of the panel. */}
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Credito de loja</p>
              <p
                className="stat-value mt-1 truncate text-foreground"
                title={money(customer.storeCreditMinor)}
              >
                {money(customer.storeCreditMinor)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Utilizavel como pagamento no registo.
              </p>
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Wallet className="size-5" aria-hidden="true" />
            </span>
          </div>

          {canManage && (
            <Button
              variant="outline"
              size="lg"
              leftIcon={<Gift />}
              onClick={() => setCreditOpen(true)}
            >
              Adicionar ou remover credito
            </Button>
          )}
        </div>
      </div>

      <div className="panel flex flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <History className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Movimentos de pontos</h2>
          <span className="text-xs text-muted-foreground">(ultimos 20)</span>
        </div>
        <DataTable
          columns={columns}
          rows={customer.loyaltyTransactions}
          rowKey={(row) => row.id}
          emptyIcon={Sparkles}
          emptyTitle="Sem movimentos"
          emptyDescription="Ainda nao foram atribuidos nem resgatados pontos."
        />
      </div>

      {canManage && (
        <>
          <AdjustPointsDialog
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            customerId={customer.id}
            customerName={customer.name}
            currentPoints={customer.points}
            pointValueMinor={pointValueMinor}
          />
          <StoreCreditDialog
            open={creditOpen}
            onOpenChange={setCreditOpen}
            customerId={customer.id}
            customerName={customer.name}
            currentMinor={customer.storeCreditMinor}
          />
        </>
      )}
    </div>
  );
}

export default LoyaltyTab;
