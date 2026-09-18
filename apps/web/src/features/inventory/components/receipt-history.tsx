import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';
import type { Paginated } from '@pos/shared';

import {
  Badge,
  DataTable,
  Pagination,
  SearchInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  type DataTableColumn,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { amount, formatDate, formatDateTime, money, quantity as formatQuantity } from '@/lib/format';
import { qk } from '@/lib/query';
import { ErrorState, FilterBar, LocationSelect } from './inventory-shell';
import type { StockReceiptDto } from '../types';

const PAGE_SIZE = 20;

function useReceipts(params: { page: number; pageSize: number; search?: string; locationId?: string }) {
  return useQuery({
    queryKey: qk.inventory({ scope: 'receipts', ...params }),
    queryFn: () => api.get<Paginated<StockReceiptDto>>('/api/inventory/receipts', { ...params }),
  });
}

function useReceipt(id: string | null) {
  return useQuery({
    queryKey: qk.inventory({ scope: 'receipt', id }),
    queryFn: () => api.get<StockReceiptDto>(`/api/inventory/receipts/${id}`),
    enabled: Boolean(id),
  });
}

/** Past goods receipts, with the full document behind a tap. */
export function ReceiptHistory() {
  const showCost = useAuth((s) => s.can)('product:cost');
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const list = useReceipts({ page, pageSize: PAGE_SIZE, search: search.trim() || undefined, locationId });
  const detail = useReceipt(openId);

  const columns: Array<DataTableColumn<StockReceiptDto>> = [
    {
      key: 'createdAt',
      header: 'Data',
      cell: (row) => <span className="tabular">{formatDateTime(row.createdAt)}</span>,
    },
    { key: 'reference', header: 'Referencia', cell: (row) => <span className="tabular font-medium">{row.reference}</span> },
    {
      key: 'supplierName',
      header: 'Fornecedor',
      cell: (row) => row.supplierName ?? <span className="text-muted-foreground">Sem fornecedor</span>,
    },
    {
      key: 'locationName',
      header: 'Localizacao',
      cell: (row) => row.locationName ?? <span className="text-muted-foreground">-</span>,
    },
    {
      key: 'invoiceNumber',
      header: 'Factura',
      cell: (row) => row.invoiceNumber ?? <span className="text-muted-foreground">-</span>,
    },
    { key: 'lineCount', header: 'Linhas', numeric: true, cell: (row) => <span className="tabular">{row.lineCount}</span> },
    {
      key: 'userName',
      header: 'Registado por',
      cell: (row) => row.userName ?? <span className="text-muted-foreground">-</span>,
    },
  ];

  if (showCost) {
    columns.push({
      key: 'totalCostMinor',
      header: 'Custo total',
      numeric: true,
      cell: (row) =>
        row.totalCostMinor === null ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span className="tabular font-semibold">{amount(row.totalCostMinor)}</span>
        ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <SearchInput
          value={search}
          onValueChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Procurar por referencia ou factura..."
          className="min-w-[16rem] flex-1"
        />
        <LocationSelect
          value={locationId}
          onChange={(value) => {
            setLocationId(value);
            setPage(1);
          }}
        />
      </FilterBar>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <DataTable
            columns={columns}
            rows={list.data?.data ?? []}
            rowKey={(row) => row.id}
            loading={list.isLoading}
            stickyHeader
            onRowClick={(row) => setOpenId(row.id)}
            emptyTitle="Sem entradas registadas"
            emptyDescription="As entradas de stock que registar aparecem aqui."
            emptyIcon={PackageSearch}
          />
          <div className="border-t border-border p-3">
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </div>
        </div>
      )}

      <Sheet open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent size="lg" className="flex flex-col gap-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail.data?.reference ?? 'Entrada de stock'}</SheetTitle>
            <SheetDescription>
              {detail.data ? formatDateTime(detail.data.createdAt) : 'A carregar...'}
            </SheetDescription>
          </SheetHeader>

          {detail.isLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {detail.isError && <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />}

          {detail.data && (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Fornecedor</dt>
                  <dd className="font-medium">{detail.data.supplierName ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Localizacao</dt>
                  <dd className="font-medium">{detail.data.locationName ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Factura</dt>
                  <dd className="font-medium">{detail.data.invoiceNumber ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Encomenda</dt>
                  <dd className="font-medium">{detail.data.purchaseOrderReference ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Registado por</dt>
                  <dd className="font-medium">{detail.data.userName ?? '-'}</dd>
                </div>
                {showCost && detail.data.totalCostMinor !== null && (
                  <div>
                    <dt className="text-muted-foreground">Custo total</dt>
                    <dd className="tabular font-semibold">{money(detail.data.totalCostMinor)}</dd>
                  </div>
                )}
              </dl>

              {detail.data.note && (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{detail.data.note}</p>
              )}

              <ul className="divide-y divide-border rounded-xl border border-border">
                {detail.data.lines.map((line) => (
                  <li key={line.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <span className="block truncate font-medium">
                        {line.productName}
                        {line.variantName ? ` - ${line.variantName}` : ''}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {line.sku}
                        {line.batchNumber ? ` - Lote ${line.batchNumber}` : ''}
                        {line.expiryDate ? ` - Validade ${formatDate(line.expiryDate)}` : ''}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="tabular block font-semibold">{formatQuantity(line.quantity, line.unit)}</span>
                      {showCost && line.lineCostMinor !== null && (
                        <span className="tabular block text-xs text-muted-foreground">
                          {amount(line.unitCostMinor ?? 0)} un - {amount(line.lineCostMinor)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <Badge variant="muted">{detail.data.lineCount} linhas</Badge>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default ReceiptHistory;
