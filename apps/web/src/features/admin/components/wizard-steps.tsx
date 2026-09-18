import * as React from 'react';
import { Check, Globe, Store, UtensilsCrossed } from 'lucide-react';
import {
  bpsToPct,
  COSTING_METHODS,
  CURRENCIES,
  ENTITY_MODES,
  LOCALES,
  pctToBps,
  PRICING_MODES,
  type EntityMode,
  type Locale,
} from '@pos/shared';

import {
  Badge,
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

import { MODE_HINTS, MODE_LABELS, type EntityWizardValues } from '../entity-types';

/** The four step bodies of the provisioning wizard. */

const MODE_ICONS: Record<EntityMode, typeof Store> = {
  retail: Store,
  restaurant: UtensilsCrossed,
  online: Globe,
};

const LOCALE_LABELS: Record<Locale, string> = {
  'pt-PT': 'Portugues (Portugal)',
  en: 'English',
};

export const PRICING_LABELS: Record<string, string> = {
  inclusive: 'Precos com imposto incluido',
  exclusive: 'Precos sem imposto (somado no total)',
};

const COSTING_LABELS: Record<string, string> = {
  weighted_average: 'Custo medio ponderado',
  fifo: 'FIFO (primeiro a entrar, primeiro a sair)',
};

export interface StepProps {
  values: EntityWizardValues;
  patch: (next: Partial<EntityWizardValues>) => void;
  fieldError: (path: string) => string | undefined;
}

/* -------------------------------------------------------------------------- */
/* 1. Business details                                                         */
/* -------------------------------------------------------------------------- */

export function BusinessStep({ values, patch, fieldError }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ent-name" required>
          Nome do negocio
        </Label>
        <Input
          id="ent-name"
          value={values.name}
          maxLength={120}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {fieldError('name') ?? 'O endereco da loja online e gerado a partir deste nome.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ent-nif">NIF</Label>
          <Input
            id="ent-nif"
            className="tabular"
            value={values.nif}
            maxLength={40}
            onChange={(e) => patch({ nif: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ent-phone">Telefone</Label>
          <Input
            id="ent-phone"
            type="tel"
            inputMode="tel"
            className="tabular"
            value={values.phone}
            maxLength={40}
            onChange={(e) => patch({ phone: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ent-email">Email</Label>
        <Input
          id="ent-email"
          type="email"
          value={values.email}
          maxLength={160}
          onChange={(e) => patch({ email: e.target.value })}
        />
        {fieldError('email') && (
          <p className="text-xs font-medium text-destructive">{fieldError('email')}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ent-address">Morada</Label>
        <Textarea
          id="ent-address"
          rows={2}
          maxLength={240}
          value={values.address}
          onChange={(e) => patch({ address: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ent-location" required>
          Primeira localizacao
        </Label>
        <Input
          id="ent-location"
          value={values.locationName}
          maxLength={120}
          onChange={(e) => patch({ locationName: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Criada automaticamente como localizacao principal.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Mode                                                                     */
/* -------------------------------------------------------------------------- */

export function ModeStep({ values, patch }: Omit<StepProps, 'fieldError'>) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        O modo decide que ecras existem. Pode ser alterado mais tarde nas definicoes.
      </p>
      {ENTITY_MODES.map((mode) => {
        const Icon = MODE_ICONS[mode];
        const active = values.mode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => patch({ mode })}
            aria-pressed={active}
            className={cn(
              'flex min-h-touch items-start gap-4 rounded-xl border p-4 text-left transition-colors',
              active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted',
            )}
          >
            <span
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-lg',
                active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                {MODE_LABELS[mode]}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{MODE_HINTS[mode]}</span>
            </span>
            {active && <Check className="size-5 shrink-0 text-primary" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Currency, locale, tax                                                    */
/* -------------------------------------------------------------------------- */

export function RegionalStep({ values, patch }: Omit<StepProps, 'fieldError'>) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ent-currency">Moeda</Label>
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
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ent-locale">Idioma</Label>
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
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ent-pricing">Modo de preco</Label>
        <Select
          value={values.pricingMode}
          onValueChange={(value) =>
            patch({ pricingMode: value as EntityWizardValues['pricingMode'] })
          }
        >
          <SelectTrigger id="ent-pricing" aria-label="Modo de preco">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRICING_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {PRICING_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Decide se o preco etiquetado ja contem o imposto ou se este e somado no total.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ent-costing">Metodo de custeio</Label>
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
                {COSTING_LABELS[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ent-tax">Taxa de imposto por omissao (%)</Label>
          <NumericInput
            id="ent-tax"
            value={bpsToPct(values.defaultTaxRateBps)}
            decimals={2}
            min={0}
            max={100}
            onValueChange={(value) => patch({ defaultTaxRateBps: pctToBps(value) })}
          />
          <p className="text-xs text-muted-foreground">
            Guardado em pontos base: {values.defaultTaxRateBps}.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ent-accent">Cor de destaque</Label>
          <div className="flex items-center gap-3">
            <input
              id="ent-accent"
              type="color"
              value={values.accentColor}
              aria-label="Cor de destaque"
              onChange={(e) => patch({ accentColor: e.target.value.toUpperCase() })}
              className="size-12 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1"
            />
            {/* Inline style: the colour is data the operator picked, not a token. */}
            <span
              className="inline-flex h-12 flex-1 items-center justify-center rounded-lg text-sm font-semibold"
              style={{
                backgroundColor: values.accentColor,
                color: contrastText(values.accentColor),
              }}
            >
              {values.accentColor}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. First administrator                                                      */
/* -------------------------------------------------------------------------- */

export function AdminStep({ values, patch, fieldError }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        A primeira conta de administrador desta entidade. Pode deixar em branco e criar os
        utilizadores mais tarde, mas entao ninguem consegue entrar.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ent-admin-name">Nome do administrador</Label>
        <Input
          id="ent-admin-name"
          value={values.adminName}
          maxLength={120}
          autoComplete="off"
          onChange={(e) => patch({ adminName: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ent-admin-email">Email do administrador</Label>
        <Input
          id="ent-admin-email"
          type="email"
          value={values.adminEmail}
          maxLength={160}
          autoComplete="off"
          onChange={(e) => patch({ adminEmail: e.target.value })}
        />
        {fieldError('adminEmail') && (
          <p className="text-xs font-medium text-destructive">{fieldError('adminEmail')}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ent-admin-password">Palavra-passe</Label>
        <Input
          id="ent-admin-password"
          type="password"
          value={values.adminPassword}
          maxLength={128}
          autoComplete="new-password"
          onChange={(e) => patch({ adminPassword: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {fieldError('adminPassword') ?? 'Minimo 8 caracteres.'}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Resumo</p>
        <dl className="flex flex-col gap-1.5 text-sm">
          <SummaryRow label="Negocio" value={values.name || '-'} />
          <SummaryRow label="Modo" value={MODE_LABELS[values.mode]} />
          <SummaryRow label="Localizacao" value={values.locationName} />
          <SummaryRow
            label="Moeda e imposto"
            value={`${values.currency} - ${percent(values.defaultTaxRateBps)}`}
          />
          <SummaryRow
            label="Precos"
            value={PRICING_LABELS[values.pricingMode] ?? values.pricingMode}
          />
          <SummaryRow label="Administrador" value={values.adminEmail.trim() || 'Sem conta inicial'} />
        </dl>
        {!values.adminEmail.trim() && (
          <Badge variant="warning" className="mt-3">
            Esta entidade fica sem ninguem que possa entrar
          </Badge>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}
