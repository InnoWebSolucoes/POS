import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileDown, PackagePlus, ShieldAlert } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@/components/ui';
import { ApiRequestError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { money, quantity as formatQuantity } from '@/lib/format';
import { successChime } from '@/lib/sound';
import { uid } from '@/lib/utils';
import { invalidateStock, useOpenPurchaseOrders, usePurchaseOrder, useSuppliers } from './api';
import { ALL_VALUE, FieldError, InventoryShell, LocationSelect } from './components/inventory-shell';
import { ProductPicker, type PickedProduct } from './components/product-picker';
import { ReceiptConfirmation } from './components/receipt-confirmation';
import { ReceiptHistory } from './components/receipt-history';
import { ReceiptLineRow, lineTotalMinor, stepFor, type ReceiptLineDraft } from './components/receipt-lines';
import type { StockReceiptDto } from './types';

export default function ReceiveStockPage() {
  const { t } = useTranslation();
  const can = useAuth((s) => s.can);
  const canReceive = can('inventory:receive');
  const showCost = can('product:cost');

  const [lines, setLines] = React.useState<ReceiptLineDraft[]>([]);
  const [highlight, setHighlight] = React.useState<string | null>(null);
  const [supplierId, setSupplierId] = React.useState<string | undefined>(undefined);
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const [invoiceNumber, setInvoiceNumber] = React.useState('');
  const [purchaseOrderId, setPurchaseOrderId] = React.useState<string | undefined>(undefined);
  const [note, setNote] = React.useState('');
  const [confirmation, setConfirmation] = React.useState<StockReceiptDto | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  /** An open dropdown must not have the barcode field pulling focus back. */
  const [menuOpen, setMenuOpen] = React.useState(false);

  const suppliers = useSuppliers(canReceive);
  const purchaseOrders = useOpenPurchaseOrders(supplierId, canReceive);
  const purchaseOrder = usePurchaseOrder(purchaseOrderId ?? null);

  const totalCostMinor = lines.reduce((sum, line) => sum + lineTotalMinor(line), 0);
  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);

  const patchLine = React.useCallback((key: string, patch: Partial<ReceiptLineDraft>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }, []);

  const removeLine = React.useCallback((key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
  }, []);

  /** A second scan of the same article adds to the line already on screen. */
  const addProduct = React.useCallback((picked: PickedProduct) => {
    setLines((current) => {
      const existing = current.find(
        (line) => line.productId === picked.productId && line.variantId === (picked.variantId ?? null),
      );
      const increment = picked.scannedQuantity ?? stepFor(picked.unit);

      if (existing) {
        setHighlight(existing.key);
        return current.map((line) =>
          line.key === existing.key
            ? { ...line, quantity: Math.round((line.quantity + increment) * 1000) / 1000 }
            : line,
        );
      }

      const key = uid('linha');
      setHighlight(key);
      return [
        ...current,
        {
          key,
          productId: picked.productId,
          variantId: picked.variantId,
          name: picked.name,
          sku: picked.sku,
          unit: picked.unit,
          quantity: increment,
          unitCostMinor: picked.unitCostMinor ?? 0,
          batchNumber: '',
          expiryDate: '',
        },
      ];
    });
  }, []);

  React.useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 1200);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  const loadPurchaseOrder = () => {
    const order = purchaseOrder.data;
    if (!order?.lines) return;
    const outstanding = order.lines.filter((line) => line.outstandingQuantity > 0);
    if (outstanding.length === 0) {
      toast.warning('Nada em falta', 'Esta encomenda ja foi totalmente recebida.');
      return;
    }
    setLines(
      outstanding.map((line) => ({
        key: uid('linha'),
        productId: line.productId,
        variantId: line.variantId,
        name: line.variantSku ? `${line.productName} - ${line.variantSku}` : line.productName,
        sku: line.productSku,
        unit: line.unit,
        quantity: line.outstandingQuantity,
        unitCostMinor: line.unitCostMinor,
        batchNumber: '',
        expiryDate: '',
      })),
    );
    toast.success('Linhas carregadas', `${outstanding.length} linhas em falta da encomenda ${order.reference}.`);
  };

  const reset = () => {
    setLines([]);
    setInvoiceNumber('');
    setNote('');
    setPurchaseOrderId(undefined);
    setFormError(null);
  };

  const submit = useMutation({
    mutationFn: (payload: unknown) => api.post<StockReceiptDto>('/api/inventory/receipts', payload),
    onSuccess: (receipt) => {
      successChime();
      invalidateStock();
      setConfirmation(receipt);
      reset();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiRequestError ? error.message : 'Nao foi possivel registar a entrada de stock.';
      setFormError(message);
      toast.error('Entrada nao registada', message);
    },
  });

  const handleSubmit = () => {
    if (lines.length === 0) {
      setFormError('Adicione pelo menos uma linha antes de registar a entrada.');
      return;
    }
    const invalid = lines.find((line) => line.quantity <= 0);
    if (invalid) {
      setFormError(`A quantidade de "${invalid.name}" tem de ser maior do que zero.`);
      return;
    }
    setFormError(null);
    submit.mutate({
      supplierId: supplierId ?? null,
      locationId: locationId ?? null,
      invoiceNumber: invoiceNumber.trim() || null,
      purchaseOrderId: purchaseOrderId ?? null,
      note: note.trim() || null,
      lines: lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        unitCostMinor: line.unitCostMinor,
        batchNumber: line.batchNumber.trim() || null,
        expiryDate: line.expiryDate ? new Date(`${line.expiryDate}T00:00:00`).toISOString() : null,
      })),
    });
  };

  if (!canReceive) {
    return (
      <InventoryShell title={t('inventory.receiveStock', 'Entrada de Stock')}>
        <EmptyState
          icon={ShieldAlert}
          title="Sem permissao"
          description="Precisa da permissao inventory:receive para registar entradas de stock."
        />
      </InventoryShell>
    );
  }

  return (
    <InventoryShell
      title={t('inventory.receiveStock', 'Entrada de Stock')}
      description="Digitalize cada artigo recebido. O custo unitario actualiza o custo medio do produto."
    >
      <Tabs defaultValue="nova" className="flex flex-col gap-4">
        <TabsList variant="underline">
          <TabsTrigger value="nova">Nova entrada</TabsTrigger>
          <TabsTrigger value="historico">Historico</TabsTrigger>
        </TabsList>

        <TabsContent value="nova" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Documento</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Fornecedor</Label>
                <Select
                  value={supplierId ?? ALL_VALUE}
                  onOpenChange={setMenuOpen}
                  onValueChange={(value) => {
                    setSupplierId(value === ALL_VALUE ? undefined : value);
                    setPurchaseOrderId(undefined);
                  }}
                >
                  <SelectTrigger aria-label="Fornecedor">
                    <SelectValue placeholder="Sem fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>Sem fornecedor</SelectItem>
                    {(suppliers.data ?? []).map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Localizacao de destino</Label>
                <LocationSelect
                  value={locationId}
                  onChange={setLocationId}
                  onOpenChange={setMenuOpen}
                  allLabel="Localizacao principal"
                  className="w-full"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invoice">{t('inventory.invoiceNumber', 'Numero da Factura')}</Label>
                <Input
                  id="invoice"
                  value={invoiceNumber}
                  maxLength={120}
                  placeholder="FT 2026/1234"
                  onChange={(event) => setInvoiceNumber(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Encomenda de compra</Label>
                <div className="flex gap-2">
                  <Select
                    value={purchaseOrderId ?? ALL_VALUE}
                    onOpenChange={setMenuOpen}
                    onValueChange={(value) => setPurchaseOrderId(value === ALL_VALUE ? undefined : value)}
                  >
                    <SelectTrigger className="flex-1" aria-label="Encomenda de compra">
                      <SelectValue placeholder="Sem encomenda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_VALUE}>Sem encomenda</SelectItem>
                      {(purchaseOrders.data ?? []).map((order) => (
                        <SelectItem key={order.id} value={order.id}>
                          {order.reference}
                          {order.supplierName ? ` - ${order.supplierName}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    leftIcon={<FileDown className="size-5" />}
                    disabled={!purchaseOrderId || purchaseOrder.isLoading}
                    loading={purchaseOrder.isLoading && Boolean(purchaseOrderId)}
                    onClick={loadPurchaseOrder}
                  >
                    Carregar
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-2">
                <Label htmlFor="note">Nota</Label>
                <Textarea
                  id="note"
                  value={note}
                  maxLength={2000}
                  rows={2}
                  placeholder="Observacoes sobre esta entrada"
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Digitalizar artigos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ProductPicker onPick={addProduct} keepFocused={confirmation === null && !menuOpen} autoFocus />

              {lines.length === 0 ? (
                <EmptyState
                  icon={PackagePlus}
                  size="sm"
                  title="Nenhuma linha ainda"
                  description="Digitalize o codigo de barras de cada artigo recebido, ou procure-o pelo nome."
                />
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {lines.map((line, index) => (
                    <ReceiptLineRow
                      key={line.key}
                      line={line}
                      index={index}
                      highlighted={highlight === line.key}
                      onChange={patchLine}
                      onRemove={removeLine}
                    />
                  ))}
                </ul>
              )}

              <FieldError message={formError} />

              <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <span className="text-sm text-muted-foreground">
                    {lines.length} linhas - <span className="tabular">{formatQuantity(totalUnits)}</span> unidades
                  </span>
                  {showCost && (
                    <span className="text-sm text-muted-foreground">
                      Custo total{' '}
                      <span className="tabular text-xl font-semibold text-foreground">{money(totalCostMinor)}</span>
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={reset} disabled={lines.length === 0 || submit.isPending}>
                    Limpar
                  </Button>
                  <Button
                    size="lg"
                    onClick={handleSubmit}
                    loading={submit.isPending}
                    disabled={lines.length === 0}
                    leftIcon={<PackagePlus className="size-5" />}
                  >
                    Registar entrada
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <ReceiptHistory />
        </TabsContent>
      </Tabs>

      <ReceiptConfirmation receipt={confirmation} showCost={showCost} onClose={() => setConfirmation(null)} />
    </InventoryShell>
  );
}
