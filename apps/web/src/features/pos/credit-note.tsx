import { Printer, ShoppingBag } from 'lucide-react';
import type { EntityDto, ReturnReason } from '@pos/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { amount, formatDateTime, money } from '@/lib/format';
import { REFUND_METHOD_LABELS, RETURN_REASON_LABELS, type RefundDto, type RefundMethod } from './types';

function reasonLabel(reason: string): string {
  return RETURN_REASON_LABELS[reason as ReturnReason] ?? reason;
}

export interface CreditNoteDialogProps {
  refund: RefundDto | null;
  entity: EntityDto | null;
  onClose: () => void;
}

/** The paper the customer leaves with. Same 80mm print path as a receipt. */
export function CreditNoteDialog({ refund, entity, onClose }: CreditNoteDialogProps) {
  if (!refund) return null;

  const method = REFUND_METHOD_LABELS[refund.method as RefundMethod] ?? refund.method;

  return (
    <Dialog open={Boolean(refund)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="default">
        <DialogHeader>
          <DialogTitle>Nota de credito</DialogTitle>
          <p className="tabular text-sm text-muted-foreground">
            {refund.reference} - {money(refund.totalMinor)}
          </p>
        </DialogHeader>

        <DialogBody>
          <div
            id="receipt-print"
            className="mx-auto w-full max-w-[80mm] rounded-xl border border-border bg-card p-4 font-mono text-xs leading-relaxed text-card-foreground"
          >
            <div className="text-center">
              <p className="text-base font-bold uppercase">{entity?.name ?? 'Loja'}</p>
              {entity?.nif && <p>NIF: {entity.nif}</p>}
              {entity?.address && <p>{entity.address}</p>}
              <p className="mt-2 text-sm font-bold uppercase">Nota de credito</p>
            </div>

            <div className="my-2 border-t border-dashed border-current opacity-50" />

            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Referencia</span>
                <span className="tabular">{refund.reference}</span>
              </div>
              <div className="flex justify-between">
                <span>Recibo</span>
                <span className="tabular">{refund.receiptNumber ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>Data</span>
                <span className="tabular">{formatDateTime(refund.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Operador</span>
                <span>{refund.userName ?? '-'}</span>
              </div>
            </div>

            <div className="my-2 border-t border-dashed border-current opacity-50" />

            <div className="space-y-1.5">
              {refund.lines.map((line) => (
                <div key={line.id}>
                  <p className="break-words font-semibold">{line.name ?? 'Artigo'}</p>
                  <div className="flex justify-between">
                    <span className="tabular opacity-70">
                      {line.quantity} - {reasonLabel(line.reason)}
                      {line.restocked ? ' - reposto' : ''}
                    </span>
                    <span className="tabular">{amount(line.amountMinor)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="my-2 border-t border-current opacity-50" />

            <div className="flex justify-between text-base font-bold">
              <span>TOTAL</span>
              <span className="tabular">{amount(refund.totalMinor)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Reembolso</span>
              <span>{method}</span>
            </div>
            {refund.note && <p className="mt-2 whitespace-pre-line opacity-70">{refund.note}</p>}
          </div>
        </DialogBody>

        <DialogFooter className="no-print">
          <Button variant="outline" size="lg" leftIcon={<Printer />} onClick={() => window.print()}>
            Imprimir
          </Button>
          <Button size="lg" leftIcon={<ShoppingBag />} onClick={onClose}>
            Nova devolucao
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreditNoteDialog;
