import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Download, PackagePlus, Pencil, Send } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Progress,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Textarea,
  toast,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { formatDate, formatDateTime, money, percent, quantity } from '@/lib/format';
import { qk } from '@/lib/query';

import {
  cancelPurchaseOrder,
  downloadPurchaseOrderPdf,
  getPurchaseOrder,
  purchaseOrdersRoot,
  sendPurchaseOrder,
  suppliersRoot,
} from '../api';
import type { PurchaseOrderDto } from '../types';
import { QueryError } from './page-shell';
import { PoStatusBadge } from './po-status';

interface PoDetailSheetProps {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (order: PurchaseOrderDto) => void;
}

export function PoDetailSheet({ orderId, onOpenChange, onEdit }: PoDetailSheetProps) {
  const can = useAuth((state) => state.can);
  const queryClient = useQueryClient();

  const [confirmSend, setConfirmSend] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [downloading, setDownloading] = React.useState(false);

  const query = useQuery({
    queryKey: qk.purchaseOrders({ detail: orderId }),
    queryFn: () => getPurchaseOrder(orderId ?? ''),
    enabled: Boolean(orderId),
  });

  const order = query.data;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: purchaseOrdersRoot });
    void queryClient.invalidateQueries({ queryKey: suppliersRoot });
  };

  const send = useMutation({
    mutationFn: () => sendPurchaseOrder(orderId ?? ''),
    onSuccess: (saved) => {
      invalidate();
      toast.success('Encomenda enviada', saved.reference);
      setConfirmSend(false);
    },
    onError: (error: Error) => toast.error('Nao foi possivel enviar', error.message),
  });

  const cancel = useMutation({
    mutationFn: () => cancelPurchaseOrder(orderId ?? '', reason.trim() || null),
    onSuccess: (saved) => {
      invalidate();
      toast.success('Encomenda cancelada', saved.reference);
      setCancelOpen(false);
      setReason('');
    },
    onError: (error: Error) => toast.error('Nao foi possivel cancelar', error.message),
  });

  const download = async () => {
    if (!order) return;
    setDownloading(true);
    try {
      await downloadPurchaseOrderPdf(order.id, order.reference);
    } catch {
      toast.error('Nao foi possivel descarregar o PDF');
    } finally {
      setDownloading(false);
    }
  };

  const canWrite = can('po:write');
  const isDraft = order?.status === 'draft';
  const canCancel = order ? order.status !== 'cancelled' && order.status !== 'received' : false;
  const canReceive =
    order != null && can('inventory:receive') && (order.status === 'sent' || order.status === 'partially_received');

  return (
    <Sheet open={Boolean(orderId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="tabular truncate">{order?.reference ?? 'Encomenda'}</SheetTitle>
          {order && (
            <div className="flex flex-wrap items-center gap-2">
              <PoStatusBadge status={order.status} />
              <span className="truncate text-sm text-muted-foreground">
                {order.supplierName ?? 'Sem fornecedor'}
              </span>
            </div>
          )}
        </SheetHeader>

        <SheetBody className="space-y-5">
          {query.isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {query.isError && <QueryError error={query.error} onRetry={() => void query.refetch()} />}

          {order && (
            <>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Meta label="Criada" value={formatDate(order.createdAt)} />
                <Meta label="Data prevista" value={order.expectedDate ? formatDate(order.expectedDate) : '-'} />
                <Meta label="Enviada" value={order.sentAt ? formatDateTime(order.sentAt) : '-'} />
                <Meta label="Total" value={money(order.totalCostMinor)} />
              </dl>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Recebido</span>
                  <span className="tabular text-muted-foreground">{percent(order.receivedBps)}</span>
                </div>
                <Progress
                  value={order.receivedBps / 100}
                  tone={order.receivedBps >= 10_000 ? 'success' : 'primary'}
                />
              </div>

              {order.note && (
                <p className="whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {order.note}
                </p>
              )}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Linhas ({order.lineCount})</h3>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {(order.lines ?? []).map((line) => {
                    const done = line.quantity > 0 ? (line.receivedQuantity / line.quantity) * 100 : 0;
                    return (
                      <li key={line.id} className="space-y-2 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{line.productName}</p>
                            <p className="tabular text-xs text-muted-foreground">
                              {line.variantSku ?? line.productSku} - {money(line.unitCostMinor)} / {line.unit}
                            </p>
                          </div>
                          <p className="tabular shrink-0 text-sm font-semibold text-foreground">
                            {money(line.lineTotalMinor)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Progress
                            className="flex-1"
                            size="sm"
                            value={done}
                            tone={done >= 100 ? 'success' : 'primary'}
                          />
                          <span className="tabular shrink-0 text-xs text-muted-foreground">
                            {quantity(line.receivedQuantity, line.unit)} / {quantity(line.quantity, line.unit)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {order.receipts && order.receipts.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Entradas de stock</h3>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {order.receipts.map((receipt) => (
                      <li key={receipt.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="tabular truncate text-sm text-foreground">{receipt.reference}</p>
                          <p className="tabular text-xs text-muted-foreground">
                            {formatDate(receipt.createdAt)}
                            {receipt.invoiceNumber ? ` - factura ${receipt.invoiceNumber}` : ''}
                          </p>
                        </div>
                        <span className="tabular text-sm text-foreground">{money(receipt.totalCostMinor)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </SheetBody>

        {order && (
          <SheetFooter className="flex-wrap sm:justify-start">
            <Button variant="outline" onClick={() => void download()} loading={downloading}>
              <Download /> PDF
            </Button>
            {canWrite && isDraft && (
              <Button variant="outline" onClick={() => onEdit(order)}>
                <Pencil /> Editar
              </Button>
            )}
            {canWrite && isDraft && (
              <Button onClick={() => setConfirmSend(true)}>
                <Send /> Enviar
              </Button>
            )}
            {canReceive && (
              <Button variant="success" asChild>
                <Link to={`/stock/entrada?purchaseOrderId=${order.id}`}>
                  <PackagePlus /> Registar entrada
                </Link>
              </Button>
            )}
            {canWrite && canCancel && (
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                <Ban /> Cancelar encomenda
              </Button>
            )}
          </SheetFooter>
        )}

        <ConfirmDialog
          open={confirmSend}
          onOpenChange={setConfirmSend}
          title="Enviar encomenda?"
          description="Depois de enviada deixa de ser editavel e fica a espera de receber stock."
          confirmLabel="Enviar"
          variant="default"
          onConfirm={() => send.mutate()}
        />

        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancelar encomenda?</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOpen(false)}>
                Voltar
              </Button>
              <Button variant="destructive" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancelar encomenda
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="tabular mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}
