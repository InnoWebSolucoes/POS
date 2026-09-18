import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, ClipboardList, Plus, Sparkles, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { PurchaseOrderStatus } from '@pos/shared';

import {
  Button,
  DataTable,
  DateRangePicker,
  EmptyState,
  Pagination,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  rangeForPreset,
  type DataTableColumn,
  type DateRange,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { formatDate, money, number } from '@/lib/format';
import { qk } from '@/lib/query';

import { listPurchaseOrders, listSuppliers } from './api';
import { LowStockSheet } from './components/low-stock-sheet';
import { PoDetailSheet } from './components/po-detail-sheet';
import { PoFormSheet } from './components/po-form-sheet';
import { PO_STATUS_OPTIONS, PoStatusBadge } from './components/po-status';
import { PageShell, QueryError } from './components/page-shell';
import type { PurchaseOrderDto } from './types';

const PAGE_SIZE = 25;
const ALL = 'all';

export default function PurchaseOrdersPage() {
  const can = useAuth((state) => state.can);
  const [searchParams] = useSearchParams();

  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<string>(ALL);
  const [supplierId, setSupplierId] = React.useState<string>(searchParams.get('supplierId') ?? ALL);
  const [range, setRange] = React.useState<DateRange | null>(null);
  const [page, setPage] = React.useState(1);

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PurchaseOrderDto | null>(null);
  const [lowStockOpen, setLowStockOpen] = React.useState(false);

  const params = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: status === ALL ? undefined : (status as PurchaseOrderStatus),
    supplierId: supplierId === ALL ? undefined : supplierId,
    from: range?.from,
    // The API compares against createdAt, so the last day has to run to midnight.
    to: range ? `${range.to}T23:59:59.999` : undefined,
  };

  const query = useQuery({
    queryKey: qk.purchaseOrders({ list: params }),
    queryFn: () => listPurchaseOrders(params),
    enabled: can('po:read'),
  });

  const suppliersQuery = useQuery({
    queryKey: qk.suppliers({ options: true }),
    queryFn: () => listSuppliers({ page: 1, pageSize: 200, active: true }),
    enabled: can('supplier:read'),
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const resetPage = () => setPage(1);

  if (!can('po:read')) {
    return (
      <PageShell title="Encomendas">
        <EmptyState
          icon={ClipboardList}
          title="Sem permissao"
          description="A sua conta nao tem acesso as encomendas a fornecedores."
        />
      </PageShell>
    );
  }

  const columns: Array<DataTableColumn<PurchaseOrderDto>> = [
    {
      key: 'reference',
      header: 'Referencia',
      cell: (row) => <span className="tabular font-medium text-foreground">{row.reference}</span>,
    },
    {
      key: 'supplierName',
      header: 'Fornecedor',
      cell: (row) => <span className="truncate">{row.supplierName ?? '-'}</span>,
    },
    { key: 'status', header: 'Estado', cell: (row) => <PoStatusBadge status={row.status} /> },
    {
      key: 'expectedDate',
      header: 'Data prevista',
      numeric: true,
      align: 'right',
      cell: (row) => (
        <span className="tabular">{row.expectedDate ? formatDate(row.expectedDate) : '-'}</span>
      ),
    },
    {
      key: 'lineCount',
      header: 'Linhas',
      numeric: true,
      align: 'right',
      cell: (row) => <span className="tabular">{number(row.lineCount)}</span>,
    },
    {
      key: 'totalCostMinor',
      header: 'Total',
      numeric: true,
      align: 'right',
      cell: (row) => <span className="tabular font-medium">{money(row.totalCostMinor)}</span>,
    },
  ];

  return (
    <PageShell
      title="Encomendas a fornecedores"
      description="O que esta pedido, o que ja chegou e o que falta receber."
      actions={
        <>
          {can('po:write') && (
            <Button onClick={() => setLowStockOpen(true)}>
              <Sparkles /> Gerar a partir de stock baixo
            </Button>
          )}
          {can('po:write') && (
            <Button variant="outline" onClick={openCreate}>
              <Plus /> Nova encomenda
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput
          className="lg:max-w-xs"
          defaultValue={search}
          onSearch={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder="Pesquisar referencia ou fornecedor..."
        />

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            resetPage();
          }}
        >
          <SelectTrigger className="lg:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os estados</SelectItem>
            {PO_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={supplierId}
          onValueChange={(value) => {
            setSupplierId(value);
            resetPage();
          }}
        >
          <SelectTrigger className="lg:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os fornecedores</SelectItem>
            {(suppliersQuery.data?.data ?? []).map((supplier) => (
              <SelectItem key={supplier.id} value={supplier.id}>
                {supplier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {range ? (
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker
              value={range}
              onChange={(next) => {
                setRange(next);
                resetPage();
              }}
            />
            <Button
              variant="ghost"
              onClick={() => {
                setRange(null);
                resetPage();
              }}
            >
              <X /> Limpar datas
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setRange(rangeForPreset('mes'));
              resetPage();
            }}
          >
            <CalendarRange /> Filtrar por data
          </Button>
        )}
      </div>

      {query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={query.data?.data ?? []}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            onRowClick={(row) => setDetailId(row.id)}
            isRowSelected={(row) => row.id === detailId}
            stickyHeader
            emptyIcon={ClipboardList}
            emptyTitle="Sem encomendas"
            emptyDescription="Crie uma encomenda ou gere rascunhos a partir do stock baixo."
            emptyAction={can('po:write') ? { label: 'Nova encomenda', onClick: openCreate } : undefined}
          />

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={query.data?.total ?? 0}
            onPageChange={setPage}
          />
        </>
      )}

      <PoFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        order={editing}
        defaultSupplierId={supplierId === ALL ? undefined : supplierId}
      />

      <PoDetailSheet
        orderId={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        onEdit={(order) => {
          setDetailId(null);
          setEditing(order);
          setFormOpen(true);
        }}
      />

      <LowStockSheet
        open={lowStockOpen}
        onOpenChange={setLowStockOpen}
        onOpenOrder={(order) => {
          setLowStockOpen(false);
          setEditing(order);
          setFormOpen(true);
        }}
      />
    </PageShell>
  );
}
