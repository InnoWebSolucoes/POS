import * as React from 'react';
import { AlertTriangle, Receipt } from 'lucide-react';
import type { EntityDto, EntitySettings } from '@pos/shared';

import { Button, Spinner, SwitchField, Textarea, toast } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

import { useReceiptPreview, useUpdateSettings } from '../settings-queries';
import { Callout, Field, SaveBar, SettingsSection } from './settings-section';

export interface ReceiptTabProps {
  entity: EntityDto;
  settings: EntitySettings;
  canWrite: boolean;
}

interface ReceiptDraft {
  receiptHeader: string;
  receiptFooter: string;
  receiptShowLogo: boolean;
}

const pick = (settings: EntitySettings): ReceiptDraft => ({
  receiptHeader: settings.receiptHeader,
  receiptFooter: settings.receiptFooter,
  receiptShowLogo: settings.receiptShowLogo,
});

/** The preview is rendered server-side by the real template, so it never lies. */
const PREVIEW_DEBOUNCE_MS = 450;

export function ReceiptTab({ entity, settings, canWrite }: ReceiptTabProps) {
  const [draft, setDraft] = React.useState<ReceiptDraft>(() => pick(settings));
  const [previewInput, setPreviewInput] = React.useState<ReceiptDraft>(() => pick(settings));

  React.useEffect(() => {
    setDraft(pick(settings));
  }, [settings]);

  // Typing must not fire a render call per keystroke.
  React.useEffect(() => {
    const timer = window.setTimeout(() => setPreviewInput(draft), PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const save = useUpdateSettings();
  const preview = useReceiptPreview(previewInput);

  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(settings));
  const patch = (next: Partial<ReceiptDraft>) => setDraft((prev) => ({ ...prev, ...next }));

  const submit = () => {
    save.mutate(draft, {
      onSuccess: () => toast.success('Recibo actualizado', 'O talao passa a sair com o novo texto.'),
      onError: (cause) => {
        const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
        toast.error('Nao foi possivel guardar', message);
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-5">
          <SettingsSection
            title="Texto do talao"
            description="Impresso acima e abaixo das linhas da venda, em papel de 80 mm (42 colunas)."
          >
            <div className="flex flex-col gap-4">
              <Field
                label="Cabecalho"
                htmlFor="receipt-header"
                hint="Aparece por baixo do nome do negocio. Ate 600 caracteres."
              >
                <Textarea
                  id="receipt-header"
                  rows={3}
                  maxLength={600}
                  value={draft.receiptHeader}
                  disabled={!canWrite}
                  placeholder="Ex: Rua Rainha Ginga, 12 - Luanda"
                  onChange={(e) => patch({ receiptHeader: e.target.value })}
                />
              </Field>

              <Field
                label="Rodape"
                htmlFor="receipt-footer"
                hint="A ultima palavra do talao: agradecimento, politica de trocas, horario."
              >
                <Textarea
                  id="receipt-footer"
                  rows={3}
                  maxLength={600}
                  value={draft.receiptFooter}
                  disabled={!canWrite}
                  placeholder="Obrigado pela sua preferencia!"
                  onChange={(e) => patch({ receiptFooter: e.target.value })}
                />
              </Field>

              <SwitchField
                label="Imprimir logotipo"
                description={
                  entity.logoUrl
                    ? 'O logotipo carregado no separador Negocio sai no topo do talao.'
                    : 'Ainda nao ha logotipo carregado no separador Negocio.'
                }
                checked={draft.receiptShowLogo}
                disabled={!canWrite}
                onCheckedChange={(checked) => patch({ receiptShowLogo: checked })}
              />
            </div>
          </SettingsSection>

          <SaveBar
            dirty={dirty}
            saving={save.isPending}
            canSave={canWrite}
            onSave={submit}
            onReset={() => setDraft(pick(settings))}
          />
        </div>

        <SettingsSection
          title="Pre-visualizacao"
          description="Dados de exemplo, template real."
          actions={preview.isFetching ? <Spinner className="size-4" /> : undefined}
        >
          <ReceiptPaper
            lines={preview.data?.lines ?? null}
            loading={preview.isLoading}
            error={preview.isError}
            onRetry={() => void preview.refetch()}
          />
        </SettingsSection>
      </div>

      <Callout>
        A pre-visualizacao usa as alteracoes ainda por guardar, por isso mostra exactamente o que sera
        impresso depois de carregar em Guardar.
      </Callout>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The paper                                                                   */
/* -------------------------------------------------------------------------- */

function ReceiptPaper({
  lines,
  loading,
  error,
  onRetry,
}: {
  lines: string[] | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-6 text-center">
        <AlertTriangle className="size-6 text-warning" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Nao foi possivel gerar a pre-visualizacao.</p>
        <Button variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (loading || !lines) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border">
        <Receipt className="size-7 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">A carregar...</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <pre
        aria-label="Pre-visualizacao do talao"
        className="mx-auto w-[23rem] max-w-full whitespace-pre rounded-md border border-border bg-card px-4 py-5 text-[0.7rem] leading-[1.35] text-card-foreground shadow-md tabular"
      >
        {lines.join('\n')}
      </pre>
    </div>
  );
}

export default ReceiptTab;
