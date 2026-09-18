import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  GripVertical,
  MoreVertical,
  Plus,
} from 'lucide-react';
import type { CategoryDto } from '@pos/shared';

import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { number } from '@/lib/format';
import { cn, colorForLabel } from '@/lib/utils';
import {
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton,
  toast,
} from '@/components/ui';
import { catalogApi, invalidateCategories } from './catalog-api';
import { useCategoriesQuery } from './catalog-hooks';
import { planMove, visibleRows, type DropPosition, type DropTarget } from './category-tree';
import { CatalogPage, NoAccess, QueryError } from './components/catalog-page';
import { CategoryDialog } from './components/category-dialog';

interface DragState {
  id: string;
  target: DropTarget | null;
}

export default function CategoriesPage() {
  const navigate = useNavigate();
  const can = useAuth((state) => state.can);
  const canRead = can('product:read');
  const canWrite = can('category:write');

  const treeQuery = useCategoriesQuery(true);
  const tree = React.useMemo(() => treeQuery.data ?? [], [treeQuery.data]);

  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(new Set<string>());
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CategoryDto | null>(null);
  const [defaultParent, setDefaultParent] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<CategoryDto | null>(null);
  const [drag, setDrag] = React.useState<DragState | null>(null);

  const rowRefs = React.useRef(new Map<string, HTMLElement>());

  const rows = React.useMemo(() => visibleRows(tree, collapsed), [tree, collapsed]);

  const reorder = useMutation({
    mutationFn: catalogApi.reorderCategories,
    onSuccess: () => {
      invalidateCategories();
      toast.success('Arvore actualizada');
    },
    onError: (error) => {
      toast.error(
        'Nao foi possivel mover',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      );
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => catalogApi.deleteCategory(id),
    onSuccess: (result) => {
      invalidateCategories();
      toast.success(
        'Categoria eliminada',
        result.productsDetached > 0
          ? `${result.productsDetached} produtos ficaram sem categoria.`
          : undefined,
      );
      setPendingDelete(null);
    },
    onError: (error) => {
      toast.error(
        'Nao foi possivel eliminar',
        error instanceof ApiRequestError
          ? error.message
          : 'Verifique se a categoria ainda tem subcategorias.',
      );
      setPendingDelete(null);
    },
  });

  const toggleCollapsed = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ---------------------------------------------------------------------- */
  /* Pointer drag: works with a finger, a pen and a mouse alike               */
  /* ---------------------------------------------------------------------- */

  const resolveTarget = (clientY: number, draggedId: string): DropTarget | null => {
    for (const row of rows) {
      const element = rowRefs.current.get(row.category.id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom) continue;

      const offset = (clientY - rect.top) / rect.height;
      let position: DropPosition = 'inside';
      if (offset < 0.3) position = 'before';
      else if (offset > 0.7) position = 'after';

      if (row.category.id === draggedId && position === 'inside') return null;
      return { id: row.category.id, position };
    }
    return null;
  };

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (!canWrite) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id, target: null });
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const target = resolveTarget(event.clientY, drag.id);
    setDrag((current) => (current ? { ...current, target } : current));
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const { id, target } = drag;
    setDrag(null);
    if (!target || target.id === id) return;

    const plan = planMove(tree, id, target);
    if (plan.error) {
      toast.warning('Movimento invalido', plan.error);
      return;
    }
    if (plan.items.length > 0) reorder.mutate(plan.items);
  };

  if (!canRead) return <NoAccess what="as categorias" />;

  const actions = canWrite ? (
    <Button
      leftIcon={<Plus />}
      onClick={() => {
        setEditing(null);
        setDefaultParent(null);
        setDialogOpen(true);
      }}
    >
      Nova categoria
    </Button>
  ) : null;

  return (
    <CatalogPage
      title="Categorias"
      description="Arraste pelo puxador para reordenar; solte sobre o meio de uma linha para a tornar subcategoria."
      actions={actions}
    >
      {treeQuery.isError ? (
        <QueryError
          error={treeQuery.error}
          onRetry={() => void treeQuery.refetch()}
          title="Nao foi possivel carregar as categorias"
        />
      ) : treeQuery.isLoading ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={FolderTree}
            title="Sem categorias"
            description="Organize o catalogo em categorias para acelerar a caixa e a grelha rapida."
            action={
              canWrite
                ? {
                    label: 'Criar a primeira categoria',
                    onClick: () => {
                      setEditing(null);
                      setDefaultParent(null);
                      setDialogOpen(true);
                    },
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2">
          {rows.map(({ category, depth, hasChildren }) => {
            const isDragging = drag?.id === category.id;
            const target = drag?.target?.id === category.id ? drag.target.position : null;
            const swatch = category.color ?? colorForLabel(category.namePt);

            return (
              <li
                key={category.id}
                ref={(element) => {
                  if (element) rowRefs.current.set(category.id, element);
                  else rowRefs.current.delete(category.id);
                }}
                className={cn(
                  'flex min-h-touch items-center gap-2 rounded-lg border-2 border-transparent px-2 py-1.5 transition-colors',
                  isDragging && 'opacity-50',
                  target === 'inside' && 'border-primary bg-primary/10',
                  target === 'before' && 'border-t-primary',
                  target === 'after' && 'border-b-primary',
                )}
                style={{ marginLeft: `${(depth - 1) * 1.5}rem` }}
              >
                {canWrite ? (
                  <button
                    type="button"
                    aria-label={`Mover ${category.namePt}`}
                    onPointerDown={(event) => startDrag(event, category.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="size-5" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="size-11 shrink-0" aria-hidden="true" />
                )}

                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(category.id)}
                    aria-expanded={!collapsed.has(category.id)}
                    aria-label={collapsed.has(category.id) ? 'Expandir' : 'Recolher'}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                  >
                    {collapsed.has(category.id) ? (
                      <ChevronRight className="size-5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="size-5" aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  <span className="size-11 shrink-0" aria-hidden="true" />
                )}

                <span
                  aria-hidden="true"
                  className="size-6 shrink-0 rounded-md border border-border"
                  style={{ backgroundColor: swatch }}
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{category.namePt}</span>
                  {category.nameEn && (
                    <span className="block truncate text-xs text-muted-foreground">{category.nameEn}</span>
                  )}
                </span>

                {!category.active && (
                  <Badge variant="muted" size="sm">
                    Inactiva
                  </Badge>
                )}

                <Badge variant="outline" size="sm" className="tabular">
                  {number(category.productCount ?? 0)}
                </Badge>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Accoes para ${category.namePt}`}>
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => navigate(`/produtos?categoria=${category.id}`)}
                    >
                      Ver produtos
                    </DropdownMenuItem>
                    {canWrite && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(category);
                            setDefaultParent(null);
                            setDialogOpen(true);
                          }}
                        >
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(null);
                            setDefaultParent(category.id);
                            setDialogOpen(true);
                          }}
                        >
                          Nova subcategoria
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setPendingDelete(category)}
                        >
                          Eliminar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
        defaultParentId={defaultParent}
        tree={tree}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Eliminar "${pendingDelete?.namePt ?? ''}"?`}
        description={
          (pendingDelete?.children?.length ?? 0) > 0
            ? 'Esta categoria tem subcategorias. Mova ou elimine as subcategorias primeiro - o servidor vai recusar.'
            : 'Os produtos desta categoria ficam sem categoria. A accao nao pode ser anulada.'
        }
        confirmLabel="Eliminar"
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </CatalogPage>
  );
}
