import * as React from 'react';
import {
  AlertTriangle,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserX,
} from 'lucide-react';
import { ROLE_LABELS, ROLES, type Role } from '@pos/shared';

import {
  Badge,
  Button,
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
  UserAvatar,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatDateTime, relativeTime } from '@/lib/format';

import { useLocations, useUserList } from './user-queries';
import {
  defaultUserListParams,
  type UserListParams,
  type UserRow,
} from './user-types';
import { UserSheet } from './components/user-sheet';
import { PermissionSheet } from './components/permission-sheet';
import { PinDialog, ResetPasswordDialog, ToggleActiveDialog } from './components/user-actions';

/** Column keys that double as the API's `sort` values. */
const SORTABLE: Record<string, UserListParams['sort']> = {
  name: 'name',
  role: 'role',
  lastLoginAt: 'lastLoginAt',
};

const ROLE_VARIANTS: Record<Role, 'default' | 'secondary' | 'outline' | 'muted' | 'warning'> = {
  super_admin: 'warning',
  entity_admin: 'default',
  manager: 'default',
  cashier: 'secondary',
  stock_clerk: 'secondary',
  waiter: 'outline',
  kitchen: 'outline',
};

type DialogKind = 'password' | 'pin' | 'active' | null;

export default function UsersPage() {
  const can = useAuth((s) => s.can);
  const currentUserId = useAuth((s) => s.user?.id);
  const entityId = useAuth((s) => s.entity?.id);
  const canWrite = can('user:write');

  const [params, setParams] = React.useState<UserListParams>(defaultUserListParams);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [target, setTarget] = React.useState<UserRow | null>(null);
  const [dialog, setDialog] = React.useState<DialogKind>(null);
  const [permissionsFor, setPermissionsFor] = React.useState<UserRow | null>(null);
  const [permissionsOpen, setPermissionsOpen] = React.useState(false);

  const list = useUserList(params);
  const locations = useLocations(entityId);

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;

  const patch = (next: Partial<UserListParams>) =>
    setParams((prev) => ({ ...prev, page: 1, ...next }));

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditing(user);
    setSheetOpen(true);
  };

  const openDialog = (user: UserRow, kind: Exclude<DialogKind, null>) => {
    setTarget(user);
    setDialog(kind);
  };

  /** The permission editor: what THIS person may see, role notwithstanding. */
  const openPermissions = (user: UserRow) => {
    setPermissionsFor(user);
    setPermissionsOpen(true);
  };

  const sort: DataTableSort | null = SORTABLE[params.sort]
    ? { key: params.sort, direction: params.order }
    : null;

  const filtered =
    params.search !== '' ||
    params.role !== 'all' ||
    params.active !== 'all' ||
    params.locationId !== 'all';

  const columns: Array<DataTableColumn<UserRow>> = [
    {
      key: 'name',
      header: 'Nome',
      sortable: true,
      width: '18rem',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <UserAvatar name={row.name} src={row.avatarUrl ?? undefined} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {row.name}
              {row.id === currentUserId && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">(voce)</span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Perfil',
      sortable: true,
      width: '12rem',
      cell: (row) => <Badge variant={ROLE_VARIANTS[row.role]}>{ROLE_LABELS[row.role].pt}</Badge>,
    },
    {
      key: 'permissions',
      header: 'Permissoes',
      width: '11rem',
      headClassName: 'hidden sm:table-cell',
      className: 'hidden sm:table-cell',
      cell: (row) =>
        row.hasCustomPermissions ? (
          <Badge variant="warning">Personalizado</Badge>
        ) : (
          <Badge variant="muted">Padrao do perfil</Badge>
        ),
    },
    {
      key: 'locationName',
      header: 'Localizacao',
      headClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{row.locationName ?? '-'}</span>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Ultimo acesso',
      sortable: true,
      width: '13rem',
      headClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
      cell: (row) =>
        row.lastLoginAt ? (
          <div className="min-w-0">
            <p className="tabular text-sm text-foreground">{formatDateTime(row.lastLoginAt)}</p>
            <p className="text-xs text-muted-foreground">{relativeTime(row.lastLoginAt)}</p>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Nunca entrou</span>
        ),
    },
    {
      key: 'active',
      header: 'Estado',
      width: '10rem',
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={row.active ? 'success' : 'muted'} dot>
            {row.active ? 'Activo' : 'Inactivo'}
          </Badge>
          {row.pinEnabled && (
            <Badge variant="outline" size="sm">
              PIN
            </Badge>
          )}
        </div>
      ),
    },
  ];

  if (canWrite) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Accoes</span>,
      align: 'right',
      width: '5rem',
      cell: (row) => (
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
            <DropdownMenuItem onSelect={() => openEdit(row)}>
              <Pencil />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openPermissions(row)}>
              <ShieldCheck />
              Permissoes
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDialog(row, 'password')}>
              <RotateCcw />
              Repor palavra-passe
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDialog(row, 'pin')}>
              <KeyRound />
              {row.pinEnabled ? 'Alterar ou remover PIN' : 'Definir PIN'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant={row.active ? 'destructive' : 'default'}
              onSelect={() => openDialog(row, 'active')}
            >
              {row.active ? <UserX /> : <UserCheck />}
              {row.active ? 'Desactivar' : 'Reactivar'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    });
  }

  const errorMessage =
    list.error instanceof ApiRequestError
      ? list.error.isOffline
        ? 'Sem ligacao ao servidor.'
        : list.error.message
      : 'Ocorreu um erro inesperado.';

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Utilizadores"
        description="Quem trabalha neste negocio e o que cada um pode ver. O perfil define o ponto de partida - as permissoes de cada pessoa podem ser afinadas uma a uma."
        actions={
          canWrite ? (
            <Button size="lg" leftIcon={<Plus />} onClick={openCreate}>
              Novo utilizador
            </Button>
          ) : undefined
        }
      />

      <div className="panel flex flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <SearchInput
            className="min-w-[14rem] flex-1"
            placeholder="Procurar por nome ou email..."
            defaultValue={params.search}
            onSearch={(value) => patch({ search: value })}
            aria-label="Procurar utilizadores"
          />

          <Select
            value={params.role}
            onValueChange={(value) => patch({ role: value as UserListParams['role'] })}
          >
            <SelectTrigger className="w-[13rem]" aria-label="Filtrar por perfil">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os perfis</SelectItem>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role].pt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={params.locationId}
            onValueChange={(value) => patch({ locationId: value })}
          >
            <SelectTrigger className="w-[12rem]" aria-label="Filtrar por localizacao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as localizacoes</SelectItem>
              {(locations.data ?? []).map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={params.active}
            onValueChange={(value) => patch({ active: value as UserListParams['active'] })}
          >
            <SelectTrigger className="w-[10rem]" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="true">Activos</SelectItem>
              <SelectItem value="false">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {list.isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Nao foi possivel carregar os utilizadores"
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
              sort={sort}
              onSortChange={(next) => {
                const mapped = next ? SORTABLE[next.key] : undefined;
                setParams((prev) => ({
                  ...prev,
                  page: 1,
                  sort: mapped ?? 'name',
                  order: next && mapped ? next.direction : 'asc',
                }));
              }}
              onRowClick={canWrite ? (row) => openEdit(row) : undefined}
              emptyIcon={UserCog}
              emptyTitle="Sem utilizadores"
              emptyDescription={
                filtered
                  ? 'Nenhum utilizador corresponde aos filtros aplicados.'
                  : 'Ainda nao ha colaboradores registados.'
              }
              emptyAction={
                canWrite && !filtered ? { label: 'Novo utilizador', onClick: openCreate } : undefined
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

      <UserSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        user={editing}
        onAdjustPermissions={openPermissions}
      />

      <PermissionSheet
        open={permissionsOpen}
        onOpenChange={setPermissionsOpen}
        user={permissionsFor}
      />

      <ResetPasswordDialog
        user={target}
        open={dialog === 'password'}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <PinDialog
        user={target}
        open={dialog === 'pin'}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <ToggleActiveDialog
        user={target}
        open={dialog === 'active'}
        onOpenChange={(open) => !open && setDialog(null)}
      />
    </div>
  );
}
