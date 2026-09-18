import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Label,
  Textarea,
  toast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { errorMessage } from './query-error';
import type { SaleDetailDto } from '../types';

export interface VoidSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: SaleDetailDto;
  onVoided: () => void;
}

/**
 * Voiding is not a soft edit: the server reverses the sale and writes the stock
 * back through the movement ledger, so the dialog says exactly that.
 */
export function VoidSaleDialog({ open, onOpenChange, sale, onVoided }: VoidSaleDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const voidSale = useMutation({
    mutationFn: () =>
      api.post<SaleDetailDto>(`/api/sales/${sale.id}/void`, { reason: reason.trim() || null }),
    onSuccess: () => {
      toast.success('Venda anulada', `Recibo ${sale.receiptNumber}`);
      onVoided();
      onOpenChange(false);
    },
    onError: (error) => toast.error('Nao foi possivel anular', errorMessage(error)),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anular a venda {sale.receiptNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            A venda de {money(sale.totalMinor)} passa a anulada e deixa de contar para as vendas do
            dia. Todo o stock vendido volta ao inventario, com um movimento de anulacao para cada
            artigo. Esta accao nao pode ser desfeita: para uma venda de outro dia, ou com devolucoes,
            emita antes uma devolucao.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="anular-motivo">Motivo (opcional)</Label>
          <Textarea
            id="anular-motivo"
            rows={3}
            maxLength={300}
            placeholder="Ex: erro de registo no caixa"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={voidSale.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={voidSale.isPending}
            onClick={(event) => {
              // Keep the dialog open so a server refusal stays on screen.
              event.preventDefault();
              voidSale.mutate();
            }}
          >
            {voidSale.isPending ? 'A anular...' : 'Anular venda'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default VoidSaleDialog;
