import * as React from 'react';
import { AlertTriangle, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { PERMISSIONS, ROLE_LABELS, type Permission } from '@pos/shared';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SkeletonText,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

import {
  usePermissionCatalogue,
  useResetUserPermissions,
  useSaveUserPermissions,
  useUserPermissions,
} from '../permission-queries';
import {
  applyPreset,
  buildEditorGroups,
  countChanged,
  permissionLabel,
  presetPermissions,
  sameSelection,
  PERMISSION_PRESETS,
} from '../permission-types';
import type { UserRow } from '../user-types';
import { PermissionRow } from './permission-row';

export interface PermissionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The member being tuned. Kept mounted while the sheet animates out. */
  user: UserRow | null;
}

/** Roles where every switch is already on - a preset would say nothing. */
const PRESETS_HIDDEN_FOR = new Set(['super_admin', 'entity_admin']);

/**
 * The permission editor.
 *
 * The model it has to teach, in one screen: the role is a starting point, and
 * this person can be moved off it. Everything else follows from that - the
 * "alterado" badges say how far you have moved, "Repor padroes do perfil" walks
 * it all back, and the presets are three sensible places to start.
 */
export function PermissionSheet({ open, onOpenChange, user }: PermissionSheetProps) {
  const entityMode = useAuth((s) => s.entity?.mode);
  const userId = user?.id ?? '';

  const query = useUserPermissions(user?.id ?? null, open);
  const catalogue = usePermissionCatalogue(open);
  const save = useSaveUserPermissions(userId);
  const reset = useResetUserPermissions(userId);

  const [selected, setSelected] = React.useState<ReadonlySet<Permission>>(new Set<Permission>());
  const [openGroups, setOpenGroups] = React.useState<string[]>([]);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [serverMessage, setServerMessage] = React.useState<string | null>(null);

  const data = query.data;
  const busy = save.isPending || reset.isPending;

  const effective = React.useMemo(() => new Set<Permission>(data?.effective ?? []), [data]);
  const roleDefaults = React.useMemo(() => new Set<Permission>(data?.roleDefaults ?? []), [data]);
  const editable = React.useMemo(
    () =>
      new Set<Permission>(
        data && Array.isArray(data.editableByCaller) ? data.editableByCaller : [...PERMISSIONS],
      ),
    [data],
  );

  /**
   * Load the server's answer into the switches.
   *
   * Two things must both hold: a background refetch may never wipe edits the
   * owner is in the middle of, and a set that really did change on the server
   * (someone else edited this member, or we just pressed "repor") has to land.
   * So we sync on the CONTENT of the answer, and hold off only while there are
   * unsaved taps on screen.
   */
  const syncedRef = React.useRef<string | null>(null);
  const touchedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      syncedRef.current = null;
      touchedRef.current = false;
      return;
    }
    if (!data || !user) return;

    const signature = `${user.id}|${[...data.effective].sort().join(',')}`;
    if (syncedRef.current === signature) return;
    if (touchedRef.current && syncedRef.current?.startsWith(`${user.id}|`)) return;

    syncedRef.current = signature;
    touchedRef.current = false;
    const initial = new Set<Permission>(data.effective);
    setSelected(initial);
    setServerMessage(null);

    // Open the groups the owner has already touched; otherwise just the first.
    const groups = buildEditorGroups(entityMode, initial, catalogue.data);
    const touched = groups
      .filter((group) => countChanged(initial, new Set(data.roleDefaults), group.permissions) > 0)
      .map((group) => group.key);
    setOpenGroups(touched.length > 0 ? touched : groups.slice(0, 1).map((group) => group.key));
  }, [open, user, data, entityMode, catalogue.data]);

  const groups = React.useMemo(() => {
    const active = new Set<Permission>([...effective, ...selected]);
    return buildEditorGroups(entityMode, active, catalogue.data);
  }, [effective, selected, entityMode, catalogue.data]);

  const visiblePermissions = React.useMemo(
    () => groups.flatMap((group) => group.permissions),
    [groups],
  );

  const touchable = React.useMemo(
    () => visiblePermissions.filter((permission) => editable.has(permission)),
    [visiblePermissions, editable],
  );

  const dirty = !sameSelection(selected, effective);
  const changedCount = countChanged(selected, roleDefaults, visiblePermissions);
  const activeCount = visiblePermissions.filter((permission) => selected.has(permission)).length;

  const role = data?.role ?? user?.role ?? 'cashier';
  const roleName = ROLE_LABELS[role].pt;
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';

  const toggle = (permission: Permission, next: boolean) => {
    setServerMessage(null);
    touchedRef.current = true;
    setSelected((prev) => {
      const draft = new Set<Permission>(prev);
      if (next) draft.add(permission);
      else draft.delete(permission);
      return draft;
    });
  };

  const choosePreset = (key: string) => {
    const preset = PERMISSION_PRESETS.find((candidate) => candidate.key === key);
    if (!preset) return;
    setServerMessage(null);
    touchedRef.current = true;
    setSelected((prev) => applyPreset(prev, presetPermissions(preset, entityMode), touchable));
    setOpenGroups(groups.map((group) => group.key));
    toast.show(preset.label, 'Interruptores preenchidos. Confirme e prima Guardar.');
  };

  const failed = (cause: unknown, title: string) => {
    if (cause instanceof ApiRequestError) {
      // The server's own wording explains a refusal far better than we can.
      setServerMessage(cause.isOffline ? 'Sem ligacao ao servidor.' : cause.message);
      toast.error(title, cause.isOffline ? 'Sem ligacao ao servidor.' : cause.message);
      return;
    }
    setServerMessage('Ocorreu um erro inesperado.');
    toast.error(title, 'Tente novamente.');
  };

  const submit = () => {
    if (!user || !dirty) return;
    setServerMessage(null);

    save.mutate([...selected], {
      onSuccess: () => {
        syncedRef.current = null;
        touchedRef.current = false;
        toast.success('Permissoes actualizadas', `${user.name} ja trabalha com o novo acesso.`);
        onOpenChange(false);
      },
      onError: (cause) => failed(cause, 'Nao foi possivel guardar'),
    });
  };

  const doReset = () => {
    if (!user) return;
    setServerMessage(null);

    reset.mutate(undefined, {
      onSuccess: () => {
        // Re-sync so the switches visibly snap back to the preset.
        syncedRef.current = null;
        touchedRef.current = false;
        toast.success('Permissoes repostas', `${user.name} voltou ao perfil ${roleName}.`);
      },
      onError: (cause) => failed(cause, 'Nao foi possivel repor'),
    });
  };

  const showPresets = !PRESETS_HIDDEN_FOR.has(role);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>Permissoes de {user?.name ?? 'colaborador'}</SheetTitle>
          <SheetDescription>
            O perfil <strong className="font-semibold text-foreground">{roleName}</strong> ja define
            o que esta pessoa ve. Aqui pode afinar, so para {firstName || 'este colaborador'}, o que
            fica ligado ou desligado.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-4">
          {query.isLoading ? (
            <div className="flex flex-col gap-4">
              <SkeletonText lines={2} />
              <SkeletonText lines={6} />
            </div>
          ) : query.isError ? (
            <EmptyState
              icon={AlertTriangle}
              title="Nao foi possivel carregar as permissoes"
              description={
                query.error instanceof ApiRequestError
                  ? query.error.message
                  : 'Ocorreu um erro inesperado.'
              }
              action={{ label: 'Tentar novamente', onClick: () => void query.refetch() }}
            />
          ) : (
            <>
              {/* Where this person stands right now. */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
                <ShieldCheck className="size-5 text-muted-foreground" aria-hidden="true" />
                <Badge variant="secondary">{roleName}</Badge>
                <Badge variant={changedCount > 0 ? 'warning' : 'muted'}>
                  {changedCount > 0 ? 'Personalizado' : 'Padrao do perfil'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {activeCount} de {visiblePermissions.length} permissoes activas
                  {changedCount > 0
                    ? ` - ${changedCount} diferente${changedCount === 1 ? '' : 's'} do perfil`
                    : ''}
                </span>
              </div>

              {showPresets && (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
                    Comecar por um modelo
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {PERMISSION_PRESETS.map((preset) => (
                      <Button
                        key={preset.key}
                        type="button"
                        variant="outline"
                        disabled={busy}
                        className="h-auto flex-col items-start gap-1 px-3 py-3 text-left"
                        onClick={() => choosePreset(preset.key)}
                      >
                        <span className="text-sm font-semibold">{preset.label}</span>
                        <span className="whitespace-normal text-xs font-normal text-muted-foreground">
                          {preset.description}
                        </span>
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Um modelo apenas prepara os interruptores. Nada e guardado ate premir Guardar.
                  </p>
                </div>
              )}

              <Accordion
                type="multiple"
                value={openGroups}
                onValueChange={setOpenGroups}
                className="rounded-xl border border-border"
              >
                {groups.map((group) => {
                  const active = group.permissions.filter((permission) =>
                    selected.has(permission),
                  ).length;
                  const changed = countChanged(selected, roleDefaults, group.permissions);

                  return (
                    <AccordionItem
                      key={group.key}
                      value={group.key}
                      className="px-3 last:border-b-0"
                    >
                      <AccordionTrigger>
                        <span className="flex flex-1 flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{group.label}</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {active} de {group.permissions.length} activas
                          </span>
                          {changed > 0 && (
                            <Badge variant="warning" size="sm">
                              alterado
                            </Badge>
                          )}
                        </span>
                      </AccordionTrigger>

                      <AccordionContent className="pt-0">
                        <div className="flex flex-col divide-y divide-border">
                          {group.permissions.map((permission) => (
                            <PermissionRow
                              key={permission}
                              permission={permission}
                              label={permissionLabel(permission, catalogue.data)}
                              checked={selected.has(permission)}
                              defaultOn={roleDefaults.has(permission)}
                              locked={!editable.has(permission)}
                              busy={busy}
                              onChange={(next) => toggle(permission, next)}
                            />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>

              {serverMessage && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3"
                >
                  <AlertTriangle
                    className="mt-0.5 size-5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-foreground">{serverMessage}</p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                As alteracoes so entram em vigor no proximo ecra que o colaborador abrir. Se estiver
                com sessao iniciada, pode ter de sair e entrar de novo.
              </p>
            </>
          )}
        </SheetBody>

        <SheetFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="lg"
            leftIcon={<RotateCcw />}
            disabled={busy || !data?.hasOverrides}
            onClick={() => setConfirmReset(true)}
          >
            Repor padroes do perfil
          </Button>

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="lg"
              loading={save.isPending}
              disabled={!dirty || busy}
              onClick={submit}
            >
              {dirty ? 'Guardar alteracoes' : 'Guardar'}
            </Button>
          </div>
        </SheetFooter>

        <ConfirmDialog
          open={confirmReset}
          onOpenChange={setConfirmReset}
          title="Repor os padroes do perfil?"
          description={`Todos os ajustes feitos a ${user?.name ?? 'este colaborador'} sao removidos e as permissoes voltam ao que o perfil ${roleName} define.`}
          confirmLabel="Repor padroes"
          cancelLabel="Manter como esta"
          onConfirm={doReset}
        />
      </SheetContent>
    </Sheet>
  );
}

export default PermissionSheet;
