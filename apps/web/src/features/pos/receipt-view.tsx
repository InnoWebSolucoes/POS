import { PAYMENT_METHOD_LABELS, UNIT_LABELS, type EntityDto, type EntitySettings, type SaleDto } from '@pos/shared';

import { amount, formatDateTime, percent, quantity as formatQuantity } from '@/lib/format';

export interface ReceiptViewProps {
  sale: SaleDto;
  entity: EntityDto | null;
  settings: EntitySettings;
}

const FRACTIONAL = ['kg', 'g', 'litre', 'ml', 'metre'];

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between text-base font-bold' : 'flex justify-between'}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

/**
 * The 80mm receipt. `id="receipt-print"` is what the print stylesheet in
 * index.css keys on, so this element is the only thing that reaches the paper.
 */
export function ReceiptView({ sale, entity, settings }: ReceiptViewProps) {
  const changeMinor = sale.payments.reduce((sum, payment) => sum + (payment.changeMinor ?? 0), 0);

  return (
    <div
      id="receipt-print"
      className="mx-auto w-full max-w-[80mm] bg-card p-4 font-mono text-xs leading-relaxed text-card-foreground"
    >
      <div className="text-center">
        {settings.receiptShowLogo && entity?.logoUrl && (
          <img src={entity.logoUrl} alt="" className="mx-auto mb-2 max-h-16 object-contain" />
        )}
        <p className="text-base font-bold uppercase">{entity?.name ?? 'Loja'}</p>
        {entity?.nif && <p>NIF: {entity.nif}</p>}
        {entity?.address && <p>{entity.address}</p>}
        {entity?.phone && <p>Tel: {entity.phone}</p>}
        {settings.receiptHeader && <p className="mt-1 whitespace-pre-line">{settings.receiptHeader}</p>}
      </div>

      <div className="my-2 border-t border-dashed border-current opacity-50" />

      <div className="space-y-0.5">
        <Row label="Recibo" value={sale.receiptNumber} />
        <Row label="Data" value={formatDateTime(sale.completedAt ?? sale.createdAt)} />
        <Row label="Operador" value={sale.cashierName ?? '-'} />
        {sale.customerName && <Row label="Cliente" value={sale.customerName} />}
      </div>

      <div className="my-2 border-t border-dashed border-current opacity-50" />

      <div className="space-y-1.5">
        {sale.lines.map((line) => {
          const fractional = FRACTIONAL.includes(line.unit);
          const unitShort = UNIT_LABELS[line.unit]?.short ?? '';
          const detail = fractional
            ? `${formatQuantity(line.quantity, line.unit)} x ${amount(line.unitPriceMinor)}/${unitShort}`
            : `${line.quantity} x ${amount(line.unitPriceMinor)}`;
          return (
            <div key={line.id}>
              <p className="break-words font-semibold">{line.name}</p>
              <div className="flex justify-between">
                <span className="tabular opacity-70">{detail}</span>
                <span className="tabular">{amount(line.totalMinor)}</span>
              </div>
              {line.discountMinor > 0 && (
                <div className="flex justify-between opacity-70">
                  <span>Desconto</span>
                  <span className="tabular">- {amount(line.discountMinor)}</span>
                </div>
              )}
              {line.note && <p className="opacity-70">{line.note}</p>}
            </div>
          );
        })}
      </div>

      <div className="my-2 border-t border-dashed border-current opacity-50" />

      <div className="space-y-0.5">
        <Row label="Subtotal" value={amount(sale.subtotalMinor)} />
        {sale.discountMinor > 0 && <Row label="Desconto" value={`- ${amount(sale.discountMinor)}`} />}
        {sale.taxBreakdown.map((row) => (
          <Row key={row.rateBps} label={`IVA ${percent(row.rateBps)}`} value={amount(row.taxMinor)} />
        ))}
        {sale.tipMinor > 0 && <Row label="Gorjeta" value={amount(sale.tipMinor)} />}
        <div className="my-1 border-t border-current opacity-50" />
        <Row label="TOTAL" value={amount(sale.totalMinor)} strong />
      </div>

      <div className="my-2 border-t border-dashed border-current opacity-50" />

      <div className="space-y-0.5">
        {sale.payments.map((payment) => (
          <Row
            key={payment.id}
            label={payment.label ?? PAYMENT_METHOD_LABELS[payment.method].pt}
            value={amount(payment.amountMinor)}
          />
        ))}
        {changeMinor > 0 && <Row label="Troco" value={amount(changeMinor)} strong />}
      </div>

      {settings.receiptFooter && (
        <p className="mt-3 whitespace-pre-line text-center">{settings.receiptFooter}</p>
      )}
    </div>
  );
}

export default ReceiptView;
