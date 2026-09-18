import * as React from 'react';
import { Download, FileJson, Upload } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  toast,
} from '@/components/ui';
import { api, ApiRequestError } from '@/lib/api';
import { number as formatNumber } from '@/lib/format';

import { useImportBackup } from '../settings-queries';
import type { ImportSummary, ImportTally } from '../settings-types';
import { Callout, SettingsSection } from './settings-section';

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export interface BackupTabProps {
  canWrite: boolean;
}

/**
 * Data portability. The export is a plain JSON file of how this tenant is
 * configured and what it sells - never users, never sales, never hashes.
 */
export function BackupTab({ canWrite }: BackupTabProps) {
  const [exporting, setExporting] = React.useState(false);
  const [pending, setPending] = React.useState<{ file: File; payload: unknown } | null>(null);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const importBackup = useImportBackup();

  const runExport = async () => {
    setExporting(true);
    try {
      await api.download('/api/settings/export', undefined, 'pos-export.json');
      toast.success('Exportacao concluida', 'O ficheiro foi guardado no dispositivo.');
    } catch (cause) {
      const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
      toast.error('Nao foi possivel exportar', message);
    } finally {
      setExporting(false);
    }
  };

  const onPickFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_IMPORT_BYTES) {
      toast.error('Ficheiro demasiado grande', 'O limite de importacao e 25 MB.');
      return;
    }

    try {
      const text = await file.text();
      const payload: unknown = JSON.parse(text);
      setSummary(null);
      setPending({ file, payload });
    } catch {
      toast.error('Ficheiro invalido', 'Nao foi possivel ler o JSON deste ficheiro.');
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    const payload = pending.payload;
    setPending(null);

    importBackup.mutate(payload, {
      onSuccess: (result) => {
        setSummary(result.summary);
        toast.success('Importacao concluida', 'Os dados em falta foram adicionados.');
      },
      onError: (cause) => {
        const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
        toast.error('Nao foi possivel importar', message);
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection
        title="Exportar dados"
        description="Um ficheiro JSON com a configuracao, o catalogo, os clientes e as promocoes desta entidade."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            leftIcon={<Download />}
            loading={exporting}
            disabled={!canWrite}
            onClick={() => void runExport()}
          >
            Exportar para JSON
          </Button>
          <span className="text-sm text-muted-foreground">
            Inclui: localizacoes, categorias, fornecedores, produtos, clientes, promocoes, definicoes
            e taxas.
          </span>
        </div>

        <Callout className="mt-4" title="O que NAO e exportado">
          Utilizadores, palavras-passe, PIN, vendas, pagamentos, movimentos de stock e o registo de
          auditoria ficam de fora, por serem dados de pessoas e de historico financeiro.
        </Callout>
      </SettingsSection>

      <SettingsSection
        title="Importar dados"
        description="Carrega um ficheiro exportado por este sistema e acrescenta o que faltar."
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void onPickFile(event)}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            variant="outline"
            leftIcon={<Upload />}
            disabled={!canWrite}
            loading={importBackup.isPending}
            onClick={() => fileRef.current?.click()}
          >
            Escolher ficheiro
          </Button>
          <span className="text-sm text-muted-foreground">Ficheiro .json ate 25 MB.</span>
        </div>

        <Callout tone="warning" className="mt-4" title="Leia antes de importar">
          <ul className="ml-4 list-disc space-y-1">
            <li>A importacao <strong>acrescenta</strong>: nada do que ja existe e substituido.</li>
            <li>
              Produtos, categorias e fornecedores com o mesmo codigo ou nome sao ignorados, nao
              actualizados.
            </li>
            <li>Nao mexe em stock, vendas, utilizadores nem no registo de auditoria.</li>
            <li>Nao remove nada. Uma importacao errada acrescenta lixo, mas nao apaga dados.</li>
          </ul>
        </Callout>

        {summary && <ImportReport summary={summary} />}
      </SettingsSection>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importar este ficheiro?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.file.name} sera lido e tudo o que ainda nao existir nesta entidade sera
              criado. Nada e substituido nem apagado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Result                                                                      */
/* -------------------------------------------------------------------------- */

const TALLY_LABELS: Array<{ key: keyof ImportSummary; label: string }> = [
  { key: 'locations', label: 'Localizacoes' },
  { key: 'categories', label: 'Categorias' },
  { key: 'suppliers', label: 'Fornecedores' },
  { key: 'products', label: 'Produtos' },
  { key: 'variants', label: 'Variantes' },
  { key: 'images', label: 'Imagens' },
  { key: 'recipeComponents', label: 'Componentes de receita' },
  { key: 'customers', label: 'Clientes' },
  { key: 'promotions', label: 'Promocoes' },
];

const isTally = (value: unknown): value is ImportTally =>
  typeof value === 'object' && value !== null && 'created' in value;

function ImportReport({ summary }: { summary: ImportSummary }) {
  return (
    <div className="mt-5 rounded-xl border border-border bg-card p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <FileJson className="size-5 text-muted-foreground" aria-hidden="true" />
        Resultado da importacao
      </p>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {TALLY_LABELS.map(({ key, label }) => {
          const tally = summary[key];
          if (!isTally(tally)) return null;
          return (
            <div key={key} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="tabular text-sm">
                <span className="font-semibold text-success">+{formatNumber(tally.created)}</span>
                {tally.skipped > 0 && (
                  <span className="ml-2 text-muted-foreground">
                    {formatNumber(tally.skipped)} ignorado(s)
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {summary.taxRatesApplied && <Badge variant="success">Taxas aplicadas</Badge>}
        {summary.settingsApplied.length > 0 && (
          <Badge variant="success">
            {formatNumber(summary.settingsApplied.length)} definicao(oes) aplicada(s)
          </Badge>
        )}
      </div>

      {summary.warnings.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-warning">Avisos</p>
          <ul className="mt-1 ml-4 list-disc space-y-1 text-sm text-muted-foreground">
            {summary.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default BackupTab;
