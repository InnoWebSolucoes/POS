import * as React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, LogIn, Store, Users } from 'lucide-react';
import { ROLE_LABELS, type EntityDto, type Role } from '@pos/shared';

import { Badge, Button, EmptyState, Skeleton, UserAvatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ErrorNotice, authErrorMessage, isOfflineError } from './auth-chrome';

/** What GET /api/users/pin-users returns: no email, no hash, nothing private. */
export interface PinUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
}

export function useRoleLabel(): (role: Role) => string {
  const { i18n } = useTranslation();
  const lang: 'pt' | 'en' = i18n.language === 'en' ? 'en' : 'pt';
  return React.useCallback((role: Role) => ROLE_LABELS[role][lang], [lang]);
}

const TILE_CLASS = [
  'flex min-h-[10rem] flex-col items-center justify-center gap-3 rounded-2xl border border-border',
  'bg-card p-4 text-center shadow-sm transition-transform duration-75 active:scale-[0.97]',
  'hover:border-primary hover:bg-muted/40',
  'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
].join(' ');

/* -------------------------------------------------------------------------- */
/* Staff grid                                                                  */
/* -------------------------------------------------------------------------- */

export interface StaffGridProps {
  users: PinUser[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onSelect: (user: PinUser) => void;
}

export function StaffGrid({ users, isLoading, error, onRetry, onSelect }: StaffGridProps) {
  const { t } = useTranslation();
  const roleLabel = useRoleLabel();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="flex min-h-[10rem] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorNotice
        message={authErrorMessage(error, 'Nao foi possivel carregar a equipa desta loja.')}
        offline={isOfflineError(error)}
        onRetry={onRetry}
        retryLabel={t('common.retry')}
      />
    );
  }

  if (!users || users.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t('auth.noPinUsers', 'Nenhum utilizador com PIN')}
        description={t(
          'auth.noPinUsersBody',
          'Ninguem nesta loja tem PIN definido. Entre com email e defina o PIN nas definicoes da conta.',
        )}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {users.map((user) => (
        <button key={user.id} type="button" onClick={() => onSelect(user)} className={TILE_CLASS}>
          <UserAvatar name={user.name} src={user.avatarUrl} size="xl" />
          <span className="line-clamp-2 text-base font-semibold leading-tight text-foreground">
            {user.name}
          </span>
          <Badge variant="muted">{roleLabel(user.role)}</Badge>
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Entity picker                                                               */
/* -------------------------------------------------------------------------- */

const MODE_LABELS: Record<EntityDto['mode'], string> = {
  retail: 'Retalho',
  restaurant: 'Restauracao',
  online: 'Loja online',
};

export interface EntityPickerProps {
  entities: EntityDto[] | undefined;
  isLoading: boolean;
  error: unknown;
  /** False when nobody is signed in: the entity list is not a public endpoint. */
  canList: boolean;
  onRetry: () => void;
  onSelect: (entityId: string) => void;
  onCancel?: () => void;
}

export function EntityPicker({
  entities,
  isLoading,
  error,
  canList,
  onRetry,
  onSelect,
  onCancel,
}: EntityPickerProps) {
  const { t } = useTranslation();

  if (!canList) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Store className="size-7" aria-hidden="true" />
        </span>
        <div>
          <p className="text-base font-semibold text-foreground">
            {t('auth.chooseEntity', 'Escolha a loja')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'auth.chooseEntityBody',
              'Este equipamento ainda nao esta associado a uma loja. Entre uma vez com email; a partir dai o PIN basta.',
            )}
          </p>
        </div>
        <Button asChild size="lg" block>
          <Link to="/login">
            <LogIn className="size-5" aria-hidden="true" />
            <span>{t('auth.signIn')}</span>
          </Link>
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="lg" block onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorNotice
        message={authErrorMessage(error, 'Nao foi possivel carregar as lojas.')}
        offline={isOfflineError(error)}
        onRetry={onRetry}
        retryLabel={t('common.retry')}
      />
    );
  }

  if (!entities || entities.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title={t('auth.noEntities', 'Sem lojas disponiveis')}
        description={t('auth.noEntitiesBody', 'Nenhuma loja activa esta associada a esta conta.')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entities.map((entity) => (
        <button
          key={entity.id}
          type="button"
          onClick={() => onSelect(entity.id)}
          className={cn(
            'flex min-h-[4.5rem] items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3',
            'text-left shadow-sm transition-transform duration-75 active:scale-[0.99] hover:border-primary hover:bg-muted/40',
            'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Store className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold text-foreground">
                {entity.name}
              </span>
              <span className="block truncate text-sm text-muted-foreground">{entity.slug}</span>
            </span>
          </span>
          <Badge variant="muted">{MODE_LABELS[entity.mode]}</Badge>
        </button>
      ))}
      {onCancel && (
        <Button type="button" variant="ghost" size="lg" block onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      )}
    </div>
  );
}
