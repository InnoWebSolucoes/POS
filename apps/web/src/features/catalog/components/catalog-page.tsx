import * as React from 'react';
import { AlertTriangle, WifiOff } from 'lucide-react';

import { ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui';
import { PageHeader, type Crumb } from '@/components/layout/page-header';

/**
 * The frame every catalogue screen sits in. The shell already supplies the page
 * padding, so this only adds the header and the vertical rhythm underneath it.
 */

export interface CatalogPageProps {
  title: string;
  description?: React.ReactNode;
  breadcrumbs?: Crumb[];
  /** Buttons for the top-right; they wrap under the title on a phone. */
  actions?: React.ReactNode;
  /** Filter bar, tabs - anything that sits between the header and the body. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function CatalogPage({
  title,
  description,
  breadcrumbs,
  actions,
  toolbar,
  children,
  className,
}: CatalogPageProps) {
  return (
    <div className={cn('flex w-full flex-col', className)}>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        actions={actions}
      />
      <div className="flex flex-col gap-4">
        {toolbar}
        {children}
      </div>
    </div>
  );
}

export interface QueryErrorProps {
  error: unknown;
  onRetry: () => void;
  /** Shown above the message, e.g. "Nao foi possivel carregar os produtos." */
  title?: string;
}

/** Loading failed: say what happened and give the finger a way to try again. */
export function QueryError({ error, onRetry, title }: QueryErrorProps) {
  const offline = error instanceof ApiRequestError && error.isOffline;
  const message =
    error instanceof ApiRequestError
      ? error.message
      : 'Ocorreu um erro inesperado ao contactar o servidor.';

  return (
    <EmptyState
      icon={offline ? WifiOff : AlertTriangle}
      title={title ?? (offline ? 'Sem ligacao ao servidor' : 'Nao foi possivel carregar')}
      description={message}
      action={{ label: 'Tentar novamente', onClick: onRetry }}
    />
  );
}

/** Inline banner for a failed save, with the server message when there is one. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiRequestError ? error.message : 'Nao foi possivel guardar. Tente novamente.';
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

/** A field-level message; empty renders nothing so layouts do not jump. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

export function NoAccess({ what }: { what: string }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Sem permissao"
      description={`A sua conta nao tem permissao para ver ${what}.`}
    />
  );
}

export default CatalogPage;
