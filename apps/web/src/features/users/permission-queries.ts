import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

import type { PermissionCatalogueDto, UserPermissionsDto } from './permission-types';

const BASE = '/api/users';

/** Everything users-shaped hangs off this prefix, so one invalidate covers all. */
const usersRoot = qk.users().slice(0, 1);

const permissionsKey = (id: string) => qk.users({ scope: 'permissions', id });

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

/** What this member may do, what the role said, and what the caller may change. */
export function useUserPermissions(id: string | null, enabled = true) {
  return useQuery({
    queryKey: permissionsKey(id ?? 'none'),
    queryFn: () => api.get<UserPermissionsDto>(`${BASE}/${id}/permissions`),
    enabled: Boolean(id) && enabled,
    staleTime: 0,
  });
}

/**
 * Server-side labels for the permission list.
 *
 * Purely an enhancement: the editor renders from @pos/shared, and this only
 * overrides a title here and there. A failure is silence, never an error state.
 */
export function usePermissionCatalogue(enabled = true) {
  return useQuery({
    queryKey: qk.users({ scope: 'permission-catalogue' }),
    queryFn: () => api.get<PermissionCatalogueDto>(`${BASE}/permission-catalogue`),
    enabled,
    staleTime: 30 * 60_000,
    retry: false,
  });
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The PUT takes the DESIRED FINAL SET, not a diff. The server turns it back
 * into overrides against the role, so a later change to the role's defaults
 * still reaches everyone who was never specifically tuned.
 */
export function useSaveUserPermissions(id: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (permissions: Permission[]) =>
      api.put<UserPermissionsDto>(`${BASE}/${id}/permissions`, { permissions }),
    onSuccess: (data) => {
      if (data && Array.isArray(data.effective)) client.setQueryData(permissionsKey(id), data);
      void client.invalidateQueries({ queryKey: usersRoot });
      void client.invalidateQueries({ queryKey: qk.me });
    },
  });
}

/** Back to whatever the role grants, with every individual tweak dropped. */
export function useResetUserPermissions(id: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<UserPermissionsDto>(`${BASE}/${id}/permissions/reset`),
    onSuccess: (data) => {
      if (data && Array.isArray(data.effective)) client.setQueryData(permissionsKey(id), data);
      void client.invalidateQueries({ queryKey: usersRoot });
      void client.invalidateQueries({ queryKey: qk.me });
    },
  });
}
