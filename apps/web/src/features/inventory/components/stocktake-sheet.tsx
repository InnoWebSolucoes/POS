import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, CloudOff, Eye, EyeOff, Loader2, ScanLine, X } from 'lucide-react';
import { FRACTIONAL_UNITS } from '@pos/shared';

import {
  Badge,
  Button,
  NumericInput,
  Progress,
  SearchInput,
  SwitchField,
  toast,
} from '@/components/ui';
import { useScanner } from '@/hooks/use-scanner';
import { api } from '@/lib/api';
import { number as formatNumber, quantity as formatQuantity } from '@/lib/format';
import { beep, errorBeep } from '@/lib/sound';
import { cn } from '@/lib/utils';
import type { StockTakeDto, StockTakeLineDto } from '../types';

interface LinesPayload {
  lines: Array<{ id: string; countedQuantity: number | null }>;
}

export interface StockTakeSheetProps {
  stockTake: StockTakeDto;
  onSaved: (updated: StockTakeDto) => void;
  onReview: () => void;
}

/**
 * The count sheet.
 *
 * The expected quantity is hidden by default - showing it biases the count -
 * and a scan jumps straight to the matching line, which is how this is done
 * with a tablet in one hand and a scanner in the other.
 */
export function StockTakeSheet({ stockTake, onSaved, onReview }: StockTakeSheetProps) {
  const [counts, setCounts] = React.useState<Record<string, number | null>>({});
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({});
  const [showExpected, setShowExpected] = React.useState(false);
  const [onlyPending, setOnlyPending] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [focusedId, setFocusedId] = React.useState<string | null>(null);

  const inputs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const pending = React.useRef<Map<string, number | null>>(new Map());
  const timer = React.useRef<number | null>(null);

  // Seed the local counts from the server, keeping anything typed since.
  React.useEffect(() => {
    setCounts((current) => {
      const next: Record<string, number | null> = { ...current };
      for (const line of stockTake.lines) {
        if (!(line.id in next)) next[line.id] = line.countedQuantity;
      }
      return next;
    });
  }, [stockTake.lines]);

  const save = useMutation({
    mutationFn: (payload: LinesPayload) =>
      api.patch<StockTakeDto>(`/api/inventory/stocktakes/${stockTake.id}/lines`, payload),
    onSuccess: (updated) => onSaved(updated),
    onError: () => toast.error('Contagem nao guardada', 'Verifique a ligacao; a contagem continua no ecra.'),
  });

  const mutate = save.mutate;

  const flush = React.useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current.size === 0) return;
    const lines = [...pending.current.entries()].map(([id, countedQuantity]) => ({ id, countedQuantity }));
    pending.current.clear();
    mutate({ lines });
  }, [mutate]);

  const queueSave = React.useCallback(
    (id: string, value: number | null) => {
      pending.current.set(id, value);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        const lines = [...pending.current.entries()].map(([lineId, countedQuantity]) => ({
          id: lineId,
          countedQuantity,
        }));
        pending.current.clear();
        if (lines.length) mutate({ lines });
      }, 900);
    },
    [mutate],
  );

  // Never walk away with an unsaved count sitting in the debounce timer. The
  // ref keeps this an unmount-only effect, whatever re-renders in between.
  const flushRef = React.useRef(flush);
  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  React.useEffect(() => () => flushRef.current(), []);

  const setCount = (line: StockTakeLineDto, value: number | null) => {
    setCounts((current) => ({ ...current, [line.id]: value }));
    queueSave(line.id, value);
  };

  const jumpTo = React.useCallback((line: StockTakeLineDto) => {
    setFocusedId(line.id);
    const input = inputs.current[line.id];
    if (input) {
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      input.focus();
      input.select();
    }
  }, []);

  useScanner({
    onScan: (code) => {
      const needle = code.trim().toUpperCase();
      const match = stockTake.lines.find(
        (line) => (line.barcode ?? '').toUpperCase() === needle || line.sku.toUpperCase() === needle,
      );
      if (!match) {
        errorBeep();
        toast.error('Artigo fora deste inventario', `O codigo ${code} nao consta da folha de contagem.`);
        return;
      }
      beep();
      setSearch('');
      setOnlyPending(false);
      window.setTimeout(() => jumpTo(match), 0);
    },
  });

  const visible = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return stockTake.lines.filter((line) => {
      if (onlyPending && counts[line.id] !== null && counts[line.id] !== undefined) return false;
      if (!needle) return true;
      return (
        line.productName.toLowerCase().includes(needle) ||
        line.sku.toLowerCase().includes(needle) ||
        (line.barcode ?? '').toLowerCase().includes(needle)
      );
    });
  }, [stockTake.lines, search, onlyPending, counts]);

  const countedCount = stockTake.lines.filter(
    (line) => counts[line.id] !== null && counts[line.id] !== undefined,
  ).length;
  const progress = stockTake.lineCount > 0 ? (countedCount / stockTake.lineCount) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              Contados <span className="tabular font-semibold text-foreground">{formatNumber(countedCount)}</span> de{' '}
              <span className="tabular">{formatNumber(stockTake.lineCount)}</span> artigos
            </p>
            <Progress value={progress} className="mt-2 w-64" tone={progress === 100 ? 'success' : 'primary'} />
          </div>
          <div className="flex items-center gap-3">
            <SaveIndicator pending={save.isPending} failed={save.isError} />
            <Button size="lg" onClick={() => {
              flush();
              onReview();
            }}>
              Rever diferencas
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Filtrar a folha de contagem..."
            className="min-w-[14rem] flex-1"
          />
          <SwitchField
            label="Mostrar quantidade esperada"
            checked={showExpected}
            onCheckedChange={setShowExpected}
            className="w-auto gap-3"
          />
          <SwitchField
            label="Apenas por contar"
            checked={onlyPending}
            onCheckedChange={setOnlyPending}
            className="w-auto gap-3"
          />
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ScanLine className="size-4" aria-hidden="true" />
          Digitalize um codigo de barras para saltar directamente para esse artigo.
        </p>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {visible.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">Sem artigos para mostrar com este filtro.</li>
        )}
        {visible.map((line) => {
          const value = counts[line.id] ?? null;
          const reveal = showExpected || revealed[line.id] === true;
          const decimals = FRACTIONAL_UNITS.includes(line.unit) ? 3 : 0;

          return (
            <li
              key={line.id}
              className={cn(
                'grid grid-cols-1 items-center gap-3 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,10rem)_minmax(0,12rem)]',
                focusedId === line.id && 'bg-accent',
              )}
            >
              <div className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {line.productName}
                  {line.variantName ? ` - ${line.variantName}` : ''}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {line.sku}
                  {line.barcode ? ` - ${line.barcode}` : ''}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {reveal ? (
                  <span className="tabular text-sm text-muted-foreground">
                    Esperado {formatQuantity(line.expectedQuantity, line.unit)}
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Eye className="size-4" />}
                    onClick={() => setRevealed((current) => ({ ...current, [line.id]: true }))}
                  >
                    Ver esperado
                  </Button>
                )}
                {reveal && !showExpected && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Esconder quantidade esperada"
                    onClick={() => setRevealed((current) => ({ ...current, [line.id]: false }))}
                  >
                    <EyeOff className="size-4" />
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <NumericInput
                  ref={(element) => {
                    inputs.current[line.id] = element;
                  }}
                  value={value}
                  decimals={decimals}
                  min={0}
                  aria-label={`Quantidade contada de ${line.productName}`}
                  placeholder="Por contar"
                  className="h-14 text-lg"
                  onFocus={() => setFocusedId(line.id)}
                  onValueChange={(next) => setCount(line, next)}
                  // An empty field means "por contar", not a counted zero - the
                  // numeric input parses blank as 0, so put the null back.
                  onBlur={(event) => {
                    if (event.currentTarget.value.trim() === '') setCount(line, null);
                  }}
                />
                {value !== null && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Limpar contagem de ${line.productName}`}
                    onClick={() => setCount(line, null)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SaveIndicator({ pending, failed }: { pending: boolean; failed: boolean }) {
  if (failed) {
    return (
      <Badge variant="destructive" size="lg">
        <CloudOff className="size-4" aria-hidden="true" /> Por guardar
      </Badge>
    );
  }
  if (pending) {
    return (
      <Badge variant="muted" size="lg">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> A guardar...
      </Badge>
    );
  }
  return (
    <Badge variant="success" size="lg">
      <Check className="size-4" aria-hidden="true" /> Guardado
    </Badge>
  );
}

export default StockTakeSheet;
