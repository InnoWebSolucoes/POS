import * as React from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { CURRENCIES, LOCALES, PRICING_MODES, COSTING_METHODS } from '@pos/shared';
import type { EntityDto } from '@pos/shared';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { contrastText, initials } from '@/lib/utils';

import { useUpdateEntity, useUploadLogo } from '../settings-queries';
import {
  COSTING_METHOD_HINTS,
  COSTING_METHOD_LABELS,
  entityToDraft,
  draftToEntityPatch,
  LOCALE_LABELS,
  PRICING_MODE_HINTS,
  PRICING_MODE_LABELS,
  type EntityDraft,
} from '../settings-types';
import { Callout, Field, FieldGrid, SaveBar, SettingsSection } from './settings-section';

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export interface BusinessTabProps {
  entity: EntityDto;
  canWrite: boolean;
}

/**
 * Identity and money rules. Everything here lives on the Entity row rather
 * than the settings blob, so it is saved through /api/entities/:id.
 */
export function BusinessTab({ entity, canWrite }: BusinessTabProps) {
  const [draft, setDraft] = React.useState<EntityDraft>(() => entityToDraft(entity));
  const [error, setError] = React.useState<ApiRequestError | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // A save elsewhere (or a switch of entity) refills the form.
  React.useEffect(() => {
    setDraft(entityToDraft(entity));
  }, [entity]);

  const save = useUpdateEntity(entity.id);
  const uploadLogo = useUploadLogo();

  const patch = (next: Partial<EntityDraft>) => setDraft((prev) => ({ ...prev, ...next }));

  const dirty = React.useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(entityToDraft(entity)),
    [draft, entity],
  );

  const accentValid = HEX.test(draft.accentColor);

  const onPickLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Ficheiro demasiado grande', 'O logotipo nao pode exceder 5 MB.');
      return;
    }

    uploadLogo.mutate(file, {
      onSuccess: (uploaded) => {
        patch({ logoUrl: uploaded.url });
        toast.success('Logotipo carregado', 'Guarde as alteracoes para o aplicar.');
      },
      onError: (cause) => {
        const message =
          cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
        toast.error('Nao foi possivel carregar o logotipo', message);
      },
    });
  };

  const submit = () => {
    setError(null);

    if (draft.name.trim().length < 2) {
      toast.error('Nome obrigatorio', 'Indique o nome do negocio.');
      return;
    }
    if (!accentValid) {
      toast.error('Cor invalida', 'A cor de destaque deve estar no formato #RRGGBB.');
      return;
    }

    save.mutate(draftToEntityPatch(draft), {
      onSuccess: () => toast.success('Definicoes guardadas', 'Os dados do negocio foram actualizados.'),
      onError: (cause) => {
        if (cause instanceof ApiRequestError) {
          setError(cause);
          toast.error('Nao foi possivel guardar', cause.message);
          return;
        }
        toast.error('Nao foi possivel guardar', 'Tente novamente.');
      },
    });
  };

  const fieldError = (path: string) => error?.fieldError(path);

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection
        title="Identificacao"
        description="O nome, o NIF e a morada aparecem no recibo e nas facturas."
      >
        <FieldGrid>
          <Field label="Nome do negocio" htmlFor="biz-name" required error={fieldError('name')}>
            <Input
              id="biz-name"
              value={draft.name}
              maxLength={120}
              disabled={!canWrite}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>

          <Field label="NIF" htmlFor="biz-nif" error={fieldError('nif')} hint="Numero de identificacao fiscal.">
            <Input
              id="biz-nif"
              value={draft.nif}
              maxLength={40}
              disabled={!canWrite}
              className="tabular"
              onChange={(e) => patch({ nif: e.target.value })}
            />
          </Field>

          <Field label="Telefone" htmlFor="biz-phone" error={fieldError('phone')}>
            <Input
              id="biz-phone"
              type="tel"
              inputMode="tel"
              value={draft.phone}
              maxLength={40}
              disabled={!canWrite}
              className="tabular"
              onChange={(e) => patch({ phone: e.target.value })}
            />
          </Field>

          <Field label="Email" htmlFor="biz-email" error={fieldError('email')}>
            <Input
              id="biz-email"
              type="email"
              value={draft.email}
              maxLength={160}
              disabled={!canWrite}
              onChange={(e) => patch({ email: e.target.value })}
            />
          </Field>

          <Field
            label="Morada"
            htmlFor="biz-address"
            className="sm:col-span-2"
            error={fieldError('address')}
          >
            <Textarea
              id="biz-address"
              value={draft.address}
              rows={2}
              maxLength={240}
              disabled={!canWrite}
              onChange={(e) => patch({ address: e.target.value })}
            />
          </Field>
        </FieldGrid>

        <p className="mt-4 text-xs text-muted-foreground">
          Endereco da loja online: <span className="tabular">/{entity.slug}</span>
        </p>
      </SettingsSection>

      <SettingsSection
        title="Marca"
        description="O logotipo imprime no recibo e a cor de destaque pinta os botoes principais."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
                {draft.logoUrl ? (
                  <img
                    src={draft.logoUrl}
                    alt="Logotipo"
                    className="size-full object-contain"
                  />
                ) : (
                  <ImagePlus className="size-8 text-muted-foreground" aria-hidden="true" />
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={onPickLogo}
                />
                <Button
                  variant="outline"
                  leftIcon={<Upload />}
                  disabled={!canWrite}
                  loading={uploadLogo.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  Carregar logotipo
                </Button>
                {draft.logoUrl && (
                  <Button
                    variant="ghost"
                    leftIcon={<Trash2 />}
                    disabled={!canWrite}
                    onClick={() => patch({ logoUrl: '' })}
                  >
                    Remover
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, WEBP ou SVG ate 5 MB. Um fundo transparente imprime melhor.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Field
              label="Cor de destaque"
              htmlFor="biz-accent"
              error={accentValid ? fieldError('accentColor') : 'Use o formato #RRGGBB.'}
            >
              <div className="flex items-center gap-3">
                <input
                  id="biz-accent"
                  type="color"
                  value={accentValid ? draft.accentColor : '#006AFF'}
                  disabled={!canWrite}
                  aria-label="Escolher cor de destaque"
                  onChange={(e) => patch({ accentColor: e.target.value.toUpperCase() })}
                  className="size-12 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1"
                />
                <Input
                  value={draft.accentColor}
                  maxLength={7}
                  disabled={!canWrite}
                  aria-label="Cor de destaque em hexadecimal"
                  className="tabular uppercase"
                  onChange={(e) => patch({ accentColor: e.target.value.toUpperCase() })}
                />
              </div>
            </Field>

            {/* Live preview - inline styles because the colour is data, not a token. */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pre-visualizacao
              </p>
              <div className="flex items-center gap-3">
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                  style={
                    accentValid
                      ? { backgroundColor: draft.accentColor, color: contrastText(draft.accentColor) }
                      : undefined
                  }
                >
                  {initials(draft.name || entity.name)}
                </span>
                <span
                  className="inline-flex h-12 items-center rounded-lg px-5 text-sm font-semibold"
                  style={
                    accentValid
                      ? { backgroundColor: draft.accentColor, color: contrastText(draft.accentColor) }
                      : undefined
                  }
                >
                  Finalizar venda
                </span>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Moeda e precos"
        description="Como os precos sao interpretados em todo o sistema."
      >
        <FieldGrid>
          <Field label="Moeda" htmlFor="biz-currency" error={fieldError('currency')}>
            <Select
              value={draft.currency}
              disabled={!canWrite}
              onValueChange={(value) => patch({ currency: value })}
            >
              <SelectTrigger id="biz-currency" aria-label="Moeda">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(CURRENCIES).map((config) => (
                  <SelectItem key={config.code} value={config.code}>
                    {config.code} - {config.name.pt} ({config.symbol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Idioma" htmlFor="biz-locale" error={fieldError('locale')}>
            <Select
              value={draft.locale}
              disabled={!canWrite}
              onValueChange={(value) => patch({ locale: value as EntityDraft['locale'] })}
            >
              <SelectTrigger id="biz-locale" aria-label="Idioma">
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

          <Field
            label="Modo de preco"
            htmlFor="biz-pricing"
            hint={PRICING_MODE_HINTS[draft.pricingMode]}
            error={fieldError('pricingMode')}
          >
            <Select
              value={draft.pricingMode}
              disabled={!canWrite}
              onValueChange={(value) => patch({ pricingMode: value as EntityDraft['pricingMode'] })}
            >
              <SelectTrigger id="biz-pricing" aria-label="Modo de preco">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICING_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {PRICING_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Metodo de custeio"
            htmlFor="biz-costing"
            hint={COSTING_METHOD_HINTS[draft.costingMethod]}
            error={fieldError('costingMethod')}
          >
            <Select
              value={draft.costingMethod}
              disabled={!canWrite}
              onValueChange={(value) =>
                patch({ costingMethod: value as EntityDraft['costingMethod'] })
              }
            >
              <SelectTrigger id="biz-costing" aria-label="Metodo de custeio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COSTING_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {COSTING_METHOD_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGrid>

        {draft.pricingMode !== entity.pricingMode && (
          <Callout tone="warning" className="mt-4" title="Isto muda a leitura de todos os precos">
            Os precos ja registados nao sao convertidos. Em modo{' '}
            <strong>{PRICING_MODE_LABELS[draft.pricingMode].toLowerCase()}</strong>, um produto a
            1000,00 Kz passa a valer um total diferente no talao.
          </Callout>
        )}
      </SettingsSection>

      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        canSave={canWrite}
        onSave={submit}
        onReset={() => {
          setDraft(entityToDraft(entity));
          setError(null);
        }}
      />
    </div>
  );
}

export default BusinessTab;
