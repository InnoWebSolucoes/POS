import * as React from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  LogIn,
  Plus,
  Sparkles,
} from 'lucide-react';

import { Button, Spinner, toast } from '@/components/ui';
import { cn } from '@/lib/utils';

import { handoverText, MODE_LABELS, type Handover } from '../entity-types';
import type { StarterContentSummary } from '../entity-queries';

/**
 * The one moment the password exists in readable form.
 *
 * The API hashes it and never hands it back, so this panel is the only place it
 * can be read - and the operator is told so plainly rather than discovering it
 * the hard way. Everything on here is copyable in one tap, because the next
 * thing that happens is the operator dictating it down a phone line.
 */

export type StarterState =
  | { status: 'skipped' }
  | { status: 'pending' }
  | { status: 'done'; summary: StarterContentSummary }
  | { status: 'failed'; message: string };

export interface HandoverPanelProps {
  handover: Handover;
  starter: StarterState;
  onRetryStarter: () => void;
  onEnter: () => void;
  entering: boolean;
  onCreateAnother: () => void;
  onClose: () => void;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back to the old trick so the
    // operator is never stuck retyping a generated password by hand.
    try {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(field);
      return ok;
    } catch {
      return false;
    }
  }
}

/** One credential line: label, value in monospace, and its own copy button. */
function CredentialRow({
  label,
  value,
  masked = false,
}: {
  label: string;
  value: string;
  masked?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const [revealed, setRevealed] = React.useState(!masked);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      toast.success('Copiado', label);
    } else {
      toast.error('Nao foi possivel copiar', 'Seleccione o texto e copie manualmente.');
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-border py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="tabular break-all text-sm font-semibold text-foreground">
          {revealed ? value : '•'.repeat(Math.min(value.length, 16))}
        </p>
      </div>

      {masked && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={revealed ? `Esconder ${label}` : `Mostrar ${label}`}
          onClick={() => setRevealed((prev) => !prev)}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
      )}

      <Button variant="outline" size="icon" aria-label={`Copiar ${label}`} onClick={() => void copy()}>
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  );
}

export function HandoverPanel({
  handover,
  starter,
  onRetryStarter,
  onEnter,
  entering,
  onCreateAnother,
  onClose,
}: HandoverPanelProps) {
  const [copiedAll, setCopiedAll] = React.useState(false);

  React.useEffect(() => {
    if (!copiedAll) return;
    const timer = window.setTimeout(() => setCopiedAll(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedAll]);

  const copyAll = async () => {
    const ok = await copyToClipboard(handoverText(handover));
    if (ok) {
      setCopiedAll(true);
      toast.success('Dados copiados', 'Cole na mensagem para o cliente.');
    } else {
      toast.error('Nao foi possivel copiar', 'Seleccione o texto e copie manualmente.');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground">{handover.businessName} esta criado</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {MODE_LABELS[handover.mode]} - o cliente ja pode entrar com os dados abaixo.
          </p>
        </div>
      </div>

      {/* The warning comes BEFORE the credentials, so it is read first. */}
      <div className="flex items-start gap-3 rounded-xl border-2 border-warning/50 bg-warning/10 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">
          A palavra-passe so e mostrada aqui, uma unica vez. Copie-a agora. Assim que fechar este
          ecra ela nao pode ser recuperada - so substituida por uma nova.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Dados de entrega</h3>
          <Button
            variant="outline"
            size="sm"
            leftIcon={copiedAll ? <Check /> : <Copy />}
            onClick={() => void copyAll()}
          >
            {copiedAll ? 'Copiado' : 'Copiar tudo'}
          </Button>
        </div>

        <CredentialRow label="Negocio" value={handover.businessName} />
        <CredentialRow label="Endereco de entrada" value={handover.loginUrl} />
        <CredentialRow label="Email" value={handover.adminEmail} />
        <CredentialRow label="Palavra-passe" value={handover.adminPassword} masked />
      </section>

      {starter.status !== 'skipped' && (
        <section
          className={cn(
            'flex items-start gap-3 rounded-xl border p-4',
            starter.status === 'failed' ? 'border-destructive/40 bg-destructive/10' : 'border-border bg-muted/30',
          )}
        >
          {starter.status === 'pending' ? (
            <Spinner className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          ) : starter.status === 'done' ? (
            <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          )}

          <div className="min-w-0 flex-1">
            {starter.status === 'pending' && (
              <p className="text-sm text-muted-foreground">A criar o catalogo de exemplo...</p>
            )}

            {starter.status === 'done' && (
              <>
                <p className="text-sm font-semibold text-foreground">Catalogo de exemplo criado</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {starter.summary.categories} categorias, {starter.summary.products} produtos
                  {starter.summary.tables > 0 ? `, ${starter.summary.tables} mesas` : ''}
                  {starter.summary.modifierGroups > 0
                    ? `, ${starter.summary.modifierGroups} grupo(s) de opcoes`
                    : ''}
                  .
                </p>
              </>
            )}

            {starter.status === 'failed' && (
              <>
                <p className="text-sm font-semibold text-foreground">
                  O negocio foi criado, mas o catalogo de exemplo nao.
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{starter.message}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={onRetryStarter}>
                  Tentar novamente
                </Button>
              </>
            )}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          block
          leftIcon={<LogIn />}
          loading={entering}
          loadingLabel="A entrar..."
          onClick={onEnter}
        >
          Entrar neste negocio
        </Button>
        <p className="px-1 text-xs text-muted-foreground">
          Entra como operador da plataforma para configurar o negocio ao lado do cliente. Fica
          registado na auditoria.
        </p>

        <Button variant="outline" size="lg" block leftIcon={<Plus />} onClick={onCreateAnother}>
          Criar outro cliente
        </Button>

        <Button variant="ghost" size="lg" block onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}

export default HandoverPanel;
