import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';

import { Button, toast } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { qk } from '@/lib/query';
import { cn } from '@/lib/utils';

/**
 * Offers a brand new business a small example catalogue.
 *
 * A business the platform operator sets up arrives with shelves already
 * stocked, because the creation wizard offers exactly this. A business that
 * signed itself up at /registar used to arrive at an empty screen instead, with
 * nothing to press and no way to see what the product even looks like working.
 * Same product, two very different first days, for no reason other than which
 * door the client came through. This closes that.
 *
 * It is a genuine shortcut rather than a demo mode: real categories, real
 * products with real prices, and for a restaurant a real dining room. Everything
 * it creates can be edited or deleted like anything else, so nobody has to unpick
 * a special case later. The server refuses once the business has products of its
 * own, so this can never overwrite real work.
 */

interface StarterSummary {
  categories: number;
  products: number;
  tables: number;
}

/** "12 produtos, 4 categorias e 8 mesas" - only the parts that are not zero. */
function describe(summary: StarterSummary): string {
  const parts: string[] = [];
  if (summary.products > 0) parts.push(`${summary.products} produtos`);
  if (summary.categories > 0) parts.push(`${summary.categories} categorias`);
  if (summary.tables > 0) parts.push(`${summary.tables} mesas`);
  if (parts.length === 0) return 'Tudo pronto.';
  if (parts.length === 1) return `Criámos ${parts[0]}.`;
  return `Criámos ${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}.`;
}

export interface StarterOfferProps {
  className?: string;
}

export function StarterOffer({ className }: StarterOfferProps) {
  const entity = useAuth((state) => state.entity);
  const can = useAuth((state) => state.can);
  const queryClient = useQueryClient();

  const entityId = entity?.id ?? null;
  const isRestaurant = entity?.mode === 'restaurant';

  const seed = useMutation({
    mutationFn: () =>
      api.post<StarterSummary>(`/api/entities/${entityId ?? ''}/starter-content`),
    onSuccess: (summary) => {
      // Everything the checklist reads has just changed underneath it.
      void queryClient.invalidateQueries({ queryKey: qk.products() });
      void queryClient.invalidateQueries({ queryKey: qk.categories() });
      void queryClient.invalidateQueries({ queryKey: qk.floorAreas() });
      toast.success('O seu catálogo de exemplo está pronto.', describe(summary));
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Não foi possível criar o catálogo de exemplo.';
      toast.error('Não foi possível criar o catálogo', message);
    },
  });

  // Creating the catalogue means creating products and categories, so anyone who
  // may not do that by hand is not offered a button that would only fail.
  if (!entityId || !can('product:write') || !can('category:write')) return null;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4',
        'sm:flex-row sm:items-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
      >
        <Sparkles className="size-5" />
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold text-foreground">
          Quer começar com um catálogo de exemplo?
        </p>
        <p className="text-sm leading-snug text-muted-foreground">
          {isRestaurant
            ? 'Criamos alguns pratos, bebidas e uma sala com mesas para experimentar já. Pode mudar ou apagar tudo depois.'
            : 'Criamos alguns produtos e categorias para experimentar já. Pode mudar ou apagar tudo depois.'}
        </p>
      </div>

      <Button
        onClick={() => seed.mutate()}
        disabled={seed.isPending}
        className="shrink-0 sm:w-auto"
      >
        {seed.isPending ? (
          <>
            <Loader2 className="animate-spin" />
            <span>A criar...</span>
          </>
        ) : (
          <>
            <Sparkles />
            <span>Criar exemplos</span>
          </>
        )}
      </Button>
    </div>
  );
}

export default StarterOffer;
