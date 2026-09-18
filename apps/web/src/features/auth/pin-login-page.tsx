import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Store } from 'lucide-react';
import { ROLE_HOME, type AuthUser, type EntityDto, type Paginated } from '@pos/shared';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  UserAvatar,
} from '@/components/ui';
import { ApiRequestError, api, getEntityId } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { queryClient, qk } from '@/lib/query';
import { errorBeep, successChime, unlockAudio } from '@/lib/sound';
import { AuthBackdrop, BrandMark, LocaleToggle, authErrorMessage } from './auth-chrome';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH, PinDots, PinKeypad } from './pin-keypad';
import { EntityPicker, StaffGrid, useRoleLabel, type PinUser } from './staff-picker';

/**
 * A 4-digit PIN submits itself, but only after this pause - a fifth digit typed
 * inside the window cancels it, so 5 and 6-digit PINs still reach the confirm
 * key instead of being sent short.
 */
const AUTO_SUBMIT_MS = 320;

export default function PinLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const roleLabel = useRoleLabel();
  const [searchParams, setSearchParams] = useSearchParams();

  const status = useAuth((s) => s.status);
  const can = useAuth((s) => s.can);
  const authEntity = useAuth((s) => s.entity);
  const pinLogin = useAuth((s) => s.pinLogin);

  // The device remembers the last tenant it traded under; a link may override it.
  const storedEntityId = React.useMemo(() => getEntityId(), []);
  const entityId = searchParams.get('entityId') ?? authEntity?.id ?? storedEntityId;

  const [switching, setSwitching] = React.useState(false);
  const [selected, setSelected] = React.useState<PinUser | null>(null);
  const [pin, setPin] = React.useState('');
  const [shakeToken, setShakeToken] = React.useState(0);

  const needsEntity = !entityId || switching;
  const canListEntities = status === 'authenticated' && can('entity:read');

  const entitiesQuery = useQuery({
    queryKey: qk.entities({ scope: 'pin-login', active: true }),
    queryFn: () =>
      api.get<Paginated<EntityDto>>('/api/entities', { active: 'true', pageSize: 100 }),
    enabled: needsEntity && canListEntities,
  });

  const staffQuery = useQuery({
    queryKey: qk.users({ scope: 'pin', entityId }),
    // Read before anyone is authenticated: a stale token from another tenant
    // would only earn a 403, so this call is deliberately anonymous.
    queryFn: () => api.get<PinUser[]>('/api/users/pin-users', { entityId }, { anonymous: true }),
    enabled: Boolean(entityId) && !needsEntity,
    staleTime: 60_000,
  });

  const entityName =
    authEntity && authEntity.id === entityId
      ? authEntity.name
      : (entitiesQuery.data?.data.find((entity) => entity.id === entityId)?.name ?? null);

  const mutation = useMutation<AuthUser, Error, string>({
    mutationFn: async (value) => {
      if (!entityId) throw new ApiRequestError(400, 'bad_request', 'Seleccione primeiro a loja.');
      return pinLogin(entityId, value);
    },
    onSuccess: (user) => {
      // A register is handed from one operator to the next: drop everything the
      // previous session had cached before the new one renders.
      queryClient.clear();
      successChime();
      navigate(ROLE_HOME[user.role], { replace: true });
    },
    onError: () => {
      errorBeep();
      setPin('');
      setShakeToken((token) => token + 1);
    },
  });

  const submit = () => {
    if (mutation.isPending || pin.length < PIN_MIN_LENGTH) return;
    mutation.mutate(pin);
  };

  // The auto-submit timer needs the freshest closure without restarting itself
  // on every render, so it goes through a ref.
  const submitRef = React.useRef(submit);
  React.useEffect(() => {
    submitRef.current = submit;
  });

  React.useEffect(() => {
    if (pin.length !== PIN_MIN_LENGTH) return undefined;
    const timer = window.setTimeout(() => submitRef.current(), AUTO_SUBMIT_MS);
    return () => window.clearTimeout(timer);
  }, [pin]);

  // Desktop registers have a keyboard and a numeric keypad; both must work.
  React.useEffect(() => {
    if (!selected) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key.length === 1 && event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        setPin((previous) => (previous.length >= PIN_MAX_LENGTH ? previous : previous + event.key));
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        setPin((previous) => previous.slice(0, -1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  const openKeypad = (user: PinUser) => {
    unlockAudio();
    mutation.reset();
    setPin('');
    setSelected(user);
  };

  const closeKeypad = () => {
    setSelected(null);
    setPin('');
    mutation.reset();
  };

  const chooseEntity = (id: string) => {
    setSwitching(false);
    setSearchParams({ entityId: id }, { replace: true });
  };

  const pinError = mutation.error
    ? authErrorMessage(mutation.error, t('auth.invalidPin', 'PIN invalido. Tente novamente.'))
    : null;

  return (
    <AuthBackdrop>
      <header className="safe-top flex items-center justify-between gap-3 p-4">
        <BrandMark align="start" subtitle={entityName ?? t('auth.pin')} />
        <LocaleToggle />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pb-10">
        {needsEntity ? (
          <section className="mx-auto w-full max-w-lg">
            <h1 className="mb-1 text-center text-xl font-bold tracking-tight text-foreground">
              {t('auth.chooseEntity', 'Escolha a loja')}
            </h1>
            <p className="mb-5 text-center text-sm text-muted-foreground">
              {t('auth.chooseEntityHint', 'O PIN pertence a equipa de uma loja.')}
            </p>
            <EntityPicker
              entities={entitiesQuery.data?.data}
              isLoading={entitiesQuery.isLoading}
              error={entitiesQuery.error}
              canList={canListEntities}
              onRetry={() => void entitiesQuery.refetch()}
              onSelect={chooseEntity}
              onCancel={switching && entityId ? () => setSwitching(false) : undefined}
            />
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {t('auth.selectUser')}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('auth.selectUserHint', 'Toque no seu nome e introduza o PIN.')}
                </p>
              </div>
              {canListEntities && (
                <Button type="button" variant="outline" onClick={() => setSwitching(true)}>
                  <Store className="size-5" aria-hidden="true" />
                  <span>{t('auth.switchEntity', 'Mudar de loja')}</span>
                </Button>
              )}
            </div>

            <StaffGrid
              users={staffQuery.data}
              isLoading={staffQuery.isLoading}
              error={staffQuery.error}
              onRetry={() => void staffQuery.refetch()}
              onSelect={openKeypad}
            />
          </>
        )}

        <div className="mt-auto flex justify-center pt-4">
          <Button asChild variant="ghost" size="lg">
            <Link to="/login">
              <ArrowLeft className="size-5" aria-hidden="true" />
              <span>{t('auth.backToLogin', 'Entrar com email e palavra-passe')}</span>
            </Link>
          </Button>
        </div>
      </main>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeKeypad();
        }}
      >
        <DialogContent size="sm" className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <UserAvatar name={selected.name} src={selected.avatarUrl} size="lg" />
                  <div className="min-w-0">
                    <DialogTitle className="truncate">{selected.name}</DialogTitle>
                    <DialogDescription>{roleLabel(selected.role)}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <DialogBody className="flex flex-col gap-5 p-5">
                <p className="text-center text-sm text-muted-foreground">{t('auth.enterPin')}</p>

                <PinDots value={pin} shakeToken={shakeToken} />

                {pinError && (
                  <p role="alert" className="text-center text-sm font-medium text-destructive">
                    {pinError}
                  </p>
                )}

                <PinKeypad
                  disabled={mutation.isPending}
                  onDigit={(digit) =>
                    setPin((previous) =>
                      previous.length >= PIN_MAX_LENGTH ? previous : previous + digit,
                    )
                  }
                  onBackspace={() => setPin((previous) => previous.slice(0, -1))}
                  onClear={() => setPin('')}
                />

                <Button
                  type="button"
                  size="xl"
                  block
                  onClick={submit}
                  loading={mutation.isPending}
                  loadingLabel={t('auth.signingIn', 'A entrar...')}
                  disabled={pin.length < PIN_MIN_LENGTH}
                >
                  {t('auth.signIn')}
                </Button>
              </DialogBody>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AuthBackdrop>
  );
}
