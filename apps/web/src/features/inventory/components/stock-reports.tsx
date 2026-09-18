import * as React from 'react';
import { CalendarClock, PackageX, Snowflake } from 'lucide-react';

import {
  Badge,
  DataTable,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SwitchField,
  type DataTableColumn,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { amount, formatDate, number as formatNumber, quantity as formatQuantity, relativeTime } from '@/lib/format';
import { useDeadStock, useExpiring, useLowStock } from '../api';
import { ErrorState, FilterBar } from './inventory-shell';
import type { DeadStockRowDto, ExpiringRowDto, LowStockRowDto } from '../types';

const PAGE_SIZE = 25;

/* -------------------------------------------------------------------------- */
/* Low stock                                                                   */
/* -------------------------------------------------------------------------- */

export function LowStockReport({ locationId, categoryId }: { locationId?: string; categoryId?: string }) {
  const [page, setPage] = React.useState(1);
  const showCost = useAuth((s) => s.can)('product:cost');
  const query = useLowStock({ page, pageSize: PAGE_SIZE, locationId, categoryId });

  const columns: Array<DataTableColumn<LowStockRowDto>> = [
    {
      key: 'name',
      header: 'Produto',
      width: '22rem',
      cell: (row) => (
        <div>
          <span className="block truncate font-medium text-foreground">{row.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {row.sku}
            {row.categoryName ? ` - ${row.categoryName}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Em stock',
      numeric: true,
      cell: (row) => (
        <span className={`tabular font-semibold ${row.outOfStock ? 'text-destructive' : ''}`}>
          {formatQuantity(row.quantity, row.unit)}
        </span>
      ),
    },
    {
      key: 'minStockLevel',
      header: 'Minimo',
      numeric: true,
      cell: (row) => <span className="tabular text-muted-foreground">{formatNumber(row.minStockLevel, row.minStockLevel % 1 === 0 ? 0 : 3)}</span>,
    },
    {
      key: 'suggestedReorderQuantity',
      header: 'Sugestao de compra',
      numeric: true,
      cell: (row) => <span className="tabular">{formatQuantity(row.suggestedReorderQuantity, row.unit)}</span>,
    },
    {
      key: 'supplier',
      header: 'Fornecedor',
      cell: (row) => row.supplier?.name ?? <span className="text-muted-foreground">Sem fornecedor</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (row) =>
        row.outOfStock ? (
          <Badge variant="destructive" dot>
            Esgotado
          </Badge>
        ) : (
          <Badge variant="warning" dot>
            Stock baixo
          </Badge>
        ),
    },
  ];

  if (showCost) {
    columns.push({
      key: 'reorderCostMinor',
      header: 'Custo da reposicao',
      numeric: true,
      cell: (row) =>
        row.reorderCostMinor === undefined ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span className="tabular">{amount(row.reorderCostMinor)}</span>
        ),
    });
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="rounded-xl border border-border bg-card">
      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        rowKey={(row) => row.productId}
        loading={query.isLoading}
        stickyHeader
        emptyTitle="Nada abaixo do minimo"
        emptyDescription="Todos os artigos com nivel minimo definido estao acima dele."
        emptyIcon={PackageX}
      />
      <div className="border-t border-border p-3">
        <Pagination page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPageChange={setPage} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dead stock                                                                  */
/* -------------------------------------------------------------------------- */

const DAY_OPTIONS = [30, 60, 90, 180, 365];

export function DeadStockReport({ categoryId }: { categoryId?: string }) {
  const [page, setPage] = React.useState(1);
  const [days, setDays] = React.useState(90);
  const showCost = useAuth((s) => s.can)('product:cost');
  const query = useDeadStock({ page, pageSize: PAGE_SIZE, days, categoryId });

  const columns: Array<DataTableColumn<DeadStockRowDto>> = [
    {
      key: 'name',
      header: 'Produto',
      width: '22rem',
      cell: (row) => (
        <div>
          <span className="block truncate font-medium text-foreground">{row.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {row.sku}
            {row.categoryName ? ` - ${row.categoryName}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Em stock',
      numeric: true,
      cell: (row) => <span className="tabular font-semibold">{formatQuantity(row.quantity, row.unit)}</span>,
    },
    {
      key: 'lastSoldAt',
      header: 'Ultima venda',
      cell: (row) =>
        row.lastSoldAt ? (
          <span>
            {formatDate(row.lastSoldAt)}
            <span className="ml-2 text-xs text-muted-foreground">{relativeTime(row.lastSoldAt)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Nunca vendido</span>
        ),
    },
    {
      key: 'daysSinceLastSale',
      header: 'Dias parado',
      numeric: true,
      cell: (row) => (
        <span className="tabular">{row.daysSinceLastSale === null ? '-' : formatNumber(row.daysSinceLastSale)}</span>
      ),
    },
    {
      key: 'retailValueMinor',
      header: 'Valor a retalho',
      numeric: true,
      cell: (row) => <span className="tabular">{amount(row.retailValueMinor)}</span>,
    },
  ];

  if (showCost) {
    columns.push({
      key: 'stockValueMinor',
      header: 'Valor a custo',
      numeric: true,
      cell: (row) =>
        row.stockValueMinor === undefined ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span className="tabular font-semibold">{amount(row.stockValueMinor)}</span>
        ),
    });
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <span className="text-sm text-muted-foreground">Sem vendas ha pelo menos</span>
        <Select
          value={String(days)}
          onValueChange={(value) => {
            setDays(Number(value));
            setPage(1);
          }}
        >
          <SelectTrigger className="min-w-[9rem]" aria-label="Periodo sem vendas">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option} dias
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="rounded-xl border border-border bg-card">
        <DataTable
          columns={columns}
          rows={query.data?.data ?? []}
          rowKey={(row) => row.productId}
          loading={query.isLoading}
          stickyHeader
          emptyTitle="Sem stock parado"
          emptyDescription={`Todos os artigos com stock venderam nos ultimos ${days} dias.`}
          emptyIcon={Snowflake}
        />
        <div className="border-t border-border p-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Expiring batches                                                            */
/* -------------------------------------------------------------------------- */

export function ExpiringReport({ locationId }: { locationId?: string }) {
  const [page, setPage] = React.useState(1);
  const [days, setDays] = React.useState(30);
  const [includeExpired, setIncludeExpired] = React.useState(true);
  const showCost = useAuth((s) => s.can)('product:cost');
  const query = useExpiring({ page, pageSize: PAGE_SIZE, days, locationId, includeExpired });

  const columns: Array<DataTableColumn<ExpiringRowDto>> = [
    {
      key: 'productName',
      header: 'Produto',
      width: '22rem',
      cell: (row) => (
        <div>
          <span className="block truncate font-medium text-foreground">
            {row.productName}
            {row.variantName ? ` - ${row.variantName}` : ''}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {row.sku}
            {row.batchNumber ? ` - Lote ${row.batchNumber}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'locationName',
      header: 'Localizacao',
      cell: (row) => row.locationName ?? <span className="text-muted-foreground">-</span>,
    },
    {
      key: 'quantityRemaining',
      header: 'Quantidade',
      numeric: true,
      cell: (row) => <span className="tabular font-semibold">{formatQuantity(row.quantityRemaining, row.unit)}</span>,
    },
    {
      key: 'expiryDate',
      header: 'Validade',
      cell: (row) => <span className="tabular">{formatDate(row.expiryDate)}</span>,
    },
    {
      key: 'daysToExpiry',
      header: 'Estado',
      cell: (row) =>
        row.expired ? (
          <Badge variant="destructive" dot>
            Expirado
          </Badge>
        ) : (
          <Badge variant={row.daysToExpiry !== null && row.daysToExpiry <= 7 ? 'warning' : 'muted'} dot>
            {row.daysToExpiry === null ? 'Sem validade' : `Faltam ${row.daysToExpiry} dias`}
          </Badge>
        ),
    },
  ];

  if (showCost) {
    columns.push({
      key: 'stockValueMinor',
      header: 'Valor em risco',
      numeric: true,
      cell: (row) =>
        row.stockValueMinor === undefined ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span className="tabular font-semibold">{amount(row.stockValueMinor)}</span>
        ),
    });
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <span className="text-sm text-muted-foreground">A expirar nos proximos</span>
        <Select
          value={String(days)}
          onValueChange={(value) => {
            setDays(Number(value));
            setPage(1);
          }}
        >
          <SelectTrigger className="min-w-[9rem]" aria-label="Janela de validade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[7, 15, 30, 60, 90].map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option} dias
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SwitchField
          label="Incluir lotes ja expirados"
          checked={includeExpired}
          onCheckedChange={(checked) => {
            setIncludeExpired(checked);
            setPage(1);
          }}
        />
      </FilterBar>

      <div className="rounded-xl border border-border bg-card">
        <DataTable
          columns={columns}
          rows={query.data?.data ?? []}
          rowKey={(row) => row.batchId}
          loading={query.isLoading}
          stickyHeader
          emptyTitle="Nenhum lote a expirar"
          emptyDescription={`Sem lotes com validade nos proximos ${days} dias.`}
          emptyIcon={CalendarClock}
        />
        <div className="border-t border-border p-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}
