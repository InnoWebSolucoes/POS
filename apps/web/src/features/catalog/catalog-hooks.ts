import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CategoryDto, ModifierGroupDto } from '@pos/shared';

import { qk } from '@/lib/query';
import { useAuth } from '@/lib/auth-store';
import {
  catalogApi,
  modifierGroupsKey,
  type SupplierOption,
  type TaxRatesResponse,
} from './catalog-api';

/** Shared lookups. Every catalogue screen needs at least one of them. */

export function useCategoriesQuery(tree = false): UseQueryResult<CategoryDto[]> {
  return useQuery({
    queryKey: qk.categories({ tree, includeInactive: true }),
    queryFn: async () => (await catalogApi.listCategories(tree)).data,
    staleTime: 60_000,
  });
}

export function useSuppliersQuery(): UseQueryResult<SupplierOption[]> {
  const canRead = useAuth((state) => state.can('supplier:read'));
  return useQuery({
    queryKey: qk.suppliers({ scope: 'catalog-options' }),
    queryFn: async () => (await catalogApi.listSuppliers()).data,
    enabled: canRead,
    staleTime: 5 * 60_000,
  });
}

export function useTaxRatesQuery(): UseQueryResult<TaxRatesResponse> {
  const canRead = useAuth((state) => state.can('settings:read'));
  return useQuery({
    queryKey: qk.settings(),
    queryFn: () => catalogApi.taxRates(),
    enabled: canRead,
    staleTime: 5 * 60_000,
  });
}

export function useModifierGroupsQuery(enabled = true): UseQueryResult<ModifierGroupDto[]> {
  return useQuery({
    queryKey: modifierGroupsKey,
    queryFn: () => catalogApi.listModifierGroups(),
    enabled,
    staleTime: 60_000,
  });
}

/* -------------------------------------------------------------------------- */
/* Tree helpers                                                                */
/* -------------------------------------------------------------------------- */

export interface FlatCategory {
  category: CategoryDto;
  depth: number;
}

/** Nested tree -> depth-tagged flat list, for indented selects and rows. */
export function flattenCategories(nodes: CategoryDto[], depth = 0): FlatCategory[] {
  const out: FlatCategory[] = [];
  for (const node of nodes) {
    out.push({ category: node, depth });
    if (node.children?.length) out.push(...flattenCategories(node.children, depth + 1));
  }
  return out;
}

/** The ids of a node and everything under it - a branch can never move into itself. */
export function branchIds(node: CategoryDto): string[] {
  const out = [node.id];
  for (const child of node.children ?? []) out.push(...branchIds(child));
  return out;
}

export function findCategory(nodes: CategoryDto[], id: string): CategoryDto | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findCategory(node.children ?? [], id);
    if (hit) return hit;
  }
  return null;
}
