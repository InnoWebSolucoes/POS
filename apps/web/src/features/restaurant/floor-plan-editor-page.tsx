import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, WifiOff } from 'lucide-react';

import {
  ConfirmDialog,
  EmptyState,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';

import { AreaDialog, type AreaFormValue } from './floor-components/area-dialog';
import { EditorCanvas } from './floor-components/editor-canvas';
import { EditorPanel } from './floor-components/editor-panel';
import { EditorToolbar } from './floor-components/editor-toolbar';
import { errorMessage, useMediaQuery } from './floor-components/floor-utils';
import { useFloorEditor } from './floor-components/use-floor-editor';

interface AreaDialogState {
  mode: 'create' | 'edit';
  initial: AreaFormValue | null;
}

const noop = () => undefined;

/**
 * The drag-and-drop layout editor: geometry is edited locally and the whole
 * area goes back to the server in a single "Guardar".
 */
export default function FloorPlanEditorPage() {
  const navigate = useNavigate();
  const can = useAuth((state) => state.can);
  const canEdit = can('restaurant:floorplan');
  const wide = useMediaQuery('(min-width: 1024px)');
  const editor = useFloorEditor();

  const [areaDialog, setAreaDialog] = useState<AreaDialogState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaveAction, setLeaveAction] = useState<{ run: () => void } | null>(null);

  const { area, selected, dirty } = editor;

  /** Anything that would throw unsaved work away asks first. */
  const guard = useCallback(
    (run: () => void) => {
      if (dirty) setLeaveAction({ run });
      else run();
    },
    [dirty],
  );

  const panel = (
    <EditorPanel
      table={selected}
      area={area ?? { width: 1200, height: 800 }}
      colliding={selected ? editor.collisions.has(selected.id) : false}
      onPatch={(patch) => {
        if (selected && canEdit) editor.patchTable(selected.id, patch);
      }}
      onBeginEdit={editor.beginEdit}
      onEndEdit={editor.endEdit}
      onDuplicate={editor.duplicateSelected}
      onDelete={() => setConfirmDelete(true)}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <EditorToolbar
        areas={editor.areas}
        areaId={area?.id ?? ''}
        dirty={dirty}
        saving={editor.saving}
        adding={editor.adding}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        canDuplicate={Boolean(selected) && canEdit}
        canEdit={canEdit}
        onAreaChange={editor.chooseArea}
        onAddArea={() => setAreaDialog({ mode: 'create', initial: null })}
        onEditArea={() =>
          area &&
          setAreaDialog({
            mode: 'edit',
            initial: { name: area.name, width: area.width, height: area.height },
          })
        }
        onAddTable={editor.addTable}
        onDuplicate={editor.duplicateSelected}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onSave={editor.save}
        onCancel={() => guard(editor.discard)}
        onBack={() => guard(() => navigate('/restaurante/sala'))}
      />

      {!canEdit && (
        <p className="border-b border-border bg-muted px-4 py-2 text-sm text-muted-foreground">
          Sem permissao para alterar a disposicao. Pode ver o plano, mas nao guardar alteracoes.
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {editor.loading && <Skeleton className="m-6 min-h-0 flex-1 rounded-2xl" />}

        {editor.failed && (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={WifiOff}
              title="Nao foi possivel carregar a sala"
              description={errorMessage(editor.loadError)}
              action={{ label: 'Tentar novamente', onClick: editor.retry }}
            />
          </div>
        )}

        {!editor.loading && !editor.failed && !area && (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={LayoutGrid}
              title="Sem zonas"
              description="Crie a primeira zona para comecar a desenhar a sala."
              action={
                canEdit
                  ? { label: 'Nova zona', onClick: () => setAreaDialog({ mode: 'create', initial: null }) }
                  : undefined
              }
            />
          </div>
        )}

        {!editor.loading && !editor.failed && area && (
          <EditorCanvas
            area={area}
            tables={editor.areaTables}
            selectedId={editor.selectedId}
            collisions={editor.collisions}
            onSelect={editor.select}
            onPatch={canEdit ? editor.patchTable : noop}
            onGestureStart={editor.beginEdit}
            onGestureEnd={editor.endEdit}
            onNudge={canEdit ? editor.nudge : noop}
            onRequestDelete={() => {
              if (selected && canEdit) setConfirmDelete(true);
            }}
          />
        )}

        {wide && area && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card">{panel}</aside>
        )}
      </div>

      {!wide && (
        <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && editor.select(null)}>
          <SheetContent side="bottom" size="lg" className="flex flex-col">
            <SheetHeader>
              <SheetTitle>Mesa seleccionada</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">{panel}</div>
          </SheetContent>
        </Sheet>
      )}

      <AreaDialog
        open={areaDialog !== null}
        mode={areaDialog?.mode ?? 'create'}
        initial={areaDialog?.initial ?? null}
        pending={editor.savingArea}
        onOpenChange={(open) => !open && setAreaDialog(null)}
        onSubmit={(value) =>
          editor.saveArea(value, areaDialog?.mode === 'edit' ? area?.id : undefined, () =>
            setAreaDialog(null),
          )
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={selected ? `Eliminar a mesa ${selected.name}?` : 'Eliminar mesa?'}
        description={
          selected?.activeOrderId
            ? 'Esta mesa tem um pedido em aberto. Feche a conta primeiro - o servidor recusa a eliminacao.'
            : 'A mesa desaparece do plano. Esta accao nao pode ser anulada.'
        }
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (selected) editor.deleteTable(selected.id, () => setConfirmDelete(false));
        }}
      />

      <ConfirmDialog
        open={leaveAction !== null}
        onOpenChange={(open) => !open && setLeaveAction(null)}
        title="Sair sem guardar?"
        description={`Ha ${editor.pendingCount} mesa(s) com alteracoes por guardar.`}
        confirmLabel="Descartar"
        cancelLabel="Continuar a editar"
        onConfirm={() => {
          const action = leaveAction;
          setLeaveAction(null);
          editor.discard();
          action?.run();
        }}
      />
    </div>
  );
}
