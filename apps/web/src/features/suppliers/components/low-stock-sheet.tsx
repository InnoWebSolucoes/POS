import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, PackageCheck, Sparkles } from 'lucide-react';

import {
  Button,
  EmptyState,
  Label,
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
  Skeleton,
  toast,
} from '@/components/ui';
import { money, number } from '@/lib/format';
import { qk } from '@/lib/query';

import { listSuppliers, purchaseOrdersFromLowStock, purchaseOrdersRoot, suppliersRoot } from '../api';
import type { LowStockResult, PurchaseOrderDto } from '../types';

interface LowStockSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens one of the generated drafts so it can be edited before sending. */
  onOpenOrder: (order: PurchaseOrderDto) => void;
}

const ALL = 'all';

export function LowStockSheet({ open, onOpenChange, onOpenOrder }: LowStockSheetProps) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = React.useState<string>(ALL);
  const [result, setResult] = React.useState<LowStockResult | null>(null);

  React.useEffect(() => {
    if (open) setResult(null);
  }, [open]);

  const suppliersQuery = useQuery({
    queryKey: qk.suppliers({ options: true }),
    queryFn: () => listSuppliers({ page: 1, pageSize: 200, active: true }),
    enabled: open,
  });

  const generate = useMutation({
    mutationFn: () => purchaseOrdersFromLowStock(supplierId === ALL ? null : supplierId),
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: purchaseOrdersRoot });
      void queryClient.invalidateQueries({ queryKey: suppliersRoot });
      if (data.orders.length > 0) {
        toast.success(
          `${data.orders.length} rascunho(s) gerado(s)`,
          'Reveja as quantidades antes de enviar.',
        );
      }
    },
    onError: (error: Error) => toast.error('Nao foi possivel gerar', error.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Gerar a partir de stock baixo</SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Cria um rascunho por fornecedor com tudo o que esta no minimo ou abaixo dele. Nada e
            enviado automaticamente - os rascunhos ficam a espera da sua revisao.
          </p>

          <div className="space-y-1.5">
            <Label>Fornecedor</Label>
            {suppliersQuery.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os fornecedores</SelectItem>
                  {(suppliersQuery.data?.data ?? []).map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {result && result.orders.length === 0 && (
            <EmptyState
              size="sm"
              icon={PackageCheck}
              title="Nada abaixo do minimo"
              description="Nenhum produto com fornecedor associado precisa de reposicao."
            />
          )}

          {result && result.orders.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Rascunhos criados</h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {result.orders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="tabular truncate text-sm font-medium text-foreground">
                        {order.reference}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {order.supplierName ?? '-'} - {number(order.lineCount)} linhas -{' '}
                        <span className="tabular">{money(order.totalCostMinor)}</span>
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => onOpenOrder(order)}>
                      Rever
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result && result.skipped.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="size-4 text-warning" />
                Ignorados ({result.skipped.length})
              </h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {result.skipped.map((item) => (
                  <li key={`${item.productId}:${item.variantId ?? ''}`} className="p-3">
                    <p className="truncate text-sm text-foreground">{item.name}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {item.sku} - {item.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={() => generate.mutate()} loading={generate.isPending}>
            <Sparkles /> {result ? 'Gerar novamente' : 'Gerar rascunhos'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
