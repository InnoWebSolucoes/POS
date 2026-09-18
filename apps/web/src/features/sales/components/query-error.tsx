import { CloudOff, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.isOffline) return 'Sem ligacao ao servidor. Verifique a rede e tente novamente.';
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Ocorreu um erro inesperado.';
}

export interface QueryErrorProps {
  error: unknown;
  onRetry: () => void;
  title?: string;
  className?: string;
  compact?: boolean;
}

/** Every screen that loads data owes the user a way back - never a blank panel. */
export function QueryError({ error, onRetry, title, className, compact = false }: QueryErrorProps) {
  const offline = error instanceof ApiRequestError && error.isOffline;
  const Icon = offline ? CloudOff : TriangleAlert;

  return (
    <div
      role="alert"
      className={cn(
        'panel flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'px-4 py-8' : 'px-6 py-14',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <p className="text-base font-semibold text-foreground">
        {title ?? 'Nao foi possivel carregar'}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">{errorMessage(error)}</p>
      <Button variant="outline" onClick={onRetry} className="mt-1">
        Tentar novamente
      </Button>
    </div>
  );
}

export default QueryError;
