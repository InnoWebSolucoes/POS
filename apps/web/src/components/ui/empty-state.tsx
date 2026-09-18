import * as React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from './button';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: { label: string; onClick: () => void; icon?: LucideIcon };
  /** A second, quieter way out. */
  secondaryAction?: { label: string; onClick: () => void };
  size?: 'sm' | 'default';
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondaryAction,
  size = 'default',
  className,
  ...props
}: EmptyStateProps) {
  const ActionIcon = action?.icon;
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'default' ? 'gap-3 px-6 py-16' : 'gap-2 px-4 py-10',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full bg-muted text-muted-foreground',
          size === 'default' ? 'size-14' : 'size-11',
        )}
      >
        <Icon className={size === 'default' ? 'size-7' : 'size-5'} aria-hidden="true" />
      </span>
      <p className={cn('font-semibold text-foreground', size === 'default' ? 'text-base' : 'text-sm')}>{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-2 flex flex-col items-center gap-2 sm:flex-row">
          {action && (
            <Button onClick={action.onClick} leftIcon={ActionIcon ? <ActionIcon /> : undefined}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
