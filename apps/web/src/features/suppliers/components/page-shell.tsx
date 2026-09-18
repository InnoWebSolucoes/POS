import type * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button, Card } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PageShellProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/** The back office has no shared page header component, so this is ours. */
export function PageShell({ title, description, actions, children }: PageShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

interface QueryErrorProps {
  error: unknown;
  onRetry: () => void;
  className?: string;
}

/** Loading, empty and error are the three states every screen owes the user. */
export function QueryError({ error, onRetry, className }: QueryErrorProps) {
  const offline = error instanceof ApiRequestError && error.isOffline;
  const message =
    error instanceof ApiRequestError
      ? error.message
      : 'Nao foi possivel carregar os dados.';

  return (
    <Card className={cn('flex flex-col items-center gap-4 p-8 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <AlertTriangle className="size-6" />
      </span>
      <div>
        <p className="font-semibold text-foreground">
          {offline ? 'Sem ligacao ao servidor' : 'Ocorreu um erro'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw /> Tentar novamente
      </Button>
    </Card>
  );
}
