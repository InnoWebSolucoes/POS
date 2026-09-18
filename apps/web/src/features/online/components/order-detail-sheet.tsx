import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Package, Printer, Truck } from 'lucide-react';

import type { OnlineOrderStatus } from '@pos/shared';
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Label,
  Separator,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Spinner,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { formatDateTime, formatPhone, money, quantity as formatQuantity } from '@/lib/format';

import {
  changeOrderStatus,
  loadOnlineOrder,
  markReadyForPickup,
  onlineKeys,
  openPackingSlip,
  saveTracking,
} from '../api';
import {
  FULFILMENT_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  STATUS_ACTIONS,
  STATUS_LABELS,
  STATUS_TONES,
  nextStatuses,
} from '../lifecycle';

/**
 * Everything a packer needs about one order, and the only place its status
 * moves. The lifecycle is enforced twice - here so no impossible button is
 * offered, and on the server so no client can skip a step anyway.
 */
export interface OrderDetailSheetProps {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
  showCost: boolean;
}

function errorText(error: unknown, fallback = 'Tente novamente.'): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function OrderDetailSheet({
  orderId,
  onOpenChange,
  canWrite,
  showCost,
}: OrderDetailSheetProps) {
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [carrier, setCarrier] = React.useState('');
  const [trackingNumber, setTrackingNumber] = React.useState('');
  const [printing, setPrinting] = React.useState(false);

  const query = useQuery({
    queryKey: onlineKeys.detail(orderId ?? 'none'),
    queryFn: () => loadOnlineOrder(orderId ?? ''),
    enabled: Boolean(orderId),
  });

  const order = query.data ?? null;

  React.useEffect(() => {
    setCarrier(order?.carrier ?? '');
    setTrackingNumber(order?.trackingNumber ?? '');
  }, [order?.id, order?.carrier, order?.trackingNumber]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: onlineKeys.root });
  };

  const statusMutation = useMutation({
    mutationFn: (status: OnlineOrderStatus) => changeOrderStatus(order?.id ?? '', status),
    onSuccess: (updated) => {
      invalidate();
      setConfirmCancel(false);
      toast.success('Estado actualizado', `${updated.orderNumber}: ${updated.statusLabelPt}`);
    },
    onError: (error) => toast.error('Nao foi possivel mudar o estado', errorText(error)),
  });

  const pickupMutation = useMutation({
    mutationFn: () => markReadyForPickup(order?.id ?? ''),
    onSuccess: (updated) => {
      invalidate();
      toast.success('Pronta para recolha', `${updated.orderNumber} esta no balcao.`);
    },
    onError: (error) => toast.error('Nao foi possivel marcar', errorText(error)),
  });

  const trackingMutation = useMutation({
    mutationFn: () =>
      saveTracking(order?.id ?? '', {
        carrier: carrier.trim(),
        trackingNumber: trackingNumber.trim(),
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Seguimento guardado');
    },
    onError: (error) => toast.error('Nao foi possivel guardar', errorText(error)),
  });

  const print = async () => {
    if (!order) return;
    setPrinting(true);
    try {
      await openPackingSlip(order.id);
    } catch (error) {
      toast.error('Nao foi possivel abrir a guia', errorText(error));
    } finally {
      setPrinting(false);
    }
  };

  const transitions = order ? nextStatuses(order.status, order.fulfilmentMethod) : [];
  const busy = statusMutation.isPending || pickupMutation.isPending;

  return (
    <Sheet open={Boolean(orderId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="tabular">{order?.orderNumber ?? 'Encomenda'}</SheetTitle>
          <SheetDescription>
            {order ? `${formatDateTime(order.createdAt)} - ${FULFILMENT_LABELS[order.fulfilmentMethod]}` : 'A carregar...'}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex-1 space-y-6 overflow-y-auto">
          {query.isError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{errorText(query.error)}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : query.isLoading || !order ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_TONES[order.status]}>{STATUS_LABELS[order.status]}</Badge>
                <Badge variant={PAYMENT_STATUS_TONES[order.paymentStatus]}>
                  {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                </Badge>
                {order.saleId && <Badge variant="outline">Venda emitida</Badge>}
              </div>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold">Cliente</h3>
                <p className="text-sm">{order.customerName ?? 'Convidado'}</p>
                {order.contactEmail && (
                  <p className="text-sm text-muted-foreground">{order.contactEmail}</p>
                )}
                {order.contactPhone && (
                  <p className="tabular text-sm text-muted-foreground">
                    {formatPhone(order.contactPhone)}
                  </p>
                )}
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold">
                  {order.fulfilmentMethod === 'delivery' ? 'Morada de entrega' : 'Levantamento'}
                </h3>
                {order.fulfilmentMethod === 'delivery' ? (
                  order.shippingAddress ? (
                    <address className="text-sm not-italic text-muted-foreground">
                      {order.shippingAddress.recipient}
                      <br />
                      {order.shippingAddress.line1}
                      {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
                      <br />
                      {order.shippingAddress.city}
                      {order.shippingAddress.province ? `, ${order.shippingAddress.province}` : ''}
                      {order.shippingAddress.phone && (
                        <>
                          <br />
                          <span className="tabular">{formatPhone(order.shippingAddress.phone)}</span>
                        </>
                      )}
                    </address>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem morada registada.</p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {order.pickupLocation?.name ?? 'Loja'}
                    {order.pickupLocation?.address ? ` - ${order.pickupLocation.address}` : ''}
                  </p>
                )}
              </section>

              {order.note && (
                <section className="space-y-1">
                  <h3 className="text-sm font-semibold">Nota do cliente</h3>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{order.note}</p>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Artigos</h3>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {order.lines.map((line) => (
                    <li key={line.id} className="flex items-start justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{line.name}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {line.sku} - {formatQuantity(line.quantity, line.unit)} x{' '}
                          {money(line.unitPriceMinor)}
                        </p>
                      </div>
                      <p className="tabular shrink-0 text-sm font-semibold">
                        {money(line.totalMinor)}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="space-y-1 pt-1 text-sm">
                  <Row label="Subtotal" value={money(order.subtotalMinor)} />
                  {order.discountMinor > 0 && (
                    <Row label="Desconto" value={`- ${money(order.discountMinor)}`} />
                  )}
                  {order.shippingMinor > 0 && (
                    <Row label="Entrega" value={money(order.shippingMinor)} />
                  )}
                  <Row label="IVA" value={money(order.taxMinor)} />
                  <Row label="Total" value={money(order.totalMinor)} strong />
                  {showCost && order.cogsMinor !== undefined && (
                    <Row label="Custo das mercadorias" value={money(order.cogsMinor)} muted />
                  )}
                </div>
              </section>

              {order.fulfilmentMethod === 'delivery' && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Seguimento</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="carrier">Transportadora</Label>
                      <Input
                        id="carrier"
                        value={carrier}
                        disabled={!canWrite}
                        onChange={(event) => setCarrier(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tracking">Numero</Label>
                      <Input
                        id="tracking"
                        value={trackingNumber}
                        disabled={!canWrite}
                        onChange={(event) => setTrackingNumber(event.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!canWrite || !carrier.trim() || !trackingNumber.trim()}
                    loading={trackingMutation.isPending}
                    onClick={() => trackingMutation.mutate()}
                    leftIcon={<Truck />}
                  >
                    Guardar seguimento
                  </Button>
                </section>
              )}

              <Separator />

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Historico</h3>
                <dl className="space-y-1 text-sm text-muted-foreground">
                  <Row label="Criada" value={formatDateTime(order.createdAt)} />
                  {order.confirmedAt && (
                    <Row label="Pagamento confirmado" value={formatDateTime(order.confirmedAt)} />
                  )}
                  {order.shippedAt && <Row label="Expedida" value={formatDateTime(order.shippedAt)} />}
                  {order.deliveredAt && (
                    <Row label="Entregue" value={formatDateTime(order.deliveredAt)} />
                  )}
                </dl>
              </section>
            </>
          )}
        </SheetBody>

        <SheetFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            variant="outline"
            onClick={() => void print()}
            loading={printing}
            disabled={!order}
            leftIcon={<Printer />}
          >
            Guia de expedicao
          </Button>

          {canWrite && order && order.fulfilmentMethod === 'pickup' && order.status === 'processing' && (
            <Button
              variant="secondary"
              loading={pickupMutation.isPending}
              onClick={() => pickupMutation.mutate()}
              leftIcon={<Package />}
            >
              Pronta para recolha
            </Button>
          )}

          {canWrite &&
            transitions
              .filter((status) => status !== 'cancelled' && status !== 'ready_for_pickup')
              .map((status) => (
                <Button
                  key={status}
                  disabled={busy}
                  loading={statusMutation.isPending && statusMutation.variables === status}
                  onClick={() => statusMutation.mutate(status)}
                >
                  {STATUS_ACTIONS[status]}
                </Button>
              ))}

          {canWrite && transitions.includes('cancelled') && (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
              leftIcon={<Ban />}
            >
              Cancelar
            </Button>
          )}

          {busy && <Spinner className="size-5" />}
        </SheetFooter>
      </SheetContent>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar encomenda?"
        description="Se ja estava paga, o stock volta ao inventario e a venda e anulada. Esta accao nao se desfaz."
        confirmLabel="Cancelar encomenda"
        cancelLabel="Voltar"
        variant="destructive"
        onConfirm={() => statusMutation.mutate('cancelled')}
      />
    </Sheet>
  );
}

function Row({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={`tabular ${strong ? 'text-base font-bold' : ''}`}>{value}</span>
    </div>
  );
}

export default OrderDetailSheet;
