import type { OrderDto } from '@pos/shared';

import {
  Button,
  Label,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { amount } from '@/lib/format';

import type { Bill, SplitMode, SplitResponse } from './types';

const SPLIT_LABELS: Record<SplitMode, string> = {
  even: 'Igualmente',
  by_seat: 'Por lugar',
  by_item: 'Por artigo',
};

export interface SplitPanelProps {
  splitMode: SplitMode;
  setSplitMode: (mode: SplitMode) => void;
  people: number;
  setPeople: (value: number) => void;
  billCount: number;
  setBillCount: (value: number) => void;
  assignment: Record<string, number>;
  setAssignment: (next: Record<string, number>) => void;
  items: OrderDto['items'];
  split: SplitResponse | null;
  splitting: boolean;
  onCalculate: () => void;
  onPayBill: (bill: Bill) => void;
  remaining: number;
}

export function SplitPanel({
  splitMode,
  setSplitMode,
  people,
  setPeople,
  billCount,
  setBillCount,
  assignment,
  setAssignment,
  items,
  split,
  splitting,
  onCalculate,
  onPayBill,
  remaining,
}: SplitPanelProps) {
  const groups = Array.from({ length: Math.max(2, billCount) }, (_, index) => index);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(SPLIT_LABELS) as SplitMode[]).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={splitMode === value ? 'secondary' : 'outline'}
            onClick={() => setSplitMode(value)}
          >
            {SPLIT_LABELS[value]}
          </Button>
        ))}
      </div>

      {splitMode === 'even' && (
        <div className="space-y-1.5">
          <Label htmlFor="pessoas">Quantas pessoas</Label>
          <NumericInput
            id="pessoas"
            value={people}
            decimals={0}
            min={1}
            max={50}
            onValueChange={setPeople}
          />
        </div>
      )}

      {splitMode === 'by_item' && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="contas">Quantas contas</Label>
            <NumericInput
              id="contas"
              value={billCount}
              decimals={0}
              min={2}
              max={20}
              onValueChange={setBillCount}
            />
          </div>
          <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                <Select
                  value={String(assignment[item.id] ?? 0)}
                  onValueChange={(value) =>
                    setAssignment({ ...assignment, [item.id]: Number(value) })
                  }
                >
                  <SelectTrigger aria-label={`Conta de ${item.name}`} className="h-11 w-[7.5rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((index) => (
                      <SelectItem key={index} value={String(index)}>
                        Conta {index + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button variant="outline" block loading={splitting} onClick={onCalculate}>
        Calcular divisao
      </Button>

      {split && (
        <ul className="space-y-2">
          {split.bills.map((bill, index) => (
            <li
              key={`${bill.label}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{bill.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {bill.lines.length} {bill.lines.length === 1 ? 'artigo' : 'artigos'}
                </span>
              </span>
              <span className="tabular text-sm font-semibold">{amount(bill.totalMinor)}</span>
              <Button size="sm" variant="outline" disabled={remaining <= 0} onClick={() => onPayBill(bill)}>
                Registar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default SplitPanel;
