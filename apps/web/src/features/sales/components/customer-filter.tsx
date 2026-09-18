import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, UserRound } from 'lucide-react';
import type { CustomerDto } from '@pos/shared';

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchInput,
  Skeleton,
} from '@/components/ui';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { cn } from '@/lib/utils';
import { useCustomerOptions } from '../sales-api';

export interface CustomerFilterProps {
  value: string | undefined;
  onChange: (customerId: string | undefined) => void;
}

/** A searchable picker - a tenant can have thousands of customers, not a list. */
export function CustomerFilter({ value, onChange }: CustomerFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useQuery({
    queryKey: qk.customer(value ?? 'none'),
    queryFn: () => api.get<CustomerDto>(`/api/customers/${value ?? ''}`),
    enabled: Boolean(value),
    staleTime: 5 * 60_000,
  });

  const options = useCustomerOptions(open, search);
  const label = value ? (selected.data?.name ?? 'Cliente seleccionado') : 'Todos os clientes';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-12 w-full justify-between font-normal sm:w-[13rem]"
          aria-label="Filtrar por cliente"
        >
          <span className="flex min-w-0 items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className={cn('truncate', !value && 'text-muted-foreground')}>{label}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-2" align="start">
        <SearchInput
          placeholder="Procurar cliente..."
          defaultValue={search}
          onSearch={setSearch}
          autoFocus
        />

        <ul className="mt-2 max-h-72 overflow-y-auto">
          <li>
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="flex min-h-touch w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted"
            >
              <span className="text-muted-foreground">Todos os clientes</span>
              {!value && <Check className="size-4" aria-hidden="true" />}
            </button>
          </li>

          {options.isLoading &&
            Array.from({ length: 4 }).map((_, index) => (
              <li key={`skeleton-${index}`} className="px-3 py-2.5">
                <Skeleton className="h-4 w-2/3" />
              </li>
            ))}

          {options.isError && (
            <li className="px-3 py-3 text-sm text-destructive">
              Nao foi possivel carregar os clientes.{' '}
              <button type="button" className="underline" onClick={() => void options.refetch()}>
                Tentar novamente
              </button>
            </li>
          )}

          {!options.isLoading && !options.isError && (options.data?.length ?? 0) === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">Sem resultados</li>
          )}

          {options.data?.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(customer.id);
                  setOpen(false);
                }}
                className="flex min-h-touch w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{customer.name}</span>
                  {customer.phone && (
                    <span className="block truncate text-xs text-muted-foreground tabular">
                      {customer.phone}
                    </span>
                  )}
                </span>
                {value === customer.id && <Check className="size-4 shrink-0" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export default CustomerFilter;
