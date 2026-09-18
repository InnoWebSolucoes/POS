import type { CategoryDto } from '@pos/shared';

import type { ReorderItem } from './catalog-api';

/**
 * Pure tree maths for the category screen. Kept out of the component so the
 * drag-and-drop rules - three levels deep, never inside yourself - are one
 * readable place rather than scattered through pointer handlers.
 */

/** Mirrors MAX_DEPTH in apps/api/src/modules/categories/service.ts. */
export const MAX_DEPTH = 3;

export type DropPosition = 'before' | 'after' | 'inside';

export interface DropTarget {
  id: string;
  position: DropPosition;
}

export interface VisibleRow {
  category: CategoryDto;
  depth: number;
  hasChildren: boolean;
}

/** Depth-first walk that stops at collapsed nodes, for rendering. */
export function visibleRows(
  nodes: CategoryDto[],
  collapsed: ReadonlySet<string>,
  depth = 1,
): VisibleRow[] {
  const out: VisibleRow[] = [];
  for (const node of nodes) {
    const children = node.children ?? [];
    out.push({ category: node, depth, hasChildren: children.length > 0 });
    if (children.length > 0 && !collapsed.has(node.id)) {
      out.push(...visibleRows(children, collapsed, depth + 1));
    }
  }
  return out;
}

export function childrenOf(nodes: CategoryDto[], parentId: string | null): CategoryDto[] {
  if (parentId === null) return nodes;
  const parent = findNode(nodes, parentId);
  return parent?.children ?? [];
}

export function findNode(nodes: CategoryDto[], id: string): CategoryDto | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findNode(node.children ?? [], id);
    if (hit) return hit;
  }
  return null;
}

export function parentIdOf(nodes: CategoryDto[], id: string, parent: string | null = null): string | null {
  for (const node of nodes) {
    if (node.id === id) return parent;
    const hit = parentIdOf(node.children ?? [], id, node.id);
    if (hit !== null) return hit;
  }
  return null;
}

/** 1 for a root; used to keep a move inside MAX_DEPTH. */
export function depthOf(nodes: CategoryDto[], id: string, depth = 1): number {
  for (const node of nodes) {
    if (node.id === id) return depth;
    const hit = depthOf(node.children ?? [], id, depth + 1);
    if (hit > 0) return hit;
  }
  return 0;
}

/** How many levels the branch itself occupies (a leaf is 1). */
export function branchHeight(node: CategoryDto): number {
  const children = node.children ?? [];
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map(branchHeight));
}

export function idsInBranch(node: CategoryDto): string[] {
  const out = [node.id];
  for (const child of node.children ?? []) out.push(...idsInBranch(child));
  return out;
}

export interface MoveResult {
  items: ReorderItem[];
  /** Human-readable reason when the move is refused. */
  error?: string;
}

/**
 * Works out the reorder payload for dropping `draggedId` on a target.
 *
 * Only the siblings that actually change are sent: the destination list always,
 * and the source list too when the node changed parent.
 */
export function planMove(
  tree: CategoryDto[],
  draggedId: string,
  target: DropTarget,
): MoveResult {
  const dragged = findNode(tree, draggedId);
  if (!dragged) return { items: [], error: 'Categoria nao encontrada.' };
  if (target.id === draggedId) return { items: [] };

  const banned = new Set(idsInBranch(dragged));
  if (banned.has(target.id) && target.position === 'inside') {
    return { items: [], error: 'Uma categoria nao pode ser movida para dentro de si propria.' };
  }

  const targetParentId =
    target.position === 'inside' ? target.id : parentIdOf(tree, target.id);

  if (targetParentId !== null && banned.has(targetParentId)) {
    return { items: [], error: 'Uma categoria nao pode ser movida para dentro de si propria.' };
  }

  const newParentDepth = targetParentId === null ? 0 : depthOf(tree, targetParentId);
  if (newParentDepth + branchHeight(dragged) > MAX_DEPTH) {
    return {
      items: [],
      error: `A arvore de categorias so permite ${MAX_DEPTH} niveis.`,
    };
  }

  const sourceParentId = parentIdOf(tree, draggedId);

  const destination = childrenOf(tree, targetParentId)
    .filter((node) => node.id !== draggedId)
    .slice();

  let index = destination.length;
  if (target.position === 'inside') {
    index = destination.length;
  } else {
    const at = destination.findIndex((node) => node.id === target.id);
    index = at === -1 ? destination.length : target.position === 'before' ? at : at + 1;
  }
  destination.splice(index, 0, dragged);

  const items: ReorderItem[] = destination.map((node, order) => ({
    id: node.id,
    sortOrder: order,
    ...(node.id === draggedId ? { parentId: targetParentId } : {}),
  }));

  if (sourceParentId !== targetParentId) {
    const source = childrenOf(tree, sourceParentId).filter((node) => node.id !== draggedId);
    source.forEach((node, order) => items.push({ id: node.id, sortOrder: order }));
  }

  return { items };
}
