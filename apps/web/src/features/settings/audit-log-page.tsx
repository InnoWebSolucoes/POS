import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, Lock, RotateCcw, ScrollText } from 'lucide-react';
import type { Paginated } from '@pos/shared';

import {
  Badge,
  Button,
  DataTable,
  DateRangePicker,
  EmptyState,
  Input,
  Pagination,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SwitchField,
  rangeForPreset,
  type DataTableColumn,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatDateTime, number as formatNumber, relativeTime } from '@/lib/format';
import { qk } from '@/lib/query';

import { useAuditActions, useAuditLog } from './audit-queries';
import {
  actionLabel,
  actionVariant,
  defaultAuditFilters,
  targetLabel,
  TARGET_TYPES,
  TARGET_TYPE_LABELS,
  type AuditFilters,
  type AuditLogEntry,
} from './audit-types';
import { AuditDetailSheet } from './components/audit-detail';
import { Callout } from './components/settings-section';

interface UserOption {
  id: string;
  name: string;
}

/** The staff list only feeds the filter dropdown, so a single page is plenty. */
function useUserOptions(enabled: boolean) {
  return useQuery({
    queryKey: qk.users({ scope: 'audit-filter' }),
    queryFn: async () => {
      const page = await api.get<Paginated<UserOption>>('/api/users', {
        pageSize: 200,
        sort: 'name',
      });
      return page.data.map((user) => ({ id: user.id, name: user.name }));
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * The immutable trail. Every write in the system lands here and nothing ever
 * leaves: there is no update or delete route for /audit on the server, by
 * design, and this screen says so out loud.
 */
export default function AuditLogPage() {
  const can = useAuth((s) => s.can);
  const [filters, setFilters] = React.useState<AuditFilters>(defaultAuditFilters);
  const [selected, setSelected] = React.useState<AuditLogEntry | null>(null);
  /** Bumped on "limpar filtros" so the uncontrolled search box empties too. */
  const [resetKey, setResetKey] = React.useState(0);

  const list = useAuditLog(filters);
  const actions = useAuditActions();
  const users = useUserOptions(can('user:read'));

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;

  /** Any filter change resets to page 1 - page 4 of a new filter means nothing. */
  const patch = (next: Partial<AuditFilters>) =>
    setFilters((prev) => ({ ...prev, page: 1, ...next }));

  const filtered =
    filters.search !== '' ||
    filters.action !== 'all' ||
    filters.userId !== 'all' ||
    filters.targetType !== 'all' ||
    filters.targetId !== '' ||
    filters.dated;

  const columns: Array<DataTableColumn<AuditLogEntry>> = [
    {
      key: 'createdAt',
      header: 'Data e hora',
      width: '13rem',
      cell: (row) => (
        <div className="min-w-0">
          <p className="tabular text-sm font-medium text-foreground">
            {formatDateTime(row.createdAt)}
          </p>
          <p className="text-xs text-muted-foreground">{relativeTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'user',
      header: 'Utilizador',
      width: '12rem',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {row.userName ?? 'Sistema'}
          </p>
          {row.userId && (
            <p className="tabular truncate text-xs text-muted-foreground">{row.userId}</p>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Accao',
      width: '15rem',
      cell: (row) => <Badge variant={actionVariant(row.action)}>{actionLabel(row.action)}</Badge>,
    },
    {
      key: 'target',
      header: 'Alvo',
      headClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">{targetLabel(row.targetType)}</p>
          {row.targetId && (
            <p className="tabular truncate text-xs text-muted-foreground">{row.targetId}</p>
          )}
        </div>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP',
      width: '10rem',
      headClassName: 'hidden xl:table-cell',
      className: 'hidden xl:table-cell',
      cell: (row) => <span className="tabular text-sm">{row.ipAddress ?? '-'}</span>,
    },
    {
      key: 'details',
      header: <span className="sr-only">Detalhes</span>,
      align: 'right',
      width: '8rem',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          rightIcon={<ChevronRight />}
          onClick={(event) => {
            event.stopPropagation();
            setSelected(row);
          }}
        >
          Detalhes
        </Button>
      ),
    },
  ];

  const errorMessage =
    list.error instanceof ApiRequestError
      ? list.error.isOffline
        ? 'Sem ligacao ao servidor.'
        : list.error.message
      : 'Ocorreu um erro inesperado.';

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Registo de auditoria"
        description="Quem fez o que, quando e a partir de que endereco."
        breadcrumbs={[{ label: 'Definicoes', to: '/definicoes' }, { label: 'Auditoria' }]}
        actions={
          filtered ? (
            <Button
              variant="outline"
              leftIcon={<RotateCcw />}
              onClick={() => {
                setFilters(defaultAuditFilters());
                setResetKey((prev) => prev + 1);
              }}
            >
              Limpar filtros
            </Button>
          ) : undefined
        }
      />

      <Callout title="Este registo nao pode ser alterado">
        As entradas sao escritas automaticamente e sao permanentes: nao ha forma de as editar nem de
        as apagar, nem aqui nem na API. E esse o objectivo de um registo de auditoria.
      </Callout>

      <div className="panel flex flex-col">
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              key={resetKey}
              className="min-w-[16rem] flex-1"
              placeholder="Procurar por accao, utilizador, alvo, IP ou detalhes..."
              defaultValue={filters.search}
              onSearch={(value) => patch({ search: value })}
              aria-label="Procurar no registo"
            />

            <Select value={filters.action} onValueChange={(value) => patch({ action: value })}>
              <SelectTrigger className="w-[15rem]" aria-label="Filtrar por accao">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as accoes</SelectItem>
                {(actions.data?.data ?? []).map((option) => (
                  <SelectItem key={option.action} value={option.action}>
                    {actionLabel(option.action)} ({formatNumber(option.count)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {can('user:read') && (
              <Select value={filters.userId} onValueChange={(value) => patch({ userId: value })}>
                <SelectTrigger className="w-[13rem]" aria-label="Filtrar por utilizador">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os utilizadores</SelectItem>
                  {(users.data ?? []).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={filters.targetType}
              onValueChange={(value) => patch({ targetType: value })}
            >
              <SelectTrigger className="w-[13rem]" aria-label="Filtrar por tipo de alvo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os alvos</SelectItem>
                {TARGET_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {TARGET_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              className="w-[14rem] tabular"
              placeholder="ID do alvo"
              aria-label="Filtrar por ID do alvo"
              value={filters.targetId}
              onChange={(event) => patch({ targetId: event.target.value.trim() })}
            />

            <SwitchField
              className="w-auto gap-3"
              label="Filtrar por data"
              checked={filters.dated}
              onCheckedChange={(checked) => {
                const range = rangeForPreset('mes');
                patch({
                  dated: checked,
                  from: checked ? filters.from || range.from : '',
                  to: checked ? filters.to || range.to : '',
                });
              }}
            />

            {filters.dated && (
              <DateRangePicker
                value={{ from: filters.from, to: filters.to }}
                onChange={(range) => patch({ from: range.from, to: range.to })}
              />
            )}
          </div>
        </div>

        {list.isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Nao foi possivel carregar o registo"
            description={errorMessage}
            action={{ label: 'Tentar novamente', onClick: () => void list.refetch() }}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              loading={list.isLoading}
              manualSorting
              stickyHeader
              onRowClick={(row) => setSelected(row)}
              isRowSelected={(row) => row.id === selected?.id}
              emptyIcon={filtered ? ScrollText : Lock}
              emptyTitle="Sem registos"
              emptyDescription={
                filtered
                  ? 'Nenhuma entrada corresponde aos filtros aplicados.'
                  : 'Ainda nao ha actividade registada nesta entidade.'
              }
            />

            <Pagination
              className="border-t border-border px-4"
              page={filters.page}
              pageSize={filters.pageSize}
              total={total}
              onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
              onPageSizeChange={(pageSize) => patch({ pageSize })}
            />
          </>
        )}
      </div>

      <AuditDetailSheet
        entry={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
