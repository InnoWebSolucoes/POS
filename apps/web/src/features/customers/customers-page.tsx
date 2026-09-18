import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Pencil, Plus, Users } from 'lucide-react';
import type { CustomerDto, VipTier } from '@pos/shared';
import { VIP_TIERS } from '@pos/shared';

import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Pagination,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  UserAvatar,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatDate, formatPhone, money, number as formatNumber } from '@/lib/format';

import { useCustomerList } from './customer-queries';
import { defaultListParams, type CustomerListParams, type CustomerSort } from './customer-types';
import { CustomerSheet } from './components/customer-sheet';
import { CustomerStats } from './components/customer-stats';
import { TIER_LABELS, TierBadge } from './components/tier';

/** Column keys that double as the API's `sort` values. */
const SORTABLE: Record<string, CustomerSort> = {
  name: 'name',
  spend: 'spend',
  lastPurchase: 'lastPurchase',
};

export default function CustomersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const can = useAuth((s) => s.can);
  const canWrite = can('customer:write');

  const [params, setParams] = React.useState<CustomerListParams>(defaultListParams);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CustomerDto | null>(null);

  const list = useCustomerList(params);
  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;

  const patch = (next: Partial<CustomerListParams>) =>
    setParams((prev) => ({ ...prev, page: 1, ...next }));

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (customer: CustomerDto) => {
    setEditing(customer);
    setSheetOpen(true);
  };

  const sort: DataTableSort | null = SORTABLE[params.sort]
    ? { key: params.sort, direction: params.order }
    : null;

  const columns: Array<DataTableColumn<CustomerDto>> = [
    {
      key: 'name',
      header: 'Cliente',
      sortable: true,
      width: '18rem',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <UserAvatar name={row.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{row.name}</p>
            {!row.active && (
              <Badge variant="muted" size="sm" className="mt-1">
                Inactivo
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Telefone',
      cell: (row) => <span className="tabular">{formatPhone(row.phone)}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      headClassName: 'hidden xl:table-cell',
      className: 'hidden xl:table-cell',
      cell: (row) => (
        <span className="block max-w-[14rem] truncate text-muted-foreground">
          {row.email ?? '-'}
        </span>
      ),
    },
    {
      key: 'card',
      header: 'Cartao',
      headClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell',
      cell: (row) =>
        row.loyaltyCardNumber ? (
          <span className="tabular text-sm">{row.loyaltyCardNumber}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: 'tier',
      header: 'Nivel',
      cell: (row) => <TierBadge tier={row.tier} />,
    },
    {
      key: 'points',
      header: 'Pontos',
      numeric: true,
      cell: (row) => <span className="tabular">{formatNumber(row.points)}</span>,
    },
    {
      key: 'spend',
      header: 'Total gasto',
      numeric: true,
      sortable: true,
      cell: (row) => (
        <span className="tabular font-semibold">{money(row.lifetimeSpendMinor)}</span>
      ),
    },
    {
      key: 'orders',
      header: 'Compras',
      numeric: true,
      headClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
      cell: (row) => <span className="tabular">{formatNumber(row.orderCount)}</span>,
    },
    {
      key: 'lastPurchase',
      header: 'Ultima compra',
      sortable: true,
      align: 'right',
      cell: (row) => (
        <span className="tabular text-sm">
          {row.lastPurchaseAt ? formatDate(row.lastPurchaseAt) : '-'}
        </span>
      ),
    },
  ];

  if (canWrite) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Accoes</span>,
      align: 'right',
      width: '6rem',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Pencil />}
          onClick={(event) => {
            event.stopPropagation();
            openEdit(row);
          }}
        >
          {t('common.edit')}
        </Button>
      ),
    });
  }

  const errorMessage =
    list.error instanceof ApiRequestError
      ? list.error.isOffline
        ? 'Sem ligacao ao servidor.'
        : list.error.message
      : 'Ocorreu um erro inesperado.';

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('nav.customers')}</h1>
          <p className="text-sm text-muted-foreground">
            Fidelizacao, historico de compras e credito de loja.
          </p>
        </div>
        {canWrite && (
          <Button size="lg" leftIcon={<Plus />} onClick={openCreate}>
            Novo cliente
          </Button>
        )}
      </header>

      <CustomerStats />

      <div className="panel flex flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <SearchInput
            className="min-w-[14rem] flex-1"
            placeholder="Procurar por nome, telefone, email ou cartao..."
            defaultValue={params.search}
            onSearch={(value) => patch({ search: value })}
            aria-label="Procurar clientes"
          />

          <Select
            value={params.tier}
            onValueChange={(value) => patch({ tier: value as VipTier | 'all' })}
          >
            <SelectTrigger className="w-[11rem]" aria-label="Filtrar por nivel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os niveis</SelectItem>
              {VIP_TIERS.map((tier) => (
                <SelectItem key={tier} value={tier}>
                  {TIER_LABELS[tier]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={params.active}
            onValueChange={(value) => patch({ active: value as CustomerListParams['active'] })}
          >
            <SelectTrigger className="w-[10rem]" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              <SelectItem value="true">Activos</SelectItem>
              <SelectItem value="false">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {list.isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Nao foi possivel carregar os clientes"
            description={errorMessage}
            action={{ label: t('common.retry'), onClick: () => void list.refetch() }}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              loading={list.isLoading}
              manualSorting
              sort={sort}
              onSortChange={(next) => {
                const mapped = next ? SORTABLE[next.key] : undefined;
                setParams((prev) => ({
                  ...prev,
                  page: 1,
                  sort: mapped ?? 'created',
                  order: next && mapped ? next.direction : 'desc',
                }));
              }}
              onRowClick={(row) => navigate(`/clientes/${row.id}`)}
              emptyIcon={Users}
              emptyTitle={t('common.noResults')}
              emptyDescription={
                params.search || params.tier !== 'all' || params.active !== 'all'
                  ? 'Nenhum cliente corresponde aos filtros aplicados.'
                  : 'Ainda nao ha clientes registados.'
              }
              emptyAction={canWrite ? { label: 'Novo cliente', onClick: openCreate } : undefined}
              stickyHeader
            />

            <Pagination
              className="border-t border-border px-4"
              page={params.page}
              pageSize={params.pageSize}
              total={total}
              onPageChange={(page) => setParams((prev) => ({ ...prev, page }))}
              onPageSizeChange={(pageSize) => patch({ pageSize })}
            />
          </>
        )}
      </div>

      <CustomerSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        customer={editing}
        onSaved={() => setEditing(null)}
      />
    </div>
  );
}
