import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  LogIn,
  MoreHorizontal,
  Plus,
  Power,
  ShieldAlert,
} from 'lucide-react';
import type { EntityDto } from '@pos/shared';

import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Pagination,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
  type DataTableColumn,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatDate, money, number as formatNumber } from '@/lib/format';

import { useEntityList, useEntityStats, useSetEntityActive } from './entity-queries';
import {
  defaultEntityListParams,
  MODE_LABELS,
  MODE_VARIANTS,
  type EntityListParams,
  type EntityStats,
} from './entity-types';
import { EntityWizard } from './components/entity-wizard';

/**
 * Tenancy administration. Only the platform owner gets here: every other role
 * is scoped to a single entity by the server anyway, so the list would be a
 * table of one.
 */
export default function EntitiesPage() {
  const navigate = useNavigate();
  const role = useAuth((s) => s.user?.role);
  const currentEntityId = useAuth((s) => s.entity?.id);
  const switchEntity = useAuth((s) => s.switchEntity);
  const isSuperAdmin = role === 'super_admin';

  const [params, setParams] = React.useState<EntityListParams>(defaultEntityListParams);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [toToggle, setToToggle] = React.useState<EntityDto | null>(null);
  const [entering, setEntering] = React.useState<string | null>(null);

  const list = useEntityList(params);
  const rows = React.useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.total ?? 0;

  const ids = React.useMemo(() => rows.map((row) => row.id), [rows]);
  const statsQueries = useEntityStats(ids);

  const setActive = useSetEntityActive();

  /** id -> stats, so a column can read one row's numbers without a lookup loop. */
  const statsById = React.useMemo(() => {
    const map = new Map<string, { data: EntityStats | undefined; loading: boolean }>();
    ids.forEach((id, index) => {
      const query = statsQueries[index];
      map.set(id, { data: query?.data, loading: query?.isLoading ?? false });
    });
    return map;
  }, [ids, statsQueries]);

  const patch = (next: Partial<EntityListParams>) =>
    setParams((prev) => ({ ...prev, page: 1, ...next }));

  const enterEntity = async (entity: EntityDto) => {
    setEntering(entity.id);
    try {
      await switchEntity(entity.id);
      toast.success('Entidade activa', entity.name);
      navigate('/dashboard');
    } catch (cause) {
      const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
      toast.error('Nao foi possivel entrar nesta entidade', message);
    } finally {
      setEntering(null);
    }
  };

  const confirmToggle = () => {
    if (!toToggle) return;
    const entity = toToggle;
    setToToggle(null);

    setActive.mutate(
      { id: entity.id, active: !entity.active },
      {
        onSuccess: () =>
          toast.success(entity.active ? 'Entidade desactivada' : 'Entidade reactivada', entity.name),
        onError: (cause) => {
          const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
          toast.error('Nao foi possivel alterar o estado', message);
        },
      },
    );
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col p-4 sm:p-6">
        <PageHeader title="Entidades" description="Administracao de inquilinos da plataforma." />
        <div className="panel">
          <EmptyState
            icon={ShieldAlert}
            title="Area reservada"
            description="Apenas o super administrador da plataforma pode gerir entidades."
          />
        </div>
      </div>
    );
  }

  const columns: Array<DataTableColumn<EntityDto>> = [
    {
      key: 'name',
      header: 'Entidade',
      sortable: true,
      width: '20rem',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {row.name}
            {row.id === currentEntityId && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">(activa)</span>
            )}
          </p>
          <p className="tabular truncate text-xs text-muted-foreground">/{row.slug}</p>
        </div>
      ),
    },
    {
      key: 'mode',
      header: 'Modo',
      width: '9rem',
      cell: (row) => <Badge variant={MODE_VARIANTS[row.mode]}>{MODE_LABELS[row.mode]}</Badge>,
    },
    {
      key: 'counts',
      header: 'Dimensao',
      width: '14rem',
      headClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell',
      cell: (row) => {
        const stats = statsById.get(row.id);
        if (stats?.loading) return <Skeleton className="h-4 w-28" />;
        return (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="muted" size="sm">
              {formatNumber(stats?.data?.locationCount ?? row.locationCount ?? 0)} loja(s)
            </Badge>
            <Badge variant="muted" size="sm">
              {formatNumber(stats?.data?.userCount ?? row.userCount ?? 0)} pessoa(s)
            </Badge>
            {stats?.data && (
              <Badge variant="muted" size="sm">
                {formatNumber(stats.data.productCount)} produto(s)
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'revenue',
      header: 'Vendas hoje',
      numeric: true,
      width: '12rem',
      cell: (row) => {
        const stats = statsById.get(row.id);
        if (stats?.loading) return <Skeleton className="ml-auto h-4 w-20" />;
        // The API blanks revenue for a role without financial visibility.
        if (!stats?.data || stats.data.todayRevenueMinor === null) {
          return <span className="text-sm text-muted-foreground">-</span>;
        }
        return (
          <div className="min-w-0">
            <p className="tabular font-semibold text-foreground">
              {money(stats.data.todayRevenueMinor)}
            </p>
            <p className="tabular text-xs text-muted-foreground">
              {formatNumber(stats.data.todaySaleCount)} venda(s)
            </p>
          </div>
        );
      },
    },
    {
      key: 'active',
      header: 'Estado',
      width: '9rem',
      cell: (row) => (
        <Badge variant={row.active ? 'success' : 'muted'} dot>
          {row.active ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Criada',
      width: '8rem',
      headClassName: 'hidden xl:table-cell',
      className: 'hidden xl:table-cell',
      cell: (row) => <span className="tabular text-sm">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Accoes</span>,
      align: 'right',
      width: '15rem',
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<LogIn />}
            loading={entering === row.id}
            disabled={!row.active || row.id === currentEntityId}
            onClick={(event) => {
              event.stopPropagation();
              void enterEntity(row);
            }}
          >
            Entrar
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Accoes para ${row.name}`}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{row.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!row.active} onSelect={() => void enterEntity(row)}>
                <LogIn />
                Entrar nesta entidade
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={row.active ? 'destructive' : 'default'}
                onSelect={() => setToToggle(row)}
              >
                <Power />
                {row.active ? 'Desactivar' : 'Reactivar'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const errorMessage =
    list.error instanceof ApiRequestError
      ? list.error.isOffline
        ? 'Sem ligacao ao servidor.'
        : list.error.message
      : 'Ocorreu um erro inesperado.';

  const filtered = params.search !== '' || params.active !== 'all';

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Entidades"
        description="Todos os negocios alojados nesta instalacao."
        actions={
          <Button size="lg" leftIcon={<Plus />} onClick={() => setWizardOpen(true)}>
            Nova entidade
          </Button>
        }
      />

      <div className="panel flex flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <SearchInput
            className="min-w-[14rem] flex-1"
            placeholder="Procurar por nome, endereco, NIF ou email..."
            defaultValue={params.search}
            onSearch={(value) => patch({ search: value })}
            aria-label="Procurar entidades"
          />

          <Select
            value={params.active}
            onValueChange={(value) => patch({ active: value as EntityListParams['active'] })}
          >
            <SelectTrigger className="w-[11rem]" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="true">Activas</SelectItem>
              <SelectItem value="false">Inactivas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {list.isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Nao foi possivel carregar as entidades"
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
              stickyHeader
              emptyIcon={Building2}
              emptyTitle="Sem entidades"
              emptyDescription={
                filtered
                  ? 'Nenhuma entidade corresponde aos filtros aplicados.'
                  : 'Crie a primeira entidade para comecar.'
              }
              emptyAction={
                filtered ? undefined : { label: 'Nova entidade', onClick: () => setWizardOpen(true) }
              }
            />

            <Pagination
              className="border-t border-border px-4"
              page={params.page}
              pageSize={params.pageSize}
              total={total}
              onPageChange={(page) => setParams((prev) => ({ ...prev, page }))}
              onPageSizeChange={(pageSize) => patch({ pageSize })}
            />
          </>
        )}
      </div>

      <EntityWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => void list.refetch()}
      />

      <ConfirmDialog
        open={toToggle !== null}
        onOpenChange={(open) => !open && setToToggle(null)}
        title={toToggle?.active ? `Desactivar ${toToggle.name}?` : `Reactivar ${toToggle?.name}?`}
        description={
          toToggle?.active
            ? 'Ninguem desta entidade consegue iniciar sessao enquanto estiver inactiva. Os dados mantem-se intactos e pode reactiva-la a qualquer momento.'
            : 'A entidade volta a ficar acessivel aos seus utilizadores.'
        }
        confirmLabel={toToggle?.active ? 'Desactivar' : 'Reactivar'}
        variant={toToggle?.active ? 'destructive' : 'success'}
        onConfirm={confirmToggle}
      />
    </div>
  );
}
