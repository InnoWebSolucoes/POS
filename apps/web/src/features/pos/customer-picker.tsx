import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserRound, X } from 'lucide-react';
import type { CustomerDto, VipTier } from '@pos/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatPhone, number } from '@/lib/format';
import { qk } from '@/lib/query';

const TIER_LABELS: Record<VipTier, string> = {
  none: 'Sem nivel',
  bronze: 'Bronze',
  silver: 'Prata',
  gold: 'Ouro',
};

interface LookupResponse {
  data: CustomerDto[];
  match: string;
  query: string;
}

export interface CustomerPickerProps {
  customer: CustomerDto | null;
  onChange: (customer: CustomerDto | null) => void;
}

/** Scan a loyalty card or type a phone number; points and tier come with it. */
export function CustomerPicker({ customer, onChange }: CustomerPickerProps) {
  const [term, setTerm] = useState('');
  const query = term.trim();

  const results = useQuery({
    queryKey: qk.customers({ lookup: query }),
    queryFn: () => api.get<LookupResponse>('/api/customers/lookup', { q: query, limit: 6 }),
    enabled: query.length >= 2 && !customer,
    staleTime: 30_000,
  });

  if (customer) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3">
        <div className="min-w-0">
          <p className="break-words text-base font-semibold text-foreground">{customer.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatPhone(customer.phone)} - {number(customer.points)} pontos
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {customer.tier !== 'none' && <Badge variant="warning">{TIER_LABELS[customer.tier]}</Badge>}
          <Button variant="ghost" size="icon" aria-label="Remover cliente" onClick={() => onChange(null)}>
            <X />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SearchInput
        onSearch={setTerm}
        delay={250}
        placeholder="Telefone, cartao ou nome do cliente"
        aria-label="Procurar cliente"
      />

      {query.length >= 2 && (
        <div className="space-y-1.5">
          {results.isPending ? (
            <Skeleton className="h-14 w-full rounded-lg" />
          ) : results.isError ? (
            <p className="text-sm text-destructive">Nao foi possivel procurar clientes.</p>
          ) : results.data && results.data.data.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserRound className="size-4" aria-hidden="true" />
              Sem resultados
            </p>
          ) : (
            (results.data?.data ?? []).map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onChange(row)}
                className="min-h-touch flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block break-words font-semibold text-foreground">{row.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {formatPhone(row.phone)} - {number(row.points)} pontos
                  </span>
                </span>
                {row.tier !== 'none' && (
                  <Badge variant="muted" size="sm">
                    {TIER_LABELS[row.tier]}
                  </Badge>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default CustomerPicker;
