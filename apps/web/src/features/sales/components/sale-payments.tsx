import type { PaymentDto } from '@pos/shared';

import {
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { CreditCard } from 'lucide-react';
import { amount, money } from '@/lib/format';
import { paymentMethodLabel, type UiLang } from '../labels';

export interface SalePaymentsProps {
  payments: PaymentDto[];
  lang: UiLang;
}

export function SalePayments({ payments, lang }: SalePaymentsProps) {
  return (
    <section className="panel overflow-hidden">
      <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Pagamentos
      </h2>

      {payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          size="sm"
          title="Sem pagamentos registados"
          description="Esta venda nao tem linhas de pagamento."
        />
      ) : (
        <Table className="mt-2">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Metodo</TableHead>
              <TableHead align="right">Valor</TableHead>
              <TableHead align="right" className="hidden sm:table-cell">
                Entregue
              </TableHead>
              <TableHead align="right" className="hidden sm:table-cell">
                Troco
              </TableHead>
              <TableHead className="hidden md:table-cell">Referencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>
                  <span className="font-medium text-foreground">
                    {payment.label ?? paymentMethodLabel(payment.method, lang)}
                  </span>
                </TableCell>
                <TableCell numeric className="font-semibold">
                  {money(payment.amountMinor)}
                </TableCell>
                <TableCell numeric className="hidden sm:table-cell">
                  {payment.tenderedMinor === null ? '-' : amount(payment.tenderedMinor)}
                </TableCell>
                <TableCell numeric className="hidden sm:table-cell">
                  {payment.changeMinor === null ? '-' : amount(payment.changeMinor)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="tabular text-muted-foreground">{payment.reference ?? '-'}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

export default SalePayments;
