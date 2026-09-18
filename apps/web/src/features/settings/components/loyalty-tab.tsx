import * as React from 'react';
import { Award, Gem, Medal } from 'lucide-react';
import type { EntitySettings, VipTier } from '@pos/shared';

import { MoneyInput, toast } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { money, number as formatNumber } from '@/lib/format';

import { useUpdateSettings } from '../settings-queries';
import { Callout, Field, FieldGrid, SaveBar, SettingsSection } from './settings-section';

type NamedTier = Exclude<VipTier, 'none'>;

export interface LoyaltyTabProps {
  settings: EntitySettings;
  canWrite: boolean;
}

interface LoyaltyDraft {
  loyaltyEarnPerMinor: number;
  loyaltyPointValueMinor: number;
  vipThresholds: Record<NamedTier, number>;
}

const pick = (settings: EntitySettings): LoyaltyDraft => ({
  loyaltyEarnPerMinor: settings.loyaltyEarnPerMinor,
  loyaltyPointValueMinor: settings.loyaltyPointValueMinor,
  vipThresholds: { ...settings.vipThresholds },
});

const TIERS: Array<{ key: NamedTier; label: string; icon: typeof Medal }> = [
  { key: 'bronze', label: 'Bronze', icon: Medal },
  { key: 'silver', label: 'Prata', icon: Award },
  { key: 'gold', label: 'Ouro', icon: Gem },
];

/** How many points the example spends, so the maths is recognisable. */
const EXAMPLE_POINTS = 100;

export function LoyaltyTab({ settings, canWrite }: LoyaltyTabProps) {
  const [draft, setDraft] = React.useState<LoyaltyDraft>(() => pick(settings));

  React.useEffect(() => {
    setDraft(pick(settings));
  }, [settings]);

  const save = useUpdateSettings();
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(settings));
  const patch = (next: Partial<LoyaltyDraft>) => setDraft((prev) => ({ ...prev, ...next }));

  const submit = () => {
    if (draft.loyaltyEarnPerMinor <= 0) {
      toast.error('Valor invalido', 'O gasto por ponto tem de ser maior que zero.');
      return;
    }
    const { bronze, silver, gold } = draft.vipThresholds;
    if (!(bronze <= silver && silver <= gold)) {
      toast.error('Escaloes invalidos', 'Os escaloes devem crescer: bronze, prata, ouro.');
      return;
    }

    save.mutate(draft, {
      onSuccess: () => toast.success('Fidelizacao actualizada'),
      onError: (cause) => {
        const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
        toast.error('Nao foi possivel guardar', message);
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection
        title="Pontos"
        description="Quanto e preciso gastar para ganhar um ponto e quanto vale cada ponto no desconto."
      >
        <FieldGrid>
          <Field
            label="Gasto por 1 ponto"
            htmlFor="loyalty-earn"
            hint="O cliente ganha 1 ponto por cada compra deste valor."
          >
            <MoneyInput
              id="loyalty-earn"
              value={draft.loyaltyEarnPerMinor}
              disabled={!canWrite}
              min={1}
              onChange={(minor) => patch({ loyaltyEarnPerMinor: minor })}
            />
          </Field>

          <Field
            label="Valor de 1 ponto"
            htmlFor="loyalty-value"
            hint="Quanto desconta cada ponto quando e trocado."
          >
            <MoneyInput
              id="loyalty-value"
              value={draft.loyaltyPointValueMinor}
              disabled={!canWrite}
              min={0}
              onChange={(minor) => patch({ loyaltyPointValueMinor: minor })}
            />
          </Field>
        </FieldGrid>

        <Callout tone="success" className="mt-4" title="Como fica na pratica">
          1 ponto por cada <strong className="tabular">{money(draft.loyaltyEarnPerMinor)}</strong>;{' '}
          <strong className="tabular">{formatNumber(EXAMPLE_POINTS)} pontos</strong> ={' '}
          <strong className="tabular">
            {money(draft.loyaltyPointValueMinor * EXAMPLE_POINTS)}
          </strong>{' '}
          de desconto.
          {draft.loyaltyEarnPerMinor > 0 && (
            <>
              {' '}
              Uma compra de{' '}
              <span className="tabular">{money(draft.loyaltyEarnPerMinor * 10)}</span> rende{' '}
              <span className="tabular">10</span> pontos.
            </>
          )}
        </Callout>
      </SettingsSection>

      <SettingsSection
        title="Escaloes VIP"
        description="Calculados sobre o total gasto pelo cliente ao longo da vida."
      >
        <FieldGrid className="lg:grid-cols-3">
          {TIERS.map(({ key, label, icon: Icon }) => (
            <div key={key} className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                {label}
              </p>
              <Field
                label="Gasto acumulado minimo"
                htmlFor={`vip-${key}`}
                hint={`A partir de ${money(draft.vipThresholds[key])} gastos.`}
              >
                <MoneyInput
                  id={`vip-${key}`}
                  value={draft.vipThresholds[key]}
                  disabled={!canWrite}
                  min={0}
                  onChange={(minor) =>
                    patch({ vipThresholds: { ...draft.vipThresholds, [key]: minor } })
                  }
                />
              </Field>
            </div>
          ))}
        </FieldGrid>

        <Callout className="mt-4">
          Os escaloes tem de crescer por ordem: bronze nao pode exigir mais do que prata, nem prata
          mais do que ouro.
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

export default LoyaltyTab;
