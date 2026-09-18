import * as React from 'react';
import { Check, ShieldAlert } from 'lucide-react';
import type { Permission } from '@pos/shared';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  SENSITIVE_PERMISSIONS,
} from '../user-types';

export interface RolePermissionsProps {
  permissions: Permission[];
  className?: string;
}

/**
 * What a role actually grants, in plain Portuguese.
 *
 * A manager assigning a role should not have to know that "product:cost" means
 * "sees the margin". Only the granted permissions are listed - a wall of greyed
 * out rows hides the ones that matter.
 */
export function RolePermissions({ permissions, className }: RolePermissionsProps) {
  const granted = React.useMemo(() => new Set(permissions), [permissions]);

  const groups = PERMISSION_GROUPS.map((group) => ({
    label: group.label,
    items: group.permissions.filter((permission) => granted.has(permission)),
  })).filter((group) => group.items.length > 0);

  const sensitive = SENSITIVE_PERMISSIONS.filter((permission) => granted.has(permission));

  if (permissions.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        Este perfil nao concede qualquer permissao.
      </p>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{permissions.length} permissoes</Badge>
        {sensitive.length > 0 && (
          <Badge variant="warning">
            <ShieldAlert className="size-3" aria-hidden="true" />
            {sensitive.length} sensivel(eis)
          </Badge>
        )}
      </div>

      {sensitive.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Concede acesso privilegiado a
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {sensitive.map((permission) => (
              <li key={permission} className="text-sm text-foreground">
                {PERMISSION_LABELS[permission]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul className="flex flex-col gap-1">
              {group.items.map((permission) => (
                <li key={permission} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  <span>{PERMISSION_LABELS[permission]}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RolePermissions;
