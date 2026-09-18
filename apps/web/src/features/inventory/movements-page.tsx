import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, ScrollText, X } from 'lucide-react';
import { ADJUSTMENT_REASON_LABELS, STOCK_MOVEMENT_TYPES, type Paginated, type StockMovementDto } from '@pos/shared';

import {
  Badge,
  Button,
  DataTable,
  DateRangePicker,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  rangeForPreset,
  toast,
  type DataTableColumn,
  type DateRange,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { amount, formatDateTime, number as formatNumber } from '@/lib/format';
import { qk } from '@/lib/query';
import { useStaff } from './api';
import {
  ALL_VALUE,
  ClearFiltersButton,
  ErrorState,
  FilterBar,
  InventoryShell,
  LocationSelect,
} from './components/inventory-shell';
import { ProductPicker, type PickedProduct } from './components/product-picker';
import { MOVEMENT_TYPE_LABELS } from './types';

const PAGE_SIZE = 50;

const TYPE_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'muted'> = {
  receipt: 'success',
  transfer_in: 'success',
  refund: 'success',
  initial: 'muted',
  sale: 'muted',
  transfer_out: 'warning',
  composite_consumption: 'muted',
  adjustment: 'warning',
  stocktake: 'warning',
  waste: 'destructive',
};

/** yyyy-MM-dd from the picker -> a full-day window the API can compare against. */
const startOfDay = (day: string) => `${day}T00:00:00.000`;
const endOfDay = (day: string) => `${day}T23:59:59.999`;

export default function MovementsPage() {
  const { t } = useTranslation();
  const can = useAuth((s) => s.can);
  const showCost = can('product:cost');
  const canExport = can('report:read');

  const [range, setRange] = React.useState<DateRange>(() => rangeForPreset('mes'));
  const [type, setType] = React.useState<string | undefined>(undefined);
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const [userId, setUserId] = React.useState<string | undefined>(undefined);
  const [product, setProduct] = React.useState<PickedProduct | null>(null);
  const [page, setPage] = React.useState(1);
  const [exporting, setExporting] = React.useState(false);

  const staff = useStaff(can('user:read'));

  const filters = {
    page,
    pageSize: PAGE_SIZE,
    from: startOfDay(range.from),
    to: endOfDay(range.to),
    type,
    locationId,
    userId,
    productId: product?.productId,
    variantId: product?.variantId ?? undefined,
  };

  const movements = useQuery({
    queryKey: qk.movements(filters),
    queryFn: () => api.get<Paginated<StockMovementDto>>('/api/inventory/movements', { ...filters }),
  });

  const dirty = Boolean(type || locationId || userId || product);

  const resetFilters = () => {
    setType(undefined);
    setLocationId(undefined);
    setUserId(undefined);
    setProduct(null);
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.download(
        '/api/reports/export/movements',
        {
          format: 'csv',
          from: range.from,
          to: range.to,
          type,
          locationId,
          userId,
          productId: product?.productId,
          limit: 5000,
        },
        'movimentos.csv',
      );
    } catch {
      toast.error('Exportacao falhou', 'Nao foi possivel gerar o ficheiro CSV.');
    } finally {
      setExporting(false);
    }
  };

  const columns: Array<DataTableColumn<StockMovementDto>> = [
    {
      key: 'createdAt',
      header: 'Data',
      width: '11rem',
      cell: (row) => <span className="tabular">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'productName',
      header: 'Produto',
      width: '20rem',
      cell: (row) => <span className="block truncate font-medium text-foreground">{row.productName}</span>,
    },
    {
      key: 'type',
      header: 'Tipo',
      cell: (row) => (
        <Badge variant={TYPE_VARIANT[row.type] ?? 'muted'}>{MOVEMENT_TYPE_LABELS[row.type] ?? row.type}</Badge>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantidade',
      numeric: true,
      cell: (row) => (
        <span className={`tabular font-semibold ${row.quantity < 0 ? 'text-destructive' : 'text-success'}`}>
          {row.quantity > 0 ? '+' : ''}
          {formatNumber(row.quantity, row.quantity % 1 === 0 ? 0 : 3)}
        </span>
      ),
    },
    {
      key: 'balanceAfter',
      header: 'Saldo apos',
      numeric: true,
      cell: (row) => (
        <span className="tabular">{formatNumber(row.balanceAfter, row.balanceAfter % 1 === 0 ? 0 : 3)}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Motivo',
      cell: (row) =>
        row.reason ? (
          ADJUSTMENT_REASON_LABELS[row.reason]?.pt ?? row.reason
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: 'reference',
      header: 'Referencia',
      cell: (row) => <span className="tabular">{row.reference ?? '-'}</span>,
    },
    {
      key: 'userName',
      header: 'Utilizador',
      cell: (row) => row.userName ?? <span className="text-muted-foreground">Sistema</span>,
    },
  ];

  if (showCost) {
    columns.splice(5, 0, {
      key: 'unitCostMinor',
      header: 'Custo unit.',
      numeric: true,
      cell: (row) =>
        row.unitCostMinor === null ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span className="tabular">{amount(row.unitCostMinor)}</span>
        ),
    });
  }

  return (
    <InventoryShell
      title={t('inventory.movements', 'Movimentos')}
      description="O livro completo: tudo o que entrou, saiu ou foi corrigido, e por quem."
      actions={
        canExport && (
          <Button
            variant="outline"
            leftIcon={<Download className="size-5" />}
            loading={exporting}
            onClick={() => void exportCsv()}
          >
            Exportar CSV
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <FilterBar className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <DateRangePicker
            value={range}
            onChange={(next) => {
              setRange(next);
              setPage(1);
            }}
          />
          <Select
            value={type ?? ALL_VALUE}
            onValueChange={(value) => {
              setType(value === ALL_VALUE ? undefined : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="min-w-[12rem]" aria-label="Tipo de movimento">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Todos os tipos</SelectItem>
              {STOCK_MOVEMENT_TYPES.map((movementType) => (
                <SelectItem key={movementType} value={movementType}>
                  {MOVEMENT_TYPE_LABELS[movementType] ?? movementType}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <LocationSelect
            value={locationId}
            onChange={(value) => {
              setLocationId(value);
              setPage(1);
            }}
          />
          {can('user:read') && (
            <Select
              value={userId ?? ALL_VALUE}
              onValueChange={(value) => {
                setUserId(value === ALL_VALUE ? undefined : value);
                setPage(1);
              }}
            >
              <SelectTrigger className="min-w-[12rem]" aria-label="Utilizador">
                <SelectValue placeholder="Utilizador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Todos os utilizadores</SelectItem>
                {(staff.data ?? []).map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <ClearFiltersButton show={dirty} onClick={resetFilters} />
        </FilterBar>

        {product ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <span className="text-sm text-muted-foreground">A mostrar apenas</span>
            <Badge variant="secondary" size="lg">
              {product.name}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X className="size-4" />}
              onClick={() => {
                setProduct(null);
                setPage(1);
              }}
            >
              Remover filtro
            </Button>
          </div>
        ) : (
          <ProductPicker
            onPick={(picked) => {
              setProduct(picked);
              setPage(1);
            }}
            placeholder="Filtrar por produto: digitalizar ou procurar..."
          />
        )}
      </div>

      {movements.isError ? (
        <ErrorState error={movements.error} onRetry={() => void movements.refetch()} />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <DataTable
            columns={columns}
            rows={movements.data?.data ?? []}
            rowKey={(row) => row.id}
            loading={movements.isLoading}
            stickyHeader
            emptyTitle="Sem movimentos"
            emptyDescription="Nenhum movimento de stock no periodo e nos filtros escolhidos."
            emptyIcon={ScrollText}
          />
          <div className="border-t border-border p-3">
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={movements.data?.total ?? 0}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}
    </InventoryShell>
  );
}
