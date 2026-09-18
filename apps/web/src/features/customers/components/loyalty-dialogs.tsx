import * as React from 'react';
import { Minus, Plus } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  MoneyInput,
  NumericInput,
  Textarea,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { money, number as formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useAdjustPoints, useMoveStoreCredit } from '../customer-queries';

const POINT_PRESETS = [10, 50, 100, 500];

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError) return cause.message;
  return 'Ocorreu um erro inesperado. Tente novamente.';
}

/* -------------------------------------------------------------------------- */
/* Points                                                                      */
/* -------------------------------------------------------------------------- */

export interface AdjustPointsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  currentPoints: number;
  /** What one point is worth, in minor units. */
  pointValueMinor: number;
}

/**
 * A manual points movement. The note is mandatory here even though the API
 * allows it to be empty: a hand-made balance change with no reason is the one
 * thing an audit can never explain later.
 */
export function AdjustPointsDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  currentPoints,
  pointValueMinor,
}: AdjustPointsDialogProps) {
  const [points, setPoints] = React.useState(0);
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const adjust = useAdjustPoints(customerId);

  React.useEffect(() => {
    if (!open) return;
    setPoints(0);
    setNote('');
    setTouched(false);
  }, [open]);

  const balanceAfter = currentPoints + points;
  const noteMissing = note.trim().length === 0;
  const invalid = points === 0 || noteMissing || balanceAfter < 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (invalid) return;

    adjust.mutate(
      { points, note: note.trim() },
      {
        onSuccess: (result) => {
          toast.success(
            'Pontos ajustados',
            `${customerName}: ${formatNumber(result.transaction.balanceAfter)} pontos`,
          );
          onOpenChange(false);
        },
        onError: (cause) => toast.error('Nao foi possivel ajustar', errorMessage(cause)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar pontos</DialogTitle>
          <DialogDescription>
            Saldo actual: {formatNumber(currentPoints)} pontos ({money(currentPoints * pointValueMinor)})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-points" required>
                Pontos a creditar ou debitar
              </Label>
              <NumericInput
                id="adjust-points"
                value={points}
                onValueChange={setPoints}
                decimals={0}
                min={-1_000_000}
                max={1_000_000}
                inputMode="numeric"
                aria-invalid={touched && (points === 0 || balanceAfter < 0)}
              />
              <p className="text-xs text-muted-foreground">
                Use um valor negativo para retirar pontos.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {POINT_PRESETS.map((preset) => (
                <Button
                  key={`plus-${preset}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPoints((prev) => prev + preset)}
                >
                  +{formatNumber(preset)}
                </Button>
              ))}
              {POINT_PRESETS.map((preset) => (
                <Button
                  key={`minus-${preset}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPoints((prev) => prev - preset)}
                >
                  -{formatNumber(preset)}
                </Button>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">Novo saldo</span>
              <span className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'tabular text-lg font-semibold',
                    balanceAfter < 0 ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {formatNumber(balanceAfter)} pontos
                </span>
                <span className="tabular text-sm text-muted-foreground">
                  {money(Math.max(0, balanceAfter) * pointValueMinor)}
                </span>
              </span>
            </div>

            {balanceAfter < 0 && (
              <p className="text-sm font-medium text-destructive">
                O saldo nao pode ficar negativo. Disponivel: {formatNumber(currentPoints)} pontos.
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-note" required>
                Motivo
              </Label>
              <Textarea
                id="adjust-note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Campanha de aniversario, correccao de venda..."
                aria-invalid={touched && noteMissing}
              />
              {touched && noteMissing && (
                <p className="text-sm font-medium text-destructive">
                  Indique o motivo do ajuste.
                </p>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={adjust.isPending} loadingLabel="A guardar...">
              Confirmar ajuste
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Store credit                                                                */
/* -------------------------------------------------------------------------- */

export interface StoreCreditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  currentMinor: number;
}

/** Adds or removes store credit. Money in and out is always in minor units. */
export function StoreCreditDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  currentMinor,
}: StoreCreditDialogProps) {
  const [mode, setMode] = React.useState<'add' | 'remove'>('add');
  const [amountMinor, setAmountMinor] = React.useState(0);
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const move = useMoveStoreCredit(customerId);

  React.useEffect(() => {
    if (!open) return;
    setMode('add');
    setAmountMinor(0);
    setNote('');
    setTouched(false);
  }, [open]);

  const signed = mode === 'add' ? amountMinor : -amountMinor;
  const balanceAfter = currentMinor + signed;
  const invalid = amountMinor <= 0 || balanceAfter < 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (invalid) return;

    move.mutate(
      { amountMinor: signed, note: note.trim() },
      {
        onSuccess: (result) => {
          toast.success(
            mode === 'add' ? 'Credito adicionado' : 'Credito removido',
            `${customerName}: ${money(result.storeCreditMinor)}`,
          );
          onOpenChange(false);
        },
        onError: (cause) => toast.error('Nao foi possivel actualizar', errorMessage(cause)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Credito de loja</DialogTitle>
          <DialogDescription>Saldo actual: {money(currentMinor)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="lg"
                variant={mode === 'add' ? 'default' : 'outline'}
                leftIcon={<Plus />}
                onClick={() => setMode('add')}
                aria-pressed={mode === 'add'}
              >
                Adicionar
              </Button>
              <Button
                type="button"
                size="lg"
                variant={mode === 'remove' ? 'destructive' : 'outline'}
                leftIcon={<Minus />}
                onClick={() => setMode('remove')}
                aria-pressed={mode === 'remove'}
              >
                Remover
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="credit-amount" required>
                Valor
              </Label>
              <MoneyInput
                id="credit-amount"
                value={amountMinor}
                onChange={setAmountMinor}
                inputSize="lg"
                aria-invalid={touched && invalid}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">Novo saldo</span>
              <span
                className={cn(
                  'tabular text-lg font-semibold',
                  balanceAfter < 0 ? 'text-destructive' : 'text-foreground',
                )}
              >
                {money(balanceAfter)}
              </span>
            </div>

            {balanceAfter < 0 && (
              <p className="text-sm font-medium text-destructive">
                Credito insuficiente. Disponivel: {money(currentMinor)}.
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="credit-note">Nota</Label>
              <Textarea
                id="credit-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Devolucao sem recibo, vale oferta..."
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={mode === 'remove' ? 'destructive' : 'default'}
              loading={move.isPending}
              loadingLabel="A guardar..."
            >
              {mode === 'add' ? 'Adicionar credito' : 'Remover credito'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
