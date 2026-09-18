import * as React from 'react';
import { Volume2 } from 'lucide-react';
import {
  BEEP_SOUNDS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type BeepSound,
  type EntitySettings,
  type PaymentMethod,
} from '@pos/shared';

import {
  Button,
  CheckboxField,
  Input,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { beep, unlockAudio } from '@/lib/sound';

import { useUpdateSettings } from '../settings-queries';
import { BEEP_SOUND_LABELS, POS_THEME_LABELS } from '../settings-types';
import { Callout, Field, FieldGrid, SaveBar, SettingsSection } from './settings-section';

export interface RegisterTabProps {
  settings: EntitySettings;
  canWrite: boolean;
}

interface RegisterDraft {
  beepSound: BeepSound;
  beepVolume: number;
  defaultPaymentMethod: PaymentMethod;
  enabledPaymentMethods: PaymentMethod[];
  customPaymentLabels: Record<string, string>;
  posTheme: EntitySettings['posTheme'];
  autoLogoutMinutes: number;
}

const pick = (settings: EntitySettings): RegisterDraft => ({
  beepSound: settings.beepSound,
  beepVolume: settings.beepVolume,
  defaultPaymentMethod: settings.defaultPaymentMethod,
  enabledPaymentMethods: [...settings.enabledPaymentMethods],
  customPaymentLabels: { ...settings.customPaymentLabels },
  posTheme: settings.posTheme,
  autoLogoutMinutes: settings.autoLogoutMinutes,
});

/** Everything the cashier's own screen behaves by. */
export function RegisterTab({ settings, canWrite }: RegisterTabProps) {
  const [draft, setDraft] = React.useState<RegisterDraft>(() => pick(settings));

  React.useEffect(() => {
    setDraft(pick(settings));
  }, [settings]);

  const save = useUpdateSettings();
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(settings));
  const patch = (next: Partial<RegisterDraft>) => setDraft((prev) => ({ ...prev, ...next }));

  const testSound = (sound: BeepSound) => {
    unlockAudio();
    if (sound === 'silent') {
      toast.show('Silencioso', 'Nao e emitido qualquer som na leitura.');
      return;
    }
    beep({ sound, volume: draft.beepVolume });
  };

  const toggleMethod = (method: PaymentMethod, enabled: boolean) => {
    const next = enabled
      ? [...draft.enabledPaymentMethods, method]
      : draft.enabledPaymentMethods.filter((item) => item !== method);

    patch({
      enabledPaymentMethods: next,
      // Never leave the default pointing at a method nobody can pick.
      defaultPaymentMethod: next.includes(draft.defaultPaymentMethod)
        ? draft.defaultPaymentMethod
        : (next[0] ?? draft.defaultPaymentMethod),
    });
  };

  const submit = () => {
    if (draft.enabledPaymentMethods.length === 0) {
      toast.error('Sem metodos de pagamento', 'Active pelo menos um metodo.');
      return;
    }
    if (!draft.enabledPaymentMethods.includes(draft.defaultPaymentMethod)) {
      toast.error(
        'Metodo por omissao invalido',
        'O metodo por omissao tem de estar entre os metodos activos.',
      );
      return;
    }

    // Blank overrides are dropped rather than stored as "".
    const labels: Record<string, string> = {};
    for (const [key, value] of Object.entries(draft.customPaymentLabels)) {
      if (value.trim()) labels[key] = value.trim();
    }

    save.mutate(
      { ...draft, customPaymentLabels: labels },
      {
        onSuccess: () => toast.success('Definicoes de caixa guardadas'),
        onError: (cause) => {
          const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
          toast.error('Nao foi possivel guardar', message);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection
        title="Som de leitura"
        description="O sinal que confirma cada leitura de codigo de barras."
      >
        <div className="flex flex-col gap-3">
          {BEEP_SOUNDS.map((sound) => {
            const active = draft.beepSound === sound;
            return (
              <div
                key={sound}
                className="flex min-h-touch items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2"
              >
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="beep-sound"
                    value={sound}
                    checked={active}
                    disabled={!canWrite}
                    onChange={() => patch({ beepSound: sound })}
                    className="size-5 accent-primary"
                  />
                  <span className="text-sm font-medium text-foreground">
                    {BEEP_SOUND_LABELS[sound]}
                  </span>
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Volume2 />}
                  onClick={() => testSound(sound)}
                >
                  Testar
                </Button>
              </div>
            );
          })}
        </div>

        <Field
          label={`Volume: ${Math.round(draft.beepVolume * 100)}%`}
          htmlFor="beep-volume"
          className="mt-5"
          hint="Aplica-se ao sinal de leitura e aos alertas do posto de caixa."
        >
          <div className="flex items-center gap-4">
            <input
              id="beep-volume"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(draft.beepVolume * 100)}
              disabled={!canWrite}
              onChange={(e) => patch({ beepVolume: Number(e.target.value) / 100 })}
              className="h-12 w-full max-w-md cursor-pointer accent-primary"
            />
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Volume2 />}
              onClick={() => testSound(draft.beepSound)}
            >
              Ouvir
            </Button>
          </div>
        </Field>
      </SettingsSection>

      <SettingsSection
        title="Pagamentos"
        description="Os metodos que aparecem no ecra de cobranca, pela ordem abaixo."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {PAYMENT_METHODS.map((method) => {
            const enabled = draft.enabledPaymentMethods.includes(method);
            return (
              <div key={method} className="rounded-xl border border-border bg-card p-2">
                <CheckboxField
                  label={PAYMENT_METHOD_LABELS[method].pt}
                  checked={enabled}
                  disabled={!canWrite}
                  onCheckedChange={(checked) => toggleMethod(method, checked === true)}
                />
                {enabled && (
                  <Input
                    aria-label={`Etiqueta alternativa para ${PAYMENT_METHOD_LABELS[method].pt}`}
                    className="mt-1 h-11 text-sm"
                    maxLength={40}
                    disabled={!canWrite}
                    placeholder={`Etiqueta no ecra (${PAYMENT_METHOD_LABELS[method].pt})`}
                    value={draft.customPaymentLabels[method] ?? ''}
                    onChange={(e) =>
                      patch({
                        customPaymentLabels: {
                          ...draft.customPaymentLabels,
                          [method]: e.target.value,
                        },
                      })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        <Field label="Metodo por omissao" htmlFor="default-payment" className="mt-5">
          <Select
            value={draft.defaultPaymentMethod}
            disabled={!canWrite}
            onValueChange={(value) => patch({ defaultPaymentMethod: value as PaymentMethod })}
          >
            <SelectTrigger id="default-payment" className="sm:w-[20rem]" aria-label="Metodo por omissao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {draft.enabledPaymentMethods.map((method) => (
                <SelectItem key={method} value={method}>
                  {draft.customPaymentLabels[method]?.trim() || PAYMENT_METHOD_LABELS[method].pt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </SettingsSection>

      <SettingsSection title="Ecra e sessao" description="Como o posto de caixa se comporta sozinho.">
        <FieldGrid>
          <Field
            label="Tema do posto de caixa"
            htmlFor="pos-theme"
            hint="Independente do tema do back office."
          >
            <Select
              value={draft.posTheme}
              disabled={!canWrite}
              onValueChange={(value) => patch({ posTheme: value as EntitySettings['posTheme'] })}
            >
              <SelectTrigger id="pos-theme" aria-label="Tema do posto de caixa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <SelectItem key={theme} value={theme}>
                    {POS_THEME_LABELS[theme]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Terminar sessao apos (minutos)"
            htmlFor="auto-logout"
            hint={
              draft.autoLogoutMinutes === 0
                ? 'Zero mantem a sessao aberta indefinidamente.'
                : `A sessao fecha ao fim de ${draft.autoLogoutMinutes} minuto(s) sem actividade.`
            }
          >
            <NumericInput
              id="auto-logout"
              value={draft.autoLogoutMinutes}
              decimals={0}
              min={0}
              max={1440}
              disabled={!canWrite}
              onValueChange={(value) => patch({ autoLogoutMinutes: Math.round(value) })}
            />
          </Field>
        </FieldGrid>

        <Callout className="mt-4">
          Um posto partilhado por varios operadores deve ter um tempo curto; um posto de um so
          operador pode ficar a zero.
        </Callout>
      </SettingsSection>

      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        canSave={canWrite}
        onSave={submit}
        onReset={() => setDraft(pick(settings))}
      />
    </div>
  );
}

export default RegisterTab;
