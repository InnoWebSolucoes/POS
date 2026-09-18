import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Ban, Printer, RotateCcw, Send } from 'lucide-react';

import { Button } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { ChannelBadge, SaleStatusBadge } from './sale-badges';
import type { UiLang } from '../labels';
import type { SaleDetailDto } from '../types';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

export interface SaleHeaderProps {
  sale: SaleDetailDto;
  lang: UiLang;
  canLinkCustomer: boolean;
  canRefund: boolean;
  canVoid: boolean;
  printing: boolean;
  onPrint: () => void;
  onSendReceipt: () => void;
  onReturn: () => void;
  onVoid: () => void;
}

export function SaleHeader({
  sale,
  lang,
  canLinkCustomer,
  canRefund,
  canVoid,
  printing,
  onPrint,
  onSendReceipt,
  onReturn,
  onVoid,
}: SaleHeaderProps) {
  return (
    <header className="panel flex flex-col gap-4 p-4 no-print">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Voltar as transaccoes">
            <Link to="/transaccoes">
              <ArrowLeft />
            </Link>
          </Button>

          <div className="min-w-0">
            <h1 className="tabular truncate text-2xl font-semibold tracking-tight text-foreground">
              {sale.receiptNumber}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <SaleStatusBadge status={sale.status} lang={lang} />
              <ChannelBadge channel={sale.channel} lang={lang} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" leftIcon={<Printer />} loading={printing} onClick={onPrint}>
            Reimprimir
          </Button>
          <Button variant="outline" leftIcon={<Send />} onClick={onSendReceipt}>
            Enviar recibo
          </Button>
          {canRefund && (
            <Button variant="outline" leftIcon={<RotateCcw />} onClick={onReturn}>
              Devolver
            </Button>
          )}
          {canVoid && (
            <Button variant="destructive" leftIcon={<Ban />} onClick={onVoid}>
              Anular
            </Button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 md:grid-cols-4">
        <Fact label="Data">
          <span className="tabular">{formatDateTime(sale.completedAt ?? sale.createdAt)}</span>
        </Fact>
        <Fact label="Operador">{sale.cashierName ?? '-'}</Fact>
        <Fact label="Cliente">
          {sale.customerId && sale.customerName && canLinkCustomer ? (
            <Link to={`/clientes/${sale.customerId}`} className="text-primary underline-offset-4 hover:underline">
              {sale.customerName}
            </Link>
          ) : (
            (sale.customerName ?? 'Consumidor final')
          )}
        </Fact>
        <Fact label="Artigos">
          <span className="tabular">{sale.lines.length}</span>
        </Fact>
      </dl>
    </header>
  );
}

export default SaleHeader;
