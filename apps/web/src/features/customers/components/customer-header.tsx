import { CalendarDays, CreditCard, Mail, MapPin, Pencil, Phone, ReceiptText } from 'lucide-react';

import { Badge, Button, Separator, UserAvatar } from '@/components/ui';
import { formatDate, formatPhone, money, number as formatNumber } from '@/lib/format';

import type { CustomerDetail, TierConfig } from '../customer-types';
import { TierBadge, TierProgressBar } from './tier';

interface ContactLineProps {
  icon: typeof Phone;
  label: string;
  value: string;
  mono?: boolean;
}

function ContactLine({ icon: Icon, label, value, mono = false }: ContactLineProps) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={mono ? 'tabular truncate text-sm text-foreground' : 'truncate text-sm text-foreground'}>
          {value}
        </p>
      </div>
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      {/* Kwanza is long and Intl joins the thousands with a no-break space, so
          the figure cannot wrap its way out of a narrow track. Clip it inside
          the cell rather than over the next one, and keep the whole value on
          the element for a long-press. */}
      <p className="tabular truncate text-lg font-semibold text-foreground" title={value}>
        {value}
      </p>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface CustomerHeaderProps {
  customer: CustomerDetail;
  tierConfig: TierConfig | undefined;
  canWrite: boolean;
  onEdit: () => void;
}

/** Everything a cashier needs to recognise the person standing in front of them. */
export function CustomerHeader({ customer, tierConfig, canWrite, onEdit }: CustomerHeaderProps) {
  const pointValueMinor = tierConfig?.loyaltyPointValueMinor ?? 0;

  return (
    <div className="panel flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar name={customer.name} size="xl" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {customer.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <TierBadge tier={customer.tier} size="default" />
              {!customer.active && (
                <Badge variant="muted" size="default">
                  Inactivo
                </Badge>
              )}
              {customer.loyaltyCardNumber && (
                <Badge variant="outline" size="default" className="tabular">
                  <CreditCard className="size-3.5" aria-hidden="true" />
                  {customer.loyaltyCardNumber}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {canWrite && (
          <Button variant="outline" size="lg" leftIcon={<Pencil />} onClick={onEdit}>
            Editar dados
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ContactLine icon={Phone} label="Telefone" value={formatPhone(customer.phone)} mono />
        <ContactLine icon={Mail} label="Email" value={customer.email ?? '-'} />
        <ContactLine icon={ReceiptText} label="NIF" value={customer.nif ?? '-'} mono />
        <ContactLine icon={MapPin} label="Morada" value={customer.address ?? '-'} />
      </div>

      <Separator />

      {/* Five across at xl gives each figure a 161px track, and "Total gasto"
          for a long-standing customer is a 15-16 character Kwanza value needing
          ~162px at 18px monospace - it spilled into its neighbour. Five only
          from 2xl, where the track is 220px. */}
      <div className="grid gap-4 sm:grid-cols-3 2xl:grid-cols-5">
        <Figure
          label="Pontos"
          value={formatNumber(customer.points)}
          hint={pointValueMinor > 0 ? `Vale ${money(customer.points * pointValueMinor)}` : undefined}
        />
        <Figure label="Credito de loja" value={money(customer.storeCreditMinor)} />
        <Figure label="Total gasto" value={money(customer.lifetimeSpendMinor)} />
        <Figure
          label="Compras"
          value={formatNumber(customer.orderCount)}
          hint={
            customer.lastPurchaseAt ? `Ultima: ${formatDate(customer.lastPurchaseAt)}` : 'Sem compras'
          }
        />
        <div className="flex flex-col">
          <p className="text-xs text-muted-foreground">Cliente desde</p>
          <p className="tabular text-lg font-semibold text-foreground">
            {formatDate(customer.createdAt)}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            Membro
          </p>
        </div>
      </div>

      <TierProgressBar
        lifetimeSpendMinor={customer.lifetimeSpendMinor}
        tiers={tierConfig?.tiers}
      />

      {customer.notes && (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {customer.notes}
        </p>
      )}
    </div>
  );
}

export default CustomerHeader;
