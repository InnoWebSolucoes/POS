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
      {/*
        Four of these five are money. Five across at xl leaves 133px of text per
        tile and a Kwanza total wants ~180px, so StatCard ellipsised the figure;
        two columns on a phone did the same. Three is the densest that still
        shows the whole number.
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
          className="sm:col-span-2 xl:col-span-1"
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
