import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PauseCircle, RefreshCw, Trash2 } from 'lucide-react';
import type { HeldSaleDto, SaleDto } from '@pos/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { formatTime, money } from '@/lib/format';
import { qk } from '@/lib/query';

/* -------------------------------------------------------------------------- */
/* Suspender                                                                   */
/* -------------------------------------------------------------------------- */

export interface HoldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onConfirm: (label: string) => void;
}

export function HoldDialog({ open, onOpenChange, saving, onConfirm }: HoldDialogProps) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (open) setLabel(`Cliente ${formatTime(new Date())}`);
  }, [open]);

  const trimmed = label.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('pos.hold', 'Suspender')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <Label htmlFor="pos-hold-label">Etiqueta</Label>
          <Input
            id="pos-hold-label"
            value={label}
            maxLength={120}
            autoFocus
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && trimmed) onConfirm(trimmed);
            }}
            placeholder="Ex.: Senhora do casaco azul"
          />
          <p className="text-sm text-muted-foreground">
            A venda fica guardada e pode ser recuperada em qualquer caixa.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancelar')}
          </Button>
          <Button disabled={!trimmed} loading={saving} onClick={() => onConfirm(trimmed)}>
            {t('pos.hold', 'Suspender')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Recuperar                                                                   */
/* -------------------------------------------------------------------------- */

export interface RecallSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoaded: (sale: SaleDto) => void;
}

export function RecallSheet({ open, onOpenChange, onLoaded }: RecallSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const held = useQuery({
    queryKey: qk.heldSales(),
    queryFn: () => api.get<HeldSaleDto[]>('/api/sales/held'),
    enabled: open,
    staleTime: 0,
  });

  const recall = useMutation({
    mutationFn: async (id: string) => {
      const sale = await api.get<SaleDto>(`/api/sales/held/${id}`);
      // The cart now owns these lines; leaving the parked row behind would let
      // the same basket be recalled twice at another till.
      await api.delete(`/api/sales/held/${id}`);
      return sale;
    },
    onSuccess: (sale) => {
      void queryClient.invalidateQueries({ queryKey: qk.heldSales() });
      onLoaded(sale);
      onOpenChange(false);
    },
    onError: (error) => toast.error('Nao foi possivel recuperar', (error as Error).message),
  });

  const discard = useMutation({
    mutationFn: (id: string) => api.delete(`/api/sales/held/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.heldSales() });
      toast.success('Venda suspensa eliminada');
    },
    onError: (error) => toast.error('Nao foi possivel eliminar', (error as Error).message),
  });

  const rows = held.data ?? [];
  const busy = recall.isPending || discard.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="default">
        <SheetHeader>
          <SheetTitle>{t('pos.heldSales', 'Vendas Suspensas')}</SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-2">
          {held.isPending ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-xl" />)
          ) : held.isError ? (
            <EmptyState
              icon={RefreshCw}
              title={t('common.error', 'Ocorreu um erro')}
              description={held.error instanceof Error ? held.error.message : 'Erro desconhecido.'}
              action={{
                label: t('common.retry', 'Tentar novamente'),
                onClick: () => void held.refetch(),
                icon: RefreshCw,
              }}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={PauseCircle}
              size="sm"
              title="Sem vendas suspensas"
              description="Use Suspender para guardar um carrinho e atender outro cliente."
            />
          ) : (
            rows.map((row) => (
              <div key={row.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => recall.mutate(row.id)}
                  className="min-h-touch flex-1 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted active:scale-[0.99] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 break-words text-base font-semibold text-foreground">{row.label}</span>
                    <span className="tabular shrink-0 text-base font-bold text-foreground">
                      {money(row.totalMinor)}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {formatTime(row.createdAt)} - {row.lineCount === 1 ? '1 linha' : `${row.lineCount} linhas`}
                    {row.customerName ? ` - ${row.customerName}` : ''}
                  </span>
                </button>
                <Button
                  variant="outline"
                  size="icon-lg"
                  disabled={busy}
                  aria-label={`Eliminar ${row.label}`}
                  onClick={() => discard.mutate(row.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
