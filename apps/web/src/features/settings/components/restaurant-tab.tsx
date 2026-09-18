import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { bpsToPct, pctToBps, type EntitySettings } from '@pos/shared';

import { Badge, Button, NumericInput, SwitchField, toast } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { money, percent } from '@/lib/format';

import { useUpdateSettings } from '../settings-queries';
import { Callout, Field, FieldGrid, SaveBar, SettingsSection } from './settings-section';

export interface RestaurantTabProps {
  settings: EntitySettings;
  canWrite: boolean;
}

interface RestaurantDraft {
  kdsWarnAfterMinutes: number;
  kdsAlertAfterMinutes: number;
  serviceChargeBps: number;
  tipsEnabled: boolean;
  tipPresetsBps: number[];
}

const pick = (settings: EntitySettings): RestaurantDraft => ({
  kdsWarnAfterMinutes: settings.kdsWarnAfterMinutes,
  kdsAlertAfterMinutes: settings.kdsAlertAfterMinutes,
  serviceChargeBps: settings.serviceChargeBps,
  tipsEnabled: settings.tipsEnabled,
  tipPresetsBps: [...settings.tipPresetsBps],
});

/** A round check to show what a percentage actually costs the customer. */
const EXAMPLE_BILL_MINOR = 1_000_000;

const MAX_PRESETS = 6;

export function RestaurantTab({ settings, canWrite }: RestaurantTabProps) {
  const [draft, setDraft] = React.useState<RestaurantDraft>(() => pick(settings));

  React.useEffect(() => {
    setDraft(pick(settings));
  }, [settings]);

  const save = useUpdateSettings();
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(settings));
  const patch = (next: Partial<RestaurantDraft>) => setDraft((prev) => ({ ...prev, ...next }));

  const submit = () => {
    if (draft.kdsWarnAfterMinutes > draft.kdsAlertAfterMinutes) {
      toast.error('Tempos invalidos', 'O aviso da cozinha tem de vir antes do alerta.');
      return;
    }

    save.mutate(
      { ...draft, tipPresetsBps: [...draft.tipPresetsBps].sort((a, b) => a - b) },
      {
        onSuccess: () => toast.success('Definicoes de restaurante guardadas'),
        onError: (cause) => {
          const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
          toast.error('Nao foi possivel guardar', message);
        },
      },
    );
  };

  const addPreset = () => {
    if (draft.tipPresetsBps.length >= MAX_PRESETS) {
      toast.error('Limite atingido', `Maximo de ${MAX_PRESETS} sugestoes de gorjeta.`);
      return;
    }
    patch({ tipPresetsBps: [...draft.tipPresetsBps, 1000] });
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection
        title="Ecra da cozinha"
        description="Quando um pedido passa a amarelo e quando passa a vermelho no KDS."
      >
        <FieldGrid>
          <Field
            label="Aviso apos (minutos)"
            htmlFor="kds-warn"
            hint="O talao fica em aviso a partir deste tempo em preparacao."
          >
            <NumericInput
              id="kds-warn"
              value={draft.kdsWarnAfterMinutes}
              decimals={0}
              min={0}
              max={240}
              disabled={!canWrite}
              onValueChange={(value) => patch({ kdsWarnAfterMinutes: Math.round(value) })}
            />
          </Field>

          <Field
            label="Alerta apos (minutos)"
            htmlFor="kds-alert"
            hint="Atraso critico: o talao pisca no ecra da cozinha."
            error={
              draft.kdsWarnAfterMinutes > draft.kdsAlertAfterMinutes
                ? 'O alerta tem de vir depois do aviso.'
                : undefined
            }
          >
            <NumericInput
              id="kds-alert"
              value={draft.kdsAlertAfterMinutes}
              decimals={0}
              min={0}
              max={240}
              disabled={!canWrite}
              onValueChange={(value) => patch({ kdsAlertAfterMinutes: Math.round(value) })}
            />
          </Field>
        </FieldGrid>
      </SettingsSection>

      <SettingsSection
        title="Servico e gorjetas"
        description="A taxa de servico e somada a conta; a gorjeta e escolhida pelo cliente."
      >
        <Field
          label="Taxa de servico (%)"
          htmlFor="service-charge"
          hint={
            draft.serviceChargeBps === 0
              ? 'Zero desliga a taxa de servico.'
              : `Numa conta de ${money(EXAMPLE_BILL_MINOR)} acrescenta ${money(
                  Math.round((EXAMPLE_BILL_MINOR * draft.serviceChargeBps) / 10_000),
                )}.`
          }
          className="sm:max-w-xs"
        >
          <NumericInput
            id="service-charge"
            value={bpsToPct(draft.serviceChargeBps)}
            decimals={2}
            min={0}
            max={100}
            disabled={!canWrite}
            onValueChange={(value) => patch({ serviceChargeBps: pctToBps(value) })}
          />
        </Field>

        <div className="mt-5">
          <SwitchField
            label="Pedir gorjeta no pagamento"
            description="Mostra as sugestoes abaixo no ecra de cobranca da mesa."
            checked={draft.tipsEnabled}
            disabled={!canWrite}
            onCheckedChange={(checked) => patch({ tipsEnabled: checked })}
          />
        </div>

        {draft.tipsEnabled && (
          <div className="mt-4">
            <p className="mb-3 text-sm font-medium text-foreground">Sugestoes de gorjeta</p>
            <div className="flex flex-wrap items-center gap-3">
              {draft.tipPresetsBps.map((bps, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card p-2"
                >
                  <NumericInput
                    aria-label={`Sugestao ${index + 1} em percentagem`}
                    value={bpsToPct(bps)}
                    decimals={0}
                    min={0}
                    max={100}
                    disabled={!canWrite}
                    className="w-20"
                    onValueChange={(value) =>
                      patch({
                        tipPresetsBps: draft.tipPresetsBps.map((item, i) =>
                          i === index ? pctToBps(value) : item,
                        ),
                      })
                    }
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover sugestao ${percent(bps)}`}
                    disabled={!canWrite}
                    onClick={() =>
                      patch({ tipPresetsBps: draft.tipPresetsBps.filter((_, i) => i !== index) })
                    }
                  >
                    <X />
                  </Button>
                </div>
              ))}

              {canWrite && (
                <Button variant="outline" leftIcon={<Plus />} onClick={addPreset}>
                  Adicionar
                </Button>
              )}
            </div>

            {draft.tipPresetsBps.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Numa conta de {money(EXAMPLE_BILL_MINOR)}:
                </span>
                {[...draft.tipPresetsBps]
                  .sort((a, b) => a - b)
                  .map((bps, index) => (
                    <Badge key={index} variant="outline">
                      {percent(bps)} = {money(Math.round((EXAMPLE_BILL_MINOR * bps) / 10_000))}
                    </Badge>
                  ))}
              </div>
            )}
          </div>
        )}

        <Callout className="mt-4">
          Estas definicoes so tem efeito no modo restaurante. Numa loja de retalho sao ignoradas.
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

export default RestaurantTab;
