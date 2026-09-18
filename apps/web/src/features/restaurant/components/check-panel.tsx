import { CreditCard, Printer, Send } from 'lucide-react';
import type { OrderDto, RestaurantTableDto } from '@pos/shared';

import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { amount, money, percent } from '@/lib/format';

import { CheckItems } from './check-items';
import { GuestsTab } from './guests-tab';
import { OrderActionsTab } from './order-actions-tab';
import { orderIsEditable, sentItems, unsentItems } from './types';
import type { OrderActions } from './use-order';

export interface CheckPanelProps {
  order: OrderDto;
  actions: OrderActions;
  tables: RestaurantTableDto[];
  tipPresetsBps: number[];
  serviceChargeBps: number;
  tab: string;
  onTabChange: (tab: string) => void;
  printing: boolean;
  onPrint: () => void;
  onPay: () => void;
  onOrderMoved: (orderId: string) => void;
  onCancelled: () => void;
  onTablesChanged: () => void;
}

/** The right-hand check: the table, its courses, and the three bottom actions. */
export function CheckPanel({
  order,
  actions,
  tables,
  tipPresetsBps,
  serviceChargeBps,
  tab,
  onTabChange,
  printing,
  onPrint,
  onPay,
  onOrderMoved,
  onCancelled,
  onTablesChanged,
}: CheckPanelProps) {
  const can = useAuth((state) => state.can);

  const editable = orderIsEditable(order);
  const unsent = unsentItems(order);
  const sent = sentItems(order);
  const canBill = can('restaurant:bill') && can('sale:create');

  return (
    <aside className="flex w-[38%] min-w-[20rem] max-w-[30rem] shrink-0 flex-col bg-card">
      <Tabs value={tab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 px-4 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-foreground">
                {order.tableName ?? `Pedido ${order.orderNumber}`}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {order.orderNumber}
                {order.serverName ? ` - ${order.serverName}` : ''} - {order.guestCount}{' '}
                {order.guestCount === 1 ? 'convidado' : 'convidados'}
              </p>
            </div>
            {!editable && (
              <Badge variant={order.status === 'paid' ? 'success' : 'muted'}>
                {order.status === 'paid' ? 'Paga' : 'Cancelada'}
              </Badge>
            )}
          </div>

          <TabsList variant="underline" stretch className="mt-3">
            <TabsTrigger value="conta">Conta</TabsTrigger>
            <TabsTrigger value="accoes">Accoes</TabsTrigger>
            <TabsTrigger value="convidados">Convidados</TabsTrigger>
          </TabsList>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="conta" className="mt-0">
            <div className="flex items-center justify-between gap-3 bg-accent px-4 py-3 text-accent-foreground">
              <span className="text-sm font-medium">
                {sent.length} {sent.length === 1 ? 'artigo enviado' : 'artigos enviados'}
              </span>
              <span className="tabular text-base font-bold">{amount(order.sentTotalMinor)}</span>
            </div>
            <CheckItems order={order} actions={actions} editable={editable} />
          </TabsContent>

          <TabsContent value="accoes" className="mt-0">
            <OrderActionsTab
              order={order}
              actions={actions}
              tables={tables}
              tipPresetsBps={tipPresetsBps}
              editable={editable}
              onOrderMoved={onOrderMoved}
              onCancelled={onCancelled}
              onTablesChanged={onTablesChanged}
            />
          </TabsContent>

          <TabsContent value="convidados" className="mt-0">
            <GuestsTab order={order} actions={actions} editable={editable} />
          </TabsContent>
        </div>
      </Tabs>

      <footer className="safe-bottom shrink-0 space-y-3 border-t border-border px-4 py-3">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal</dt>
            <dd className="tabular">{amount(order.subtotalMinor)}</dd>
          </div>
          {order.discountMinor > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <dt>Desconto</dt>
              <dd className="tabular">-{amount(order.discountMinor)}</dd>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <dt>Imposto</dt>
            <dd className="tabular">{amount(order.taxMinor)}</dd>
          </div>
          {order.serviceChargeMinor > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <dt>Servico {percent(serviceChargeBps)}</dt>
              <dd className="tabular">{amount(order.serviceChargeMinor)}</dd>
            </div>
          )}
          <div className="flex justify-between pt-1 text-base font-bold text-foreground">
            <dt>Total</dt>
            <dd className="tabular">{money(order.totalMinor)}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" leftIcon={<Printer />} loading={printing} onClick={onPrint}>
            Imprimir
          </Button>
          <Button
            variant="outline"
            size="lg"
            leftIcon={<CreditCard />}
            disabled={!canBill || !editable || order.items.length === 0}
            onClick={onPay}
          >
            Pagar
          </Button>
        </div>

        <Button
          block
          size="xl"
          leftIcon={<Send />}
          loading={actions.send.isPending}
          disabled={!editable || unsent.length === 0}
          onClick={() => actions.send.mutate()}
        >
          Enviar{unsent.length > 0 ? ` (${unsent.length})` : ''}
        </Button>
      </footer>
    </aside>
  );
}

export default CheckPanel;
