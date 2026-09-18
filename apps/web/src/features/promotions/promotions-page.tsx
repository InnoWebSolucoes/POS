import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, MoreVertical, Pencil, Plus, Tag, Trash2, TicketPercent } from 'lucide-react';
import { PROMOTION_TYPES, SOCKET_EVENTS, type PromotionType } from '@pos/shared';

import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Pagination,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
  type DataTableColumn,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { useAuth } from '@/lib/auth-store';
import { money } from '@/lib/format';
import { useSocketEvent } from '@/hooks/use-socket';

import {
  promotionsRoot,
  useDeletePromotion,
  usePromotionList,
  useUpdatePromotion,
  type PromotionListParams,
} from './api';
import {
  PromotionScopeCell,
  PromotionTypeBadge,
  PromotionUsage,
  PromotionValue,
  PromotionWindow,
} from './components/promotion-bits';
import { PromotionFormSheet } from './components/promotion-form-sheet';
import { PromotionTestSheet } from './components/promotion-test-sheet';
import { QueryError } from './components/query-error';
import { PROMOTION_TYPE_LABELS, type PromotionDto } from './types';

const PAGE_SIZE = 25;

type StatusFilter = 'all' | 'running' | 'active' | 'inactive';

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'Todos os estados',
  running: 'A decorrer',
  active: 'Activas',
  inactive: 'Inactivas',
};

/** The filter row, translated into what GET /api/promotions understands. */
function statusParams(status: StatusFilter): Pick<PromotionListParams, 'active' | 'running'> {
  if (status === 'running') return { running: true };
  if (status === 'active') return { active: true };
  if (status === 'inactive') return { active: false };
  return {};
}

export default function PromotionsPage() {
  const can = useAuth((state) => state.can);
  const canAny = useAuth((state) => state.canAny);
  const canRead = can('product:read');
  const canWrite = can('sale:discount');
  const canTest = canAny('sale:create', 'sale:discount', 'restaurant:bill');
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState('');
  const [type, setType] = React.useState<PromotionType | 'all'>('all');
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [page, setPage] = React.useState(1);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PromotionDto | null>(null);
  const [testOpen, setTestOpen] = React.useState(false);
  const [testCode, setTestCode] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState<PromotionDto | null>(null);

  /** Windows open and close while the screen is left standing on a counter. */
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const params: PromotionListParams = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    type: type === 'all' ? undefined : type,
    ...statusParams(status),
  };

  const list = usePromotionList(params, canRead);
  const update = useUpdatePromotion();
  const removal = useDeletePromotion();

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;

  // The API announces promotion changes to the whole tenant; another till
  // creating a code should not leave this table showing yesterday.
  useSocketEvent<{ type?: string }>(
    SOCKET_EVENTS.NOTIFICATION,
    (payload) => {
      if (payload?.type === 'promotion') {
        void queryClient.invalidateQueries({ queryKey: promotionsRoot });
      }
    },
    canRead,
  );

  const patchFilters = (next: () => void) => {
    setPage(1);
    next();
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (promotion: PromotionDto) => {
    setEditing(promotion);
    setFormOpen(true);
  };

  const openTest = (code: string) => {
    setTestCode(code);
    setTestOpen(true);
  };

  const toggleActive = (promotion: PromotionDto, active: boolean) => {
    update.mutate(
      { id: promotion.id, body: { active } },
      {
        onSuccess: () =>
          toast.success(active ? 'Promocao activada' : 'Promocao desactivada', promotion.code),
        onError: (error: Error) => toast.error('Nao foi possivel actualizar', error.message),
      },
    );
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    removal.mutate(target.id, {
      onSuccess: () => {
        toast.success('Promocao eliminada', target.code);
        setPendingDelete(null);
      },
      onError: (error: Error) => toast.error('Nao foi possivel eliminar', error.message),
    });
  };

  if (!canRead) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Promocoes" description="Cupoes e descontos automaticos." />
        <EmptyState
          icon={TicketPercent}
          title="Sem permissao"
          description="A sua conta nao tem acesso as promocoes."
        />
      </div>
    );
  }

  const columns: Array<DataTableColumn<PromotionDto>> = [
    {
      key: 'code',
      header: 'Codigo',
      width: '16rem',
      cell: (row) => (
        <div className="min-w-0">
          <p className="tabular truncate text-base font-semibold uppercase text-foreground">{row.code}</p>
          <p className="truncate text-sm text-muted-foreground">{row.namePt}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      width: '11rem',
      cell: (row) => <PromotionTypeBadge type={row.type} />,
    },
    {
      key: 'value',
      header: 'Valor',
      width: '10rem',
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <PromotionValue promotion={row} />
          {row.minSpendMinor > 0 && (
            <span className="tabular text-xs text-muted-foreground">min. {money(row.minSpendMinor)}</span>
          )}
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Ambito',
      width: '12rem',
      cell: (row) => <PromotionScopeCell promotion={row} />,
    },
    {
      key: 'window',
      header: 'Janela',
      width: '15rem',
      cell: (row) => <PromotionWindow promotion={row} now={now} />,
    },
    {
      key: 'usage',
      header: 'Utilizacoes',
      align: 'right',
      width: '9rem',
      cell: (row) => <PromotionUsage promotion={row} />,
    },
    {
      key: 'active',
      header: 'Activa',
      align: 'center',
      width: '6rem',
      cell: (row) => (
        <span
          className="flex justify-center"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          <Switch
            checked={row.active}
            disabled={!canWrite || (update.isPending && update.variables?.id === row.id)}
            onCheckedChange={(checked) => toggleActive(row, checked)}
            aria-label={`Activar ${row.code}`}
          />
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '4rem',
      cell: (row) => (
        <span
          className="flex justify-end"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Accoes para ${row.code}`}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canWrite && (
                <DropdownMenuItem onSelect={() => openEdit(row)}>
                  <Pencil /> Editar
                </DropdownMenuItem>
              )}
              {canTest && (
                <DropdownMenuItem onSelect={() => openTest(row.code)}>
                  <FlaskConical /> Testar
                </DropdownMenuItem>
              )}
              {canWrite && (
                <DropdownMenuItem variant="destructive" onSelect={() => setPendingDelete(row)}>
                  <Trash2 /> Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ),
    },
  ];

  const filtered = Boolean(search) || type !== 'all' || status !== 'all';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Promocoes"
        description="Cupoes e descontos automaticos aceites na caixa."
        actions={
          <>
            {canTest && (
              <Button variant="outline" size="lg" leftIcon={<FlaskConical />} onClick={() => openTest('')}>
                Testar
              </Button>
            )}
            {canWrite && (
              <Button size="lg" leftIcon={<Plus />} onClick={openCreate}>
                Nova promocao
              </Button>
            )}
          </>
        }
      />

      <div className="panel flex flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <SearchInput
            className="min-w-[14rem] flex-1"
            placeholder="Procurar por codigo ou nome..."
            defaultValue=""
            onSearch={(value) => patchFilters(() => setSearch(value))}
            aria-label="Procurar promocoes"
          />

          <Select
            value={type}
            onValueChange={(value) => patchFilters(() => setType(value as PromotionType | 'all'))}
          >
            <SelectTrigger className="w-[12rem]" aria-label="Filtrar por tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {PROMOTION_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {PROMOTION_TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={status}
            onValueChange={(value) => patchFilters(() => setStatus(value as StatusFilter))}
          >
            <SelectTrigger className="w-[12rem]" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {list.isError ? (
          <QueryError
            error={list.error}
            onRetry={() => void list.refetch()}
            title="Nao foi possivel carregar as promocoes"
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              loading={list.isLoading}
              onRowClick={canWrite ? (row) => openEdit(row) : undefined}
              emptyIcon={Tag}
              emptyTitle="Sem resultados"
              emptyDescription={
                filtered
                  ? 'Nenhuma promocao corresponde aos filtros aplicados.'
                  : 'Ainda nao ha promocoes criadas.'
              }
              emptyAction={!filtered && canWrite ? { label: 'Nova promocao', onClick: openCreate } : undefined}
              stickyHeader
            />

            <Pagination
              className="border-t border-border px-4"
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <PromotionFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        promotion={editing}
        onSaved={() => setEditing(null)}
      />

      <PromotionTestSheet open={testOpen} onOpenChange={setTestOpen} initialCode={testCode} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Eliminar promocao?"
        description={
          pendingDelete
            ? `${pendingDelete.code} - ${pendingDelete.namePt}. Esta accao nao pode ser anulada.`
            : undefined
        }
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
