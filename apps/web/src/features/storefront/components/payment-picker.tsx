import type { PaymentGateway } from '@pos/shared';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Payment methods.
 *
 * Only the two manual gateways are wired to anything - the card and wallet
 * adapters answer 501 by design, so they are shown as "brevemente" and cannot
 * be chosen. Offering a button that fails at the last step would be worse than
 * saying plainly that it is not ready.
 */
export interface GatewayOption {
  gateway: PaymentGateway;
  label: string;
  description: string;
  available: boolean;
}

export const GATEWAY_OPTIONS: GatewayOption[] = [
  {
    gateway: 'bank_transfer',
    label: 'Transferencia bancaria',
    description: 'Recebe a referencia da encomenda para transferir. Segue apos confirmacao.',
    available: true,
  },
  {
    gateway: 'cash_on_delivery',
    label: 'Pagamento na entrega',
    description: 'Paga em numerario quando receber ou levantar a encomenda.',
    available: true,
  },
  {
    gateway: 'multicaixa_express',
    label: 'Multicaixa Express',
    description: 'Confirmacao no telemovel. Integracao ainda por concluir.',
    available: false,
  },
  {
    gateway: 'stripe',
    label: 'Cartao (Stripe)',
    description: 'Pagamento com cartao internacional. Integracao ainda por concluir.',
    available: false,
  },
  {
    gateway: 'paypal',
    label: 'PayPal',
    description: 'Integracao ainda por concluir.',
    available: false,
  },
];

export function gatewayLabel(gateway: PaymentGateway | null | undefined): string {
  if (!gateway) return '-';
  return GATEWAY_OPTIONS.find((option) => option.gateway === gateway)?.label ?? gateway;
}

export function PaymentPicker({
  value,
  onChange,
}: {
  value: PaymentGateway | null;
  onChange: (gateway: PaymentGateway) => void;
}) {
  return (
    <div className="space-y-3" role="radiogroup" aria-label="Metodo de pagamento">
      {GATEWAY_OPTIONS.map((option) => {
        const selected = value === option.gateway;
        return (
          <button
            key={option.gateway}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!option.available}
            onClick={() => onChange(option.gateway)}
            className={cn(
              'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors',
              selected ? 'border-primary bg-primary/5' : 'border-border bg-card',
              !option.available && 'cursor-not-allowed opacity-70',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                selected ? 'border-primary' : 'border-muted-foreground/50',
              )}
            >
              {selected && <span className="size-2.5 rounded-full bg-primary" />}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{option.label}</span>
                {!option.available && (
                  <Badge variant="warning" size="sm">
                    Brevemente
                  </Badge>
                )}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default PaymentPicker;
