import { TABLE_STATUSES, type RestaurantTableDto, type TableStatus } from '@pos/shared';

import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

import { statusColor, type AreaTotals } from './floor-utils';

export interface FloorLegendProps {
  tables: RestaurantTableDto[];
  labels: Record<TableStatus, string>;
  className?: string;
}

/** The colour key, doubling as a per-status count for the area. */
export function FloorLegend({ tables, labels, className }: FloorLegendProps) {
  const counts = TABLE_STATUSES.reduce<Record<TableStatus, number>>(
    (acc, status) => {
      acc[status] = tables.filter((table) => table.status === status).length;
      return acc;
    },
    { available: 0, occupied: 0, attention: 0, reserved: 0, dirty: 0 },
  );

  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {TABLE_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            aria-hidden
            className="size-3.5 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: statusColor(status) }}
          />
          <span className="font-medium text-foreground">{labels[status]}</span>
          <span className="tabular">{counts[status]}</span>
        </li>
      ))}
    </ul>
  );
}

export interface FloorSummaryProps {
  totals: AreaTotals;
  className?: string;
}

/** Mesas livres / ocupadas / total em curso, sized for a glance across a room. */
export function FloorSummary({ totals, className }: FloorSummaryProps) {
  const items: Array<{ label: string; value: string; accent?: string }> = [
    { label: 'Livres', value: String(totals.free), accent: statusColor('available') },
    { label: 'Ocupadas', value: String(totals.occupied), accent: statusColor('occupied') },
    { label: 'Mesas', value: String(totals.total) },
    { label: 'Total em curso', value: money(totals.openTotalMinor) },
  ];

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-h-touch flex-col justify-center rounded-xl border border-border bg-card px-4 py-1.5"
        >
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </span>
          <span className="tabular text-lg font-bold leading-tight" style={item.accent ? { color: item.accent } : undefined}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default FloorLegend;
