import { useEffect, useState } from 'react';
import type { RestaurantTableDto } from '@pos/shared';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  QuantityStepper,
} from '@/components/ui';
import { cn } from '@/lib/utils';

const QUICK_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10];

export interface OpenTableDialogProps {
  table: RestaurantTableDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (guestCount: number) => void;
  pending: boolean;
}

/** "Quantas pessoas?" - the one question between a free table and a check. */
export function OpenTableDialog({ table, open, onOpenChange, onConfirm, pending }: OpenTableDialogProps) {
  const [guests, setGuests] = useState(2);

  useEffect(() => {
    if (open && table) setGuests(Math.min(Math.max(table.seats || 2, 1), 200));
  }, [open, table]);

  if (!table) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Abrir mesa {table.name}</DialogTitle>
          <DialogDescription>Quantas pessoas se sentam nesta mesa?</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-5">
          <div className="flex justify-center">
            <QuantityStepper value={guests} onChange={setGuests} min={1} max={200} step={1} size="lg" />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {QUICK_COUNTS.map((count) => (
              <Button
                key={count}
                type="button"
                variant={guests === count ? 'default' : 'outline'}
                size="lg"
                className={cn('tabular text-lg', guests === count && 'font-bold')}
                onClick={() => setGuests(count)}
              >
                {count}
              </Button>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground">
            {table.seats} lugares disponiveis nesta mesa.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button size="lg" loading={pending} loadingLabel="A abrir..." onClick={() => onConfirm(guests)}>
            Abrir conta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OpenTableDialog;
