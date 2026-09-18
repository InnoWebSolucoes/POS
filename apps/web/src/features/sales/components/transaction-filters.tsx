import { FilterX } from 'lucide-react';
import {
  PAYMENT_METHODS,
  SALE_CHANNELS,
  type PaymentMethod,
  type SaleChannel,
  type SaleStatus,
} from '@pos/shared';

import {
  Button,
  DateRangePicker,
  Label,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type DateRange,
} from '@/components/ui';
import { CustomerFilter } from './customer-filter';
import { channelLabel, paymentMethodLabel, statusLabel, type UiLang } from '../labels';
import type { CashierOption, SalesFilters } from '../types';

/** Radix refuses an empty option value, so "everything" travels as a sentinel. */
const ALL = '__all__';

/** Parked carts and drafts never reach this screen, so they are not offered. */
const FILTERABLE_STATUSES: SaleStatus[] = [
  'completed',
  'refunded',
  'partially_refunded',
  'voided',
  'held',
];

export interface TransactionFiltersProps {
  filters: SalesFilters;
  lang: UiLang;
  cashiers: CashierOption[];
  showCashierFilter: boolean;
  showCustomerFilter: boolean;
  hasActiveFilters: boolean;
  /** Bumped when the filters are cleared, to reset the uncontrolled search box. */
  resetKey: number;
  onChange: (patch: Partial<SalesFilters>) => void;
  onClear: () => void;
}

export function TransactionFilters({
  filters,
  lang,
  cashiers,
  showCashierFilter,
  showCustomerFilter,
  hasActiveFilters,
  resetKey,
  onChange,
  onClear,
}: TransactionFiltersProps) {
  const range: DateRange = { from: filters.from, to: filters.to };

  return (
    <section aria-label="Filtros" className="panel flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <DateRangePicker
          value={range}
          withLabels
          onChange={(next) => onChange({ from: next.from, to: next.to })}
        />

        <div className="flex flex-col gap-1.5 lg:w-[22rem]">
          <Label size="sm" htmlFor="filtro-recibo">
            Numero do recibo
          </Label>
          <SearchInput
            key={resetKey}
            id="filtro-recibo"
            placeholder="Ex: FR2026/000123"
            defaultValue={filters.search ?? ''}
            onSearch={(value) => onChange({ search: value || undefined })}
            className="tabular"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {showCashierFilter && (
          <div className="flex flex-col gap-1.5">
            <Label size="sm">Operador</Label>
            <Select
              value={filters.cashierId ?? ALL}
              onValueChange={(value) => onChange({ cashierId: value === ALL ? undefined : value })}
            >
              <SelectTrigger aria-label="Filtrar por operador">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os operadores</SelectItem>
                {cashiers.map((cashier) => (
                  <SelectItem key={cashier.id} value={cashier.id}>
                    {cashier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showCustomerFilter && (
          <div className="flex flex-col gap-1.5">
            <Label size="sm">Cliente</Label>
            <CustomerFilter
              value={filters.customerId}
              onChange={(customerId) => onChange({ customerId })}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label size="sm">Canal</Label>
          <Select
            value={filters.channel ?? ALL}
            onValueChange={(value) =>
              onChange({ channel: value === ALL ? undefined : (value as SaleChannel) })
            }
          >
            <SelectTrigger aria-label="Filtrar por canal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os canais</SelectItem>
              {SALE_CHANNELS.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {channelLabel(channel, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label size="sm">Estado</Label>
          <Select
            value={filters.status ?? ALL}
            onValueChange={(value) =>
              onChange({ status: value === ALL ? undefined : (value as SaleStatus) })
            }
          >
            <SelectTrigger aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os estados</SelectItem>
              {FILTERABLE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabel(status, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label size="sm">Pagamento</Label>
          <Select
            value={filters.paymentMethod ?? ALL}
            onValueChange={(value) =>
              onChange({ paymentMethod: value === ALL ? undefined : (value as PaymentMethod) })
            }
          >
            <SelectTrigger aria-label="Filtrar por metodo de pagamento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os metodos</SelectItem>
              {PAYMENT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {paymentMethodLabel(method, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end">
          <Button
            variant="ghost"
            block
            disabled={!hasActiveFilters}
            onClick={onClear}
            leftIcon={<FilterX />}
          >
            Limpar filtros
          </Button>
        </div>
      </div>
    </section>
  );
}

export default TransactionFilters;
