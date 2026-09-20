import * as React from 'react';
import { Check, Eye, EyeOff, Info, Sparkles, Wand2 } from 'lucide-react';
import {
  bpsToPct,
  COSTING_METHODS,
  CURRENCIES,
  LOCALES,
  pctToBps,
  type EntityMode,
  type Locale,
  type PricingMode,
} from '@pos/shared';

import {
  Button,
  CheckboxField,
  Input,
  Label,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/ui';
import { percent } from '@/lib/format';
import { cn, contrastText } from '@/lib/utils';

import {
  applyModeDefaults,
  generatePassword,
  MODE_LABELS,
  MODE_OPTIONS,
  MODE_STARTER_HINTS,
  type EntityWizardValues,
} from '../entity-types';

/**
 * The four steps of "Novo cliente".
 *
 * The operator doing this is often on the phone with the client, typing one
 * answer at a time, so each step asks for one kind of thing and says in plain
 * words why it matters. Nothing is a surprise at the end: step 4 shows the
 * whole decision back before a single row is written.
 */

const LOCALE_LABELS: Record<Locale, string> = {
  'pt-PT': 'Portugues (Portugal)',
  en: 'English',
};

export const PRICING_LABELS: Record<PricingMode, string> = {
  inclusive: 'Precos com imposto incluido',
  exclusive: 'Precos sem imposto',
};

/** The one line that actually settles the choice for a shop owner. */
const PRICING_HINTS: Record<PricingMode, string> = {
  inclusive:
    'A etiqueta ja inclui o imposto. O cliente paga exactamente o numero que ve no produto. E o normal no retalho e na restauracao.',
  exclusive:
    'O imposto e somado no fim da conta. Usado por quem vende sobretudo a outras empresas, que descontam o imposto.',
};

const COSTING_LABELS: Record<string, string> = {
  weighted_average: 'Custo medio ponderado',
  fifo: 'FIFO (primeiro a entrar, primeiro a sair)',
};

/** What the first location is even called, in each kind of business. */
const LOCATION_LABELS: Record<EntityMode, { label: string; hint: string }> = {
  retail: {
    label: 'Primeira loja',
    hint: 'O sitio onde esta a caixa. Pode juntar mais lojas depois.',
  },
  restaurant: {
    label: 'Primeira sala',
    hint: 'A sala onde ficam as mesas. Pode juntar esplanada ou bar depois.',
  },
  online: {
    label: 'Armazem',
    hint: 'De onde saem as encomendas. Pode juntar mais pontos depois.',
  },
};

export interface StepProps {
  values: EntityWizardValues;
  patch: (next: Partial<EntityWizardValues>) => void;
  fieldError: (path: string) => string | undefined;
}

/** Label, control and help line in one block, so every input explains itself. */
function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 1 - Tipo de negocio                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The decision that shapes everything downstream: which dashboard, which
 * navigation, which screens exist at all. The same three cards a client sees at
 * /registar, so the operator and the client are looking at one product.
 *
 * A real radiogroup under the big cards: arrows move and pick, Space picks,
 * Enter picks and moves the wizard on.
 */
export function ModeStep({
  values,
  patch,
  onConfirm,
}: Omit<StepProps, 'fieldError'> & { onConfirm?: () => void }) {
  const cards = React.useRef<Array<HTMLButtonElement | null>>([]);

  const choose = (mode: EntityMode) => patch(applyModeDefaults(values, mode));

  const selectedIndex = MODE_OPTIONS.findIndex((option) => option.mode === values.mode);
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const pickAt = (index: number) => {
    const option = MODE_OPTIONS[index];
    if (!option) return;
    choose(option.mode);
    cards.current[index]?.focus();
  };

  const move = (from: number, delta: number) =>
    pickAt((from + delta + MODE_OPTIONS.length) % MODE_OPTIONS.length);

  return (
    <div className="flex flex-col gap-3">
      <p id="wizard-mode-label" className="text-sm text-muted-foreground">
        Que tipo de negocio e este? A escolha decide os ecras que o cliente vai ter. Pode ser
        alterada mais tarde, mas e melhor acertar agora.
      </p>

      <div role="radiogroup" aria-labelledby="wizard-mode-label" className="grid gap-3">
        {MODE_OPTIONS.map((option, index) => {
          const Icon = option.icon;
          const selected = option.mode === values.mode;

          return (
            <button
              key={option.mode}
              ref={(node) => {
                cards.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => choose(option.mode)}
              onKeyDown={(event) => {
                switch (event.key) {
                  case 'ArrowDown':
                  case 'ArrowRight':
                    event.preventDefault();
                    move(index, 1);
                    break;
                  case 'ArrowUp':
                  case 'ArrowLeft':
                    event.preventDefault();
                    move(index, -1);
                    break;
                  case 'Home':
                    event.preventDefault();
                    pickAt(0);
                    break;
                  case 'End':
                    event.preventDefault();
                    pickAt(MODE_OPTIONS.length - 1);
                    break;
                  case 'Enter':
                    event.preventDefault();
                    choose(option.mode);
                    onConfirm?.();
                    break;
                  default:
                    break;
                }
              }}
              className={cn(
                'flex w-full flex-col gap-3 rounded-xl border-2 p-4 text-left transition-colors',
                'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              <span className="flex items-start gap-3">
                <span
                  className={cn(
                    'flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors',
                    selected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-6" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold leading-tight text-foreground">
                      {option.title}
                    </span>
                    {selected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                        <Check className="size-3.5" aria-hidden="true" />
                        Escolhido
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-sm leading-snug text-muted-foreground">
                    {option.tagline}
                  </span>
                </span>
              </span>

              <span className="grid gap-1.5 sm:grid-cols-2">
                {option.features.map((feature) => (
                  <span
                    key={feature}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-1.5 shrink-0 rounded-full',
                        selected ? 'bg-primary' : 'bg-muted-foreground/60',
                      )}
                    />
                    <span className="leading-snug">{feature}</span>
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2 - Dados do negocio                                                   */
/* -------------------------------------------------------------------------- */

export function BusinessStep({ values, patch, fieldError }: StepProps) {
  const location = LOCATION_LABELS[values.mode];
  const taxHint =
    'Em Angola o IVA e normalmente 14 por cento. Guardado como ' +
    String(values.defaultTaxRateBps) +
    ' pontos base.';

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <Field
          id="ent-name"
          label="Nome do negocio"
          required
          error={fieldError('name')}
          hint="Aparece no talao, na loja online e no ecra de entrada."
        >
          <Input
            id="ent-name"
            value={values.name}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ent-nif" label="NIF" error={fieldError('nif')} hint="Sai impresso no talao.">
            <Input
              id="ent-nif"
              className="tabular"
              value={values.nif}
              maxLength={40}
              onChange={(e) => patch({ nif: e.target.value })}
            />
          </Field>

          <Field id="ent-phone" label="Telefone" error={fieldError('phone')}>
            <Input
              id="ent-phone"
              type="tel"
              inputMode="tel"
              className="tabular"
              value={values.phone}
              maxLength={40}
              onChange={(e) => patch({ phone: e.target.value })}
            />
          </Field>
        </div>

        <Field
          id="ent-email"
          label="Email do negocio"
          error={fieldError('email')}
          hint="Contacto publico do negocio. Nao e a conta de entrada."
        >
          <Input
            id="ent-email"
            type="email"
            value={values.email}
            maxLength={160}
            onChange={(e) => patch({ email: e.target.value })}
          />
        </Field>

        <Field id="ent-address" label="Morada" error={fieldError('address')}>
          <Textarea
            id="ent-address"
            rows={2}
            maxLength={240}
            value={values.address}
            onChange={(e) => patch({ address: e.target.value })}
          />
        </Field>

        <Field
          id="ent-location"
          label={location.label}
          required
          error={fieldError('locationName')}
          hint={location.hint}
        >
          <Input
            id="ent-location"
            value={values.locationName}
            maxLength={120}
            onChange={(e) => patch({ locationName: e.target.value })}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-5">
        <h3 className="text-sm font-semibold text-foreground">Moeda, idioma e imposto</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ent-currency" label="Moeda">
            <Select value={values.currency} onValueChange={(value) => patch({ currency: value })}>
              <SelectTrigger id="ent-currency" aria-label="Moeda">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(CURRENCIES).map((config) => (
                  <SelectItem key={config.code} value={config.code}>
                    {config.code} - {config.name.pt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="ent-locale" label="Idioma">
            <Select
              value={values.locale}
              onValueChange={(value) => patch({ locale: value as Locale })}
            >
              <SelectTrigger id="ent-locale" aria-label="Idioma">
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
          </Field>
        </div>

        <Field
          id="ent-tax"
          label="Taxa de imposto por omissao (%)"
          error={fieldError('defaultTaxRateBps')}
          hint={taxHint}
        >
          <NumericInput
            id="ent-tax"
            value={bpsToPct(values.defaultTaxRateBps)}
            decimals={2}
            min={0}
            max={100}
            onValueChange={(value) => patch({ defaultTaxRateBps: pctToBps(value) })}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <Label id="ent-pricing-label">Como sao mostrados os precos</Label>
          <div role="radiogroup" aria-labelledby="ent-pricing-label" className="grid gap-2">
            {(['inclusive', 'exclusive'] as const).map((mode) => {
              const selected = values.pricingMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => patch({ pricingMode: mode })}
                  className={cn(
                    'flex min-h-touch items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors',
                    'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input',
                    )}
                    aria-hidden="true"
                  >
                    {selected && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {PRICING_LABELS[mode]}
                    </span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                      {PRICING_HINTS[mode]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-5">
        <h3 className="text-sm font-semibold text-foreground">Cor do negocio</h3>
        <p className="text-sm text-muted-foreground">
          A cor dos botoes principais dentro da aplicacao do cliente.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            id="ent-accent"
            type="color"
            value={values.accentColor}
            aria-label="Cor de destaque"
            onChange={(e) => patch({ accentColor: e.target.value.toUpperCase() })}
            className="size-12 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1"
          />
          <Input
            className="tabular w-[8.5rem] shrink-0 uppercase"
            value={values.accentColor}
            maxLength={7}
            aria-label="Codigo da cor"
            onChange={(e) => patch({ accentColor: e.target.value.toUpperCase() })}
          />
        </div>

        {/* Live preview. Inline styles on purpose: this colour is data the
            operator picked, not a design token, so no Tailwind class can carry
            it. contrastText keeps the label readable on any choice. */}
        <div className="overflow-hidden rounded-xl border border-border">
          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{ backgroundColor: values.accentColor, color: contrastText(values.accentColor) }}
          >
            <span className="truncate text-sm font-bold">
              {values.name.trim() || 'O seu negocio'}
            </span>
            <span className="shrink-0 text-xs font-medium opacity-90">
              {MODE_LABELS[values.mode]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-card p-4">
            <span
              className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold"
              style={{
                backgroundColor: values.accentColor,
                color: contrastText(values.accentColor),
              }}
            >
              Cobrar
            </span>
            <span
              className="inline-flex h-11 items-center rounded-lg border-2 px-4 text-sm font-semibold"
              style={{ borderColor: values.accentColor, color: values.accentColor }}
            >
              Suspender
            </span>
            <span className="tabular text-sm text-muted-foreground">{values.accentColor}</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold text-foreground">Avancado</h3>
        <Field
          id="ent-costing"
          label="Metodo de custeio"
          hint="Como o custo do stock e calculado nos relatorios. Na duvida, deixe como esta."
        >
          <Select
            value={values.costingMethod}
            onValueChange={(value) =>
              patch({ costingMethod: value as EntityWizardValues['costingMethod'] })
            }
          >
            <SelectTrigger id="ent-costing" aria-label="Metodo de custeio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COSTING_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {COSTING_LABELS[method] ?? method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 3 - Conta do administrador                                             */
/* -------------------------------------------------------------------------- */

/**
 * The account the client will actually use. It is required, because a business
 * nobody can sign into is not an onboarded client - it is a row in a table.
 */
export function AdminStep({ values, patch, fieldError }: StepProps) {
  const [visible, setVisible] = React.useState(false);

  const generate = () => {
    patch({ adminPassword: generatePassword() });
    // Generated to be read out loud, so show it the moment it exists.
    setVisible(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        A conta do dono do negocio. Entra com estes dados e a partir dai cria a propria equipa -
        caixas, repositores, empregados de mesa - e decide o que cada um pode ver.
      </p>

      <Field
        id="ent-admin-name"
        label="Nome do responsavel"
        required
        error={fieldError('adminName')}
        hint="Como aparece no talao e no historico de quem fez o que."
      >
        <Input
          id="ent-admin-name"
          value={values.adminName}
          maxLength={120}
          autoComplete="off"
          onChange={(e) => patch({ adminName: e.target.value })}
        />
      </Field>

      <Field
        id="ent-admin-email"
        label="Email de entrada"
        required
        error={fieldError('adminEmail')}
        hint="E com este email que o cliente inicia sessao."
      >
        <Input
          id="ent-admin-email"
          type="email"
          inputMode="email"
          value={values.adminEmail}
          maxLength={160}
          autoComplete="off"
          onChange={(e) => patch({ adminEmail: e.target.value.trim() })}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ent-admin-password" required>
          Palavra-passe
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="ent-admin-password"
            type={visible ? 'text' : 'password'}
            className={cn('flex-1', visible && 'tabular')}
            value={values.adminPassword}
            maxLength={128}
            autoComplete="new-password"
            onChange={(e) => patch({ adminPassword: e.target.value })}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={visible ? 'Esconder palavra-passe' : 'Mostrar palavra-passe'}
            onClick={() => setVisible((prev) => !prev)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="self-start"
          leftIcon={<Wand2 />}
          onClick={generate}
        >
          Gerar palavra-passe
        </Button>

        <p className="text-xs text-muted-foreground">
          {fieldError('adminPassword') ??
            'Minimo 8 caracteres. A gerada usa duas palavras faceis de ditar ao telefone.'}
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
        <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Esta palavra-passe so e mostrada uma vez, no ecra logo a seguir a criacao. Guarde-a ou
          entregue-a ao cliente nesse momento - depois disso so pode ser substituida por uma nova.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 4 - Revisao                                                            */
/* -------------------------------------------------------------------------- */

export function ReviewStep({
  values,
  patch,
  onEdit,
}: Omit<StepProps, 'fieldError'> & { onEdit: (step: number) => void }) {
  const option = MODE_OPTIONS.find((item) => item.mode === values.mode);
  const location = LOCATION_LABELS[values.mode];
  const Icon = option?.icon;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Confirme antes de criar. Ainda nao foi gravado nada.
      </p>

      <ReviewBlock title="Tipo de negocio" onEdit={() => onEdit(0)}>
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {option?.title ?? MODE_LABELS[values.mode]}
            </p>
            <p className="truncate text-xs text-muted-foreground">{option?.tagline}</p>
          </div>
        </div>
      </ReviewBlock>

      <ReviewBlock title="Dados do negocio" onEdit={() => onEdit(1)}>
        <dl className="flex flex-col gap-1.5 text-sm">
          <Row label="Nome" value={values.name.trim() || '-'} />
          <Row label="NIF" value={values.nif.trim() || '-'} />
          <Row label="Telefone" value={values.phone.trim() || '-'} />
          <Row label="Email" value={values.email.trim() || '-'} />
          <Row label="Morada" value={values.address.trim() || '-'} />
          <Row label={location.label} value={values.locationName.trim() || '-'} />
          <Row label="Moeda" value={values.currency} />
          <Row label="Idioma" value={LOCALE_LABELS[values.locale]} />
          <Row label="Imposto" value={percent(values.defaultTaxRateBps)} />
          <Row label="Precos" value={PRICING_LABELS[values.pricingMode]} />
          <Row label="Cor" value={values.accentColor} />
        </dl>
      </ReviewBlock>

      <ReviewBlock title="Conta do administrador" onEdit={() => onEdit(2)}>
        <dl className="flex flex-col gap-1.5 text-sm">
          <Row label="Nome" value={values.adminName.trim() || '-'} />
          <Row label="Email" value={values.adminEmail.trim() || '-'} />
          <Row
            label="Palavra-passe"
            value={values.adminPassword ? 'Definida - mostrada depois de criar' : '-'}
          />
        </dl>
      </ReviewBlock>

      <div className="rounded-xl border border-border bg-card p-4">
        <CheckboxField
          checked={values.starterContent}
          onCheckedChange={(checked) => patch({ starterContent: checked === true })}
          label={
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              Criar catalogo de exemplo para arrancar
            </span>
          }
          description={MODE_STARTER_HINTS[values.mode]}
        />
        <p className="mt-1 px-1 text-xs text-muted-foreground">
          Sao dados normais, que o cliente pode renomear ou apagar. Servem para ele poder
          experimentar uma venda no primeiro minuto em vez de olhar para um ecra vazio.
        </p>
      </div>
    </div>
  );
}

function ReviewBlock({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Alterar
        </Button>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
