import { Crown, Medal } from 'lucide-react';
import type { VipTier } from '@pos/shared';

import { Badge, Progress, type BadgeProps } from '@/components/ui';
import { money } from '@/lib/format';

import type { TierConfigEntry } from '../customer-types';

/** The shop counter says "Ouro", not "gold". */
export const TIER_LABELS: Record<VipTier, string> = {
  none: 'Sem nivel',
  bronze: 'Bronze',
  silver: 'Prata',
  gold: 'Ouro',
};

/**
 * Semantic tokens only - the tier reads from its label first and its colour
 * second, so it survives dark mode and colour-blind eyes alike.
 */
const TIER_VARIANT: Record<VipTier, NonNullable<BadgeProps['variant']>> = {
  none: 'muted',
  bronze: 'warning',
  silver: 'outline',
  gold: 'default',
};

export interface TierBadgeProps {
  tier: VipTier;
  size?: BadgeProps['size'];
  className?: string;
}

export function TierBadge({ tier, size = 'sm', className }: TierBadgeProps) {
  return (
    <Badge variant={TIER_VARIANT[tier]} size={size} dot={tier !== 'none'} className={className}>
      {tier === 'gold' && <Crown className="size-3.5" aria-hidden="true" />}
      {TIER_LABELS[tier]}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress to the next tier                                                   */
/* -------------------------------------------------------------------------- */

export interface TierProgress {
  current: TierConfigEntry | null;
  next: TierConfigEntry | null;
  /** 0-100, how far through the current band the customer is. */
  percent: number;
  remainingMinor: number;
}

/**
 * The number a customer actually asks about at the till: how much more do I
 * have to spend. Computed from the entity's own thresholds, never hardcoded.
 */
export function tierProgress(
  lifetimeSpendMinor: number,
  tiers: TierConfigEntry[] | undefined,
): TierProgress | null {
  if (!tiers || tiers.length === 0) return null;

  const ladder = [...tiers].sort((a, b) => a.thresholdMinor - b.thresholdMinor);
  const spend = Math.max(0, lifetimeSpendMinor);

  let current: TierConfigEntry | null = null;
  let next: TierConfigEntry | null = null;
  for (const step of ladder) {
    if (spend >= step.thresholdMinor) current = step;
    else if (!next) next = step;
  }

  if (!next) return { current, next: null, percent: 100, remainingMinor: 0 };

  const floor = current?.thresholdMinor ?? 0;
  const span = Math.max(1, next.thresholdMinor - floor);
  const percent = Math.min(100, Math.max(0, ((spend - floor) / span) * 100));

  return { current, next, percent, remainingMinor: Math.max(0, next.thresholdMinor - spend) };
}

export interface TierProgressBarProps {
  lifetimeSpendMinor: number;
  tiers: TierConfigEntry[] | undefined;
  className?: string;
}

/** The bar itself, so the detail header and any future card share one look. */
export function TierProgressBar({ lifetimeSpendMinor, tiers, className }: TierProgressBarProps) {
  const progress = tierProgress(lifetimeSpendMinor, tiers);
  if (!progress) return null;

  const done = !progress.next;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {done ? 'Nivel maximo atingido' : 'Progresso para o proximo nivel'}
        </p>
        {progress.next ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Faltam</span>
            <span className="tabular font-semibold text-foreground">
              {money(progress.remainingMinor)}
            </span>
            <TierBadge tier={progress.next.tier} />
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Medal className="size-4" aria-hidden="true" />
            Obrigado pela fidelidade
          </span>
        )}
      </div>

      <Progress
        className="mt-2"
        value={progress.percent}
        tone={done ? 'success' : 'primary'}
        aria-label="Progresso para o proximo nivel"
      />

      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular">{money(progress.current?.thresholdMinor ?? 0)}</span>
        <span className="tabular">{money(progress.next?.thresholdMinor ?? lifetimeSpendMinor)}</span>
      </div>
    </div>
  );
}
