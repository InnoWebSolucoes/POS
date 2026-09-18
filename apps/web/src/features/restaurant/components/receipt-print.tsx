import { PAYMENT_METHOD_LABELS, type SaleDto } from '@pos/shared';

import { amount, formatDateTime, money, percent, quantity as formatQuantity } from '@/lib/format';

import type { PreBill } from './types';

/** Sends whatever is inside #receipt-print to the browser print dialog. */
export function printReceipt(): void {
  window.print();
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between font-bold' : 'flex justify-between'}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const RULE = <div className="my-1 border-t border-dashed border-current" aria-hidden="true" />;

export interface ReceiptDocumentProps {
  bill?: PreBill | null;
  sale?: SaleDto | null;
}

/**
 * The only printable surface on the page. It is display:none on screen and
 * display:block for print, which is what the #receipt-print rules in index.css
 * expect.
 */
export function ReceiptDocument({ bill, sale }: ReceiptDocumentProps) {
  return (
    <div id="receipt-print" className="hidden text-xs print:block">
      {sale ? <SaleBody sale={sale} /> : bill ? <PreBillBody bill={bill} /> : null}
    </div>
  );
}

function PreBillBody({ bill }: { bill: PreBill }) {
  return (
    <div>
      <p className="text-center font-bold">PRE-CONTA</p>
      <p className="text-center">Pedido {bill.orderNumber}</p>
      {bill.tableName && <p className="text-center">{bill.tableName}</p>}
      {RULE}
      <Row label="Empregado" value={bill.serverName ?? '-'} />
      <Row label="Convidados" value={String(bill.guestCount)} />
      <Row label="Aberta" value={formatDateTime(bill.openedAt)} />
      {RULE}

      {bill.lines.map((line) => (
        <div key={line.orderItemId} className="mb-1">
          <Row label={`${formatQuantity(line.quantity)} ${line.name}`} value={amount(line.totalMinor)} />
          {line.modifiers.length > 0 && (
            <div className="pl-3">{line.modifiers.map((modifier) => modifier.name).join(', ')}</div>
          )}
        </div>
      ))}

      {RULE}
      <Row label="Subtotal" value={amount(bill.subtotalMinor)} />
      {bill.discountMinor > 0 && <Row label="Desconto" value={`-${amount(bill.discountMinor)}`} />}
      <Row label="Imposto" value={amount(bill.taxMinor)} />
      {bill.serviceChargeMinor > 0 && (
        <Row label={`Servico ${percent(bill.serviceChargeBps)}`} value={amount(bill.serviceChargeMinor)} />
      )}
      {bill.tipMinor > 0 && <Row label="Gorjeta" value={amount(bill.tipMinor)} />}
      {RULE}
      <Row label="TOTAL" value={money(bill.dueMinor)} strong />
      {RULE}
      <p className="text-center">Este documento nao serve de factura.</p>
    </div>
  );
}

function SaleBody({ sale }: { sale: SaleDto }) {
  return (
    <div>
      <p className="text-center font-bold">RECIBO {sale.receiptNumber}</p>
      <p className="text-center">{formatDateTime(sale.completedAt ?? sale.createdAt)}</p>
      {RULE}

      {sale.lines.map((line) => (
        <div key={line.id} className="mb-1">
          <Row label={`${formatQuantity(line.quantity)} ${line.name}`} value={amount(line.totalMinor)} />
          {line.modifiers.length > 0 && (
            <div className="pl-3">{line.modifiers.map((modifier) => modifier.name).join(', ')}</div>
          )}
        </div>
      ))}

      {RULE}
      <Row label="Subtotal" value={amount(sale.subtotalMinor)} />
      {sale.discountMinor > 0 && <Row label="Desconto" value={`-${amount(sale.discountMinor)}`} />}
      <Row label="Imposto" value={amount(sale.taxMinor)} />
      {sale.tipMinor > 0 && <Row label="Gorjeta" value={amount(sale.tipMinor)} />}
      <Row label="TOTAL" value={money(sale.totalMinor)} strong />
      {RULE}

      {sale.payments.map((payment) => (
        <Row
          key={payment.id}
          label={payment.label ?? PAYMENT_METHOD_LABELS[payment.method].pt}
          value={amount(payment.amountMinor)}
        />
      ))}
      {sale.changeMinor > 0 && <Row label="Troco" value={amount(sale.changeMinor)} />}
      {RULE}
      <p className="text-center">Obrigado pela preferencia!</p>
    </div>
  );
}

export default ReceiptDocument;
