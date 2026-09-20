import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Printer, X } from 'lucide-react';
import {
  SOCKET_EVENTS,
  type EntityDto,
  type EntitySettings,
  type OrderDto,
  type PaymentMethod,
  type RestaurantTableDto,
  type SaleDto,
} from '@pos/shared';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Label,
  NumericInput,
  Skeleton,
  toast,
} from '@/components/ui';
import { useSocketEvent } from '@/hooks/use-socket';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { money } from '@/lib/format';
import { qk } from '@/lib/query';
import { alertChime, beep } from '@/lib/sound';

import { CheckPanel } from './components/check-panel';
import { MenuPanel } from './components/menu-panel';
import { ModifierSheet } from './components/modifier-sheet';
import { PayDialog } from './components/pay-dialog';
import { ReceiptDocument, printReceipt } from './components/receipt-print';
import {
  ordersListPrefix,
  tablesListPrefix,
  type MenuItem,
  type MenuResponse,
  type OrderUpdatedPayload,
  type PreBill,
  type TicketReadyPayload,
} from './components/types';
import { apiMessage, useOrderActions } from './components/use-order';

const DEFAULT_TIPS = [500, 1000, 1500];
const DEFAULT_METHODS: PaymentMethod[] = [
  'cash',
  'card',
  'multicaixa_express',
  'mobile_money',
  'bank_transfer',
];

/** /restaurante/mesa/:tableId and /restaurante/pedido/:orderId - the register. */
export default function OrderPage() {
  const { tableId, orderId: orderIdParam } = useParams<{ tableId?: string; orderId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const can = useAuth((state) => state.can);
  const entity = useAuth((state) => state.entity);

  const [course, setCourse] = useState(0);
  const [seat, setSeat] = useState<number | null>(null);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState('conta');
  const [guests, setGuests] = useState(2);
  const [payOpen, setPayOpen] = useState(false);
  const [billWanted, setBillWanted] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [sale, setSale] = useState<SaleDto | null>(null);
  const [ready, setReady] = useState<TicketReadyPayload | null>(null);

  /* ---------------------------------------------------------------- data -- */

  const tablesQuery = useQuery({
    queryKey: qk.tables(),
    queryFn: () => api.get<{ data: RestaurantTableDto[] }>('/api/restaurant/tables'),
    enabled: can('restaurant:table'),
  });
  const tables = tablesQuery.data?.data ?? [];

  const tableOrdersQuery = useQuery({
    queryKey: qk.orders({ tableId }),
    queryFn: () => api.get<{ data: OrderDto[] }>('/api/restaurant/orders', { tableId }),
    enabled: Boolean(tableId) && !orderIdParam,
  });

  const orderId = orderIdParam ?? tableOrdersQuery.data?.data[0]?.id ?? null;

  const orderQuery = useQuery({
    queryKey: qk.order(orderId ?? 'none'),
    queryFn: () => api.get<OrderDto>(`/api/restaurant/orders/${orderId}`),
    enabled: Boolean(orderId),
  });
  const order = orderQuery.data;

  const menuQuery = useQuery({
    queryKey: qk.menu(),
    queryFn: () => api.get<MenuResponse>('/api/products/menu', { includeUnavailable: true }),
  });

  const settingsQuery = useQuery({
    queryKey: qk.settings(),
    queryFn: () => api.get<{ entity: EntityDto; settings: EntitySettings }>('/api/settings'),
    enabled: can('settings:read'),
    staleTime: 5 * 60_000,
  });
  const settings = settingsQuery.data?.settings;
  const tipPresetsBps = settings?.tipPresetsBps ?? DEFAULT_TIPS;
  const paymentMethods = (settings?.enabledPaymentMethods ?? DEFAULT_METHODS).filter(
    (method) => method !== 'store_credit' && method !== 'loyalty_points',
  );

  const billQuery = useQuery({
    queryKey: [...qk.order(orderId ?? 'none'), 'bill'],
    queryFn: () => api.get<PreBill>(`/api/restaurant/orders/${orderId}/bill`),
    enabled: Boolean(orderId) && billWanted,
  });

  const actions = useOrderActions(orderId);

  /* ------------------------------------------------------------ realtime -- */

  useSocketEvent<OrderUpdatedPayload>(SOCKET_EVENTS.ORDER_UPDATED, (payload) => {
    if (!payload?.id) return;
    void queryClient.invalidateQueries({ queryKey: ordersListPrefix });
    void queryClient.invalidateQueries({ queryKey: tablesListPrefix });
    if (payload.id === orderId) void queryClient.invalidateQueries({ queryKey: qk.order(payload.id) });
  });

  useSocketEvent<TicketReadyPayload>(SOCKET_EVENTS.TICKET_READY, (payload) => {
    if (!payload || payload.orderId !== orderId) return;
    setReady(payload);
    alertChime();
    void queryClient.invalidateQueries({ queryKey: qk.order(payload.orderId) });
  });

  /* ------------------------------------------------------------- actions -- */

  const createOrder = useMutation({
    mutationFn: (guestCount: number) =>
      api.post<OrderDto>('/api/restaurant/orders', { tableId, guestCount }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ordersListPrefix });
      void queryClient.invalidateQueries({ queryKey: tablesListPrefix });
      navigate(`/restaurante/pedido/${created.id}`, { replace: true });
    },
    onError: (error) => toast.error('Nao foi possivel abrir a conta', apiMessage(error)),
  });

  const pickItem = (item: MenuItem) => {
    if (!order) return;
    if (item.modifierGroups.length > 0) {
      setSheetItem(item);
      setSheetOpen(true);
      return;
    }
    beep();
    actions.addItems.mutate([{ productId: item.id, quantity: 1, course, seat }]);
  };

  const handlePrint = async () => {
    if (!orderId) return;
    setBillWanted(true);
    setPrinting(true);
    setSale(null);
    try {
      const result = await billQuery.refetch();
      if (!result.data) throw result.error ?? new Error('bill');
      // Let React paint the hidden document before the print dialog reads it.
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      printReceipt();
    } catch (error) {
      toast.error('Nao foi possivel imprimir', apiMessage(error));
    } finally {
      setPrinting(false);
    }
  };

  /* -------------------------------------------------------------- render -- */

  const tableName =
    order?.tableName ?? tables.find((table) => table.id === tableId)?.name ?? 'Mesa';

  const needsOrder =
    Boolean(tableId) && !orderIdParam && tableOrdersQuery.isSuccess && !orderId;

  if (orderQuery.isError || tableOrdersQuery.isError) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState
          title="Nao foi possivel abrir o pedido"
          description={apiMessage(orderQuery.error ?? tableOrdersQuery.error)}
          action={{
            label: 'Tentar novamente',
            onClick: () => {
              void orderQuery.refetch();
              void tableOrdersQuery.refetch();
            },
          }}
          secondaryAction={{ label: 'Voltar a sala', onClick: () => navigate('/restaurante/sala') }}
        />
      </div>
    );
  }

  if (!needsOrder && (!order || orderQuery.isPending)) {
    return (
      <div className="flex h-full min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-3 border-r border-border p-4">
          <Skeleton className="h-10 w-56" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square min-h-[7rem] rounded-xl" />
            ))}
          </div>
        </div>
        <div className="flex w-[38%] min-w-[20rem] max-w-[30rem] shrink-0 flex-col gap-3 bg-card p-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="mt-auto h-16 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {ready && (
        <div className="flex shrink-0 items-center gap-3 bg-success px-4 py-3 text-success-foreground">
          <BellRing className="size-6 shrink-0 animate-ticket-pulse" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-base font-semibold">
            Comida pronta na cozinha - {ready.tableName ?? tableName}
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fechar aviso"
            className="text-success-foreground hover:bg-success-foreground/10"
            onClick={() => setReady(null)}
          >
            <X />
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <MenuPanel
          serviceName={entity?.name ?? 'Menu'}
          categories={menuQuery.data?.categories ?? []}
          loading={menuQuery.isPending}
          failed={menuQuery.isError}
          onRetry={() => void menuQuery.refetch()}
          onPickItem={pickItem}
          onDiscount={() => setTab('accoes')}
          course={course}
          onCourseChange={setCourse}
          seat={seat}
          onSeatChange={setSeat}
          guestCount={order?.guestCount ?? 1}
          disabled={!order}
        />

        {order && (
          <CheckPanel
            order={order}
            actions={actions}
            tables={tables}
            tipPresetsBps={tipPresetsBps}
            serviceChargeBps={settings?.serviceChargeBps ?? 0}
            tab={tab}
            onTabChange={setTab}
            printing={printing}
            onPrint={() => void handlePrint()}
            onPay={() => {
              setBillWanted(true);
              setPayOpen(true);
            }}
            onOrderMoved={(id) => navigate(`/restaurante/pedido/${id}`, { replace: true })}
            onCancelled={() => navigate('/restaurante/sala')}
            onTablesChanged={() => void queryClient.invalidateQueries({ queryKey: tablesListPrefix })}
          />
        )}
      </div>

      <ModifierSheet
        item={sheetItem}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        defaultCourse={course}
        defaultSeat={seat}
        guestCount={order?.guestCount ?? 1}
        pending={actions.addItems.isPending}
        onConfirm={(input) => {
          actions.addItems.mutate([input], {
            onSuccess: () => {
              beep();
              setSheetOpen(false);
            },
          });
        }}
      />

      {order && (
        <PayDialog
          order={order}
          open={payOpen}
          onOpenChange={setPayOpen}
          bill={billQuery.data ?? null}
          billLoading={billQuery.isFetching && !billQuery.data}
          billFailed={billQuery.isError}
          onRefreshBill={() => void billQuery.refetch()}
          tipPresetsBps={tipPresetsBps}
          paymentMethods={paymentMethods}
          actions={actions}
          onPaid={(paid) => {
            setSale(paid);
            setPayOpen(false);
            if (orderId) void queryClient.invalidateQueries({ queryKey: qk.order(orderId) });
            void queryClient.invalidateQueries({ queryKey: ordersListPrefix });
            void queryClient.invalidateQueries({ queryKey: tablesListPrefix });
          }}
        />
      )}

      {/* Abrir conta numa mesa livre */}
      <Dialog open={needsOrder} onOpenChange={() => undefined}>
        <DialogContent size="sm" hideClose>
          <DialogHeader>
            <DialogTitle>Abrir conta - {tableName}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-1.5">
            <Label htmlFor="convidados-nova">Quantos convidados?</Label>
            <NumericInput
              id="convidados-nova"
              autoFocus
              value={guests}
              decimals={0}
              min={1}
              max={200}
              onValueChange={setGuests}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate('/restaurante/sala')}>
              Voltar a sala
            </Button>
            <Button
              loading={createOrder.isPending}
              onClick={() => createOrder.mutate(Math.max(1, Math.round(guests)))}
            >
              Abrir conta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recibo depois do pagamento */}
      <Dialog open={Boolean(sale)} onOpenChange={(open) => !open && setSale(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Pagamento concluido</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-2">
            <p className="text-sm text-muted-foreground">Recibo {sale?.receiptNumber}</p>
            <p className="tabular text-2xl font-bold text-foreground">{money(sale?.totalMinor ?? 0)}</p>
            {(sale?.changeMinor ?? 0) > 0 && (
              <p className="tabular text-sm text-success">Troco {money(sale?.changeMinor ?? 0)}</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" leftIcon={<Printer />} onClick={() => printReceipt()}>
              Imprimir recibo
            </Button>
            <Button
              onClick={() => {
                setSale(null);
                navigate('/restaurante/sala');
              }}
            >
              Voltar a sala
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiptDocument bill={billQuery.data ?? null} sale={sale} />
    </div>
  );
}
