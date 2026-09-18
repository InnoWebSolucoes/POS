import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, ShoppingBag } from 'lucide-react';

import { SOCKET_EVENTS, type OnlineOrderStatus, type PaymentStatus } from '@pos/shared';
import {
  Badge,
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
  toast,
  type DataTableColumn,
  type DateRange,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { useAuth } from '@/lib/auth-store';
import { formatDateTime, money } from '@/lib/format';
import { alertChime } from '@/lib/sound';
import { useSocketEvent } from '@/hooks/use-socket';

import { listOnlineOrders, onlineKeys } from './api';
import { OrderDetailSheet } from './components/order-detail-sheet';
import {
  FULFILMENT_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  STATUS_LABELS,
  STATUS_TONES,
} from './lifecycle';
import type { OnlineOrderCreatedEvent, OnlineOrderDto, OnlineOrderFilters } from './types';

const PAGE_SIZE = 25;
const ALL = 'all';

const STATUS_OPTIONS: OnlineOrderStatus[] = [
  'pending',
  'processing',
  'ready_for_pickup',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
];

const PAYMENT_OPTIONS: PaymentStatus[] = [
  'pending',
  'confirmed',
  'failed',
  'refunded',
  'partially_refunded',
];

const startOfDayIso = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const endOfDayIso = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();

/**
 * The fulfilment queue.
 *
 * A shop with this tab open should notice a sale: a new order arrives over the
 * socket, chimes, and drops into the table without anyone pressing refresh.
 */
export default function OnlineOrdersPage() {
  const can = useAuth((state) => state.can);
  const canRead = can('online:order:read');
  const canWrite = can('online:order:write');
  const showCost = can('product:cost');

  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [range, setRange] = React.useState<DateRange>(() => rangeForPreset('mes'));
  const [status, setStatus] = React.useState<OnlineOrderStatus | undefined>(undefined);
  const [paymentStatus, setPaymentStatus] = React.useState<PaymentStatus | undefined>(undefined);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [arrivals, setArrivals] = React.useState(0);

  // The low-stock notification links here with the order id, so honour it.
  const selectedId = searchParams.get('order');
  const setSelectedId = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('order', id);
    else next.delete('order');
    setSearchParams(next, { replace: true });
  };

  const filters: OnlineOrderFilters = {
    page,
    pageSize: PAGE_SIZE,
    status,
    paymentStatus,
    from: startOfDayIso(range.from),
    to: endOfDayIso(range.to),
    search: search || undefined,
  };

  const query = useQuery({
    queryKey: onlineKeys.list(filters),
    queryFn: () => listOnlineOrders(filters),
    enabled: canRead,
  });

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: onlineKeys.root });
  }, [queryClient]);

  useSocketEvent<OnlineOrderCreatedEvent>(
    SOCKET_EVENTS.ONLINE_ORDER_CREATED,
    (payload) => {
      alertChime();
      setArrivals((count) => count + 1);
      toast.success(
        'Nova encomenda online',
        `${payload.orderNumber} - ${money(payload.totalMinor)} - ${payload.customerName ?? 'Convidado'}`,
      );
      refresh();
    },
    canRead,
  );

  useSocketEvent(SOCKET_EVENTS.ONLINE_ORDER_UPDATED, refresh, canRead);

  const rows = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const dirty = Boolean(status || paymentStatus || search);

  const resetFilters = () => {
    setStatus(undefined);
    setPaymentStatus(undefined);
    setSearch('');
    setPage(1);
  };

  const columns: Array<DataTableColumn<OnlineOrderDto>> = [
    {
      key: 'orderNumber',
      header: 'Encomenda',
      cell: (row) => (
        <div className="min-w-0">
          <p className="tabular font-semibold text-foreground">{row.orderNumber}</p>
          <p className="tabular text-xs text-muted-foreground">{row.itemCount} artigos</p>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Data',
      cell: (row) => <span className="tabular text-sm">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'customerName',
      header: 'Cliente',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.customerName ?? 'Convidado'}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.contactEmail ?? row.contactPhone ?? '-'}
          </p>
        </div>
      ),
    },
    {
      key: 'fulfilmentMethod',
      header: 'Entrega',
      cell: (row) => (
        <div className="min-w-0">
          <Badge variant="outline">{FULFILMENT_LABELS[row.fulfilmentMethod]}</Badge>
          {row.pickupLocation && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{row.pickupLocation.name}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (row) => <Badge variant={STATUS_TONES[row.status]}>{STATUS_LABELS[row.status]}</Badge>,
    },
    {
      key: 'paymentStatus',
      header: 'Pagamento',
      cell: (row) => (
        <Badge variant={PAYMENT_STATUS_TONES[row.paymentStatus]}>
          {PAYMENT_STATUS_LABELS[row.paymentStatus]}
        </Badge>
      ),
    },
    {
      key: 'totalMinor',
      header: 'Total',
      numeric: true,
      align: 'right',
      cell: (row) => <span className="tabular font-semibold">{money(row.totalMinor)}</span>,
    },
    {
      key: 'trackingNumber',
      header: 'Seguimento',
      cell: (row) =>
        row.trackingNumber ? (
          <div className="min-w-0">
            <p className="tabular truncate text-sm">{row.trackingNumber}</p>
            <p className="truncate text-xs text-muted-foreground">{row.carrier ?? '-'}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
  ];

  if (!canRead) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Encomendas Online" />
        <EmptyState
          icon={ShoppingBag}
          title="Sem permissao"
          description="A sua conta nao tem acesso as encomendas da loja online."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Encomendas Online"
        description="A fila de preparacao da loja online: pagar, preparar, expedir, entregar."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {arrivals > 0 && (
              <Badge variant="success" size="lg" className="tabular">
                {arrivals} novas
              </Badge>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setArrivals(0);
                refresh();
              }}
              loading={query.isFetching}
              leftIcon={<RefreshCw />}
            >
              Actualizar
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput
          defaultValue={search}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Numero, cliente, email ou telefone..."
          className="sm:max-w-xs"
        />

        <Select
          value={status ?? ALL}
          onValueChange={(value) => {
            setStatus(value === ALL ? undefined : (value as OnlineOrderStatus));
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-52" aria-label="Estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os estados</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={paymentStatus ?? ALL}
          onValueChange={(value) => {
            setPaymentStatus(value === ALL ? undefined : (value as PaymentStatus));
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-52" aria-label="Pagamento">
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os pagamentos</SelectItem>
            {PAYMENT_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {PAYMENT_STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DateRangePicker
          value={range}
          onChange={(next) => {
            setRange(next);
            setPage(1);
          }}
        />

        {dirty && (
          <Button variant="ghost" onClick={resetFilters}>
            Limpar
          </Button>
        )}
      </div>

      {query.isError ? (
        <EmptyState
          icon={ShoppingBag}
          title="Nao foi possivel carregar"
          description={query.error instanceof Error ? query.error.message : 'Erro desconhecido.'}
          action={{ label: 'Tentar novamente', onClick: () => void query.refetch() }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            onRowClick={(row) => setSelectedId(row.id)}
            isRowSelected={(row) => row.id === selectedId}
            emptyTitle="Sem encomendas"
            emptyDescription="Nada chegou da loja online neste periodo."
            emptyIcon={ShoppingBag}
            stickyHeader
          />

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </div>
      )}

      <OrderDetailSheet
        orderId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        canWrite={canWrite}
        showCost={showCost}
      />
    </div>
  );
}
