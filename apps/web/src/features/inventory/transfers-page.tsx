import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, PackageCheck, Plus } from 'lucide-react';
import type { Paginated } from '@pos/shared';

import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  toast,
  type DataTableColumn,
} from '@/components/ui';
import { ApiRequestError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatDateTime, quantity as formatQuantity } from '@/lib/format';
import { qk, queryClient } from '@/lib/query';
import { successChime } from '@/lib/sound';
import { invalidateStock } from './api';
import {
  ALL_VALUE,
  ClearFiltersButton,
  ErrorState,
  FilterBar,
  InventoryShell,
  LocationSelect,
} from './components/inventory-shell';
import { TransferForm } from './components/transfer-form';
import { TRANSFER_STATUS_LABELS, type StockTransferDto, type TransferStatus } from './types';

const PAGE_SIZE = 25;

const STATUS_VARIANT: Record<TransferStatus, 'muted' | 'warning' | 'success' | 'destructive'> = {
  draft: 'muted',
  sent: 'warning',
  received: 'success',
  cancelled: 'destructive',
};

export default function TransfersPage() {
  const { t } = useTranslation();
  const canTransfer = useAuth((s) => s.can)('inventory:transfer');

  const [status, setStatus] = React.useState<TransferStatus | undefined>(undefined);
  const [fromLocationId, setFromLocationId] = React.useState<string | undefined>(undefined);
  const [toLocationId, setToLocationId] = React.useState<string | undefined>(undefined);
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [receiving, setReceiving] = React.useState(false);

  const filters = { page, pageSize: PAGE_SIZE, status, fromLocationId, toLocationId };

  const list = useQuery({
    queryKey: qk.inventory({ scope: 'transfers', ...filters }),
    queryFn: () => api.get<Paginated<StockTransferDto>>('/api/inventory/transfers', { ...filters }),
  });

  const detail = useQuery({
    queryKey: qk.inventory({ scope: 'transfer', id: openId }),
    queryFn: () => api.get<StockTransferDto>(`/api/inventory/transfers/${openId}`),
    enabled: Boolean(openId),
  });

  const receive = useMutation({
    mutationFn: (id: string) => api.post<StockTransferDto>(`/api/inventory/transfers/${id}/receive`, {}),
    onSuccess: (transfer) => {
      successChime();
      queryClient.setQueryData(qk.inventory({ scope: 'transfer', id: transfer.id }), transfer);
      invalidateStock();
      toast.success('Transferencia recebida', `${transfer.reference} - stock creditado no destino.`);
    },
    onError: (error: unknown) =>
      toast.error(
        'Recepcao falhou',
        error instanceof ApiRequestError ? error.message : 'Nao foi possivel receber esta transferencia.',
      ),
  });

  const dirty = Boolean(status || fromLocationId || toLocationId);

  const columns: Array<DataTableColumn<StockTransferDto>> = [
    { key: 'reference', header: 'Referencia', cell: (row) => <span className="tabular font-medium">{row.reference}</span> },
    { key: 'createdAt', header: 'Criada', cell: (row) => <span className="tabular">{formatDateTime(row.createdAt)}</span> },
    { key: 'fromLocationName', header: 'Origem', cell: (row) => row.fromLocationName ?? '-' },
    { key: 'toLocationName', header: 'Destino', cell: (row) => row.toLocationName ?? '-' },
    { key: 'lineCount', header: 'Linhas', numeric: true, cell: (row) => <span className="tabular">{row.lineCount}</span> },
    {
      key: 'totalQuantity',
      header: 'Unidades',
      numeric: true,
      cell: (row) => <span className="tabular">{formatQuantity(row.totalQuantity)}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]} dot>
          {TRANSFER_STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      key: 'receivedAt',
      header: 'Recebida',
      cell: (row) => (row.receivedAt ? <span className="tabular">{formatDateTime(row.receivedAt)}</span> : <span className="text-muted-foreground">-</span>),
    },
  ];

  const active = detail.data ?? null;

  return (
    <InventoryShell
      title={t('inventory.transfers', 'Transferencias')}
      description="Movimentos entre localizacoes: o stock sai da origem ao enviar e entra no destino ao receber."
      actions={
        canTransfer && (
          <Button leftIcon={<Plus className="size-5" />} onClick={() => setCreating(true)}>
            Nova transferencia
          </Button>
        )
      }
    >
      <FilterBar>
        <Select
          value={status ?? ALL_VALUE}
          onValueChange={(value) => {
            setStatus(value === ALL_VALUE ? undefined : (value as TransferStatus));
            setPage(1);
          }}
        >
          <SelectTrigger className="min-w-[12rem]" aria-label="Estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos os estados</SelectItem>
            {(Object.keys(TRANSFER_STATUS_LABELS) as TransferStatus[]).map((value) => (
              <SelectItem key={value} value={value}>
                {TRANSFER_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <LocationSelect
          value={fromLocationId}
          onChange={(value) => {
            setFromLocationId(value);
            setPage(1);
          }}
          allLabel="Qualquer origem"
        />
        <LocationSelect
          value={toLocationId}
          onChange={(value) => {
            setToLocationId(value);
            setPage(1);
          }}
          allLabel="Qualquer destino"
        />
        <ClearFiltersButton
          show={dirty}
          onClick={() => {
            setStatus(undefined);
            setFromLocationId(undefined);
            setToLocationId(undefined);
            setPage(1);
          }}
        />
      </FilterBar>

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
            onRowClick={(row) => setOpenId(row.id)}
            emptyTitle="Sem transferencias"
            emptyDescription="Crie uma transferencia para mover stock entre localizacoes."
            emptyIcon={ArrowLeftRight}
            emptyAction={canTransfer ? { label: 'Nova transferencia', onClick: () => setCreating(true) } : undefined}
          />
          <div className="border-t border-border p-3">
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </div>
        </div>
      )}

      {/* Create */}
      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent size="lg" className="flex flex-col gap-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nova transferencia</SheetTitle>
            <SheetDescription>Escolha origem e destino e digitalize o que vai seguir.</SheetDescription>
          </SheetHeader>
          <TransferForm
            onCreated={(transfer) => {
              setCreating(false);
              void list.refetch();
              setOpenId(transfer.id);
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Detail */}
      <Sheet open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent size="lg" className="flex flex-col gap-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{active?.reference ?? 'Transferencia'}</SheetTitle>
            <SheetDescription>
              {active ? `${active.fromLocationName ?? '-'} para ${active.toLocationName ?? '-'}` : 'A carregar...'}
            </SheetDescription>
          </SheetHeader>

          {detail.isLoading && <Skeleton className="h-40 w-full" />}
          {detail.isError && <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />}

          {active && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={STATUS_VARIANT[active.status]} size="lg" dot>
                  {TRANSFER_STATUS_LABELS[active.status]}
                </Badge>
                <span className="text-sm text-muted-foreground">Criada em {formatDateTime(active.createdAt)}</span>
                {active.receivedAt && (
                  <span className="text-sm text-muted-foreground">Recebida em {formatDateTime(active.receivedAt)}</span>
                )}
              </div>

              {active.note && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{active.note}</p>}

              <ul className="divide-y divide-border rounded-xl border border-border">
                {active.lines.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <span className="block truncate font-medium">
                        {line.productName}
                        {line.variantName ? ` - ${line.variantName}` : ''}
                      </span>
                      <span className="block text-xs text-muted-foreground">{line.sku}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="tabular block font-semibold">{formatQuantity(line.quantity, line.unit)}</span>
                      <span className="tabular block text-xs text-muted-foreground">
                        Recebido {formatQuantity(line.receivedQuantity, line.unit)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {canTransfer && active.status === 'sent' && (
                <Button
                  size="lg"
                  block
                  leftIcon={<PackageCheck className="size-5" />}
                  loading={receive.isPending}
                  onClick={() => setReceiving(true)}
                >
                  Receber no destino
                </Button>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={receiving}
        onOpenChange={setReceiving}
        title="Receber esta transferencia?"
        description={
          active
            ? `As ${active.lineCount} linhas entram no stock de ${active.toLocationName ?? 'destino'} e a transferencia fica fechada.`
            : undefined
        }
        confirmLabel="Receber"
        cancelLabel="Voltar"
        variant="success"
        onConfirm={() => {
          setReceiving(false);
          if (active) receive.mutate(active.id);
        }}
      />
    </InventoryShell>
  );
}
