import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, type LucideIcon } from 'lucide-react';

import { EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * An empty screen that teaches instead of apologising.
 *
 * "Sem resultados" tells someone who has used the product for a year exactly
 * what they already knew, and tells someone on their first morning nothing at
 * all. A guided empty says three things in plain language: what this screen is
 * for, what will appear here, and the single action that fills it.
 *
 * Built on EmptyState so the spacing, the icon chip and the button sizes stay
 * identical to every other empty surface in the product.
 */

export interface GuidedEmptyAction {
  label: string;
  /** A route to open. Use this or `onClick`, not both. */
  to?: string;
  onClick?: () => void;
  icon?: LucideIcon;
}

export interface GuidedEmptyProps {
  icon?: LucideIcon;
  /** What this screen is, in a handful of words. */
  title: string;
  /** One or two sentences for a shop owner, not for a developer. */
  description: React.ReactNode;
  /** The one action that fills this screen. */
  action?: GuidedEmptyAction;
  /** A quieter way out - "ver um exemplo", "saber mais". */
  secondaryAction?: GuidedEmptyAction;
  size?: 'sm' | 'default';
  className?: string;
}

export function GuidedEmpty({
  icon = Sparkles,
  title,
  description,
  action,
  secondaryAction,
  size = 'default',
  className,
}: GuidedEmptyProps) {
  const navigate = useNavigate();

  // `to` and `onClick` collapse into one handler so callers never have to know
  // whether the action is a route or a dialog.
  const run = React.useCallback(
    (item: GuidedEmptyAction) => () => {
      if (item.onClick) item.onClick();
      if (item.to) navigate(item.to);
    },
    [navigate],
  );

  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      size={size}
      className={cn(className)}
      action={action ? { label: action.label, onClick: run(action), icon: action.icon } : undefined}
      secondaryAction={
        secondaryAction ? { label: secondaryAction.label, onClick: run(secondaryAction) } : undefined
      }
    />
  );
}

export default GuidedEmpty;
