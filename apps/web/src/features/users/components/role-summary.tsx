import * as React from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import { ROLE_LABELS, type EntityMode, type Permission, type Role } from '@pos/shared';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
} from '@/components/ui';
import { cn } from '@/lib/utils';

import { roleHighlights } from '../permission-types';
import { RolePermissions } from './role-permissions';

export interface RoleSummaryProps {
  role: Role;
  /** Restaurant capabilities are not mentioned to a shop, and the reverse. */
  mode?: EntityMode;
  /** The full list, shown only if the owner asks for it. */
  permissions?: Permission[];
  className?: string;
}

/**
 * What picking this role actually means, in a dozen words.
 *
 * The "Nao pode" half is the important one: the owner choosing "Operador de
 * Caixa" has to see, before saving, that it will not show margins and will not
 * open the reports. The full key-by-key list stays one tap away for anyone who
 * wants it.
 */
export function RoleSummary({ role, mode, permissions, className }: RoleSummaryProps) {
  const highlights = React.useMemo(() => roleHighlights(role, mode), [role, mode]);

  return (
    <div className={cn('rounded-xl border border-border bg-muted/40 p-4', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ShieldCheck className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">
          O perfil {ROLE_LABELS[role].pt} comeca assim
        </p>
        <Badge variant="secondary" size="sm">
          {highlights.total} permissoes
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pode
          </p>
          <ul className="flex flex-col gap-1">
            {highlights.can.length === 0 ? (
              <li className="text-sm text-muted-foreground">Apenas ver o essencial.</li>
            ) : (
              highlights.can.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nao pode
          </p>
          <ul className="flex flex-col gap-1">
            {highlights.cannot.length === 0 ? (
              <li className="text-sm text-muted-foreground">Tem acesso a tudo.</li>
            ) : (
              highlights.cannot.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <X className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Isto e so o ponto de partida. Depois de criar a conta pode ligar ou desligar cada permissao
        para esta pessoa em particular.
      </p>

      {permissions && permissions.length > 0 && (
        <Accordion type="single" collapsible className="mt-1">
          <AccordionItem value="all" className="border-b-0">
            <AccordionTrigger className="py-3 text-sm">Ver a lista completa</AccordionTrigger>
            <AccordionContent>
              <RolePermissions permissions={permissions} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

export default RoleSummary;
