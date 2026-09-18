import * as React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, KeyRound, Lock, Mail } from 'lucide-react';
import { ROLE_HOME, type AuthUser } from '@pos/shared';

import { Button, Card, Input, Label } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { queryClient } from '@/lib/query';
import { unlockAudio } from '@/lib/sound';
import { cn } from '@/lib/utils';
import {
  AuthBackdrop,
  BrandMark,
  ErrorNotice,
  LocaleToggle,
  authErrorMessage,
  isOfflineError,
} from './auth-chrome';

interface LoginVars {
  email: string;
  password: string;
}

/** Seeded demo accounts, shown only on a dev build so nobody hunts the seed log. */
function DemoHint() {
  if (!import.meta.env.DEV) return null;
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
      <p className="font-semibold text-foreground">Demo (apenas em desenvolvimento)</p>
      <p className="tabular">admin@pos.local / admin123</p>
      <p>
        As contas criadas pelo seed usam a palavra-passe <span className="tabular">demo1234</span>. O
        registo abre mais depressa pelo PIN.
      </p>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuth((s) => s.login);
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [revealed, setRevealed] = React.useState(false);

  // Where the router wanted to go before it bounced us here.
  const state = location.state as { from?: string } | null;
  const from = typeof state?.from === 'string' && state.from !== '/login' ? state.from : null;

  const mutation = useMutation<AuthUser, Error, LoginVars>({
    mutationFn: (vars) => login(vars.email.trim(), vars.password),
    onSuccess: (authenticated) => {
      // Nothing cached under the previous session may survive into this one.
      queryClient.clear();
      navigate(from ?? ROLE_HOME[authenticated.role], { replace: true });
    },
  });

  const apiError = mutation.error instanceof ApiRequestError ? mutation.error : null;
  const emailError = apiError?.fieldError('email');
  const passwordError = apiError?.fieldError('password');
  const formError =
    mutation.error && !emailError && !passwordError
      ? authErrorMessage(mutation.error, t('auth.invalidCredentials'))
      : null;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    unlockAudio();
    if (!email.trim() || !password) return;
    mutation.mutate({ email, password });
  };

  // Already signed in: never show the form again, just go where they belong.
  if (status === 'authenticated' && user) {
    return <Navigate to={from ?? ROLE_HOME[user.role]} replace />;
  }

  return (
    <AuthBackdrop>
      <header className="safe-top flex items-center justify-end p-4">
        <LocaleToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-10 sm:items-center">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center">
            <BrandMark subtitle={t('auth.welcome')} />
          </div>

          <Card className="p-6 shadow-lg sm:p-8">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t('auth.login')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('auth.loginSubtitle', 'Introduza os seus dados para entrar no sistema.')}
            </p>

            <form className="mt-6 flex flex-col gap-5" onSubmit={submit} noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="login-email" required>
                  {t('auth.email')}
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoFocus
                  spellCheck={false}
                  placeholder="nome@empresa.ao"
                  value={email}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? 'login-email-error' : undefined}
                  onChange={(event) => setEmail(event.target.value)}
                  startAdornment={<Mail className="size-5" aria-hidden="true" />}
                />
                {emailError && (
                  <p id="login-email-error" className="text-sm font-medium text-destructive">
                    {emailError}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="login-password" required>
                  {t('auth.password')}
                </Label>
                <Input
                  id="login-password"
                  type={revealed ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="********"
                  value={password}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? 'login-password-error' : undefined}
                  onChange={(event) => setPassword(event.target.value)}
                  startAdornment={<Lock className="size-5" aria-hidden="true" />}
                  endAdornment={
                    <button
                      type="button"
                      onClick={() => setRevealed((value) => !value)}
                      aria-label={
                        revealed
                          ? t('auth.hidePassword', 'Esconder palavra-passe')
                          : t('auth.showPassword', 'Mostrar palavra-passe')
                      }
                      aria-pressed={revealed}
                      className={cn(
                        'flex size-11 items-center justify-center rounded-lg text-muted-foreground',
                        'transition-colors hover:bg-muted hover:text-foreground',
                        'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
                      )}
                    >
                      {revealed ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </button>
                  }
                />
                {passwordError && (
                  <p id="login-password-error" className="text-sm font-medium text-destructive">
                    {passwordError}
                  </p>
                )}
              </div>

              {formError && (
                <ErrorNotice
                  message={formError}
                  offline={isOfflineError(mutation.error)}
                  onRetry={
                    isOfflineError(mutation.error)
                      ? () => mutation.mutate({ email, password })
                      : undefined
                  }
                  retryLabel={t('common.retry')}
                />
              )}

              <Button
                type="submit"
                size="lg"
                block
                loading={mutation.isPending}
                loadingLabel={t('auth.signingIn', 'A entrar...')}
                disabled={!email.trim() || !password}
              >
                {t('auth.signIn')}
              </Button>
            </form>

            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
              <Button asChild variant="outline" size="lg" block>
                <Link to="/pin">
                  <KeyRound className="size-5" aria-hidden="true" />
                  <span>{t('auth.signInWithPin')}</span>
                </Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {t(
                  'auth.forgotPasswordHint',
                  'Esqueceu a palavra-passe? Peca ao administrador da sua loja para a repor.',
                )}
              </p>
            </div>
          </Card>

          <div className="mt-4">
            <DemoHint />
          </div>
        </div>
      </main>
    </AuthBackdrop>
  );
}
