import { Banknote, Calculator, Percent, Receipt, Undo2 } from 'lucide-react';

import { StatCard } from '@/components/ui';
import { money, number } from '@/lib/format';
import type { SalesSummary } from '../types';

export interface TransactionsSummaryProps {
  summary: SalesSummary | undefined;
  loading: boolean;
}

/** The five numbers that describe whatever the filters are currently showing. */
export function TransactionsSummary({ summary, loading }: TransactionsSummaryProps) {
  return (
    <section aria-label="Resumo do periodo" className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Transaccoes"
          value={number(summary?.transactionCount ?? 0)}
          icon={Receipt}
          loading={loading}
        />
        <StatCard
          label="Total bruto"
          value={money(summary?.grossMinor ?? 0)}
          icon={Banknote}
          tone="primary"
          loading={loading}
        />
        <StatCard
          label="Descontos"
          value={money(summary?.discountMinor ?? 0)}
          icon={Percent}
          tone="warning"
          loading={loading}
        />
        <StatCard
          label="Reembolsos"
          value={money(summary?.refundMinor ?? 0)}
          icon={Undo2}
          tone="destructive"
          loading={loading}
        />
        <StatCard
          label="Ticket medio"
          value={money(summary?.averageTicketMinor ?? 0)}
          icon={Calculator}
          loading={loading}
          className="col-span-2 md:col-span-1"
        />
      </div>

      {summary?.truncated && (
        <p className="text-xs text-muted-foreground">
          Periodo demasiado grande: os totais somam apenas as primeiras 1000 transaccoes. Reduza o
          intervalo de datas para um resumo exacto.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Os reembolsos referem-se ao intervalo de datas escolhido, sem os restantes filtros.
      </p>
    </section>
  );
}

export default TransactionsSummary;
