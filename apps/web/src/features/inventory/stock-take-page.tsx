import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Play, ShieldAlert } from 'lucide-react';
import type { Paginated } from '@pos/shared';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Label,
  Skeleton,
  SwitchField,
  Textarea,
  toast,
  type DataTableColumn,
} from '@/components/ui';
import { ApiRequestError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatDateTime, money, number as formatNumber } from '@/lib/format';
import { qk, queryClient } from '@/lib/query';
import { successChime } from '@/lib/sound';
import { invalidateStock } from './api';
import { CategorySelect, ErrorState, InventoryShell, LocationSelect } from './components/inventory-shell';
import { StockTakeReview } from './components/stocktake-review';
import { StockTakeSheet } from './components/stocktake-sheet';
import { STOCKTAKE_STATUS_LABELS, type StockTakeDto, type StockTakeStatusValue } from './types';

type Step = 'list' | 'count' | 'review';

const STATUS_VARIANT: Record<StockTakeStatusValue, 'muted' | 'warning' | 'success' | 'destructive'> = {
  open: 'muted',
  counting: 'warning',
  review: 'warning',
  approved: 'success',
  cancelled: 'destructive',
};

export default function StockTakePage() {
  const { t } = useTranslation();
  const can = useAuth((s) => s.can);
  const canCount = can('inventory:stocktake');
  const showCost = can('product:cost');

  const [step, setStep] = React.useState<Step>('list');
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const [categoryId, setCategoryId] = React.useState<string | undefined>(undefined);
  const [onlyWithStock, setOnlyWithStock] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [cancelling, setCancelling] = React.useState(false);

  const list = useQuery({
    queryKey: qk.inventory({ scope: 'stocktakes' }),
    queryFn: () => api.get<Paginated<StockTakeDto>>('/api/inventory/stocktakes', { pageSize: 25 }),
  });

  const detailKey = qk.inventory({ scope: 'stocktake', id: activeId });
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => api.get<StockTakeDto>(`/api/inventory/stocktakes/${activeId}`),
    enabled: Boolean(activeId),
  });

  const applyUpdate = React.useCallback(
    (updated: StockTakeDto) => {
      queryClient.setQueryData(qk.inventory({ scope: 'stocktake', id: updated.id }), updated);
      void queryClient.invalidateQueries({ queryKey: qk.inventory({ scope: 'stocktakes' }) });
    },
    [],
  );

  const create = useMutation({
    mutationFn: () =>
      api.post<StockTakeDto>('/api/inventory/stocktakes', {
        locationId: locationId ?? null,
        categoryId: categoryId ?? null,
        onlyWithStock,
        note: note.trim() || null,
      }),
    onSuccess: (stockTake) => {
      applyUpdate(stockTake);
      setActiveId(stockTake.id);
      setStep('count');
      setNote('');
      toast.success('Inventario criado', `${stockTake.reference} - ${stockTake.lineCount} artigos para contar.`);
    },
    onError: (error: unknown) =>
      toast.error(
        'Inventario nao criado',
        error instanceof ApiRequestError ? error.message : 'Tente novamente dentro de momentos.',
      ),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.post<StockTakeDto>(`/api/inventory/stocktakes/${id}/approve`, {}),
    onSuccess: (stockTake) => {
      successChime();
      applyUpdate(stockTake);
      invalidateStock();
      toast.success('Inventario aprovado', `${stockTake.reference} - movimentos de stock escritos.`);
    },
    onError: (error: unknown) =>
      toast.error(
        'Aprovacao falhou',
        error instanceof ApiRequestError ? error.message : 'Nao foi possivel aprovar este inventario.',
      ),
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      api.post<StockTakeDto>(`/api/inventory/stocktakes/${id}/cancel`, { reason: 'Cancelado no back office.' }),
    onSuccess: (stockTake) => {
      applyUpdate(stockTake);
      setStep('list');
      setActiveId(null);
      toast.success('Inventario cancelado', stockTake.reference);
    },
    onError: (error: unknown) =>
      toast.error(
        'Nao foi possivel cancelar',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      ),
  });

  const columns: Array<DataTableColumn<StockTakeDto>> = [
    { key: 'reference', header: 'Referencia', cell: (row) => <span className="tabular font-medium">{row.reference}</span> },
    { key: 'createdAt', header: 'Criado', cell: (row) => <span className="tabular">{formatDateTime(row.createdAt)}</span> },
    {
      key: 'locationName',
      header: 'Localizacao',
      cell: (row) => row.locationName ?? <span className="text-muted-foreground">Todas</span>,
    },
    {
      key: 'progress',
      header: 'Contagem',
      numeric: true,
      cell: (row) => (
        <span className="tabular">
          {formatNumber(row.countedCount)} / {formatNumber(row.lineCount)}
        </span>
      ),
    },
    {
      key: 'varianceCount',
      header: 'Diferencas',
      numeric: true,
      cell: (row) => <span className="tabular">{formatNumber(row.varianceCount)}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]} dot>
          {STOCKTAKE_STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    { key: 'userName', header: 'Responsavel', cell: (row) => row.userName ?? '-' },
  ];

  if (showCost) {
    columns.push({
      key: 'varianceValueMinor',
      header: 'Valor da diferenca',
      numeric: true,
      cell: (row) =>
        row.varianceValueMinor === null ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span className="tabular font-semibold">{money(row.varianceValueMinor)}</span>
        ),
    });
  }

  if (!canCount) {
    return (
      <InventoryShell title={t('inventory.stockTake', 'Inventario Fisico')}>
        <EmptyState
          icon={ShieldAlert}
          title="Sem permissao"
          description="Precisa da permissao inventory:stocktake para contar stock."
        />
      </InventoryShell>
    );
  }

  const active = detail.data ?? null;
  const stepLabel =
    step === 'list' ? 'Passo 1 de 4 - criar' : step === 'count' ? 'Passo 2 de 4 - contagem' : 'Passo 3 e 4 - rever e aprovar';

  return (
    <InventoryShell
      title={t('inventory.stockTake', 'Inventario Fisico')}
      description={`${stepLabel}. As quantidades so mudam quando o inventario for aprovado.`}
      actions={
        step !== 'list' && (
          <>
            <Button variant="ghost" onClick={() => setStep('list')}>
              Ver lista
            </Button>
            {active && active.status !== 'approved' && active.status !== 'cancelled' && (
              <Button variant="outline" onClick={() => setCancelling(true)}>
                Cancelar inventario
              </Button>
            )}
          </>
        )
      }
    >
      {step === 'list' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Novo inventario</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label>Localizacao</Label>
                <LocationSelect
                  value={locationId}
                  onChange={setLocationId}
                  allLabel="Todas as localizacoes"
                  className="w-full"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Categoria (opcional)</Label>
                <CategorySelect value={categoryId} onChange={setCategoryId} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor="stocktake-note">Nota</Label>
                <Textarea
                  id="stocktake-note"
                  value={note}
                  rows={2}
                  maxLength={2000}
                  placeholder="Ex.: contagem mensal do armazem"
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              <SwitchField
                label="Apenas artigos com stock"
                description="Deixa de fora tudo o que esta a zero."
                checked={onlyWithStock}
                onCheckedChange={setOnlyWithStock}
                className="md:col-span-2"
              />
              <div className="flex items-end md:col-span-2">
                <Button
                  size="lg"
                  block
                  leftIcon={<Play className="size-5" />}
                  loading={create.isPending}
                  onClick={() => create.mutate()}
                >
                  Criar folha de contagem
                </Button>
              </div>
            </CardContent>
          </Card>

          {list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : (
            <div className="rounded-xl border border-border bg-card">
              <DataTable
                columns={columns}
                rows={list.data?.data ?? []}
                rowKey={(row) => row.id}
                loading={list.isLoading}
                stickyHeader
                onRowClick={(row) => {
                  setActiveId(row.id);
                  setStep(row.status === 'approved' || row.status === 'cancelled' ? 'review' : 'count');
                }}
                emptyTitle="Sem inventarios"
                emptyDescription="Crie uma folha de contagem para comecar."
                emptyIcon={ClipboardList}
              />
            </div>
          )}
        </>
      )}

      {step !== 'list' && detail.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {step !== 'list' && detail.isError && (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      )}

      {step === 'count' && active && (
        <StockTakeSheet stockTake={active} onSaved={applyUpdate} onReview={() => setStep('review')} />
      )}

      {step === 'review' && active && (
        <StockTakeReview
          stockTake={active}
          approving={approve.isPending}
          onApprove={() => approve.mutate(active.id)}
          onBackToCount={() => setStep('count')}
        />
      )}

      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancelar este inventario?"
        description="As contagens ja feitas ficam guardadas para consulta, mas deixam de poder ser aprovadas."
        confirmLabel="Cancelar inventario"
        cancelLabel="Voltar"
        onConfirm={() => {
          setCancelling(false);
          if (active) cancel.mutate(active.id);
        }}
      />
    </InventoryShell>
  );
}
