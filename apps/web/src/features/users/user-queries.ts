import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocationDto, Paginated } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

import type { RoleOption, UserListParams, UserRow } from './user-types';

const BASE = '/api/users';

/** Every users list variant hangs off this prefix, so one invalidate covers all. */
const usersRoot = qk.users().slice(0, 1);

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export function useUserList(params: UserListParams) {
  const query = {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search || undefined,
    role: params.role === 'all' ? undefined : params.role,
    active: params.active === 'all' ? undefined : params.active,
    locationId: params.locationId === 'all' ? undefined : params.locationId,
    sort: params.sort,
    order: params.order,
  };

  return useQuery({
    queryKey: qk.users(query),
    queryFn: () => api.get<Paginated<UserRow>>(BASE, query),
    placeholderData: (previous) => previous,
  });
}

/** The role picker, with the permission list each role grants. */
export function useRoleOptions() {
  return useQuery({
    queryKey: qk.users({ scope: 'roles' }),
    queryFn: () => api.get<RoleOption[]>(`${BASE}/roles`),
    staleTime: 10 * 60_000,
  });
}

/** Where a member of staff is posted. */
export function useLocations(entityId: string | undefined) {
  return useQuery({
    queryKey: [...qk.entity(entityId ?? 'none'), 'locations'] as const,
    queryFn: () => api.get<LocationDto[]>(`/api/entities/${entityId}/locations`),
    enabled: Boolean(entityId),
    staleTime: 5 * 60_000,
  });
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export interface CreateUserBody {
  name: string;
  email: string;
  password: string;
  role: string;
  locationId?: string | null;
  phone?: string | null;
  locale?: string;
}

export function useCreateUser() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateUserBody) => api.post<UserRow>(BASE, body),
    onSuccess: () => void client.invalidateQueries({ queryKey: usersRoot }),
  });
}

export function useUpdateUser(id: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<UserRow>(`${BASE}/${id}`, body),
    onSuccess: () => void client.invalidateQueries({ queryKey: usersRoot }),
  });
}

export interface ResetResult {
  success: boolean;
  id: string;
  sessionsRevoked: number;
}

/** Resetting a password kills every live session of that user. */
export function useResetPassword(id: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (password: string) => api.post<ResetResult>(`${BASE}/${id}/password`, { password }),
    onSuccess: () => void client.invalidateQueries({ queryKey: usersRoot }),
  });
}

/** null clears the PIN, which also removes the user from the PIN keypad. */
export function useSetPin(id: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (pin: string | null) => api.post<UserRow>(`${BASE}/${id}/pin`, { pin }),
    onSuccess: () => void client.invalidateQueries({ queryKey: usersRoot }),
  });
}
