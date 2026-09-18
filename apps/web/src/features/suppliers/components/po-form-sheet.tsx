import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import type { Unit } from '@pos/shared';

import {
  Button,
  Input,
  Label,
  MoneyInput,
  NumericInput,
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
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { money, quantity as formatQuantity } from '@/lib/format';
import { qk } from '@/lib/query';

import {
  createPurchaseOrder,
  listSuppliers,
  purchaseOrdersRoot,
  updatePurchaseOrder,
} from '../api';
import type { PoInput, ProductPick, PurchaseOrderDto } from '../types';
import { ProductPicker, lastCostMinor } from './product-picker';

interface DraftLine {
  productId: string;
  variantId: string | null;
  sku: string;
  name: string;
  unit: Unit;
  quantity: number;
  unitCostMinor: number;
}

interface PoFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A draft being edited; null creates a new order. */
  order: PurchaseOrderDto | null;
  defaultSupplierId?: string;
}

const lineTotal = (line: DraftLine) => Math.round(line.unitCostMinor * line.quantity);

export function PoFormSheet({ open, onOpenChange, order, defaultSupplierId }: PoFormSheetProps) {
  const queryClient = useQueryClient();

  const [supplierId, setSupplierId] = React.useState('');
  const [expectedDate, setExpectedDate] = React.useState('');
  const [note, setNote] = React.useState('');
  const [lines, setLines] = React.useState<DraftLine[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setSupplierId(order?.supplierId ?? defaultSupplierId ?? '');
    setExpectedDate(order?.expectedDate ? order.expectedDate.slice(0, 10) : '');
    setNote(order?.note ?? '');
    setLines(
      (order?.lines ?? []).map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        sku: line.variantSku ?? line.productSku,
        name: line.productName,
        unit: line.unit,
        quantity: line.quantity,
        unitCostMinor: line.unitCostMinor,
      })),
    );
  }, [open, order, defaultSupplierId]);

  const suppliersQuery = useQuery({
    queryKey: qk.suppliers({ options: true }),
    queryFn: () => listSuppliers({ page: 1, pageSize: 200, active: true }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (input: PoInput) =>
      order ? updatePurchaseOrder(order.id, input) : createPurchaseOrder(input),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: purchaseOrdersRoot });
      toast.success(order ? 'Encomenda actualizada' : 'Encomenda criada', saved.reference);
      onOpenChange(false);
    },
  });

  const error = mutation.error instanceof ApiRequestError ? mutation.error : null;
  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  const addProduct = (product: ProductPick) => {
    setLines((prev) =>
      prev.some((line) => line.productId === product.id)
        ? prev
        : [
            ...prev,
            {
              productId: product.id,
              variantId: null,
              sku: product.sku,
              name: product.namePt,
              unit: product.unit,
              quantity: 1,
              unitCostMinor: lastCostMinor(product),
            },
          ],
    );
  };

  const patchLine = (productId: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((line) => (line.productId === productId ? { ...line, ...patch } : line)));

  const submit = () => {
    if (!supplierId || lines.length === 0) return;
    mutation.mutate({
      supplierId,
      expectedDate: expectedDate || null,
      note: note.trim() || null,
      lines: lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        unitCostMinor: line.unitCostMinor,
      })),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{order ? `Editar ${order.reference}` : 'Nova encomenda'}</SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {error && <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">{error.message}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>Fornecedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  {(suppliersQuery.data?.data ?? []).map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error?.fieldError('supplierId') && (
                <p className="text-sm text-destructive">{error.fieldError('supplierId')}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Data prevista</Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(event) => setExpectedDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nota</Label>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Linhas</h3>
            <ProductPicker
              supplierId={supplierId || undefined}
              onPick={addProduct}
              pickedIds={lines.map((line) => line.productId)}
            />

            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Sem linhas. Procure um produto para comecar.
              </p>
            ) : (
              <ul className="space-y-3">
                {lines.map((line) => (
                  <li key={line.productId} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{line.name}</p>
                        <p className="tabular text-xs text-muted-foreground">{line.sku}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover ${line.name}`}
                        onClick={() =>
                          setLines((prev) => prev.filter((item) => item.productId !== line.productId))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label size="sm">Quantidade</Label>
                        <NumericInput
                          value={line.quantity}
                          decimals={3}
                          min={0}
                          onValueChange={(value) => patchLine(line.productId, { quantity: value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label size="sm">Custo unitario</Label>
                        <MoneyInput
                          value={line.unitCostMinor}
                          min={0}
                          onChange={(minor) => patchLine(line.productId, { unitCostMinor: minor })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label size="sm">Total da linha</Label>
                        <p className="tabular flex h-12 items-center justify-end px-3 text-base font-semibold text-foreground">
                          {money(lineTotal(line))}
                        </p>
                      </div>
                    </div>

                    <p className="tabular mt-1 text-xs text-muted-foreground">
                      {formatQuantity(line.quantity, line.unit)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetBody>

        <SheetFooter className="sm:items-center sm:justify-between">
          <div className="text-left">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total da encomenda</p>
            <p className="tabular text-xl font-semibold text-foreground">{money(total)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              loading={mutation.isPending}
              disabled={!supplierId || lines.length === 0}
            >
              Guardar rascunho
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
