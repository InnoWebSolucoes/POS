import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FloorAreaDto, RestaurantTableDto, TableShape } from '@pos/shared';

import { toast } from '@/components/ui';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { errorBeep } from '@/lib/sound';

import type { AreaFormValue } from './area-dialog';
import {
  SHAPE_DEFAULTS,
  changedRows,
  nextTableName,
  normalizeTable,
  placeNewTable,
  toEditorTable,
  useHistory,
  type EditorTable,
  type LayoutRow,
} from './editor-model';
import { clamp, clampToArea, collidingIds, errorMessage, findArea } from './floor-utils';

interface AreasResponse {
  data: FloorAreaDto[];
}

export interface FloorEditor {
  areas: FloorAreaDto[];
  area: FloorAreaDto | null;
  loading: boolean;
  failed: boolean;
  loadError: unknown;
  retry: () => void;

  tables: EditorTable[];
  areaTables: EditorTable[];
  collisions: Set<string>;
  selected: EditorTable | null;
  selectedId: string | null;
  select: (id: string | null) => void;
  chooseArea: (areaId: string) => void;

  dirty: boolean;
  pendingCount: number;

  patchTable: (id: string, patch: Partial<EditorTable>) => void;
  nudge: (id: string, dx: number, dy: number) => void;
  beginEdit: () => void;
  endEdit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  addTable: (shape: TableShape) => void;
  duplicateSelected: () => void;
  /** onDone runs whether the delete succeeded or failed, to close the dialog. */
  deleteTable: (id: string, onDone?: () => void) => void;
  save: () => void;
  discard: () => void;
  saveArea: (value: AreaFormValue, areaId?: string, onDone?: () => void) => void;

  adding: boolean;
  saving: boolean;
  deleting: boolean;
  savingArea: boolean;
}

/**
 * All of the editor's state in one place: the working copy of the layout, the
 * undo stack, what is dirty against the last save, and the four calls that
 * touch the server.
 */
export function useFloorEditor(): FloorEditor {
  const queryClient = useQueryClient();

  const [areaId, setAreaId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baselineVersion, setBaselineVersion] = useState(0);

  const history = useHistory<EditorTable[]>([]);
  // Destructured once: each method is stable, the object identity is not.
  const {
    set: setTables,
    commit: commitTables,
    begin: beginEdit,
    end: endEdit,
    rebase: rebaseTables,
    undo,
    redo,
    reset: resetTables,
    canUndo,
    canRedo,
  } = history;
  const baseline = useRef<Map<string, EditorTable>>(new Map());

  const areasQuery = useQuery({
    queryKey: qk.floorAreas(),
    queryFn: () => api.get<AreasResponse>('/api/restaurant/areas').then((response) => response.data),
  });

  const areas = useMemo(() => areasQuery.data ?? [], [areasQuery.data]);
  const area = findArea(areas, areaId);
  const serverTables = useMemo(() => areas.flatMap((entry) => entry.tables.map(toEditorTable)), [areas]);

  const tables = history.state;
  const pendingRows = useMemo(
    () => changedRows(tables, baseline.current),
    // baseline lives in a ref and is versioned by hand.
    [tables, baselineVersion],
  );
  const dirty = pendingRows.length > 0;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  /* --------------------------------------------------------------- seeding */

  useEffect(() => {
    if (!areasQuery.data) return;
    // A background refetch must never wipe work in progress.
    if (dirtyRef.current) return;
    baseline.current = new Map(serverTables.map((table) => [table.id, table]));
    setBaselineVersion((value) => value + 1);
    resetTables(serverTables);
  }, [serverTables, areasQuery.data, resetTables]);

  const areaTables = useMemo(
    () => (area ? tables.filter((table) => table.areaId === area.id) : []),
    [area, tables],
  );
  const collisions = useMemo(() => collidingIds(areaTables), [areaTables]);
  const selected = useMemo(
    () => areaTables.find((table) => table.id === selectedId) ?? null,
    [areaTables, selectedId],
  );

  /* --------------------------------------------------------------- editing */

  const patchTable = useCallback(
    (id: string, patch: Partial<EditorTable>) => {
      setTables((current) => current.map((table) => (table.id === id ? { ...table, ...patch } : table)));
    },
    [setTables],
  );

  const nudge = useCallback(
    (id: string, dx: number, dy: number) => {
      if (!area) return;
      commitTables((current) =>
        current.map((table) => {
          if (table.id !== id) return table;
          const moved = clampToArea({ ...table, x: table.x + dx, y: table.y + dy }, area);
          return { ...table, ...moved };
        }),
      );
    },
    [area, commitTables],
  );

  const discard = useCallback(() => {
    resetTables(Array.from(baseline.current.values()));
    setSelectedId(null);
  }, [resetTables]);

  /* ------------------------------------------------------------- mutations */

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.floorAreas() });
    void queryClient.invalidateQueries({ queryKey: qk.tables() });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (body: Omit<LayoutRow, 'id'>) => api.post<RestaurantTableDto>('/api/restaurant/tables', body),
    onSuccess: (created) => {
      // The table already exists on the server, so it is not an undo step - and
      // it has to be written into every step of the timeline, or one Ctrl+Z
      // would drop a table off the plan that the server still has.
      const table = toEditorTable(created);
      baseline.current = new Map(baseline.current).set(table.id, table);
      setBaselineVersion((value) => value + 1);
      rebaseTables((current) =>
        current.some((entry) => entry.id === table.id) ? current : [...current, table],
      );
      setSelectedId(table.id);
      invalidate();
    },
    onError: (error: unknown) => {
      errorBeep();
      toast.error('Mesa nao criada', errorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/restaurant/tables/${id}`),
    onSuccess: (_result, id) => {
      // Same reasoning as create: the row is gone from the server, so undo must
      // not be able to resurrect it and offer it back to /tables/layout.
      const next = new Map(baseline.current);
      next.delete(id);
      baseline.current = next;
      setBaselineVersion((value) => value + 1);
      rebaseTables((current) => current.filter((table) => table.id !== id));
      setSelectedId(null);
      invalidate();
    },
    onError: (error: unknown) => {
      errorBeep();
      toast.error('Mesa nao eliminada', errorMessage(error));
    },
  });

  const layoutMutation = useMutation({
    mutationFn: (rows: LayoutRow[]) =>
      api.post<{ data: RestaurantTableDto[] }>('/api/restaurant/tables/layout', { tables: rows }),
    onSuccess: (response) => {
      const next = new Map(baseline.current);
      for (const dto of response.data) next.set(dto.id, toEditorTable(dto));
      baseline.current = next;
      setBaselineVersion((value) => value + 1);
      toast.success('Disposicao guardada');
      invalidate();
    },
    onError: (error: unknown) => {
      errorBeep();
      toast.error('Nao foi possivel guardar', errorMessage(error));
    },
  });

  const areaMutation = useMutation({
    mutationFn: (input: AreaFormValue & { id?: string }) => {
      const body = {
        name: input.name,
        width: clamp(Math.round(input.width), 200, 8000),
        height: clamp(Math.round(input.height), 200, 8000),
      };
      return input.id
        ? api.patch<FloorAreaDto>(`/api/restaurant/areas/${input.id}`, body)
        : api.post<FloorAreaDto>('/api/restaurant/areas', body);
    },
    onSuccess: (saved) => {
      setAreaId(saved.id);
      invalidate();
    },
    onError: (error: unknown) => {
      errorBeep();
      toast.error('Zona nao guardada', errorMessage(error));
    },
  });

  /* --------------------------------------------------------------- actions */

  const save = useCallback(() => {
    const normalized = tables.map(normalizeTable);
    setTables(() => normalized);

    const rows = changedRows(normalized, baseline.current);
    if (!rows.length) {
      toast.show('Sem alteracoes', 'Nada para guardar.');
      return;
    }
    if (rows.some((row) => row.name.length === 0)) {
      toast.error('Nome em falta', 'Todas as mesas precisam de um nome.');
      return;
    }
    const names = rows.map((row) => row.name.toLowerCase());
    const duplicate = names.find((name, index) => names.indexOf(name) !== index);
    if (duplicate) {
      toast.error('Nome repetido', `Ha mais do que uma mesa chamada "${duplicate}".`);
      return;
    }

    layoutMutation.mutate(rows);
  }, [layoutMutation, setTables, tables]);

  const addTable = useCallback(
    (shape: TableShape) => {
      if (!area) return;
      const defaults = SHAPE_DEFAULTS[shape];
      const spot = placeNewTable(defaults, areaTables, area);
      createMutation.mutate({
        areaId: area.id,
        name: nextTableName(tables),
        shape,
        x: spot.x,
        y: spot.y,
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        seats: defaults.seats,
      });
    },
    [area, areaTables, createMutation, tables],
  );

  const duplicateSelected = useCallback(() => {
    if (!area || !selected) return;
    const spot = placeNewTable({ width: selected.width, height: selected.height }, areaTables, area);
    createMutation.mutate({
      areaId: area.id,
      name: nextTableName(tables),
      shape: selected.shape,
      x: spot.x,
      y: spot.y,
      width: selected.width,
      height: selected.height,
      rotation: selected.rotation,
      seats: selected.seats,
    });
  }, [area, areaTables, createMutation, selected, tables]);

  const chooseArea = useCallback((next: string) => {
    setSelectedId(null);
    setAreaId(next);
  }, []);

  /* ------------------------------------------------------------- shortcuts */

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        event.preventDefault();
        redo();
      } else if (key === 's') {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [redo, save, undo]);

  return {
    areas,
    area,
    loading: areasQuery.isLoading,
    failed: areasQuery.isError,
    loadError: areasQuery.error,
    retry: () => void areasQuery.refetch(),

    tables,
    areaTables,
    collisions,
    selected,
    selectedId,
    select: setSelectedId,
    chooseArea,

    dirty,
    pendingCount: pendingRows.length,

    patchTable,
    nudge,
    beginEdit,
    endEdit,
    undo,
    redo,
    canUndo,
    canRedo,

    addTable,
    duplicateSelected,
    deleteTable: (id: string, onDone?: () => void) =>
      deleteMutation.mutate(id, { onSettled: onDone ? () => onDone() : undefined }),
    save,
    discard,
    saveArea: (value: AreaFormValue, id?: string, onDone?: () => void) =>
      areaMutation.mutate({ ...value, id }, { onSuccess: onDone ? () => onDone() : undefined }),

    adding: createMutation.isPending,
    saving: layoutMutation.isPending,
    deleting: deleteMutation.isPending,
    savingArea: areaMutation.isPending,
  };
}
