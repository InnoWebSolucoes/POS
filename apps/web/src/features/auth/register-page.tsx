import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Building2,
  Check,
  Eye,
  EyeOff,
  Hash,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  CURRENCIES,
  ROLE_HOME,
  type AuthResponse,
  type EntityMode,
  type Locale,
} from '@pos/shared';

import {
  Button,
  Card,
  Input,
  Label,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import { ApiRequestError, api, setEntityId, setTokens } from '@/lib/api';
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
import { businessMode } from './register/business-modes';
import { ModePicker } from './register/mode-picker';
import { StepProgress } from './register/step-progress';
import { MIN_PASSWORD_LENGTH, passwordHint } from './register/password-strength';
import { isEmail, useEmailAvailability } from './register/use-email-availability';

/**
 * Self-service sign-up: how a business gets onto the platform without anybody
 * provisioning it by hand.
 *
 * Three short steps, because asking a shop owner for everything on one screen
 * is how you lose them. The first one - what kind of business is this? - is the
 * one that matters: it decides which product they end up inside. The response
 * already carries a session, so the owner lands in their own dashboard signed
 * in, never back at the login form.
 */

interface RegisterPayload {
  businessName: string;
  mode: EntityMode;
  ownerName: string;
  email: string;
  password: string;
  phone?: string;
  nif?: string;
  currency: string;
  locale: Locale;
}

const STEP_LABELS = ['Tipo de negocio', 'Dados do negocio', 'A sua conta'] as const;
const STEP_TITLES = [
  'Que tipo de negocio tem?',
  'Dados do negocio',
  'A sua conta',
] as const;
const STEP_SUBTITLES = [
  'A sua escolha define o painel, o menu e os fluxos de trabalho que vai usar todos os dias. Pode mudar mais tarde nas definicoes.',
  'Como o negocio aparece nas facturas e nos recibos.',
  'Esta conta fica como administradora do negocio: pode criar utilizadores, definir precos e ver os relatorios.',
] as const;

const LAST_STEP = STEP_TITLES.length - 1;

/** Which step owns each field the server can complain about. */
const FIELD_STEP: Record<string, number> = {
  mode: 0,
  businessName: 1,
  phone: 1,
  nif: 1,
  currency: 1,
  ownerName: 2,
  email: 2,
  password: 2,
  locale: 2,
};

const CURRENCY_OPTIONS = Object.values(CURRENCIES);

const MIN_NAME_LENGTH = 2;

export default function RegisterPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = React.useState(0);

  const [mode, setMode] = React.useState<EntityMode | null>(null);
  const [businessName, setBusinessName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [nif, setNif] = React.useState('');
  const [currency, setCurrency] = React.useState('AOA');

  const [ownerName, setOwnerName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [revealed, setRevealed] = React.useState(false);
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  const locale: Locale = i18n.language === 'en' ? 'en' : 'pt-PT';
  const normalizedEmail = email.trim().toLowerCase();
  const availability = useEmailAvailability(email, step === LAST_STEP);
  const strength = passwordHint(password);
  const chosen = businessMode(mode);

  const mutation = useMutation<AuthResponse, Error, RegisterPayload>({
    // Public route: there is no session to send yet.
    mutationFn: (payload) => api.post<AuthResponse>('/api/auth/register', payload, { anonymous: true }),
    onSuccess: (response) => {
      // The response already carries a session - persist it exactly as
      // auth-store.applySession does, since that helper is private to the store.
      setTokens(response.token, response.refreshToken);
      setEntityId(response.entity?.id ?? response.user.entityId ?? null);
      useAuth.setState({
        user: response.user,
        entity: response.entity,
        status: 'authenticated',
      });

      // Nothing cached before this session may leak into it.
      queryClient.clear();
      navigate(ROLE_HOME[response.user.role], { replace: true });
    },
    onError: (error) => {
      if (!(error instanceof ApiRequestError)) return;
      // Send them back to the step that owns the problem, not to a dead end.
      if (error.status === 409) {
        setStep(LAST_STEP);
        return;
      }
      const owning = Object.keys(error.details ?? {})
        .map((field) => FIELD_STEP[field])
        .filter((value): value is number => typeof value === 'number')
        .sort((a, b) => a - b)[0];
      if (typeof owning === 'number') setStep(owning);
    },
  });

  /* -------------------------------------------------------------------- */
  /* Validation - the same rules the API enforces, checked before we ask   */
  /* -------------------------------------------------------------------- */

  const emailValid = isEmail(normalizedEmail);
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === password;

  const stepValid: boolean[] = [
    mode !== null,
    businessName.trim().length >= MIN_NAME_LENGTH,
    ownerName.trim().length >= MIN_NAME_LENGTH &&
      emailValid &&
      !availability.taken &&
      password.length >= MIN_PASSWORD_LENGTH &&
      passwordsMatch,
  ];
  const canAdvance = stepValid[step] === true;

  const apiError = mutation.error instanceof ApiRequestError ? mutation.error : null;
  const businessNameError = apiError?.fieldError('businessName');
  const ownerNameError = apiError?.fieldError('ownerName');
  const passwordApiError = apiError?.fieldError('password');
  const emailApiError =
    apiError?.fieldError('email') ?? (apiError?.status === 409 ? apiError.message : undefined);
  const handled = [businessNameError, ownerNameError, passwordApiError, emailApiError].some(Boolean);
  const formError =
    mutation.error && !handled
      ? authErrorMessage(mutation.error, 'Nao foi possivel criar a conta. Tente novamente.')
      : null;

  /** A server complaint stops being true the moment they edit the field. */
  const clearServerError = () => {
    if (mutation.isError) mutation.reset();
  };

  const goTo = (next: number) => {
    setStep(Math.min(Math.max(next, 0), LAST_STEP));
    mutation.reset();
  };

  /** Optional fields are left out entirely rather than sent as empty strings. */
  const buildPayload = (): RegisterPayload | null => {
    if (!mode) return null;
    return {
      businessName: businessName.trim(),
      mode,
      ownerName: ownerName.trim(),
      email: normalizedEmail,
      password,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(nif.trim() ? { nif: nif.trim() } : {}),
      currency,
      locale,
    };
  };

  const create = () => {
    const payload = buildPayload();
    if (!payload) {
      goTo(0);
      return;
    }
    // First real gesture of the session - lets the register beep later on.
    unlockAudio();
    mutation.mutate(payload);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending || !canAdvance) return;

    if (step < LAST_STEP) {
      goTo(step + 1);
      return;
    }
    create();
  };

  return (
    <AuthBackdrop>
      <header className="safe-top flex items-center justify-end p-4">
        <LocaleToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-10">
        <div className="w-full max-w-2xl">
          <div className="mb-6 flex justify-center">
            <BrandMark subtitle="Crie a conta do seu negocio" />
          </div>

          <Card className="p-6 shadow-lg sm:p-8">
            <StepProgress steps={STEP_LABELS} current={step} />

            <h1 id="register-step-title" className="mt-5 text-xl font-bold tracking-tight text-foreground">
              {STEP_TITLES[step]}
            </h1>
            <p className="mt-1 text-sm leading-snug text-muted-foreground">{STEP_SUBTITLES[step]}</p>

            <form className="mt-6 flex flex-col gap-5" onSubmit={submit} noValidate>
              {step === 0 && (
                <ModePicker
                  value={mode}
                  onChange={setMode}
                  onConfirm={() => goTo(1)}
                  labelledBy="register-step-title"
                />
              )}

              {step === 1 && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="register-business" required>
                      Nome do negocio
                    </Label>
                    <Input
                      id="register-business"
                      autoFocus
                      autoComplete="organization"
                      placeholder="Mercearia Kianda"
                      value={businessName}
                      aria-invalid={Boolean(businessNameError)}
                      aria-describedby={businessNameError ? 'register-business-error' : undefined}
                      onChange={(event) => {
                        clearServerError();
                        setBusinessName(event.target.value);
                      }}
                      startAdornment={<Building2 className="size-5" aria-hidden="true" />}
                    />
                    {businessNameError && (
                      <p id="register-business-error" className="text-sm font-medium text-destructive">
                        {businessNameError}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="register-phone">Telefone</Label>
                      <Input
                        id="register-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="+244 900 000 000"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        startAdornment={<Phone className="size-5" aria-hidden="true" />}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="register-nif">NIF</Label>
                      <Input
                        id="register-nif"
                        inputMode="numeric"
                        spellCheck={false}
                        placeholder="5417000000"
                        value={nif}
                        onChange={(event) => setNif(event.target.value)}
                        startAdornment={<Hash className="size-5" aria-hidden="true" />}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Moeda</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger aria-label="Moeda">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCY_OPTIONS.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.code} - {locale === 'en' ? option.name.en : option.name.pt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Todos os precos e relatorios passam a usar esta moeda.
                    </p>
                  </div>

                  {chosen && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
                      <p className="text-sm text-muted-foreground">
                        Tipo de negocio:{' '}
                        <span className="font-semibold text-foreground">{chosen.title}</span>
                      </p>
                      <Button type="button" variant="ghost" size="sm" onClick={() => goTo(0)}>
                        Alterar
                      </Button>
                    </div>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                    <p className="leading-snug">
                      Esta sera a conta <span className="font-semibold text-foreground">administradora</span>{' '}
                      do negocio. Os restantes utilizadores sao criados por si, ja dentro da plataforma.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="register-owner" required>
                      O seu nome
                    </Label>
                    <Input
                      id="register-owner"
                      autoFocus
                      autoComplete="name"
                      placeholder="Ana Kiala"
                      value={ownerName}
                      aria-invalid={Boolean(ownerNameError)}
                      aria-describedby={ownerNameError ? 'register-owner-error' : undefined}
                      onChange={(event) => {
                        clearServerError();
                        setOwnerName(event.target.value);
                      }}
                      startAdornment={<User className="size-5" aria-hidden="true" />}
                    />
                    {ownerNameError && (
                      <p id="register-owner-error" className="text-sm font-medium text-destructive">
                        {ownerNameError}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="register-email" required>
                      Email
                    </Label>
                    <Input
                      id="register-email"
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      spellCheck={false}
                      placeholder="nome@empresa.ao"
                      value={email}
                      aria-invalid={Boolean(emailApiError) || availability.taken}
                      aria-describedby="register-email-status"
                      onChange={(event) => {
                        clearServerError();
                        setEmail(event.target.value);
                      }}
                      onBlur={() => setTouched((state) => ({ ...state, email: true }))}
                      startAdornment={<Mail className="size-5" aria-hidden="true" />}
                    />
                    <p id="register-email-status" aria-live="polite" className="text-sm">
                      {emailApiError || availability.taken ? (
                        <span className="font-medium text-destructive">
                          {emailApiError ?? 'Ja existe uma conta com este email.'}{' '}
                          <Link to="/login" className="underline underline-offset-4">
                            Entrar
                          </Link>
                        </span>
                      ) : touched.email && email.trim() && !emailValid ? (
                        <span className="font-medium text-destructive">Email invalido.</span>
                      ) : availability.checking ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Spinner className="size-4" />A verificar...
                        </span>
                      ) : availability.available ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-success">
                          <Check className="size-4" aria-hidden="true" />
                          Email disponivel
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Vai usar este email para entrar na plataforma.
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="register-password" required>
                      Palavra-passe
                    </Label>
                    <Input
                      id="register-password"
                      type={revealed ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="********"
                      value={password}
                      aria-invalid={Boolean(passwordApiError)}
                      aria-describedby="register-password-hint"
                      onChange={(event) => {
                        clearServerError();
                        setPassword(event.target.value);
                      }}
                      startAdornment={<Lock className="size-5" aria-hidden="true" />}
                      endAdornment={
                        <button
                          type="button"
                          onClick={() => setRevealed((value) => !value)}
                          aria-label={revealed ? 'Esconder palavra-passe' : 'Mostrar palavra-passe'}
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
                    <div id="register-password-hint" className="flex flex-col gap-1.5">
                      <Progress value={password ? strength.value : 0} tone={strength.tone} size="sm" />
                      <p className="text-xs text-muted-foreground">
                        {password ? (
                          <>
                            <span className="font-semibold text-foreground">{strength.label}.</span>{' '}
                            {strength.advice ?? 'Excelente.'}
                          </>
                        ) : (
                          'Minimo 8 caracteres.'
                        )}
                      </p>
                      {passwordApiError && (
                        <p className="text-sm font-medium text-destructive">{passwordApiError}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="register-confirm" required>
                      Confirmar palavra-passe
                    </Label>
                    <Input
                      id="register-confirm"
                      type={revealed ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="********"
                      value={confirmPassword}
                      aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
                      aria-describedby={
                        confirmPassword.length > 0 && !passwordsMatch ? 'register-confirm-error' : undefined
                      }
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      startAdornment={<Lock className="size-5" aria-hidden="true" />}
                    />
                    {confirmPassword.length > 0 && !passwordsMatch && (
                      <p id="register-confirm-error" className="text-sm font-medium text-destructive">
                        As palavras-passe nao coincidem.
                      </p>
                    )}
                  </div>
                </>
              )}

              {formError && (
                <ErrorNotice
                  message={formError}
                  offline={isOfflineError(mutation.error)}
                  onRetry={isOfflineError(mutation.error) ? create : undefined}
                  retryLabel="Tentar novamente"
                />
              )}

              <div className="flex flex-col gap-3 sm:flex-row-reverse">
                <Button
                  type="submit"
                  size="lg"
                  block
                  disabled={!canAdvance}
                  loading={mutation.isPending}
                  loadingLabel="A criar a conta..."
                >
                  {step === LAST_STEP ? 'Criar conta e comecar' : 'Seguinte'}
                </Button>
                {step > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    block
                    disabled={mutation.isPending}
                    onClick={() => goTo(step - 1)}
                    leftIcon={<ArrowLeft className="size-5" aria-hidden="true" />}
                  >
                    Voltar
                  </Button>
                )}
              </div>
            </form>

            <p className="mt-6 border-t border-border pt-5 text-center text-sm text-muted-foreground">
              Ja tem conta?{' '}
              <Link
                to="/login"
                className="font-semibold text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Entrar
              </Link>
            </p>
          </Card>
        </div>
      </main>
    </AuthBackdrop>
  );
}
