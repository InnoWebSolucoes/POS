import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, LayoutGrid, RefreshCw } from 'lucide-react';
import { ORDER_STATUSES, SOCKET_EVENTS, type OrderDto, type OrderStatus } from '@pos/shared';

import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
  type DataTableColumn,
} from '@/components/ui';
import { useSocketEvent } from '@/hooks/use-socket';
import { api } from '@/lib/api';
import { amount, money, relativeTime } from '@/lib/format';
import { qk } from '@/lib/query';

import {
  isLiveItem,
  ordersListPrefix,
  unsentItems,
  type OrderUpdatedPayload,
} from './components/types';
import { apiMessage } from './components/use-order';

const ALL = '__all__';

const STATUS_LABELS: Record<OrderStatus, string> = {
  open: 'Aberta',
  sent: 'Enviada',
  ready: 'Pronta',
  served: 'Servida',
  paid: 'Paga',
  cancelled: 'Cancelada',
};

const STATUS_VARIANTS: Record<OrderStatus, 'muted' | 'default' | 'success' | 'secondary' | 'destructive'> = {
  open: 'muted',
  sent: 'default',
  ready: 'success',
  served: 'secondary',
  paid: 'success',
  cancelled: 'destructive',
};

/** /restaurante/pedidos - every open check on the floor, live. */
export default function RestaurantOrdersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>(ALL);
  const [serverId, setServerId] = useState<string>(ALL);

  const params = {
    status: status === ALL ? undefined : status,
    serverId: serverId === ALL ? undefined : serverId,
  };

  const ordersQuery = useQuery({
    queryKey: qk.orders(params),
    queryFn: () => api.get<{ data: OrderDto[] }>('/api/restaurant/orders', params),
  });

  useSocketEvent<OrderUpdatedPayload>(SOCKET_EVENTS.ORDER_UPDATED, (payload) => {
    if (!payload?.id) return;
    void queryClient.invalidateQueries({ queryKey: ordersListPrefix });
  });

  const orders = useMemo(() => ordersQuery.data?.data ?? [], [ordersQuery.data]);

  // The server filter is built from what is on the floor - a waiter has no
  // permission to read the user directory.
  const servers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const order of orders) {
      if (order.serverId) seen.set(order.serverId, order.serverName ?? order.serverId);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const openTotalMinor = orders.reduce((sum, order) => sum + order.totalMinor, 0);
  const guestTotal = orders.reduce((sum, order) => sum + order.guestCount, 0);

  const columns: Array<DataTableColumn<OrderDto>> = [
    {
      key: 'orderNumber',
      header: 'Pedido',
      width: '9rem',
      cell: (order) => <span className="tabular font-semibold">{order.orderNumber}</span>,
    },
    {
      key: 'tableName',
      header: 'Mesa',
      cell: (order) => order.tableName ?? 'Sem mesa',
    },
    {
      key: 'serverName',
      header: 'Empregado',
      cell: (order) => order.serverName ?? '-',
    },
    {
      key: 'guestCount',
      header: 'Convidados',
      numeric: true,
      align: 'right',
      width: '7rem',
    },
    {
      key: 'openedAt',
      header: 'Aberta',
      width: '9rem',
      cell: (order) => <span className="text-muted-foreground">{relativeTime(order.openedAt)}</span>,
      sortValue: (order) => order.openedAt,
    },
    {
      key: 'items',
      header: 'Artigos',
      numeric: true,
      align: 'right',
      width: '7rem',
      cell: (order) => {
        const live = order.items.filter(isLiveItem).length;
        const pending = unsentItems(order).length;
        return (
          <span className="tabular">
            {live}
            {pending > 0 && <span className="text-warning"> ({pending})</span>}
          </span>
        );
      },
      sortValue: (order) => order.items.filter(isLiveItem).length,
    },
    {
      key: 'totalMinor',
      header: 'Total',
      numeric: true,
      align: 'right',
      width: '9rem',
      cell: (order) => <span className="tabular font-semibold">{amount(order.totalMinor)}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      width: '8rem',
      cell: (order) => (
        <Badge variant={STATUS_VARIANTS[order.status]} dot pulse={order.status === 'ready'}>
          {STATUS_LABELS[order.status]}
        </Badge>
      ),
    },
  ];

  if (ordersQuery.isError) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState
          title="Nao foi possivel carregar os pedidos"
          description={apiMessage(ordersQuery.error)}
          action={{ label: 'Tentar novamente', onClick: () => void ordersQuery.refetch() }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-lg font-semibold text-foreground">Pedidos em aberto</h1>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Filtrar por estado" className="h-11 w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os estados</SelectItem>
              {ORDER_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={serverId} onValueChange={setServerId}>
            <SelectTrigger aria-label="Filtrar por empregado" className="h-11 w-[11rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os empregados</SelectItem>
              {servers.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            aria-label="Actualizar"
            loading={ordersQuery.isFetching}
            onClick={() => void ordersQuery.refetch()}
          >
            <RefreshCw />
          </Button>

          <Button variant="outline" leftIcon={<LayoutGrid />} onClick={() => navigate('/restaurante/sala')}>
            Sala
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Pedidos" value={String(orders.length)} loading={ordersQuery.isPending} />
          <StatCard label="Convidados" value={String(guestTotal)} loading={ordersQuery.isPending} />
          <StatCard label="Valor em aberto" value={money(openTotalMinor)} loading={ordersQuery.isPending} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <DataTable
          columns={columns}
          rows={orders}
          rowKey={(order) => order.id}
          loading={ordersQuery.isPending}
          stickyHeader
          emptyIcon={ClipboardList}
          emptyTitle="Sem pedidos em aberto"
          emptyDescription="Abra uma conta a partir do plano de sala."
          emptyAction={{ label: 'Ir para a sala', onClick: () => navigate('/restaurante/sala') }}
          defaultSort={{ key: 'openedAt', direction: 'desc' }}
          onRowClick={(order) => navigate(`/restaurante/pedido/${order.id}`)}
        />
      </div>
    </div>
  );
}
