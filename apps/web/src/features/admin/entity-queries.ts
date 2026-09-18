import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntityDto, Paginated } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

import type { EntityListParams, EntityStats } from './entity-types';

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

/**
 * One stats call per visible tenant. They are separate queries on purpose: a
 * slow tenant must not hold the whole table hostage, and each row can retry on
 * its own.
 */
export function useEntityStats(entityIds: string[]) {
  return useQueries({
    queries: entityIds.map((id) => ({
      queryKey: [...qk.entity(id), 'stats'] as const,
      queryFn: () => api.get<EntityStats>(`${BASE}/${id}/stats`),
      staleTime: 60_000,
    })),
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
