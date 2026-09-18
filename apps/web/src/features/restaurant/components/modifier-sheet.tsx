import { useEffect, useMemo, useState } from 'react';
import { Check, Minus } from 'lucide-react';
import type { ModifierDto, ModifierGroupDto } from '@pos/shared';

import {
  Badge,
  Button,
  QuantityStepper,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@/components/ui';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

import { COURSES, courseLabel, type MenuItem } from './types';
import type { AddItemInput } from './use-order';

const GROUP_ORDER: Record<ModifierGroupDto['type'], number> = {
  required: 0,
  optional: 1,
  removal: 2,
};

const GROUP_HINTS: Record<ModifierGroupDto['type'], string> = {
  required: 'Obrigatorio',
  optional: 'Opcional',
  removal: 'Sem custo',
};

export interface ModifierSheetProps {
  item: MenuItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCourse: number;
  defaultSeat: number | null;
  guestCount: number;
  pending: boolean;
  onConfirm: (input: AddItemInput) => void;
}

/**
 * The tap-through for an item with options: required groups first, then the
 * paid extras, then the free removals. The running price is always on screen
 * because the waiter reads it back to the guest.
 */
export function ModifierSheet({
  item,
  open,
  onOpenChange,
  defaultCourse,
  defaultSeat,
  guestCount,
  pending,
  onConfirm,
}: ModifierSheetProps) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [course, setCourse] = useState(defaultCourse);
  const [seat, setSeat] = useState<number | null>(defaultSeat);
  const [note, setNote] = useState('');

  // A fresh sheet every time an item is opened - never inherit the last pick.
  useEffect(() => {
    if (!open || !item) return;
    setSelected({});
    setQuantity(1);
    setCourse(defaultCourse);
    setSeat(defaultSeat);
    setNote('');
  }, [open, item, defaultCourse, defaultSeat]);

  const groups = useMemo(() => {
    if (!item) return [];
    return [...item.modifierGroups].sort(
      (a, b) => GROUP_ORDER[a.type] - GROUP_ORDER[b.type] || a.sortOrder - b.sortOrder,
    );
  }, [item]);

  const chosen = (groupId: string): string[] => selected[groupId] ?? [];

  const toggle = (group: ModifierGroupDto, modifier: ModifierDto) => {
    setSelected((current) => {
      const list = current[group.id] ?? [];
      const already = list.includes(modifier.id);

      if (already) return { ...current, [group.id]: list.filter((id) => id !== modifier.id) };
      if (group.maxSelect <= 1) return { ...current, [group.id]: [modifier.id] };
      if (list.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...list, modifier.id] };
    });
  };

  const allChosen = useMemo(() => {
    const byId = new Map<string, ModifierDto>();
    for (const group of groups) for (const modifier of group.modifiers) byId.set(modifier.id, modifier);
    return Object.values(selected)
      .flat()
      .map((id) => byId.get(id))
      .filter((modifier): modifier is ModifierDto => Boolean(modifier));
  }, [groups, selected]);

  const unitPriceMinor =
    (item?.salePriceMinor ?? 0) + allChosen.reduce((sum, modifier) => sum + modifier.priceDeltaMinor, 0);
  const lineTotalMinor = Math.round(unitPriceMinor * quantity);

  const missing = groups.filter(
    (group) => group.type === 'required' && chosen(group.id).length < Math.max(1, group.minSelect),
  );
  const valid = missing.length === 0;

  const confirm = () => {
    if (!item || !valid) return;
    onConfirm({
      productId: item.id,
      quantity,
      course,
      seat,
      note: note.trim() ? note.trim() : null,
      modifiers: allChosen.map((modifier) => ({ modifierId: modifier.id })),
    });
  };

  const seats = Array.from({ length: Math.max(guestCount, 1) }, (_, index) => index + 1);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{item?.namePt ?? 'Opcoes'}</SheetTitle>
          <p className="tabular text-sm text-muted-foreground">{money(item?.salePriceMinor ?? 0)}</p>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {groups.map((group) => {
            const picked = chosen(group.id);
            const incomplete = group.type === 'required' && picked.length < Math.max(1, group.minSelect);

            return (
              <section key={group.id} className="space-y-2">
                <header className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-foreground">{group.namePt}</h3>
                  <Badge variant={incomplete ? 'warning' : 'muted'} size="sm">
                    {incomplete ? 'Escolha uma opcao' : GROUP_HINTS[group.type]}
                  </Badge>
                </header>

                <div className="grid gap-2 sm:grid-cols-2">
                  {group.modifiers.map((modifier) => {
                    const active = picked.includes(modifier.id);
                    const blocked = !modifier.available;
                    const label = group.type === 'removal' ? `sem ${modifier.namePt}` : modifier.namePt;

                    return (
                      <button
                        key={modifier.id}
                        type="button"
                        disabled={blocked}
                        onClick={() => toggle(group, modifier)}
                        className={cn(
                          'touch-target flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left',
                          'transition-colors focus-ring',
                          active
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-card text-foreground',
                          blocked && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              'flex size-5 shrink-0 items-center justify-center rounded-full border',
                              active ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                            )}
                            aria-hidden="true"
                          >
                            {active &&
                              (group.type === 'removal' ? (
                                <Minus className="size-3.5" />
                              ) : (
                                <Check className="size-3.5" />
                              ))}
                          </span>
                          <span className="truncate text-sm font-medium">{label}</span>
                        </span>
                        {modifier.priceDeltaMinor !== 0 && (
                          <span className="tabular shrink-0 text-sm text-muted-foreground">
                            {money(modifier.priceDeltaMinor, { signed: true })}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Prato</span>
              <Select value={String(course)} onValueChange={(value) => setCourse(Number(value))}>
                <SelectTrigger aria-label="Prato">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COURSES.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {courseLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Lugar</span>
              <Select
                value={seat === null ? 'none' : String(seat)}
                onValueChange={(value) => setSeat(value === 'none' ? null : Number(value))}
              >
                <SelectTrigger aria-label="Lugar">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem lugar</SelectItem>
                  {seats.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      Lugar {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Nota para a cozinha</span>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={240}
              rows={2}
              placeholder="Ex.: bem passado"
            />
          </section>

          <section className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-foreground">Quantidade</span>
            <QuantityStepper value={quantity} onChange={setQuantity} min={1} max={99} editable />
          </section>
        </SheetBody>

        <SheetFooter className="sm:justify-between">
          <div className="flex items-center justify-between gap-4 sm:justify-start">
            <span className="text-sm text-muted-foreground">Total do artigo</span>
            <span className="tabular text-lg font-semibold text-foreground">{money(lineTotalMinor)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={confirm} disabled={!valid} loading={pending} className="min-w-[10rem]">
              {valid ? 'Adicionar a conta' : missing[0]?.namePt ?? 'Escolha as opcoes'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default ModifierSheet;
