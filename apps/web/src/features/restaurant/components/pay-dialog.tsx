import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  PAYMENT_METHOD_LABELS,
  type OrderDto,
  type PaymentMethod,
  type SaleDto,
} from '@pos/shared';

import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Label,
  MoneyInput,
  Skeleton,
  toast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { amount, money, percent } from '@/lib/format';
import { successChime } from '@/lib/sound';
import { cn } from '@/lib/utils';

import { SplitPanel } from './split-panel';
import { isLiveItem, type PreBill, type SplitMode, type SplitResponse } from './types';
import { apiMessage, type OrderActions } from './use-order';

interface Tender {
  method: PaymentMethod;
  amountMinor: number;
  tenderedMinor?: number;
}

export interface PayDialogProps {
  order: OrderDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: PreBill | null;
  billLoading: boolean;
  billFailed: boolean;
  onRefreshBill: () => void;
  tipPresetsBps: number[];
  paymentMethods: PaymentMethod[];
  actions: OrderActions;
  onPaid: (sale: SaleDto) => void;
}

/** "Conta inteira" or "Dividir conta", plus the tip and the tender itself. */
export function PayDialog({
  order,
  open,
  onOpenChange,
  bill,
  billLoading,
  billFailed,
  onRefreshBill,
  tipPresetsBps,
  paymentMethods,
  actions,
  onPaid,
}: PayDialogProps) {
  const [mode, setMode] = useState<'whole' | 'split'>('whole');
  const [splitMode, setSplitMode] = useState<SplitMode>('even');
  const [people, setPeople] = useState(Math.max(order.guestCount, 2));
  const [billCount, setBillCount] = useState(2);
  const [assignment, setAssignment] = useState<Record<string, number>>({});
  const [split, setSplit] = useState<SplitResponse | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [method, setMethod] = useState<PaymentMethod>(paymentMethods[0] ?? 'cash');
  const [tipMinor, setTipMinor] = useState(0);
  const [entry, setEntry] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const dueMinor = bill?.dueMinor ?? order.totalMinor;
  const paidMinor = tenders.reduce((sum, tender) => sum + tender.amountMinor, 0);
  const remaining = Math.max(0, dueMinor - paidMinor);
  const liveItems = useMemo(() => order.items.filter(isLiveItem), [order.items]);

  const reset = () => {
    setTenders([]);
    setSplit(null);
    setEntry(0);
  };

  const addTender = (value: number, forMethod: PaymentMethod = method) => {
    const applied = Math.min(Math.max(0, Math.round(value)), remaining);
    if (applied <= 0) return;
    setTenders((current) => [...current, { method: forMethod, amountMinor: applied }]);
    setEntry(0);
  };

  const calculateSplit = async () => {
    setSplitting(true);
    try {
      const groups =
        splitMode === 'by_item'
          ? Array.from({ length: Math.max(2, billCount) }, (_, index) =>
              liveItems.filter((item) => (assignment[item.id] ?? 0) === index).map((item) => item.id),
            ).filter((group) => group.length > 0)
          : undefined;

      const result = await api.post<SplitResponse>(`/api/restaurant/orders/${order.id}/split`, {
        mode: splitMode,
        ...(splitMode === 'even' ? { people: Math.max(1, Math.round(people)) } : {}),
        ...(groups ? { groups } : {}),
      });
      setSplit(result);
    } catch (error) {
      toast.error('Nao foi possivel dividir a conta', apiMessage(error));
    } finally {
      setSplitting(false);
    }
  };

  const finish = async () => {
    const finalTenders: Tender[] =
      tenders.length > 0 ? tenders : [{ method, amountMinor: dueMinor, tenderedMinor: entry || undefined }];

    const total = finalTenders.reduce((sum, tender) => sum + tender.amountMinor, 0);
    if (total !== dueMinor) {
      toast.error('Pagamento incompleto', `Faltam ${money(dueMinor - total)}.`);
      return;
    }

    setSubmitting(true);
    try {
      const sale = await api.post<SaleDto>('/api/sales', {
        channel: 'restaurant',
        orderId: order.id,
        idempotencyKey: `order-${order.id}`,
        tipMinor: bill?.tipMinor ?? 0,
        ...(order.discountMinor > 0
          ? { orderDiscountType: 'fixed' as const, orderDiscountValue: order.discountMinor }
          : {}),
        lines: liveItems.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          taxRateBps: item.taxRateBps,
          modifiers: item.modifiers,
          note: item.note,
          course: item.course,
          seat: item.seat,
        })),
        payments: finalTenders.map((tender) => ({
          method: tender.method,
          amountMinor: tender.amountMinor,
          ...(tender.tenderedMinor && tender.tenderedMinor > tender.amountMinor
            ? { tenderedMinor: tender.tenderedMinor }
            : {}),
        })),
      });

      successChime();
      reset();
      onPaid(sale);
    } catch (error) {
      toast.error('Nao foi possivel concluir o pagamento', apiMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent size="lg" className="max-h-[92vh]">
        <DialogHeader>
          <DialogTitle>Pagar {order.tableName ?? order.orderNumber}</DialogTitle>
          <p className="tabular text-sm text-muted-foreground">
            Total a pagar {billLoading ? '...' : money(dueMinor)}
          </p>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {billLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : billFailed ? (
            <EmptyState
              size="sm"
              title="Nao foi possivel carregar a conta"
              action={{ label: 'Tentar novamente', onClick: onRefreshBill }}
            />
          ) : (
            <>
              {/* Gorjeta */}
              <section className="space-y-2">
                <Label>Gorjeta</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {tipPresetsBps.map((bps) => (
                    <Button
                      key={bps}
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        actions.setTip.mutate({ tipBps: bps }, { onSuccess: onRefreshBill })
                      }
                    >
                      {percent(bps)}
                    </Button>
                  ))}
                  <div className="w-40">
                    <MoneyInput value={tipMinor} min={0} onChange={setTipMinor} aria-label="Gorjeta" />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={actions.setTip.isPending}
                    onClick={() => actions.setTip.mutate({ tipMinor }, { onSuccess: onRefreshBill })}
                  >
                    Aplicar
                  </Button>
                  {(bill?.tipMinor ?? 0) > 0 && (
                    <Badge variant="success">Gorjeta {money(bill?.tipMinor ?? 0)}</Badge>
                  )}
                </div>
              </section>

              {/* Conta inteira / dividir */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={mode === 'whole' ? 'default' : 'outline'}
                  onClick={() => {
                    setMode('whole');
                    reset();
                  }}
                >
                  Conta inteira
                </Button>
                <Button
                  variant={mode === 'split' ? 'default' : 'outline'}
                  onClick={() => {
                    setMode('split');
                    reset();
                  }}
                >
                  Dividir conta
                </Button>
              </div>

              {mode === 'split' && (
                <SplitPanel
                  splitMode={splitMode}
                  setSplitMode={(next) => {
                    setSplitMode(next);
                    setSplit(null);
                  }}
                  people={people}
                  setPeople={setPeople}
                  billCount={billCount}
                  setBillCount={setBillCount}
                  assignment={assignment}
                  setAssignment={setAssignment}
                  items={liveItems}
                  split={split}
                  splitting={splitting}
                  onCalculate={() => void calculateSplit()}
                  onPayBill={(bill_) => addTender(bill_.totalMinor)}
                  remaining={remaining}
                />
              )}

              {/* Metodo e valor */}
              <section className="space-y-2">
                <Label>Metodo de pagamento</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {paymentMethods.map((value) => (
                    <Button
                      key={value}
                      variant={method === value ? 'default' : 'outline'}
                      onClick={() => setMethod(value)}
                    >
                      {PAYMENT_METHOD_LABELS[value].pt}
                    </Button>
                  ))}
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="valor-recebido">
                    {method === 'cash' ? 'Valor recebido' : 'Valor'}
                  </Label>
                  <MoneyInput
                    id="valor-recebido"
                    inputSize="lg"
                    value={entry}
                    min={0}
                    onChange={setEntry}
                  />
                  {method === 'cash' && entry > remaining && remaining > 0 && (
                    <p className="tabular text-sm text-success">Troco {money(entry - remaining)}</p>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <Button variant="outline" block onClick={() => addTender(entry || remaining)}>
                    Adicionar pagamento
                  </Button>
                </div>
              </section>

              {tenders.length > 0 && (
                <section className="space-y-2">
                  <Label>Pagamentos registados</Label>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {tenders.map((tender, index) => (
                      <li key={`${tender.method}-${index}`} className="flex items-center gap-3 px-3 py-2">
                        <span className="flex-1 text-sm text-foreground">
                          {PAYMENT_METHOD_LABELS[tender.method].pt}
                        </span>
                        <span className="tabular text-sm font-semibold">{amount(tender.amountMinor)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover pagamento"
                          onClick={() => setTenders((current) => current.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <p className={cn('tabular text-sm', remaining > 0 ? 'text-warning' : 'text-success')}>
                    {remaining > 0 ? `Falta ${money(remaining)}` : 'Conta coberta'}
                  </p>
                </section>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="lg"
            loading={submitting}
            disabled={billLoading || billFailed || (tenders.length > 0 && remaining > 0)}
            onClick={() => void finish()}
          >
            Concluir {money(dueMinor)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PayDialog;
