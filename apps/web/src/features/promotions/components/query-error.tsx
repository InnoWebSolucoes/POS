import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface QueryErrorProps {
  error: unknown;
  onRetry: () => void;
  title?: string;
  className?: string;
  compact?: boolean;
}

/** Loading, empty and error are the three states every screen owes the user. */
export function QueryError({ error, onRetry, title, className, compact = false }: QueryErrorProps) {
  const offline = error instanceof ApiRequestError && error.isOffline;
  const message = error instanceof ApiRequestError ? error.message : 'Nao foi possivel carregar os dados.';

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'px-4 py-8' : 'px-6 py-14',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </span>
      <div>
        <p className="font-semibold text-foreground">
          {title ?? (offline ? 'Sem ligacao ao servidor' : 'Ocorreu um erro')}
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" onClick={onRetry} leftIcon={<RefreshCw />}>
        Tentar novamente
      </Button>
    </div>
  );
}

export default QueryError;
