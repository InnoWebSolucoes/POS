import * as React from 'react';
import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns';

import { cn } from '@/lib/utils';
import { inputClassName } from './input';
import { Label } from './label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

/** Both ends inclusive, ISO yyyy-MM-dd - what the reports API expects. */
export interface DateRange {
  from: string;
  to: string;
}

export type DateRangePreset = 'hoje' | 'ontem' | 'semana' | 'mes' | 'ano' | 'personalizado';

export const DATE_RANGE_PRESETS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mes' },
  { value: 'ano', label: 'Este ano' },
  { value: 'personalizado', label: 'Personalizado' },
];

const iso = (date: Date): string => format(date, 'yyyy-MM-dd');

export function rangeForPreset(preset: DateRangePreset, today = new Date()): DateRange {
  switch (preset) {
    case 'ontem': {
      const yesterday = subDays(today, 1);
      return { from: iso(yesterday), to: iso(yesterday) };
    }
    case 'semana':
      // Weeks start on Monday here, like every Angolan roster.
      return {
        from: iso(startOfWeek(today, { weekStartsOn: 1 })),
        to: iso(endOfWeek(today, { weekStartsOn: 1 })),
      };
    case 'mes':
      return { from: iso(startOfMonth(today)), to: iso(endOfMonth(today)) };
    case 'ano':
      return { from: iso(startOfYear(today)), to: iso(endOfYear(today)) };
    case 'personalizado':
    case 'hoje':
    default:
      return { from: iso(today), to: iso(today) };
  }
}

/** Works out which preset a range corresponds to, if any. */
export function presetForRange(range: DateRange, today = new Date()): DateRangePreset {
  for (const { value } of DATE_RANGE_PRESETS) {
    if (value === 'personalizado') continue;
    const candidate = rangeForPreset(value, today);
    if (candidate.from === range.from && candidate.to === range.to) return value;
  }
  return 'personalizado';
}

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange, preset: DateRangePreset) => void;
  /** Controlled preset; otherwise it is derived from the range. */
  preset?: DateRangePreset;
  presets?: Array<{ value: DateRangePreset; label: string }>;
  /** Shows "De"/"Ate" captions above the fields. */
  withLabels?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * The reports header: a preset list for the nine cases out of ten, and two
 * native date inputs for the tenth - the OS pickers are the ones people know.
 */
export function DateRangePicker({
  value,
  onChange,
  preset,
  presets = DATE_RANGE_PRESETS,
  withLabels = false,
  disabled = false,
  className,
}: DateRangePickerProps) {
  const fromId = React.useId();
  const toId = React.useId();
  const active = preset ?? presetForRange(value);

  const selectPreset = (next: DateRangePreset) => {
    if (next === 'personalizado') {
      onChange(value, next);
      return;
    }
    onChange(rangeForPreset(next), next);
  };

  const setEdge = (edge: 'from' | 'to', raw: string) => {
    if (!raw) return;
    const next: DateRange =
      edge === 'from'
        ? { from: raw, to: raw > value.to ? raw : value.to }
        : { from: raw < value.from ? raw : value.from, to: raw };
    onChange(next, presetForRange(next));
  };

  const fieldClass = cn(inputClassName, 'w-auto min-w-[9.5rem] tabular');

  return (
    <div className={cn('flex flex-wrap items-end gap-2', className)}>
      <div className="flex flex-col gap-1.5">
        {withLabels && <Label size="sm">Periodo</Label>}
        <Select value={active} onValueChange={(next) => selectPreset(next as DateRangePreset)} disabled={disabled}>
          <SelectTrigger className="w-[11rem]" aria-label="Periodo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        {withLabels && (
          <Label size="sm" htmlFor={fromId}>
            De
          </Label>
        )}
        <input
          id={fromId}
          type="date"
          value={value.from}
          max={value.to}
          disabled={disabled}
          aria-label="Data inicial"
          onChange={(event) => setEdge('from', event.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        {withLabels && (
          <Label size="sm" htmlFor={toId}>
            Ate
          </Label>
        )}
        <input
          id={toId}
          type="date"
          value={value.to}
          min={value.from}
          disabled={disabled}
          aria-label="Data final"
          onChange={(event) => setEdge('to', event.target.value)}
          className={fieldClass}
        />
      </div>
    </div>
  );
}

export default DateRangePicker;
