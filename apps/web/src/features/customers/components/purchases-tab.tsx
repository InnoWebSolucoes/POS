import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Receipt } from 'lucide-react';
import type { SaleChannel, SaleStatus } from '@pos/shared';

import {
  Badge,
  DataTable,
  EmptyState,
  Pagination,
  type BadgeProps,
  type DataTableColumn,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { formatDateTime, money, number as formatNumber } from '@/lib/format';

import { useCustomerPurchases } from '../customer-queries';
import type { CustomerPurchase } from '../customer-types';

const STATUS_LABELS: Record<SaleStatus, string> = {
  draft: 'Rascunho',
  held: 'Suspensa',
  completed: 'Concluida',
  refunded: 'Reembolsada',
  partially_refunded: 'Reembolso parcial',
  voided: 'Anulada',
};

const STATUS_VARIANT: Record<SaleStatus, NonNullable<BadgeProps['variant']>> = {
  draft: 'muted',
  held: 'muted',
  completed: 'success',
  refunded: 'destructive',
  partially_refunded: 'warning',
  voided: 'muted',
};

const CHANNEL_LABELS: Record<SaleChannel, string> = {
  pos: 'Balcao',
  restaurant: 'Restaurante',
  online: 'Loja online',
};

export interface PurchasesTabProps {
  customerId: string;
}

/** Everything this customer ever bought, newest first. */
export function PurchasesTab({ customerId }: PurchasesTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const purchases = useCustomerPurchases(customerId, page, pageSize);
  const rows = purchases.data?.data ?? [];
  const total = purchases.data?.total ?? 0;

  const columns: Array<DataTableColumn<CustomerPurchase>> = [
    {
      key: 'receiptNumber',
      header: 'Recibo',
      cell: (row) => <span className="tabular font-semibold">{row.receiptNumber}</span>,
    },
    {
      key: 'date',
      header: t('common.date'),
      cell: (row) => <span className="tabular text-sm">{formatDateTime(row.date)}</span>,
    },
    {
      key: 'channel',
      header: 'Canal',
      headClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{CHANNEL_LABELS[row.channel]}</span>
      ),
    },
    {
      key: 'itemCount',
      header: 'Artigos',
      numeric: true,
      cell: (row) => <span className="tabular">{formatNumber(row.itemCount)}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      cell: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]} size="sm">
          {STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      key: 'totalMinor',
      header: t('common.total'),
      numeric: true,
      cell: (row) => <span className="tabular font-semibold">{money(row.totalMinor)}</span>,
    },
  ];

  if (purchases.isError) {
    const message =
      purchases.error instanceof ApiRequestError
        ? purchases.error.message
        : 'Ocorreu um erro inesperado.';
    return (
      <div className="panel">
        <EmptyState
          icon={AlertTriangle}
          title="Nao foi possivel carregar as compras"
          description={message}
          action={{ label: t('common.retry'), onClick: () => void purchases.refetch() }}
        />
      </div>
    );
  }

  return (
    <div className="panel flex flex-col">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={purchases.isLoading}
        onRowClick={(row) => navigate(`/transaccoes/${row.id}`)}
        emptyIcon={Receipt}
        emptyTitle="Sem compras"
        emptyDescription="Este cliente ainda nao tem vendas associadas."
        stickyHeader
      />
      <Pagination
        className="border-t border-border px-4"
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

export default PurchasesTab;
