import * as React from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { number as formatNumber } from '@/lib/format';

import { useResetPassword, useSetPin, useUpdateUser } from '../user-queries';
import type { UserRow } from '../user-types';

const failureMessage = (cause: unknown): string =>
  cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';

/* -------------------------------------------------------------------------- */
/* Reset password                                                              */
/* -------------------------------------------------------------------------- */

export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const reset = useResetPassword(user?.id ?? '');

  React.useEffect(() => {
    if (!open) return;
    setPassword('');
    setConfirmation('');
  }, [open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      toast.error('Palavra-passe curta', 'Use pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmation) {
      toast.error('As palavras-passe nao coincidem');
      return;
    }

    reset.mutate(password, {
      onSuccess: (result) => {
        toast.success(
          'Palavra-passe reposta',
          result.sessionsRevoked > 0
            ? `${formatNumber(result.sessionsRevoked)} sessao(oes) terminada(s).`
            : 'Nao havia sessoes abertas.',
        );
        onOpenChange(false);
      },
      onError: (cause) => toast.error('Nao foi possivel repor', failureMessage(cause)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repor palavra-passe</DialogTitle>
          <DialogDescription>
            Define uma nova palavra-passe para {user?.name ?? 'este utilizador'}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <DialogBody>
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
                <p className="text-foreground">
                  Ao repor a palavra-passe, <strong>todas as sessoes deste utilizador terminam
                  imediatamente</strong> - incluindo a caixa onde estiver a trabalhar neste momento.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-password" required>
                  Nova palavra-passe
                </Label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  maxLength={128}
                  disabled={reset.isPending}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Minimo 6 caracteres.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-confirm" required>
                  Confirmar
                </Label>
                <Input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  maxLength={128}
                  disabled={reset.isPending}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" variant="destructive" loading={reset.isPending}>
              Repor e terminar sessoes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* PIN                                                                         */
/* -------------------------------------------------------------------------- */

export function PinDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pin, setPin] = React.useState('');
  const setPinMutation = useSetPin(user?.id ?? '');

  React.useEffect(() => {
    if (!open) return;
    setPin('');
  }, [open]);

  const save = (value: string | null) => {
    setPinMutation.mutate(value, {
      onSuccess: () => {
        toast.success(
          value ? 'PIN definido' : 'PIN removido',
          value
            ? 'O utilizador ja aparece no teclado de PIN da caixa.'
            : 'O utilizador deixa de aparecer no teclado de PIN.',
        );
        onOpenChange(false);
      },
      onError: (cause) => toast.error('Nao foi possivel guardar o PIN', failureMessage(cause)),
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[0-9]{4,8}$/.test(pin)) {
      toast.error('PIN invalido', 'O PIN deve ter entre 4 e 8 digitos.');
      return;
    }
    save(pin);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>PIN de acesso rapido</DialogTitle>
          <DialogDescription>
            Permite a {user?.name ?? 'este utilizador'} entrar na caixa sem escrever o email.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <DialogBody>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-pin" required>
                  Novo PIN
                </Label>
                <Input
                  id="user-pin"
                  inputMode="numeric"
                  autoComplete="off"
                  className="tabular text-center text-2xl tracking-[0.5em]"
                  value={pin}
                  maxLength={8}
                  disabled={setPinMutation.isPending}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
                <p className="text-xs text-muted-foreground">
                  Entre 4 e 8 digitos, unico dentro desta entidade.
                </p>
              </div>

              {user?.pinEnabled && (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                  <KeyRound className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <p>
                    Este utilizador ja tem um PIN. Guardar substitui o anterior; remover tira-o do
                    teclado de PIN da caixa.
                  </p>
                </div>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            {user?.pinEnabled && (
              <Button
                variant="ghost"
                size="lg"
                className="mr-auto"
                disabled={setPinMutation.isPending}
                onClick={() => save(null)}
              >
                Remover PIN
              </Button>
            )}
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" loading={setPinMutation.isPending}>
              Guardar PIN
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Activation                                                                  */
/* -------------------------------------------------------------------------- */

export function ToggleActiveDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateUser(user?.id ?? '');
  const deactivating = user?.active === true;

  const confirm = () => {
    if (!user) return;

    update.mutate(
      { active: !user.active },
      {
        onSuccess: () => {
          toast.success(
            deactivating ? 'Utilizador desactivado' : 'Utilizador reactivado',
            deactivating
              ? 'As sessoes abertas foram terminadas.'
              : `${user.name} ja pode iniciar sessao.`,
          );
          onOpenChange(false);
        },
        onError: (cause) => {
          // The server owns the rules: you cannot switch yourself off, and the
          // last active administrator has to stay.
          toast.error(
            deactivating ? 'Nao foi possivel desactivar' : 'Nao foi possivel reactivar',
            failureMessage(cause),
          );
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deactivating ? `Desactivar ${user?.name}?` : `Reactivar ${user?.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deactivating ? (
              <>
                A conta deixa de poder iniciar sessao e todas as sessoes abertas terminam de
                imediato. O historico de vendas e de auditoria mantem-se intacto.
                <br />
                <br />
                O servidor recusa se tentar desactivar a sua propria conta ou o ultimo administrador
                activo da entidade.
              </>
            ) : (
              'A conta volta a poder iniciar sessao com a palavra-passe actual.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={deactivating ? 'destructive' : 'default'}
            onClick={confirm}
          >
            {deactivating ? 'Desactivar' : 'Reactivar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
