import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CalendarPlus,
  LayoutGrid,
  LogIn,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { ENTITY_MODES, type EntityDto, type EntityMode } from '@pos/shared';

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
  StatCard,
  toast,
  type DataTableColumn,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatDate, number as formatNumber } from '@/lib/format';

import { useEntityList, useSetEntityActive } from './entity-queries';
import type { EntityListParams } from './entity-types';
import {
  CONSOLE_MODE_BADGE,
  CONSOLE_MODE_LABELS,
  CONSOLE_MODE_SHORT,
  type ModeFilter,
} from './platform-types';
import { EntityWizard } from './components/entity-wizard';
import { EntityEditor } from './components/entity-editor';
import { SupportAccessDialog } from './components/support-access-dialog';
import { SystemHealthPanel } from './components/system-health-panel';

/**
 * The platform console.
 *
 * This screen belongs to the platform operator, and it is about the platform:
 * which client accounts exist, what kind of business each one runs, whether the
 * service is up. It is deliberately NOT a window onto what our clients sold
 * today - their takings are their business, read on their own dashboard by
 * them. Nothing here calls /api/entities/:id/stats.
 */

/** The page size Select offers 10/20/50/100, so start on one of those. */
const initialParams = (): EntityListParams => ({
  page: 1,
  pageSize: 20,
  search: '',
  active: 'all',
});

/**
 * A second, wider read of the same list feeds the tiles. The counters have to
 * describe the whole platform, not whichever page the operator is looking at,
 * and 200 is the largest page the API allows.
 */
const SUMMARY_PARAMS: EntityListParams = { page: 1, pageSize: 200, search: '', active: 'all' };

function NoPermission() {
  return (
    <div className="flex flex-col p-4 sm:p-6">
      <PageHeader title="Consola da Plataforma" description="Gestao das contas de clientes." />
      <div className="panel">
        <EmptyState
          icon={ShieldAlert}
          title="Sem permissao"
          description="Apenas o operador da plataforma pode abrir esta consola. O seu negocio tem o seu proprio painel."
        />
      </div>
    </div>
  );
}

export default function EntitiesPage() {
  const role = useAuth((s) => s.user?.role);
  // Guarding before the console mounts also keeps its queries from firing.
  if (role !== 'super_admin') return <NoPermission />;
  return <PlatformConsole />;
}

function PlatformConsole() {
  const navigate = useNavigate();
  const switchEntity = useAuth((s) => s.switchEntity);

  const [params, setParams] = React.useState<EntityListParams>(initialParams);
  const [mode, setMode] = React.useState<ModeFilter>('all');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EntityDto | null>(null);
  const [supportTarget, setSupportTarget] = React.useState<EntityDto | null>(null);
  const [toToggle, setToToggle] = React.useState<EntityDto | null>(null);
  const [entering, setEntering] = React.useState<string | null>(null);

  const list = useEntityList(params);
  const summary = useEntityList(SUMMARY_PARAMS);
  const setActive = useSetEntityActive();

  const pageRows = React.useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.total ?? 0;

  /**
   * The list endpoint filters by search and active only, so the type filter is
   * applied to the page in hand - and the table says so when it is on.
   */
  const rows = React.useMemo(
    () => (mode === 'all' ? pageRows : pageRows.filter((row) => row.mode === mode)),
    [pageRows, mode],
  );

  /** Platform counters, derived from the entity list. No money anywhere. */
  const stats = React.useMemo(() => {
    const all = summary.data?.data ?? [];
    const now = new Date();
    const byMode: Record<EntityMode, number> = { retail: 0, restaurant: 0, online: 0 };

    let active = 0;
    let users = 0;
    let fresh = 0;

    for (const entity of all) {
      if (entity.active) active += 1;
      byMode[entity.mode] += 1;
      users += entity.userCount ?? 0;

      const created = new Date(entity.createdAt);
      if (
        !Number.isNaN(created.getTime()) &&
        created.getFullYear() === now.getFullYear() &&
        created.getMonth() === now.getMonth()
      ) {
        fresh += 1;
      }
    }

    const counted = all.length;
    return {
      active,
      inactive: counted - active,
      byMode,
      users,
      fresh,
      counted,
      /** True when the platform has more clients than one page can carry. */
      partial: (summary.data?.total ?? counted) > counted,
    };
  }, [summary.data]);

  const sampleHint = stats.partial
    ? `Amostra dos primeiros ${formatNumber(stats.counted)} negocios`
    : undefined;

  const patch = (next: Partial<EntityListParams>) =>
    setParams((prev) => ({ ...prev, page: 1, ...next }));

  const enterEntity = async (entity: EntityDto) => {
    setSupportTarget(null);
    setEntering(entity.id);
    try {
      await switchEntity(entity.id);
      toast.success(`Dentro de ${entity.name}`, 'Acesso de operador registado na auditoria.');
      navigate('/dashboard');
    } catch (cause) {
      const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
      toast.error('Nao foi possivel abrir este negocio', message);
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
          toast.success(entity.active ? 'Negocio desactivado' : 'Negocio reactivado', entity.name),
        onError: (cause) => {
          const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
          toast.error('Nao foi possivel alterar o estado', message);
        },
      },
    );
  };

  const columns: Array<DataTableColumn<EntityDto>> = [
    {
      key: 'name',
      header: 'Negocio',
      sortable: true,
      width: '20rem',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{row.name}</p>
          <p className="tabular truncate text-xs text-muted-foreground">/{row.slug}</p>
        </div>
      ),
    },
    {
      key: 'mode',
      header: 'Tipo',
      width: '10rem',
      cell: (row) => (
        <Badge variant={CONSOLE_MODE_BADGE[row.mode]}>{CONSOLE_MODE_LABELS[row.mode]}</Badge>
      ),
    },
    {
      key: 'locationCount',
      header: 'Localizacoes',
      numeric: true,
      width: '9rem',
      headClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
      cell: (row) => <span className="tabular text-sm">{formatNumber(row.locationCount ?? 0)}</span>,
    },
    {
      key: 'userCount',
      header: 'Utilizadores',
      numeric: true,
      width: '9rem',
      headClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
      cell: (row) => <span className="tabular text-sm">{formatNumber(row.userCount ?? 0)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Criado em',
      width: '9rem',
      headClassName: 'hidden xl:table-cell',
      className: 'hidden xl:table-cell',
      cell: (row) => <span className="tabular text-sm">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'active',
      header: 'Estado',
      width: '8rem',
      cell: (row) => (
        <Badge variant={row.active ? 'success' : 'muted'} dot>
          {row.active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Accoes</span>,
      align: 'right',
      width: '14rem',
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<LogIn />}
            loading={entering === row.id}
            disabled={!row.active}
            onClick={(event) => {
              event.stopPropagation();
              setSupportTarget(row);
            }}
          >
            Abrir
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
              <DropdownMenuItem onSelect={() => setEditing(row)}>
                <Pencil />
                Editar
              </DropdownMenuItem>
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

  const filtered = params.search !== '' || params.active !== 'all' || mode !== 'all';

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Consola da Plataforma"
        description={
          <>
            Onde o operador gere as contas dos clientes: quem esta na plataforma, que tipo de
            negocio tem cada um e se o servico esta de pe. Os numeros de vendas pertencem a cada
            cliente e vivem no painel dele.
          </>
        }
        actions={
          <Button size="lg" leftIcon={<Plus />} onClick={() => setCreateOpen(true)}>
            Novo negocio
          </Button>
        }
      />

      {/* Platform counters. Accounts, types and people - never takings. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Negocios activos"
          value={summary.isError ? '-' : formatNumber(stats.active)}
          icon={Building2}
          tone="primary"
          loading={summary.isLoading}
          deltaHint={
            summary.isError
              ? undefined
              : stats.inactive > 0
                ? `${formatNumber(stats.inactive)} inactivo(s)`
                : sampleHint
          }
        />

        <StatCard
          label="Por tipo"
          icon={LayoutGrid}
          loading={summary.isLoading}
          value={
            summary.isError ? (
              '-'
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xl">
                {ENTITY_MODES.map((entityMode) => (
                  <span key={entityMode} className="inline-flex items-baseline gap-1.5">
                    <span className="tabular font-semibold">
                      {formatNumber(stats.byMode[entityMode])}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {CONSOLE_MODE_SHORT[entityMode]}
                    </span>
                  </span>
                ))}
              </span>
            )
          }
        />

        <StatCard
          label="Utilizadores totais"
          value={summary.isError ? '-' : formatNumber(stats.users)}
          icon={Users}
          loading={summary.isLoading}
          deltaHint={summary.isError ? undefined : sampleHint}
        />

        <StatCard
          label="Novos este mes"
          value={summary.isError ? '-' : formatNumber(stats.fresh)}
          icon={CalendarPlus}
          loading={summary.isLoading}
          deltaHint={summary.isError ? undefined : sampleHint}
        />
      </div>

      {summary.isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            Nao foi possivel carregar o resumo da plataforma.
          </p>
          <Button variant="outline" size="sm" onClick={() => void summary.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      <SystemHealthPanel />

      <div className="panel flex flex-col">
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              className="min-w-[14rem] flex-1"
              placeholder="Procurar por nome, endereco, NIF ou email..."
              defaultValue={params.search}
              onSearch={(value) => patch({ search: value })}
              aria-label="Procurar negocios"
            />

            <Select value={mode} onValueChange={(value) => setMode(value as ModeFilter)}>
              <SelectTrigger className="w-[12rem]" aria-label="Filtrar por tipo de negocio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {ENTITY_MODES.map((entityMode) => (
                  <SelectItem key={entityMode} value={entityMode}>
                    {CONSOLE_MODE_LABELS[entityMode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={params.active}
              onValueChange={(value) => patch({ active: value as EntityListParams['active'] })}
            >
              <SelectTrigger className="w-[11rem]" aria-label="Filtrar por estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                <SelectItem value="true">Activos</SelectItem>
                <SelectItem value="false">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Os clientes tambem se registam sozinhos em{' '}
            <span className="tabular rounded bg-muted px-1.5 py-0.5">/registar</span> e escolhem ai
            o tipo de negocio. Criar aqui e para quando acompanha a adesao pessoalmente.
          </p>
        </div>

        {list.isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Nao foi possivel carregar os negocios"
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
              emptyTitle="Sem negocios"
              emptyDescription={
                filtered
                  ? 'Nenhum negocio corresponde aos filtros aplicados.'
                  : 'Ainda nao ha clientes nesta plataforma.'
              }
              emptyAction={
                filtered ? undefined : { label: 'Novo negocio', onClick: () => setCreateOpen(true) }
              }
            />

            {mode !== 'all' && (
              <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                O filtro de tipo aplica-se aos negocios desta pagina.
              </p>
            )}

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
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          void list.refetch();
          void summary.refetch();
        }}
      />

      <EntityEditor
        entity={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => setEditing(null)}
      />

      <SupportAccessDialog
        entity={supportTarget}
        onCancel={() => setSupportTarget(null)}
        onConfirm={(entity) => void enterEntity(entity)}
      />

      <ConfirmDialog
        open={toToggle !== null}
        onOpenChange={(open) => !open && setToToggle(null)}
        title={toToggle?.active ? `Desactivar ${toToggle.name}?` : `Reactivar ${toToggle?.name}?`}
        description={
          toToggle?.active
            ? 'Ninguem deste negocio consegue iniciar sessao enquanto estiver inactivo. Os dados mantem-se intactos e pode reactiva-lo a qualquer momento.'
            : 'O negocio volta a ficar acessivel aos seus utilizadores.'
        }
        confirmLabel={toToggle?.active ? 'Desactivar' : 'Reactivar'}
        variant={toToggle?.active ? 'destructive' : 'success'}
        onConfirm={confirmToggle}
      />
    </div>
  );
}
