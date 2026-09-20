import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Store, Truck } from 'lucide-react';

import type { FulfilmentMethod, PaymentGateway } from '@pos/shared';
import { Button, Spinner } from '@/components/ui';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { AddressFormValue, ContactFormValue } from './checkout-forms';
import { gatewayLabel } from './payment-picker';

/**
 * The individual checkout steps, kept out of the page so each one stays
 * readable: how the order travels, and the summary the shopper signs off.
 */

export interface FulfilmentStepProps {
  method: FulfilmentMethod;
  onMethod: (method: FulfilmentMethod) => void;
  pickupId: string | null;
  onPickup: (id: string) => void;
  pickupPoints: Array<{ id: string; name: string; address: string | null }>;
  pickupLoading: boolean;
  pickupFailed: boolean;
  shopPhone: string | null;
}

export function FulfilmentStep({
  method,
  onMethod,
  pickupId,
  onPickup,
  pickupPoints,
  pickupLoading,
  pickupFailed,
  shopPhone,
}: FulfilmentStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold">Como quer receber?</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <MethodCard
          selected={method === 'delivery'}
          onSelect={() => onMethod('delivery')}
          title={t('store.delivery')}
          description="Entregamos na morada que indicar."
          icon={<Truck className="size-5" aria-hidden="true" />}
        />
        <MethodCard
          selected={method === 'pickup'}
          onSelect={() => onMethod('pickup')}
          title={t('store.pickup')}
          description="Levanta na loja quando estiver pronta."
          icon={<Store className="size-5" aria-hidden="true" />}
        />
      </div>

      {method === 'pickup' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Onde quer levantar?</h3>

          {pickupLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" /> A carregar lojas...
            </div>
          ) : pickupFailed || pickupPoints.length === 0 ? (
            /*
             * Without a point to choose there is nothing to submit, so this
             * branch used to end at a "Continuar" that could never light up.
             * It now carries the way out of the dead end.
             */
            <div className="space-y-3 rounded-lg bg-warning/15 px-3 py-3">
              <p className="text-sm text-foreground">
                Esta loja ainda nao publica os pontos de levantamento online. Escolha entrega ao
                domicilio
                {shopPhone ? ` ou combine o levantamento pelo ${formatPhone(shopPhone)}.` : '.'}
              </p>
              <Button variant="outline" size="lg" onClick={() => onMethod('delivery')}>
                <Truck className="size-5" aria-hidden="true" />
                Entregar na minha morada
              </Button>
            </div>
          ) : (
            <div className="space-y-2" role="radiogroup" aria-label="Ponto de levantamento">
              {pickupPoints.map((point) => (
                <button
                  key={point.id}
                  type="button"
                  role="radio"
                  aria-checked={pickupId === point.id}
                  onClick={() => onPickup(point.id)}
                  className={cn(
                    'flex w-full min-h-touch flex-col items-start rounded-xl border p-4 text-left transition-colors',
                    pickupId === point.id ? 'border-primary bg-primary/5' : 'border-border bg-card',
                  )}
                >
                  <span className="font-semibold">{point.name}</span>
                  {point.address && (
                    <span className="text-sm text-muted-foreground">{point.address}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MethodCard({
  selected,
  onSelect,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-touch-lg flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-card',
      )}
    >
      <span className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </button>
  );
}

export function ReviewStep({
  method,
  address,
  contact,
  gateway,
  note,
  pickupName,
}: {
  method: FulfilmentMethod;
  address: AddressFormValue;
  contact: ContactFormValue;
  gateway: PaymentGateway | null;
  note: string;
  pickupName: string | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold">Confirme os dados</h2>

      <dl className="space-y-4 text-sm">
        <div>
          <dt className="font-semibold">{method === 'delivery' ? t('store.delivery') : t('store.pickup')}</dt>
          <dd className="text-muted-foreground">
            {method === 'delivery' ? (
              <>
                {address.recipient}
                <br />
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ''}
                <br />
                {address.city}
                {address.province ? `, ${address.province}` : ''}
                <br />
                <span className="tabular">{formatPhone(address.phone)}</span>
              </>
            ) : (
              pickupName ?? 'Loja'
            )}
          </dd>
        </div>

        <div>
          <dt className="font-semibold">Contacto</dt>
          <dd className="text-muted-foreground">
            {contact.name}
            {contact.email ? ` - ${contact.email}` : ''}
            {contact.phone ? ` - ${formatPhone(contact.phone)}` : ''}
          </dd>
        </div>

        <div>
          <dt className="font-semibold">Pagamento</dt>
          <dd className="text-muted-foreground">{gatewayLabel(gateway)}</dd>
        </div>

        {note.trim() && (
          <div>
            <dt className="font-semibold">Nota</dt>
            <dd className="whitespace-pre-line text-muted-foreground">{note}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
