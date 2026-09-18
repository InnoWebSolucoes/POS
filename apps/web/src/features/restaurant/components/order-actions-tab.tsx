import { useState } from 'react';
import {
  ArrowRightLeft,
  Ban,
  Coins,
  Merge,
  Percent,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { DiscountType, OrderDto, RestaurantTableDto } from '@pos/shared';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  MoneyInput,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';

import { apiMessage, type OrderActions } from './use-order';

type Panel = 'move' | 'merge' | 'guests' | 'discount' | 'tip' | 'cancel' | null;

export interface OrderActionsTabProps {
  order: OrderDto;
  actions: OrderActions;
  tables: RestaurantTableDto[];
  tipPresetsBps: number[];
  editable: boolean;
  onOrderMoved: (orderId: string) => void;
  onCancelled: () => void;
  onTablesChanged: () => void;
}

/** The "Accoes" tab: everything that changes the check rather than its items. */
export function OrderActionsTab({
  order,
  actions,
  tables,
  tipPresetsBps,
  editable,
  onOrderMoved,
  onCancelled,
  onTablesChanged,
}: OrderActionsTabProps) {
  const can = useAuth((state) => state.can);
  const [panel, setPanel] = useState<Panel>(null);
  const [targetTableId, setTargetTableId] = useState('');
  const [guests, setGuests] = useState(order.guestCount);
  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const [tipMinor, setTipMinor] = useState(0);
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);

  const canTable = can('restaurant:table');
  const canBill = can('restaurant:bill');
  const canDiscount = can('sale:discount');

  const others = tables.filter((table) => table.id !== order.tableId && !table.mergedIntoId);
  const free = others.filter((table) => !table.activeOrderId);

  const close = () => {
    setPanel(null);
    setTargetTableId('');
  };

  const runTableCall = async (path: string, body: Record<string, string>, successText: string) => {
    setWorking(true);
    try {
      const result = await api.post<{ table: RestaurantTableDto; order: OrderDto | null }>(path, body);
      toast.success(successText);
      onTablesChanged();
      if (result.order && result.order.id !== order.id) onOrderMoved(result.order.id);
      close();
    } catch (error) {
      toast.error('Nao foi possivel concluir', apiMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const rows: Array<{ key: Panel; label: string; hint: string; icon: LucideIcon; hidden?: boolean; danger?: boolean }> = [
    {
      key: 'move',
      label: 'Mudar de mesa',
      hint: 'Levar esta conta para outra mesa',
      icon: ArrowRightLeft,
      hidden: !canTable || !order.tableId,
    },
    {
      key: 'merge',
      label: 'Juntar mesas',
      hint: 'Unir esta mesa a outra',
      icon: Merge,
      hidden: !canTable || !order.tableId,
    },
    {
      key: 'guests',
      label: 'Alterar numero de convidados',
      hint: `${order.guestCount} convidados`,
      icon: Users,
    },
    {
      key: 'discount',
      label: 'Aplicar desconto',
      hint: order.discountMinor > 0 ? money(order.discountMinor) : 'Sem desconto',
      icon: Percent,
      hidden: !canDiscount,
    },
    {
      key: 'tip',
      label: 'Gorjeta',
      hint: 'Registar gorjeta na conta',
      icon: Coins,
      hidden: !canBill,
    },
    {
      key: 'cancel',
      label: 'Cancelar pedido',
      hint: 'Anula a conta e liberta a mesa',
      icon: Ban,
      hidden: !canBill,
      danger: true,
    },
  ];

  return (
    <div className="space-y-2 p-4">
      {rows
        .filter((row) => !row.hidden)
        .map((row) => {
          const Icon = row.icon;
          return (
            <button
              key={row.key}
              type="button"
              disabled={!editable}
              onClick={() => {
                setGuests(order.guestCount);
                setPanel(row.key);
              }}
              className={cn(
                'touch-target flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left',
                'transition-colors focus-ring disabled:opacity-50',
                row.danger ? 'text-destructive' : 'text-foreground',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{row.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{row.hint}</span>
              </span>
            </button>
          );
        })}

      {/* Mudar de mesa / juntar mesas */}
      <Dialog open={panel === 'move' || panel === 'merge'} onOpenChange={(open) => !open && close()}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{panel === 'move' ? 'Mudar de mesa' : 'Juntar mesas'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Label htmlFor="mesa-destino">Mesa de destino</Label>
            <Select value={targetTableId} onValueChange={setTargetTableId}>
              <SelectTrigger id="mesa-destino">
                <SelectValue placeholder="Escolher mesa" />
              </SelectTrigger>
              <SelectContent>
                {(panel === 'move' ? free : others).map((table) => (
                  <SelectItem key={table.id} value={table.id}>
                    {table.name}
                    {table.activeOrderId ? ' - ocupada' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(panel === 'move' ? free : others).length === 0 && (
              <p className="text-sm text-muted-foreground">Nao ha mesas disponiveis.</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button
              loading={working}
              disabled={!targetTableId || !order.tableId}
              onClick={() => {
                if (!order.tableId || !targetTableId) return;
                void (panel === 'move'
                  ? runTableCall(
                      `/api/restaurant/tables/${order.tableId}/move`,
                      { toTableId: targetTableId },
                      'Conta mudada de mesa',
                    )
                  : runTableCall(
                      `/api/restaurant/tables/${order.tableId}/merge`,
                      { intoTableId: targetTableId },
                      'Mesas unidas',
                    ));
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convidados */}
      <Dialog open={panel === 'guests'} onOpenChange={(open) => !open && close()}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Numero de convidados</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="convidados">Convidados</Label>
            <NumericInput
              id="convidados"
              className="mt-1.5"
              value={guests}
              decimals={0}
              min={1}
              max={200}
              onValueChange={setGuests}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button
              loading={actions.patchOrder.isPending}
              onClick={() => {
                actions.patchOrder.mutate({ guestCount: Math.max(1, Math.round(guests)) });
                close();
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Desconto */}
      <Dialog open={panel === 'discount'} onOpenChange={(open) => !open && close()}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Desconto na conta</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={discountType === 'percentage' ? 'default' : 'outline'}
                onClick={() => setDiscountType('percentage')}
              >
                Percentagem
              </Button>
              <Button
                variant={discountType === 'fixed' ? 'default' : 'outline'}
                onClick={() => setDiscountType('fixed')}
              >
                Valor
              </Button>
            </div>

            {discountType === 'percentage' ? (
              <div className="space-y-1.5">
                <Label htmlFor="desconto-pct">Percentagem</Label>
                <NumericInput
                  id="desconto-pct"
                  value={discountValue / 100}
                  decimals={2}
                  min={0}
                  max={100}
                  onValueChange={(value) => setDiscountValue(Math.round(value * 100))}
                />
                <p className="text-xs text-muted-foreground">{percent(discountValue)} sobre o subtotal</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="desconto-valor">Valor</Label>
                <MoneyInput id="desconto-valor" value={discountValue} min={0} onChange={setDiscountValue} />
              </div>
            )}
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                actions.patchOrder.mutate({ discount: null });
                setDiscountValue(0);
                close();
              }}
            >
              Retirar desconto
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button
                loading={actions.patchOrder.isPending}
                disabled={discountValue <= 0}
                onClick={() => {
                  actions.patchOrder.mutate({ discount: { type: discountType, value: discountValue } });
                  close();
                }}
              >
                Aplicar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gorjeta */}
      <Dialog open={panel === 'tip'} onOpenChange={(open) => !open && close()}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Gorjeta</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {tipPresetsBps.map((bps) => (
                <Button
                  key={bps}
                  variant="outline"
                  onClick={() => {
                    actions.setTip.mutate({ tipBps: bps });
                    close();
                  }}
                >
                  {percent(bps)}
                </Button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gorjeta">Valor personalizado</Label>
              <MoneyInput id="gorjeta" value={tipMinor} min={0} onChange={setTipMinor} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button
              loading={actions.setTip.isPending}
              onClick={() => {
                actions.setTip.mutate({ tipMinor });
                close();
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelar */}
      <Dialog open={panel === 'cancel'} onOpenChange={(open) => !open && close()}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Cancelar pedido {order.orderNumber}?</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Textarea
              id="motivo"
              value={reason}
              rows={2}
              maxLength={240}
              onChange={(event) => setReason(event.target.value)}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              loading={actions.cancelOrder.isPending}
              onClick={() => {
                actions.cancelOrder.mutate(reason.trim() || null, { onSuccess: onCancelled });
                close();
              }}
            >
              Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OrderActionsTab;
