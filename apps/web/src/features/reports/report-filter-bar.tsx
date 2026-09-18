import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import type { CategoryDto, LocationDto, SaleChannel } from '@pos/shared';

import {
  Button,
  DateRangePicker,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type DateRange,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { qk } from '@/lib/query';
import { cn } from '@/lib/utils';

import type { ReportFilterState } from './report-api';

/**
 * The filter bar the whole reporting hub shares. Every control is 44px+ and
 * every option list is gated on the permission that endpoint actually needs,
 * so a manager without `user:read` simply does not get the staff filter rather
 * than getting one that 403s.
 */

const ALL = '__all__';

interface StaffOption {
  id: string;
  name: string;
}

const CHANNEL_LABELS: Record<SaleChannel, string> = {
  pos: 'Caixa',
  restaurant: 'Restaurante',
  online: 'Loja online',
};

export interface ReportFilterBarProps {
  value: ReportFilterState;
  onChange: (next: ReportFilterState) => void;
  /** Hides the controls a screen does not use (the P&L has no staff filter). */
  show?: Array<'location' | 'staff' | 'category' | 'channel'>;
  className?: string;
}

export function ReportFilterBar({
  value,
  onChange,
  show = ['location', 'staff', 'category', 'channel'],
  className,
}: ReportFilterBarProps) {
  const can = useAuth((state) => state.can);
  const entity = useAuth((state) => state.entity);
  const entityId = entity?.id ?? null;

  const locations = useQuery({
    queryKey: qk.entity(`${entityId ?? 'none'}:locations`),
    queryFn: () => api.get<LocationDto[]>(`/api/entities/${entityId}/locations`, { active: true }),
    enabled: Boolean(entityId) && can('entity:read') && show.includes('location'),
    staleTime: 5 * 60_000,
  });

  const staff = useQuery({
    queryKey: qk.users({ scope: 'report-filter' }),
    queryFn: async () => {
      const response = await api.get<{ data: StaffOption[] }>('/api/users', {
        pageSize: 200,
        active: true,
        sort: 'name',
      });
      return response.data;
    },
    enabled: can('user:read') && show.includes('staff'),
    staleTime: 5 * 60_000,
  });

  const categories = useQuery({
    queryKey: qk.categories({ scope: 'report-filter' }),
    queryFn: async () => {
      const response = await api.get<{ data: CategoryDto[] }>('/api/categories', {});
      return response.data;
    },
    enabled: can('product:read') && show.includes('category'),
    staleTime: 5 * 60_000,
  });

  const set = (patch: Partial<ReportFilterState>) => onChange({ ...value, ...patch });
  const pick = (raw: string): string | undefined => (raw === ALL ? undefined : raw);

  const hasExtraFilter = Boolean(
    value.locationId || value.userId || value.categoryId || value.channel,
  );

  return (
    <div className={cn('panel flex flex-wrap items-end gap-3 p-4', className)}>
      <DateRangePicker
        value={value.range}
        onChange={(range: DateRange) => set({ range })}
        withLabels
      />

      {show.includes('location') && can('entity:read') && (
        <FilterSelect
          label="Local"
          value={value.locationId}
          onChange={(next) => set({ locationId: pick(next) })}
          loading={locations.isLoading}
          options={(locations.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
          allLabel="Todos os locais"
        />
      )}

      {show.includes('staff') && can('user:read') && (
        <FilterSelect
          label="Funcionario"
          value={value.userId}
          onChange={(next) => set({ userId: pick(next) })}
          loading={staff.isLoading}
          options={(staff.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
          allLabel="Todos"
        />
      )}

      {show.includes('category') && can('product:read') && (
        <FilterSelect
          label="Categoria"
          value={value.categoryId}
          onChange={(next) => set({ categoryId: pick(next) })}
          loading={categories.isLoading}
          options={(categories.data ?? []).map((row) => ({ value: row.id, label: row.namePt }))}
          allLabel="Todas"
        />
      )}

      {show.includes('channel') && (
        <FilterSelect
          label="Canal"
          value={value.channel}
          onChange={(next) => set({ channel: pick(next) as SaleChannel | undefined })}
          options={(Object.keys(CHANNEL_LABELS) as SaleChannel[]).map((channel) => ({
            value: channel,
            label: CHANNEL_LABELS[channel],
          }))}
          allLabel="Todos"
        />
      )}

      {hasExtraFilter && (
        <Button
          variant="ghost"
          onClick={() =>
            onChange({
              range: value.range,
              locationId: undefined,
              userId: undefined,
              categoryId: undefined,
              channel: undefined,
            })
          }
          leftIcon={<RotateCcw />}
        >
          Limpar filtros
        </Button>
      )}
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string | undefined;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
  loading?: boolean;
}

function FilterSelect({ label, value, onChange, options, allLabel, loading }: FilterSelectProps) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label size="sm" htmlFor={id}>
        {label}
      </Label>
      <Select value={value ?? ALL} onValueChange={onChange} disabled={loading}>
        <SelectTrigger id={id} className="w-[11rem]" aria-label={label}>
          <SelectValue placeholder={loading ? 'A carregar...' : allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default ReportFilterBar;
