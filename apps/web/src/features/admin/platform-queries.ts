import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntityDto, EntityMode } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

/**
 * Server state the platform console needs on top of the tenancy list:
 * service health, and editing a client account.
 *
 * Deliberately absent: anything that reports a client's trading. The console
 * never calls /api/entities/:id/stats.
 */

const BASE = '/api/entities';

/** Prefix of every entities key, so one invalidation reaches list and summary. */
const entitiesRoot = qk.entities().slice(0, 1);

/* -------------------------------------------------------------------------- */
/* Health                                                                      */
/* -------------------------------------------------------------------------- */

export interface PlatformHealth {
  status: string;
  database: string;
  /** Process uptime in seconds. Absent when the API answers degraded. */
  uptime?: number;
}

/**
 * /api/health has no entry in the shared key factory and lib/query is not this
 * feature's file to edit, so the key lives here.
 */
const HEALTH_KEY = ['platform-health'] as const;

/**
 * GET /api/health is anonymous and answers 503 when the database is
 * unreachable - which the api client turns into a thrown ApiRequestError, so a
 * failed query IS the red state rather than a bug.
 */
export function usePlatformHealth() {
  return useQuery({
    queryKey: HEALTH_KEY,
    queryFn: () => api.get<PlatformHealth>('/api/health', undefined, { anonymous: true }),
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: false,
  });
}

/* -------------------------------------------------------------------------- */
/* Editing a client account                                                    */
/* -------------------------------------------------------------------------- */

/** Only the identity fields the console edits; null clears a nullable column. */
export interface EntityPatch {
  name?: string;
  mode?: EntityMode;
  nif?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export function useUpdateEntity() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EntityPatch }) =>
      api.patch<EntityDto>(`${BASE}/${id}`, patch),
    onSuccess: (entity) => {
      void client.invalidateQueries({ queryKey: entitiesRoot });
      void client.invalidateQueries({ queryKey: qk.entity(entity.id) });
    },
  });
}
