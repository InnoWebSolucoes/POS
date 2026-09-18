import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntityDto, Paginated } from '@pos/shared';

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
