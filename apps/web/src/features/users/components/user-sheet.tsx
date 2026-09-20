import * as React from 'react';
import { CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { LOCALES, ROLE_LABELS, type Locale, type Role } from '@pos/shared';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

import {
  useCreateUser,
  useLocations,
  useRoleOptions,
  useUpdateUser,
  type CreateUserBody,
} from '../user-queries';
import { emptyUserForm, userToForm, type UserFormValues, type UserRow } from '../user-types';
import { RoleSummary } from './role-summary';

const LOCALE_LABELS: Record<Locale, string> = {
  'pt-PT': 'Portugues',
  en: 'English',
};

export interface UserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates, a row edits. */
  user?: UserRow | null;
  /** Offered right after a member is created, and from the edit form. */
  onAdjustPermissions?: (user: UserRow) => void;
}

/** Create and edit share one form so the fields can never drift apart. */
export function UserSheet({ open, onOpenChange, user, onAdjustPermissions }: UserSheetProps) {
  const editing = Boolean(user);
  const entityId = useAuth((s) => s.entity?.id);
  const entityMode = useAuth((s) => s.entity?.mode);

  const [values, setValues] = React.useState<UserFormValues>(emptyUserForm);
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<ApiRequestError | null>(null);
  /** Set once a member exists, so we can offer the permission editor at once. */
  const [created, setCreated] = React.useState<UserRow | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setValues(user ? userToForm(user) : emptyUserForm());
    setShowPassword(false);
    setError(null);
    setCreated(null);
  }, [open, user]);

  const roles = useRoleOptions();
  const locations = useLocations(entityId);
  const create = useCreateUser();
  const update = useUpdateUser(user?.id ?? '');
  const saving = create.isPending || update.isPending;

  const patch = (next: Partial<UserFormValues>) => setValues((prev) => ({ ...prev, ...next }));

  const selectedRole = (roles.data ?? []).find((option) => option.role === values.role);

  const handleError = (cause: unknown) => {
    if (cause instanceof ApiRequestError) {
      setError(cause);
      toast.error('Nao foi possivel guardar', cause.message);
      return;
    }
    toast.error('Nao foi possivel guardar', 'Tente novamente.');
  };

  /**
   * Hand off to the permission editor. The close animation gets its moment
   * first, so two overlays never fight over the focus trap.
   */
  const adjust = (target: UserRow) => {
    onOpenChange(false);
    window.setTimeout(() => onAdjustPermissions?.(target), 220);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (values.name.trim().length < 2) {
      toast.error('Nome obrigatorio', 'Indique o nome do colaborador.');
      return;
    }
    if (!values.email.trim()) {
      toast.error('Email obrigatorio', 'O email e usado para iniciar sessao.');
      return;
    }
    if (!editing && values.password.length < 6) {
      toast.error('Palavra-passe curta', 'Use pelo menos 6 caracteres.');
      return;
    }

    if (user) {
      update.mutate(
        {
          name: values.name.trim(),
          email: values.email.trim(),
          role: values.role,
          locationId: values.locationId || null,
          phone: values.phone.trim() || null,
          locale: values.locale,
        },
        {
          onSuccess: (saved) => {
            toast.success('Utilizador actualizado', saved.name);
            onOpenChange(false);
          },
          onError: handleError,
        },
      );
      return;
    }

    const body: CreateUserBody = {
      name: values.name.trim(),
      email: values.email.trim(),
      password: values.password,
      role: values.role,
      locationId: values.locationId || null,
      phone: values.phone.trim() || null,
      locale: values.locale,
    };

    create.mutate(body, {
      onSuccess: (saved) => {
        toast.success('Utilizador criado', `${saved.name} ja pode iniciar sessao.`);
        setCreated(saved);
      },
      onError: handleError,
    });
  };

  const fieldError = (path: string) => error?.fieldError(path);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>
            {created ? 'Conta criada' : editing ? 'Editar utilizador' : 'Novo utilizador'}
          </SheetTitle>
          <SheetDescription>
            {created
              ? 'Falta a parte importante: decidir o que esta pessoa pode ver.'
              : editing
                ? 'Altere os dados e o perfil de acesso deste colaborador.'
                : 'Crie a conta de um colaborador e escolha o que ele pode fazer.'}
          </SheetDescription>
        </SheetHeader>

        {created ? (
          <>
            <SheetBody>
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
                  <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {created.name} ja pode iniciar sessao
                    </p>
                    <p className="mt-0.5 break-words text-sm text-muted-foreground">
                      Entra com {created.email} e a palavra-passe que acabou de definir.
                    </p>
                  </div>
                </div>

                <RoleSummary role={created.role} mode={entityMode} />

                <div className="rounded-xl border border-border p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ShieldCheck className="size-5 text-muted-foreground" aria-hidden="true" />
                    Quer limitar ainda mais?
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    O perfil e so o ponto de partida. Pode ligar e desligar cada permissao so para
                    esta pessoa - esconder os precos de custo, tirar os relatorios, permitir
                    devolucoes.
                  </p>
                </div>
              </div>
            </SheetBody>

            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => onOpenChange(false)}
              >
                Concluir
              </Button>
              <Button
                type="button"
                size="lg"
                leftIcon={<ShieldCheck />}
                onClick={() => adjust(created)}
              >
                Ajustar permissoes
              </Button>
            </SheetFooter>
          </>
        ) : (
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-name" required>
                  Nome
                </Label>
                <Input
                  id="user-name"
                  value={values.name}
                  maxLength={120}
                  disabled={saving}
                  autoComplete="off"
                  onChange={(e) => patch({ name: e.target.value })}
                />
                {fieldError('name') && (
                  <p className="text-xs font-medium text-destructive">{fieldError('name')}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-email" required>
                  Email
                </Label>
                <Input
                  id="user-email"
                  type="email"
                  value={values.email}
                  maxLength={180}
                  disabled={saving}
                  autoComplete="off"
                  onChange={(e) => patch({ email: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {fieldError('email') ?? 'Usado para iniciar sessao. Tem de ser unico.'}
                </p>
              </div>

              {!editing && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="user-password" required>
                    Palavra-passe inicial
                  </Label>
                  <Input
                    id="user-password"
                    type={showPassword ? 'text' : 'password'}
                    value={values.password}
                    maxLength={128}
                    disabled={saving}
                    autoComplete="new-password"
                    onChange={(e) => patch({ password: e.target.value })}
                    endAdornment={
                      <button
                        type="button"
                        aria-label={showPassword ? 'Esconder' : 'Mostrar'}
                        className="flex size-11 items-center justify-center rounded-md text-muted-foreground"
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                      </button>
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {fieldError('password') ?? 'Minimo 6 caracteres. O colaborador pode alterar depois.'}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-role" required>
                  Perfil de acesso
                </Label>
                <Select
                  value={values.role}
                  disabled={saving}
                  onValueChange={(value) => patch({ role: value as Role })}
                >
                  <SelectTrigger id="user-role" aria-label="Perfil de acesso">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(roles.data ?? []).map((option) => (
                      <SelectItem key={option.role} value={option.role}>
                        {option.labelPt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError('role') && (
                  <p className="text-xs font-medium text-destructive">{fieldError('role')}</p>
                )}
              </div>

              {/* Choosing a role has to be a decision, not a guess. */}
              <RoleSummary
                role={values.role}
                mode={entityMode}
                permissions={selectedRole?.permissions}
              />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-location">Localizacao</Label>
                <Select
                  value={values.locationId || 'none'}
                  disabled={saving}
                  onValueChange={(value) => patch({ locationId: value === 'none' ? '' : value })}
                >
                  <SelectTrigger id="user-location" aria-label="Localizacao">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem localizacao fixa</SelectItem>
                    {(locations.data ?? []).map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                        {location.isDefault ? ' (principal)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {fieldError('locationId') ?? 'A loja onde este colaborador trabalha por omissao.'}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="user-phone">Telefone</Label>
                  <Input
                    id="user-phone"
                    type="tel"
                    inputMode="tel"
                    className="tabular"
                    value={values.phone}
                    maxLength={40}
                    disabled={saving}
                    onChange={(e) => patch({ phone: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="user-locale">Idioma</Label>
                  <Select
                    value={values.locale}
                    disabled={saving}
                    onValueChange={(value) => patch({ locale: value as Locale })}
                  >
                    <SelectTrigger id="user-locale" aria-label="Idioma">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCALES.map((locale) => (
                        <SelectItem key={locale} value={locale}>
                          {LOCALE_LABELS[locale]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editing && user && (
                <p className="text-xs text-muted-foreground">
                  Perfil actual: {ROLE_LABELS[user.role].pt}. A palavra-passe so pode ser alterada
                  atraves da accao "Repor palavra-passe".
                </p>
              )}
            </div>
          </SheetBody>

          <SheetFooter className={editing ? 'sm:justify-between' : undefined}>
            {editing && user && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                leftIcon={<ShieldCheck />}
                disabled={saving}
                onClick={() => adjust(user)}
              >
                Permissoes
              </Button>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" size="lg" loading={saving}>
                {editing ? 'Guardar' : 'Criar utilizador'}
              </Button>
            </div>
          </SheetFooter>
        </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default UserSheet;
