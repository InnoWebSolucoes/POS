import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Receipt } from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  rangeForPreset,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';

import { NoPermission } from './chart-kit';
import { ReportFilterBar } from './report-filter-bar';
import type { ReportFilterState } from './report-api';
import { CategoriesTab } from './tabs/categories-tab';
import { CustomersTab } from './tabs/customers-tab';
import { PaymentsTab } from './tabs/payments-tab';
import { ProductsTab } from './tabs/products-tab';
import { SalesTab } from './tabs/sales-tab';
import { StaffTab } from './tabs/staff-tab';
import { StockTab } from './tabs/stock-tab';

/**
 * The reporting hub. One filter bar drives every tab, and only the visible tab
 * fetches - opening this screen should not fire twenty queries at a till that
 * is sharing a 3G dongle.
 */

const TABS = [
  { value: 'vendas', label: 'Vendas' },
  { value: 'produtos', label: 'Produtos' },
  { value: 'categorias', label: 'Categorias' },
  { value: 'funcionarios', label: 'Funcionarios' },
  { value: 'pagamentos', label: 'Pagamentos' },
  { value: 'stock', label: 'Stock' },
  { value: 'clientes', label: 'Clientes' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

function isTabValue(value: string | null): value is TabValue {
  return TABS.some((tab) => tab.value === value);
}

export default function ReportsPage() {
  const can = useAuth((state) => state.can);
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = React.useState<ReportFilterState>(() => ({
    range: rangeForPreset('mes'),
  }));

  const rawTab = searchParams.get('tab');
  const tab: TabValue = isTabValue(rawTab) ? rawTab : 'vendas';

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  if (!can('report:read')) {
    return (
      <div className="p-6">
        <PageHeader title="Relatorios" />
        <NoPermission description="Nao tem permissao para consultar relatorios. Fale com o administrador da conta." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Relatorios"
        description="Vendas, produtos, equipa e stock no periodo que escolher. Todos os separadores usam os mesmos filtros."
        breadcrumbs={[{ label: 'Inicio', to: '/dashboard' }, { label: 'Relatorios' }]}
        actions={
          can('report:financial') ? (
            <Button variant="outline" asChild leftIcon={<Receipt />}>
              <Link to="/relatorios/resultados">Demonstracao de Resultados</Link>
            </Button>
          ) : undefined
        }
      />

      <ReportFilterBar value={filters} onChange={setFilters} />

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-5">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList variant="underline" className="w-max min-w-full">
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Only the open tab mounts, so switching is what triggers its fetch. */}
        <TabsContent value="vendas">{tab === 'vendas' && <SalesTab filters={filters} />}</TabsContent>
        <TabsContent value="produtos">{tab === 'produtos' && <ProductsTab filters={filters} />}</TabsContent>
        <TabsContent value="categorias">{tab === 'categorias' && <CategoriesTab filters={filters} />}</TabsContent>
        <TabsContent value="funcionarios">{tab === 'funcionarios' && <StaffTab filters={filters} />}</TabsContent>
        <TabsContent value="pagamentos">{tab === 'pagamentos' && <PaymentsTab filters={filters} />}</TabsContent>
        <TabsContent value="stock">{tab === 'stock' && <StockTab filters={filters} />}</TabsContent>
        <TabsContent value="clientes">{tab === 'clientes' && <CustomersTab filters={filters} />}</TabsContent>
      </Tabs>

      <PeriodFootnote filters={filters} />
    </div>
  );
}

function PeriodFootnote({ filters }: { filters: ReportFilterState }) {
  return (
    <p className="text-xs text-muted-foreground">
      {'Periodo: '}
      <span className="tabular">{formatDate(filters.range.from)}</span>
      {' a '}
      <span className="tabular">{formatDate(filters.range.to)}</span>
      {'. Valores em Kwanza, ja liquidos de devolucoes e descontos.'}
    </p>
  );
}
