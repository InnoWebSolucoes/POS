import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StickyNote } from 'lucide-react';
import type { CustomerDto } from '@pos/shared';

import { Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { qk } from '@/lib/query';
import { QueryError } from './components/query-error';
import { ReceiptPrint, useReceiptPrint } from './components/receipt-print';
import { SaleHeader } from './components/sale-header';
import { SaleLinesTable } from './components/sale-lines-table';
import { SalePayments } from './components/sale-payments';
import { SaleRefunds } from './components/sale-refunds';
import { SaleTotals } from './components/sale-totals';
import { SendReceiptDialog } from './components/send-receipt-dialog';
import { VoidSaleDialog } from './components/void-sale-dialog';
import { langOf } from './labels';
import { useInvalidateSale, useSale } from './sales-api';

/** The server only allows a void on a completed sale from the same local day. */
function isToday(iso: string): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function SaleDetailPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = langOf(i18n.language);

  const can = useAuth((state) => state.can);
  const canAny = useAuth((state) => state.canAny);

  const sale = useSale(saleId);
  const invalidateSale = useInvalidateSale();
  const receipt = useReceiptPrint(saleId);

  const [sendOpen, setSendOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const canReadCustomers = can('customer:read');
  const customerId = sale.data?.customerId ?? null;

  // Prefills the send-receipt dialog; the sale DTO carries no contact details.
  const customer = useQuery({
    queryKey: qk.customer(customerId ?? 'none'),
    queryFn: () => api.get<CustomerDto>(`/api/customers/${customerId ?? ''}`),
    enabled: Boolean(customerId) && canReadCustomers,
    staleTime: 5 * 60_000,
  });

  const showFinancials = canAny('product:cost', 'report:financial');
  const showCost = can('product:cost');

  const canRefund = useMemo(() => {
    if (!sale.data || !can('sale:refund')) return false;
    return sale.data.status === 'completed' || sale.data.status === 'partially_refunded';
  }, [sale.data, can]);

  const canVoid = useMemo(() => {
    if (!sale.data || !can('sale:void')) return false;
    if (sale.data.status !== 'completed') return false;
    if (sale.data.refunds.length > 0) return false;
    return isToday(sale.data.createdAt);
  }, [sale.data, can]);

  if (sale.isLoading) return <DetailSkeleton />;

  if (sale.isError || !sale.data) {
    return (
      <div className="p-4 sm:p-6">
        <QueryError
          error={sale.error}
          onRetry={() => void sale.refetch()}
          title="Venda nao encontrada"
        />
      </div>
    );
  }

  const data = sale.data;

  return (
    <div className="flex flex-col gap-4 p-4 pb-24 sm:p-6">
      <SaleHeader
        sale={data}
        lang={lang}
        canLinkCustomer={canReadCustomers}
        canRefund={canRefund}
        canVoid={canVoid}
        printing={receipt.printing}
        onPrint={receipt.print}
        onSendReceipt={() => setSendOpen(true)}
        onReturn={() =>
          navigate(`/pos/devolucoes?venda=${encodeURIComponent(data.receiptNumber)}`, {
            state: { saleId: data.id, receiptNumber: data.receiptNumber },
          })
        }
        onVoid={() => setVoidOpen(true)}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="panel overflow-hidden">
            <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Linhas
            </h2>
            <div className="mt-2">
              <SaleLinesTable lines={data.lines} showCost={showCost} />
            </div>
          </section>

          <SalePayments payments={data.payments} lang={lang} />
          <SaleRefunds refunds={data.refunds} lang={lang} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <SaleTotals sale={data} showFinancials={showFinancials} />

          {data.note && (
            <section className="panel flex flex-col gap-2 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <StickyNote className="size-4" aria-hidden="true" />
                Nota
              </h2>
              <p className="text-sm text-foreground">{data.note}</p>
            </section>
          )}
        </div>
      </div>

      <SendReceiptDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        saleId={data.id}
        receiptNumber={data.receiptNumber}
        defaultPhone={customer.data?.phone ?? null}
        defaultEmail={customer.data?.email ?? null}
        onSent={() => invalidateSale(data.id)}
      />

      <VoidSaleDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        sale={data}
        onVoided={() => invalidateSale(data.id)}
      />

      <ReceiptPrint text={receipt.text} />
    </div>
  );
}
