import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';

import { Badge, DataTable, Pagination, SearchInput, type DataTableColumn } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { money, quantity } from '@/lib/format';
import { qk } from '@/lib/query';

import { listSupplierProducts } from '../api';
import type { SupplierProductRow } from '../types';
import { QueryError } from './page-shell';

const PAGE_SIZE = 20;

export function SupplierProductsTab({ supplierId }: { supplierId: string }) {
  const can = useAuth((state) => state.can);
  const canSeeCost = can('product:cost');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);

  const params = { page, pageSize: PAGE_SIZE, search: search || undefined };
  const query = useQuery({
    queryKey: qk.suppliers({ products: supplierId, ...params }),
    queryFn: () => listSupplierProducts(supplierId, params),
  });

  const columns: Array<DataTableColumn<SupplierProductRow>> = [
    {
      key: 'name',
      header: 'Produto',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.namePt}</p>
          <p className="tabular truncate text-xs text-muted-foreground">{row.sku}</p>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      numeric: true,
      align: 'right',
      cell: (row) => (
        <span className="inline-flex items-center gap-2">
          {row.belowMinimum && (
            <Badge variant="warning" size="sm">
              Baixo
            </Badge>
          )}
          <span className="tabular">{quantity(row.stockQuantity, row.unit)}</span>
        </span>
      ),
    },
    {
      key: 'min',
      header: 'Minimo',
      numeric: true,
      align: 'right',
      cell: (row) => <span className="tabular">{quantity(row.minStockLevel, row.unit)}</span>,
    },
    {
      key: 'price',
      header: 'Preco de venda',
      numeric: true,
      align: 'right',
      cell: (row) => <span className="tabular">{money(row.salePriceMinor)}</span>,
    },
  ];

  if (canSeeCost) {
    columns.push({
      key: 'cost',
      header: 'Custo medio',
      numeric: true,
      align: 'right',
      // The field is absent for roles without product:cost - never assume it.
      cell: (row) =>
        row.avgCostMinor === undefined && row.costPriceMinor === undefined ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span className="tabular">{money(row.avgCostMinor ?? row.costPriceMinor)}</span>
        ),
    });
  }

  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-4">
      <SearchInput
        defaultValue={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Pesquisar produto..."
      />

      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        skeletonRows={5}
        emptyIcon={PackageSearch}
        emptyTitle="Sem produtos"
        emptyDescription="Nenhum produto do catalogo esta associado a este fornecedor."
      />

      {(query.data?.total ?? 0) > PAGE_SIZE && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={query.data?.total ?? 0}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
