import { CheckCircle2 } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { amount, money, quantity as formatQuantity } from '@/lib/format';
import type { StockReceiptDto } from '../types';

export interface ReceiptConfirmationProps {
  receipt: StockReceiptDto | null;
  showCost: boolean;
  onClose: () => void;
}

/** What actually changed: the reference, the document and the quantities added. */
export function ReceiptConfirmation({ receipt, showCost, onClose }: ReceiptConfirmationProps) {
  const total = receipt?.totalCostMinor;

  return (
    <Dialog open={receipt !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
            Entrada registada
          </DialogTitle>
          <DialogDescription>
            Referencia <span className="tabular font-semibold">{receipt?.reference}</span> - o stock ja foi actualizado.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Linhas</dt>
              <dd className="tabular font-semibold">{receipt?.lineCount ?? 0}</dd>
            </div>
            {showCost && total !== null && total !== undefined && (
              <div>
                <dt className="text-muted-foreground">Custo total</dt>
                <dd className="tabular font-semibold">{money(total)}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Localizacao</dt>
              <dd className="font-medium">{receipt?.locationName ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fornecedor</dt>
              <dd className="font-medium">{receipt?.supplierName ?? '-'}</dd>
            </div>
            {receipt?.purchaseOrderReference && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">Encomenda {receipt.purchaseOrderReference}</dt>
                <dd className="font-medium">
                  {receipt.purchaseOrderStatus === 'received' ? 'Totalmente recebida' : 'Parcialmente recebida'}
                </dd>
              </div>
            )}
          </dl>

          <ul className="divide-y divide-border rounded-lg border border-border">
            {(receipt?.lines ?? []).map((line) => (
              <li key={line.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0 truncate">{line.productName}</span>
                <span className="tabular shrink-0 font-semibold">
                  +{formatQuantity(line.quantity, line.unit)}
                  {showCost && line.lineCostMinor !== null ? ` - ${amount(line.lineCostMinor)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose}>Registar outra entrada</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReceiptConfirmation;
