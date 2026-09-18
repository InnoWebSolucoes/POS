import * as React from 'react';
import { Barcode, Plus } from 'lucide-react';
import { DEFAULT_EMBEDDED_RULES, type EmbeddedBarcodeRule, type EntitySettings } from '@pos/shared';

import { Button, toast } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

import { useUpdateSettings } from '../settings-queries';
import { Callout, SaveBar, SettingsSection } from './settings-section';
import { newRule, ruleProblem } from './barcode-rules';
import { RuleEditor } from './barcode-rule-editor';
import { BarcodeTester } from './barcode-tester';

export interface BarcodeTabProps {
  settings: EntitySettings;
  canWrite: boolean;
}

/**
 * Embedded weight / price barcodes.
 *
 * Scales print an EAN-13 whose GS1 restricted-distribution prefix (20-29) means
 * the digits carry a local item code plus a weight or a price. Every shop wires
 * that differently, so the layout is a rule the entity owns - and the tester
 * below is what makes the rules checkable without a real scale.
 */
export function BarcodeTab({ settings, canWrite }: BarcodeTabProps) {
  const server = React.useMemo(
    () => settings.embeddedBarcodeRules ?? [],
    [settings.embeddedBarcodeRules],
  );
  const [draft, setDraft] = React.useState<EmbeddedBarcodeRule[]>(server);

  React.useEffect(() => {
    setDraft(server);
  }, [server]);

  const save = useUpdateSettings();
  const dirty = JSON.stringify(draft) !== JSON.stringify(server);

  const patchRule = (index: number, next: Partial<EmbeddedBarcodeRule>) =>
    setDraft((prev) => prev.map((rule, i) => (i === index ? { ...rule, ...next } : rule)));

  const submit = () => {
    for (const rule of draft) {
      const problem = ruleProblem(rule);
      if (problem) {
        toast.error(`Regra "${rule.label || rule.id}"`, problem);
        return;
      }
    }
    const ids = draft.map((rule) => rule.id);
    if (new Set(ids).size !== ids.length) {
      toast.error('Identificador repetido', 'Cada regra precisa de um identificador unico.');
      return;
    }

    save.mutate(
      { embeddedBarcodeRules: draft },
      {
        onSuccess: () =>
          toast.success('Regras guardadas', 'As leituras passam a usar estas regras.'),
        onError: (cause) => {
          const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
          toast.error('Nao foi possivel guardar', message);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Callout>
        As balancas de loja imprimem um EAN-13 cujo prefixo GS1 (20 a 29) significa que os digitos
        seguintes sao um codigo interno de artigo mais um peso ou um preco. Cada regra diz onde ficam
        essas duas fatias.
      </Callout>

      <SettingsSection
        title="Regras de peso e preco"
        description="Avaliadas do prefixo mais longo para o mais curto, por isso 21 ganha a 2."
        actions={
          canWrite ? (
            <Button
              variant="outline"
              leftIcon={<Plus />}
              onClick={() => setDraft((prev) => [...prev, newRule(prev.length)])}
            >
              Nova regra
            </Button>
          ) : undefined
        }
      >
        {draft.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
            <Barcode className="size-7 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Sem regras. Os codigos das balancas serao lidos como codigos normais.
            </p>
            {canWrite && (
              <Button
                variant="outline"
                onClick={() => setDraft(DEFAULT_EMBEDDED_RULES.map((rule) => ({ ...rule })))}
              >
                Usar as regras por omissao
              </Button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {draft.map((rule, index) => (
              <RuleEditor
                key={`${rule.id}-${index}`}
                rule={rule}
                index={index}
                canWrite={canWrite}
                onChange={(next) => patchRule(index, next)}
                onRemove={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
              />
            ))}
          </ul>
        )}
      </SettingsSection>

      {/* Tests against the DRAFT, so a rule can be checked before it is saved. */}
      <BarcodeTester rules={draft} />

      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        canSave={canWrite}
        onSave={submit}
        onReset={() => setDraft(server)}
      />
    </div>
  );
}

export default BarcodeTab;
