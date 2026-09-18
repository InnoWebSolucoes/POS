import type { EntityDto } from '@pos/shared';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui';

/**
 * Support access, said out loud.
 *
 * The operator can go into a client's account to help - but never silently, and
 * never without the client being able to see it afterwards in the audit trail.
 */

export interface SupportAccessDialogProps {
  /** The client about to be entered; null keeps the dialog closed. */
  entity: EntityDto | null;
  onCancel: () => void;
  onConfirm: (entity: EntityDto) => void;
}

export function SupportAccessDialog({ entity, onCancel, onConfirm }: SupportAccessDialogProps) {
  return (
    <AlertDialog
      open={entity !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Entrar como operador da plataforma?</AlertDialogTitle>
          <AlertDialogDescription>
            Vai entrar em {entity?.name ?? 'este negocio'} como operador da plataforma. Esta accao
            fica registada no historico de auditoria.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="default"
            onClick={() => {
              if (entity) onConfirm(entity);
            }}
          >
            Entrar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default SupportAccessDialog;
