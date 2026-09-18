import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, MoreVertical, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Pagination,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
  type DataTableColumn,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { formatDate, formatPhone, number } from '@/lib/format';
import { qk } from '@/lib/query';

import { deleteSupplier, listSuppliers, suppliersRoot } from './api';
import { PageShell, QueryError } from './components/page-shell';
import { SupplierDetailSheet } from './components/supplier-detail-sheet';
import { SupplierFormSheet } from './components/supplier-form-sheet';
import type { SupplierDto } from './types';

const PAGE_SIZE = 25;
type ActiveFilter = 'all' | 'active' | 'inactive';

export default function SuppliersPage() {
  const can = useAuth((state) => state.can);
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>('all');
  const [page, setPage] = React.useState(1);

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SupplierDto | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<SupplierDto | null>(null);

  const params = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    active: activeFilter === 'all' ? undefined : activeFilter === 'active',
  };

  const query = useQuery({
    queryKey: qk.suppliers({ list: params }),
    queryFn: () => listSuppliers(params),
    enabled: can('supplier:read'),
  });

  const removal = useMutation({
    mutationFn: (supplier: SupplierDto) => deleteSupplier(supplier.id),
    onSuccess: (_data, supplier) => {
      void queryClient.invalidateQueries({ queryKey: suppliersRoot });
      toast.success('Fornecedor removido', supplier.name);
      setPendingDelete(null);
    },
    onError: (error: Error) => toast.error('Nao foi possivel remover', error.message),
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (supplier: SupplierDto) => {
    setEditing(supplier);
    setFormOpen(true);
  };

  if (!can('supplier:read')) {
    return (
      <PageShell title="Fornecedores">
        <EmptyState
          icon={Truck}
          title="Sem permissao"
          description="A sua conta nao tem acesso aos fornecedores."
        />
      </PageShell>
    );
  }

  const columns: Array<DataTableColumn<SupplierDto>> = [
    {
      key: 'name',
      header: 'Fornecedor',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          <div className="mt-0.5 flex items-center gap-2">
            {!row.active && (
              <Badge variant="muted" size="sm">
                Inactivo
              </Badge>
            )}
            {row.openPurchaseOrders > 0 && (
              <span className="tabular text-xs text-muted-foreground">
                {row.openPurchaseOrders} encomendas abertas
              </span>
            )}
          </div>
        </div>
      ),
    },
    { key: 'contactName', header: 'Contacto', cell: (row) => row.contactName ?? '-' },
    {
      key: 'phone',
      header: 'Telefone',
      cell: (row) => <span className="tabular">{row.phone ? formatPhone(row.phone) : '-'}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      cell: (row) => <span className="truncate">{row.email ?? '-'}</span>,
    },
    { key: 'paymentTerms', header: 'Pagamento', cell: (row) => row.paymentTerms ?? '-' },
    {
      key: 'productCount',
      header: 'Produtos',
      numeric: true,
      align: 'right',
      cell: (row) => <span className="tabular">{number(row.productCount)}</span>,
    },
    {
      key: 'lastPurchaseAt',
      header: 'Ultima compra',
      numeric: true,
      align: 'right',
      cell: (row) => (
        <span className="tabular">{row.lastPurchaseAt ? formatDate(row.lastPurchaseAt) : '-'}</span>
      ),
    },
  ];

  if (can('supplier:write')) {
    columns.push({
      key: 'actions',
      header: '',
      width: '4rem',
      align: 'right',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Accoes para ${row.name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openEdit(row)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setPendingDelete(row)}>
              <Trash2 className="size-4" /> Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    });
  }

  return (
    <PageShell
      title="Fornecedores"
      description="Quem abastece a loja, o que fornece e como se tem portado."
      actions={
        <>
          {can('po:read') && (
            <Button variant="outline" asChild>
              <Link to="/encomendas">
                <ClipboardList /> Encomendas
              </Link>
            </Button>
          )}
          {can('supplier:write') && (
            <Button onClick={openCreate}>
              <Plus /> Novo fornecedor
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          className="sm:max-w-sm"
          defaultValue={search}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Pesquisar por nome, contacto ou NIF..."
        />
        <Select
          value={activeFilter}
          onValueChange={(value) => {
            setActiveFilter(value as ActiveFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
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
            emptyIcon={Truck}
            emptyTitle="Sem fornecedores"
            emptyDescription={
              search ? 'Nenhum fornecedor corresponde a pesquisa.' : 'Registe o primeiro fornecedor.'
            }
            emptyAction={can('supplier:write') ? { label: 'Novo fornecedor', onClick: openCreate } : undefined}
          />

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={query.data?.total ?? 0}
            onPageChange={setPage}
          />
        </>
      )}

      <SupplierFormSheet open={formOpen} onOpenChange={setFormOpen} supplier={editing} />

      <SupplierDetailSheet
        supplierId={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        onEdit={(supplier) => {
          setDetailId(null);
          openEdit(supplier);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Eliminar fornecedor?"
        description={
          pendingDelete
            ? `${pendingDelete.name} deixa de estar disponivel para novas encomendas. O historico mantem-se.`
            : undefined
        }
        onConfirm={() => pendingDelete && removal.mutate(pendingDelete)}
      />
    </PageShell>
  );
}
