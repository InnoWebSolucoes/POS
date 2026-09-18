import * as React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import { Button, Skeleton, rangeForPreset } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';

import { NoPermission, ReportState } from './chart-kit';
import { ExportButtons } from './export-buttons';
import { PnlProductTable } from './pnl-product-table';
import {
  KeyFigure,
  StatementTable,
  buildLossRows,
  buildResultRows,
} from './pnl-statement';
import { ReportFilterBar } from './report-filter-bar';
import {
  defaultGranularity,
  useDashboardReport,
  useProfitAndLoss,
  type ReportFilterState,
} from './report-api';

/**
 * Demonstracao de Resultados - the screen the owner opens first.
 *
 * Deliberately a statement rather than a dashboard: Receita, menos Custo das
 * Vendas, igual a Lucro Bruto, and only then the detail. The whole page needs
 * `report:financial`; without it the API would refuse anyway, so the screen
 * says so plainly instead of rendering empty panels.
 */
export default function ProfitLossPage() {
  const can = useAuth((state) => state.can);
  const allowed = can('report:financial');

  const [filters, setFilters] = React.useState<ReportFilterState>(() => ({
    range: rangeForPreset('mes'),
  }));

  const granularity = defaultGranularity(filters.range);
  const pnl = useProfitAndLoss(filters, granularity, allowed);
  const dashboard = useDashboardReport(filters, allowed);

  if (!allowed) {
    return (
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <PageHeader
          title="Demonstracao de Resultados"
          breadcrumbs={[
            { label: 'Inicio', to: '/dashboard' },
            { label: 'Relatorios', to: '/relatorios' },
            { label: 'Resultados' },
          ]}
        />
        <NoPermission
          title="Sem permissao para ver resultados"
          description="A demonstracao de resultados mostra custos, margens e lucro. Precisa da permissao report:financial. Fale com o administrador da conta."
        />
      </div>
    );
  }

  const summary = pnl.data?.summary;
  const previous = dashboard.data?.previous;
  const losses = pnl.data?.losses;
  const products = pnl.data?.byProduct ?? [];

  const loading = pnl.isLoading;
  const error = pnl.error;
  const retry = () => {
    void pnl.refetch();
    void dashboard.refetch();
  };

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Demonstracao de Resultados"
        description="Receita, custo das vendas e o que sobra - com o periodo anterior de igual duracao como termo de comparacao."
        breadcrumbs={[
          { label: 'Inicio', to: '/dashboard' },
          { label: 'Relatorios', to: '/relatorios' },
          { label: 'Resultados' },
        ]}
        actions={
          <Button variant="outline" asChild leftIcon={<BarChart3 />}>
            <Link to="/relatorios">Todos os relatorios</Link>
          </Button>
        }
      />

      <ReportFilterBar
        value={filters}
        onChange={setFilters}
        show={['location', 'category', 'channel']}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodLine filters={filters} previousFrom={dashboard.data?.meta.previousFrom} previousTo={dashboard.data?.meta.previousTo} />
        <ExportButtons report="profit-loss" filters={filters} options={{ granularity }} />
      </div>

      <section className="panel flex flex-col gap-5 p-5">
        <h2 className="text-lg font-semibold text-foreground">Resultado do periodo</h2>

        <ReportState
          loading={loading}
          error={error}
          onRetry={retry}
          skeleton={<Skeleton className="h-64 w-full" />}
          empty={!summary}
          emptyTitle="Sem dados no periodo"
          emptyDescription="Nao houve vendas com estes filtros."
        >
          {summary && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <KeyFigure label="Receita" value={summary.revenueMinor} hint="Liquida de devolucoes" />
                <KeyFigure
                  label="Custo das Vendas"
                  value={summary.cogsMinor ?? 0}
                  hint="COGS dos artigos vendidos"
                />
                <KeyFigure
                  label="Lucro Bruto"
                  value={summary.grossProfitMinor ?? 0}
                  hint="Receita menos COGS"
                  tone={(summary.grossProfitMinor ?? 0) < 0 ? 'destructive' : 'success'}
                />
              </div>

              <StatementTable
                rows={buildResultRows(summary, previous)}
                caption="Receita, custo das vendas, lucro bruto e margem bruta, com a variacao face ao periodo anterior."
              />
            </>
          )}
        </ReportState>
      </section>

      <section className="panel flex flex-col gap-5 p-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Perdas</h2>
          <p className="text-sm text-muted-foreground">
            O dinheiro que sai sem passar pela caixa. As quebras estao a preco de custo.
          </p>
        </div>

        <ReportState
          loading={loading}
          error={error}
          onRetry={retry}
          skeleton={<Skeleton className="h-48 w-full" />}
          empty={!summary || !losses}
          emptyTitle="Sem perdas registadas"
        >
          {summary && losses && (
            <StatementTable
              rows={buildLossRows(summary, losses, previous)}
              caption="Descontos concedidos, devolucoes e quebras, em valor e em percentagem da receita."
            />
          )}
        </ReportState>
      </section>

      <ReportState
        loading={loading}
        error={error}
        onRetry={retry}
        skeleton={<Skeleton className="h-80 w-full" />}
      >
        <PnlProductTable rows={products} />
      </ReportState>

      {pnl.data?.meta.truncated && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          O periodo escolhido excede o limite de{' '}
          <span className="tabular">{pnl.data.meta.maxRows}</span> vendas por relatorio, por isso
          estes valores sao parciais. Escolha um intervalo mais curto para um resultado exacto.
        </p>
      )}
    </div>
  );
}

function PeriodLine({
  filters,
  previousFrom,
  previousTo,
}: {
  filters: ReportFilterState;
  previousFrom?: string;
  previousTo?: string;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {'Periodo: '}
      <span className="tabular font-medium text-foreground">
        {formatDate(filters.range.from)} a {formatDate(filters.range.to)}
      </span>
      {previousFrom && previousTo && (
        <>
          {' | comparado com '}
          <span className="tabular">
            {formatDate(previousFrom)} a {formatDate(previousTo)}
          </span>
        </>
      )}
    </p>
  );
}
