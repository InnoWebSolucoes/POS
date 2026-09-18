import {
  ArrowLeft,
  Circle,
  Copy,
  Plus,
  RectangleHorizontal,
  Redo2,
  Save,
  Square,
  SquarePen,
  Undo2,
} from 'lucide-react';
import type { FloorAreaDto, TableShape } from '@pos/shared';

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';

export interface EditorToolbarProps {
  areas: FloorAreaDto[];
  areaId: string;
  canEdit: boolean;
  dirty: boolean;
  saving: boolean;
  adding: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canDuplicate: boolean;
  onAreaChange: (areaId: string) => void;
  onAddArea: () => void;
  onEditArea: () => void;
  onAddTable: (shape: TableShape) => void;
  onDuplicate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onCancel: () => void;
  onBack: () => void;
}

const SHAPE_ITEMS: Array<{ shape: TableShape; label: string; icon: typeof Square }> = [
  { shape: 'square', label: 'Mesa quadrada', icon: Square },
  { shape: 'circle', label: 'Mesa redonda', icon: Circle },
  { shape: 'rectangle', label: 'Mesa rectangular', icon: RectangleHorizontal },
];

export function EditorToolbar({
  areas,
  areaId,
  canEdit,
  dirty,
  saving,
  adding,
  canUndo,
  canRedo,
  canDuplicate,
  onAreaChange,
  onAddArea,
  onEditArea,
  onAddTable,
  onDuplicate,
  onUndo,
  onRedo,
  onSave,
  onCancel,
  onBack,
}: EditorToolbarProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      <Button variant="ghost" size="icon-lg" aria-label="Voltar a sala" onClick={onBack}>
        <ArrowLeft className="size-5" />
      </Button>

      <h1 className="mr-1 text-lg font-bold">Disposicao</h1>

      {dirty && (
        <Badge variant="warning" dot>
          Alteracoes por guardar
        </Badge>
      )}

      <div className="flex items-center gap-2">
        <div className="w-44">
          <Select value={areaId} onValueChange={onAreaChange}>
            <SelectTrigger aria-label="Zona">
              <SelectValue placeholder="Zona" />
            </SelectTrigger>
            <SelectContent>
              {areas.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  {area.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="icon"
          aria-label="Editar zona"
          onClick={onEditArea}
          disabled={!areaId || !canEdit}
        >
          <SquarePen className="size-5" />
        </Button>
        <Button variant="outline" size="icon" aria-label="Nova zona" onClick={onAddArea} disabled={!canEdit}>
          <Plus className="size-5" />
        </Button>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="lg"
              loading={adding}
              loadingLabel="A criar..."
              disabled={!areaId || !canEdit}
            >
              <Plus className="size-5" />
              Adicionar mesa
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SHAPE_ITEMS.map((item) => (
              <DropdownMenuItem key={item.shape} onSelect={() => onAddTable(item.shape)}>
                <item.icon className="size-5" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Duplicar"
          onClick={onDuplicate}
          disabled={!canDuplicate || !canEdit}
        >
          <Copy className="size-5" />
        </Button>
        <Button variant="outline" size="icon-lg" aria-label="Anular" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="size-5" />
        </Button>
        <Button variant="outline" size="icon-lg" aria-label="Refazer" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="size-5" />
        </Button>

        <Button variant="outline" size="lg" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button size="lg" onClick={onSave} disabled={!dirty || !canEdit} loading={saving} loadingLabel="A guardar...">
          <Save className="size-5" />
          Guardar
        </Button>
      </div>
    </header>
  );
}

export default EditorToolbar;
