import { Prisma } from '@prisma/client';
import type { CategoryDto } from '@pos/shared';
import { ApiError } from '../../lib/http.js';
import type { Tx } from '../../lib/prisma.js';
import { compareCategories, type CategoryPathNode } from './mappers.js';

/** Bebidas > Refrigerantes > Coca-Cola. Three levels, no more. */
export const MAX_DEPTH = 3;

/** Only live, sellable products count towards productCount. */
export const ACTIVE_PRODUCT_WHERE = { deletedAt: null, active: true } as const;

export const QUICK_GRID_PRODUCT_WHERE = {
  deletedAt: null,
  active: true,
  showInQuickGrid: true,
} as const;

export const categoryFields = {
  id: true,
  entityId: true,
  parentId: true,
  namePt: true,
  nameEn: true,
  color: true,
  iconUrl: true,
  sortOrder: true,
  active: true,
} satisfies Prisma.CategorySelect;

export const categorySelect = {
  ...categoryFields,
  _count: { select: { products: { where: ACTIVE_PRODUCT_WHERE } } },
} satisfies Prisma.CategorySelect;

export const quickGridSelect = {
  ...categoryFields,
  _count: { select: { products: { where: QUICK_GRID_PRODUCT_WHERE } } },
} satisfies Prisma.CategorySelect;

/** sortOrder, then name - matches compareCategories() used on in-memory trees. */
export const CATEGORY_ORDER_BY = [
  { sortOrder: 'asc' as const },
  { namePt: 'asc' as const },
];

export interface TreeNode {
  id: string;
  parentId: string | null;
  namePt: string;
}

/**
 * Every live category of the tenant, as a skeleton. Category trees are small
 * (tens of rows), so one query plus in-memory walking beats recursive SQL - and
 * it keeps us on the Prisma query API, which SQLite and PostgreSQL both speak.
 */
export async function loadTreeNodes(client: Tx, entityId: string): Promise<TreeNode[]> {
  return client.category.findMany({
    where: { entityId, deletedAt: null },
    select: { id: true, parentId: true, namePt: true },
  });
}

export function nodeMap(nodes: TreeNode[]): Map<string, TreeNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

/** The parent must exist, be live and belong to the same tenant. */
export function assertParentExists(nodes: Map<string, TreeNode>, parentId: string): void {
  if (!nodes.has(parentId)) {
    throw ApiError.unprocessable('Categoria superior nao encontrada.', {
      parentId: ['Categoria superior nao encontrada.'],
    });
  }
}

/**
 * Cycle and depth guard for a PROPOSED shape of the whole forest.
 *
 * Walking up from every node catches both a node parented into its own subtree
 * (the chain never reaches a root) and a branch that would grow past three
 * levels - checking the descendants is implicit, because they are in the set too.
 */
export function assertHierarchy(nodes: Array<{ id: string; parentId: string | null }>): void {
  const parentOf = new Map<string, string | null>();
  for (const node of nodes) parentOf.set(node.id, node.parentId);

  for (const node of nodes) {
    if (node.parentId === node.id) {
      throw ApiError.unprocessable('Uma categoria nao pode ser a sua propria categoria superior.', {
        parentId: ['Uma categoria nao pode ser a sua propria categoria superior.'],
      });
    }

    const seen = new Set<string>([node.id]);
    let depth = 1;
    let parentId = node.parentId;

    while (parentId) {
      if (seen.has(parentId)) {
        throw ApiError.unprocessable(
          'Movimento invalido: criaria um ciclo na arvore de categorias.',
          { parentId: ['Movimento invalido: criaria um ciclo na arvore de categorias.'] },
        );
      }
      if (!parentOf.has(parentId)) break;

      seen.add(parentId);
      depth += 1;
      if (depth > MAX_DEPTH) {
        throw ApiError.unprocessable(
          `Profundidade maxima de ${MAX_DEPTH} niveis de categorias excedida.`,
          { parentId: [`Profundidade maxima de ${MAX_DEPTH} niveis de categorias excedida.`] },
        );
      }
      parentId = parentOf.get(parentId) ?? null;
    }
  }
}

/**
 * Applies a single re-parent to the forest and validates the result.
 * `id` is undefined when creating (the node does not exist yet).
 */
export function assertPlacement(
  nodes: TreeNode[],
  id: string | undefined,
  parentId: string | null,
): void {
  const NEW = '__new__';
  const selfId = id ?? NEW;
  const proposed = nodes.map((node) =>
    node.id === selfId ? { id: node.id, parentId } : { id: node.id, parentId: node.parentId },
  );
  if (!id) proposed.push({ id: NEW, parentId });
  assertHierarchy(proposed);
}

/** Root -> ... -> the category itself, for breadcrumbs. */
export function ancestorPath(id: string, nodes: Map<string, TreeNode>): CategoryPathNode[] {
  const path: CategoryPathNode[] = [];
  const seen = new Set<string>();
  let current = nodes.get(id);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift({ id: current.id, namePt: current.namePt });
    current = current.parentId ? nodes.get(current.parentId) : undefined;
  }
  return path;
}

/**
 * Flat rows -> nested CategoryDto[]. A node whose parent is missing from the
 * set (filtered out, or inactive) is promoted to a root so nothing vanishes
 * from the UI.
 */
export function buildTree(rows: CategoryDto[]): CategoryDto[] {
  const byId = new Map<string, CategoryDto>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });

  const roots: CategoryDto[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    const parent = row.parentId && row.parentId !== row.id ? byId.get(row.parentId) : undefined;
    if (parent) parent.children!.push(node);
    else roots.push(node);
  }

  // Terminates even on corrupt data: every node has exactly one parent, so a
  // cycle is unreachable from the roots rather than an infinite descent.
  const sortLevel = (nodes: CategoryDto[]): void => {
    nodes.sort(compareCategories);
    for (const node of nodes) {
      if (node.children && node.children.length > 0) sortLevel(node.children);
    }
  };
  sortLevel(roots);

  return roots;
}

/** Next free slot at the end of a level, so new categories land last. */
export async function nextSortOrder(
  client: Tx,
  entityId: string,
  parentId: string | null,
): Promise<number> {
  const last = await client.category.findFirst({
    where: { entityId, parentId, deletedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return last ? last.sortOrder + 1 : 0;
}
