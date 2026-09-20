import * as React from 'react';
import { Lock } from 'lucide-react';
import type { Permission } from '@pos/shared';

import { Badge, SimpleTooltip, Switch } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface PermissionRowProps {
  permission: Permission;
  /** The plain sentence. "Ver precos de custo e margens". */
  label: string;
  checked: boolean;
  /** What the role grants out of the box, so straying is always visible. */
  defaultOn: boolean;
  /** The caller does not hold this permission, so cannot pass it on. */
  locked: boolean;
  busy?: boolean;
  onChange: (next: boolean) => void;
}

/**
 * One switch, one sentence.
 *
 * The raw key sits underneath in small muted mono - useless to the owner,
 * exactly what support needs on the phone: "read me the grey text".
 */
export function PermissionRow({
  permission,
  label,
  checked,
  defaultOn,
  locked,
  busy = false,
  onChange,
}: PermissionRowProps) {
  const fieldId = `perm-${permission.replace(/[^a-z]+/gi, '-')}`;
  const changed = checked !== defaultOn;

  return (
    <div
      className={cn(
        'flex min-h-touch items-start justify-between gap-3 rounded-lg px-2 py-2.5',
        changed && 'bg-warning/10',
      )}
    >
      <label htmlFor={fieldId} className={cn('min-w-0 flex-1', locked ? 'cursor-default' : 'cursor-pointer')}>
        <span className="block text-sm font-medium leading-snug text-foreground">{label}</span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <code className="font-mono text-[0.6875rem] leading-none text-muted-foreground">
            {permission}
          </code>

          {changed && (
            <>
              <Badge variant="warning" size="sm">
                alterado
              </Badge>
              <span className="text-[0.6875rem] leading-none text-muted-foreground">
                No perfil esta {defaultOn ? 'activa' : 'desactivada'}
              </span>
            </>
          )}

          {locked && (
            <span className="text-[0.6875rem] leading-none text-muted-foreground">
              Bloqueado - nao tem esta permissao
            </span>
          )}
        </span>
      </label>

      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {locked && (
          <SimpleTooltip label="Nao pode dar nem retirar um acesso que voce proprio nao tem.">
            <span
              tabIndex={0}
              aria-label="Permissao bloqueada"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Lock className="size-4" aria-hidden="true" />
            </span>
          </SimpleTooltip>
        )}

        <Switch
          id={fieldId}
          checked={checked}
          disabled={locked || busy}
          onCheckedChange={onChange}
          aria-label={label}
        />
      </div>
    </div>
  );
}

export default PermissionRow;
