import { useQuery } from '@tanstack/react-query';
import type { Paginated } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

import type { AuditActionOption, AuditFilters, AuditLogEntry } from './audit-types';

const BASE = '/api/settings/audit';

/** Drops "all" and empty strings so the server never sees a meaningless filter. */
export function auditQuery(filters: AuditFilters): Record<string, unknown> {
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    search: filters.search || undefined,
    action: filters.action === 'all' ? undefined : filters.action,
    userId: filters.userId === 'all' ? undefined : filters.userId,
    targetType: filters.targetType === 'all' ? undefined : filters.targetType,
    targetId: filters.targetId || undefined,
    from: filters.dated ? filters.from || undefined : undefined,
    to: filters.dated ? filters.to || undefined : undefined,
  };
}

export function useAuditLog(filters: AuditFilters) {
  const query = auditQuery(filters);

  return useQuery({
    queryKey: qk.audit(query),
    queryFn: () => api.get<Paginated<AuditLogEntry>>(BASE, query),
    placeholderData: (previous) => previous,
  });
}

/** The action values actually present in this tenant's trail. */
export function useAuditActions() {
  return useQuery({
    queryKey: qk.audit({ scope: 'actions' }),
    queryFn: () => api.get<{ data: AuditActionOption[] }>(`${BASE}/actions`),
    staleTime: 5 * 60_000,
  });
}
