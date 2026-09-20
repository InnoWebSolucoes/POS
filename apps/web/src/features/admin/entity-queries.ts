import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntityDto, EntityMode, Paginated } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

import type { EntityListParams } from './entity-types';

const BASE = '/api/entities';

const entitiesRoot = qk.entities().slice(0, 1);

export function useEntityList(params: EntityListParams) {
  const query = {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search || undefined,
    active: params.active === 'all' ? undefined : params.active,
  };

  return useQuery({
    queryKey: qk.entities(query),
    queryFn: () => api.get<Paginated<EntityDto>>(BASE, query),
    placeholderData: (previous) => previous,
  });
}

export function useCreateEntity() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<EntityDto>(BASE, payload),
    onSuccess: () => void client.invalidateQueries({ queryKey: entitiesRoot }),
  });
}

export function useSetEntityActive() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch<EntityDto>(`${BASE}/${id}`, { active }),
    onSuccess: (entity) => {
      void client.invalidateQueries({ queryKey: entitiesRoot });
      void client.invalidateQueries({ queryKey: qk.entity(entity.id) });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How far a client has got with their own setup - counts only. There is no
 * money in this answer by design: what a client sells is read on their
 * dashboard, by them.
 */
export interface EntitySetupState {
  entityId: string;
  mode: EntityMode;
  productCount: number;
  categoryCount: number;
  userCount: number;
  locationCount: number;
  tableCount: number;
  hasAdmin: boolean;
  canSeedStarter: boolean;
  starterProductCount: number;
}

export interface StarterContentSummary {
  entityId: string;
  mode: EntityMode;
  categories: number;
  products: number;
  modifierGroups: number;
  floorAreas: number;
  tables: number;
}

/** lib/query.ts is not this feature's file to extend, so the key lives here. */
export const setupStateKey = (entityId: string) => ['entity-setup-state', entityId] as const;

export function useEntitySetupState(entityId: string | null) {
  return useQuery({
    queryKey: setupStateKey(entityId ?? ''),
    queryFn: () => api.get<EntitySetupState>(`${BASE}/${entityId}/setup-state`),
    enabled: entityId !== null,
    // Read fresh every time the operator opens a panel about a client.
    staleTime: 0,
  });
}

export function useSeedStarterContent() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (entityId: string) =>
      api.post<StarterContentSummary>(`${BASE}/${entityId}/starter-content`),
    onSuccess: (summary) => {
      void client.invalidateQueries({ queryKey: setupStateKey(summary.entityId) });
      void client.invalidateQueries({ queryKey: entitiesRoot });
      // The operator may be standing inside this business already.
      void client.invalidateQueries({ queryKey: qk.products().slice(0, 1) });
      void client.invalidateQueries({ queryKey: qk.categories().slice(0, 1) });
    },
  });
}
