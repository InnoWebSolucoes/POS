import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, Pencil, RefreshCw, Utensils, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  SOCKET_EVENTS,
  type FloorAreaDto,
  type OrderDto,
  type RestaurantTableDto,
  type TableStatus,
} from '@pos/shared';

import { Badge, Button, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger, toast } from '@/components/ui';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { useAuth } from '@/lib/auth-store';
import { errorBeep, successChime } from '@/lib/sound';
import { useSocketEvent, useSocketStatus } from '@/hooks/use-socket';

import { FloorLegend, FloorSummary } from './floor-components/floor-legend';
import { FloorTableTile } from './floor-components/floor-table-tile';
import { OpenTableDialog } from './floor-components/open-table-dialog';
import { TableActionsDialog } from './floor-components/table-actions-dialog';
import {
  areaTotals,
  errorMessage,
  findArea,
  useCanvasScale,
  useNowTick,
  useStatusLabels,
} from './floor-components/floor-utils';

interface AreasResponse {
  data: FloorAreaDto[];
}

/**
 * The live floor: every table drawn where it stands, coloured by status and
 * kept current over the socket. This is the screen a waiter lives on.
 */
export default function FloorPlanPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const can = useAuth((state) => state.can);
  const labels = useStatusLabels();
  const now = useNowTick(15_000);
  const { connected } = useSocketStatus();

  const [areaId, setAreaId] = useState<string | null>(null);
  const [seatTarget, setSeatTarget] = useState<RestaurantTableDto | null>(null);
  const [actionTarget, setActionTarget] = useState<RestaurantTableDto | null>(null);

  const areasQuery = useQuery({
    queryKey: qk.floorAreas(),
    queryFn: () => api.get<AreasResponse>('/api/restaurant/areas').then((response) => response.data),
    refetchInterval: 60_000,
  });

  const areas = useMemo(() => areasQuery.data ?? [], [areasQuery.data]);
  const area = findArea(areas, areaId);
  const tables = area?.tables ?? [];
  const allTables = useMemo(() => areas.flatMap((entry) => entry.tables), [areas]);
  const totals = useMemo(() => areaTotals(tables), [tables]);

  const { ref: canvasRef, scale, ready } = useCanvasScale(area, 20);

  /* ------------------------------------------------------------------ live */

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.floorAreas() });
    void queryClient.invalidateQueries({ queryKey: qk.tables() });
  }, [queryClient]);

  useSocketEvent<RestaurantTableDto>(SOCKET_EVENTS.TABLE_UPDATED, (payload) => {
    if (!payload || typeof payload !== 'object' || typeof payload.id !== 'string') {
      refresh();
      return;
    }

    // Patch the one table in place: a whole refetch on every status change
    // would flicker the plan a waiter is looking at.
    let patched = false;
    queryClient.setQueryData<FloorAreaDto[]>(qk.floorAreas(), (current) => {
      if (!current) return current;
      const next = current.map((entry) => ({
        ...entry,
        tables: entry.tables.map((table) => {
          if (table.id !== payload.id) return table;
          patched = true;
          return payload;
        }),
      }));
      return patched ? next : current;
    });

    // A new table, or one that changed area, is not where we just looked.
    if (!patched) refresh();
  });

  useSocketEvent(SOCKET_EVENTS.ORDER_UPDATED, refresh);

  /* -------------------------------------------------------------- actions */

  const openOrder = useMutation({
    mutationFn: (input: { tableId: string; guestCount: number }) =>
      api.post<OrderDto>('/api/restaurant/orders', input),
    onSuccess: (order, input) => {
      successChime();
      setSeatTarget(null);
      refresh();
      void queryClient.invalidateQueries({ queryKey: qk.orders() });
      queryClient.setQueryData(qk.order(order.id), order);
      navigate(`/restaurante/mesa/${input.tableId}`);
    },
    onError: (error: unknown) => {
      errorBeep();
      toast.error('Nao foi possivel abrir a mesa', errorMessage(error));
    },
  });

  const setStatus = useMutation({
    mutationFn: (input: { tableId: string; status: TableStatus }) =>
      api.post<RestaurantTableDto>(`/api/restaurant/tables/${input.tableId}/status`, {
        status: input.status,
      }),
    onSuccess: () => {
      setActionTarget(null);
      refresh();
    },
    onError: (error: unknown) => {
      errorBeep();
      toast.error('Estado nao alterado', errorMessage(error));
    },
  });

  const moveTable = useMutation({
    mutationFn: (input: { tableId: string; toTableId: string }) =>
      api.post(`/api/restaurant/tables/${input.tableId}/move`, { toTableId: input.toTableId }),
    onSuccess: () => {
      setActionTarget(null);
      toast.success('Conta transferida');
      refresh();
      void queryClient.invalidateQueries({ queryKey: qk.orders() });
    },
    onError: (error: unknown) => {
      errorBeep();
      toast.error('Nao foi possivel mudar de mesa', errorMessage(error));
    },
  });

  const mergeTable = useMutation({
    mutationFn: (input: { tableId: string; intoTableId: string }) =>
      api.post(`/api/restaurant/tables/${input.tableId}/merge`, { intoTableId: input.intoTableId }),
    onSuccess: () => {
      setActionTarget(null);
      toast.success('Mesas unidas');
      refresh();
      void queryClient.invalidateQueries({ queryKey: qk.orders() });
    },
    onError: (error: unknown) => {
      errorBeep();
      toast.error('Nao foi possivel juntar as mesas', errorMessage(error));
    },
  });

  const busy = openOrder.isPending || setStatus.isPending || moveTable.isPending || mergeTable.isPending;

  const handleActivate = useCallback(
    (table: RestaurantTableDto) => {
      if (table.mergedIntoId) {
        toast.show('Mesa unida', 'Abra a conta na mesa principal.');
        return;
      }

      const hasCheck = Boolean(table.activeOrderId) || table.status === 'occupied' || table.status === 'attention';
      if (hasCheck) {
        if (!can('restaurant:order')) {
          setActionTarget(table);
          return;
        }
        navigate(`/restaurante/mesa/${table.id}`);
        return;
      }

      if (table.status === 'dirty' || !can('restaurant:order')) {
        setActionTarget(table);
        return;
      }

      setSeatTarget(table);
    },
    [can, navigate],
  );

  /* ---------------------------------------------------------------- render */

  const canEditLayout = can('restaurant:floorplan');

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 flex-col gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{t('restaurant.floorPlan', 'Plano de Sala')}</h1>
            <Badge variant={connected ? 'success' : 'muted'} dot pulse={connected}>
              {connected ? 'Ao vivo' : 'Sem ligacao'}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" asChild>
              <Link to="/restaurante/pedidos">
                <Utensils className="size-5" />
                Pedidos
              </Link>
            </Button>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Actualizar"
              onClick={refresh}
              loading={areasQuery.isFetching && !areasQuery.isLoading}
            >
              <RefreshCw className="size-5" />
            </Button>
            {canEditLayout && (
              <Button size="lg" asChild>
                <Link to="/restaurante/sala/editor">
                  <Pencil className="size-5" />
                  {t('restaurant.editLayout', 'Editar Disposicao')}
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {areas.length > 0 && (
            <Tabs value={area?.id ?? ''} onValueChange={setAreaId}>
              <TabsList variant="pill" className="max-w-full">
                {areas.map((entry) => (
                  <TabsTrigger key={entry.id} value={entry.id} className="min-w-[8rem]">
                    {entry.name}
                    <span className="tabular text-xs text-muted-foreground">{entry.tables.length}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <FloorSummary totals={totals} />
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col">
        {areasQuery.isLoading && (
          <div className="grid flex-1 grid-cols-2 gap-4 p-6 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        )}

        {areasQuery.isError && (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={WifiOff}
              title="Nao foi possivel carregar a sala"
              description={errorMessage(areasQuery.error)}
              action={{ label: 'Tentar novamente', onClick: () => void areasQuery.refetch() }}
            />
          </div>
        )}

        {!areasQuery.isLoading && !areasQuery.isError && areas.length === 0 && (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={LayoutGrid}
              title="Sem zonas configuradas"
              description="Crie a primeira zona e desenhe a disposicao das mesas."
              action={
                canEditLayout
                  ? { label: 'Editar disposicao', onClick: () => navigate('/restaurante/sala/editor') }
                  : undefined
              }
            />
          </div>
        )}

        {!areasQuery.isLoading && !areasQuery.isError && area && (
          <div
            ref={canvasRef}
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5"
          >
            {ready && (
              <div
                className="relative rounded-2xl border border-border bg-muted/40 shadow-inner"
                style={{ width: area.width * scale, height: area.height * scale }}
              >
                {tables.map((table) => (
                  <FloorTableTile
                    key={table.id}
                    table={table}
                    scale={scale}
                    now={now}
                    statusLabel={labels[table.status]}
                    onActivate={handleActivate}
                    onActions={setActionTarget}
                  />
                ))}

                {tables.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center p-6">
                    <EmptyState
                      icon={LayoutGrid}
                      title="Zona sem mesas"
                      description={`A zona "${area.name}" ainda nao tem mesas desenhadas.`}
                      size="sm"
                      action={
                        canEditLayout
                          ? { label: 'Editar disposicao', onClick: () => navigate('/restaurante/sala/editor') }
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {area && (
        <footer className="shrink-0 border-t border-border bg-card px-4 py-3">
          <FloorLegend tables={tables} labels={labels} />
        </footer>
      )}

      <OpenTableDialog
        table={seatTarget}
        open={seatTarget !== null}
        onOpenChange={(open) => !open && setSeatTarget(null)}
        pending={openOrder.isPending}
        onConfirm={(guestCount) => {
          if (!seatTarget) return;
          openOrder.mutate({ tableId: seatTarget.id, guestCount });
        }}
      />

      <TableActionsDialog
        table={actionTarget}
        allTables={allTables}
        labels={labels}
        open={actionTarget !== null}
        onOpenChange={(open) => !open && setActionTarget(null)}
        canManage={can('restaurant:table')}
        canOrder={can('restaurant:order')}
        pending={busy}
        onOpenCheck={(table) => {
          setActionTarget(null);
          navigate(`/restaurante/mesa/${table.id}`);
        }}
        onStatus={(table, status) => setStatus.mutate({ tableId: table.id, status })}
        onMove={(table, toTableId) => moveTable.mutate({ tableId: table.id, toTableId })}
        onMerge={(table, intoTableId) => mergeTable.mutate({ tableId: table.id, intoTableId })}
      />
    </div>
  );
}
