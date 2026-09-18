/** The small read-only pieces the promotions table is made of. */
import { Gift, Layers, Package, Percent, ShoppingBasket, Wallet } from 'lucide-react';
import type { PromotionType } from '@pos/shared';

import { Badge, Progress } from '@/components/ui';
import { formatDateTime, money, number, percent } from '@/lib/format';

import {
  buyGetLabel,
  promotionState,
  PROMOTION_TYPE_LABELS,
  STATE_LABELS,
  STATE_VARIANTS,
  scopeOf,
  type PromotionDto,
} from '../types';

const TYPE_ICONS: Record<PromotionType, typeof Percent> = {
  percent_off: Percent,
  fixed_off: Wallet,
  buy_x_get_y: Gift,
};

export function PromotionTypeBadge({ type }: { type: PromotionType }) {
  const Icon = TYPE_ICONS[type];
  return (
    <Badge variant="outline" size="default" className="gap-1.5">
      <Icon className="size-3.5" aria-hidden="true" />
      {PROMOTION_TYPE_LABELS[type]}
    </Badge>
  );
}

/** Percent in bps, fixed in minor units, buy_x_get_y as the phrase on the poster. */
export function PromotionValue({ promotion }: { promotion: PromotionDto }) {
  if (promotion.type === 'percent_off') {
    return <span className="tabular font-semibold text-foreground">{percent(promotion.value)}</span>;
  }
  if (promotion.type === 'fixed_off') {
    return <span className="tabular font-semibold text-foreground">-{money(promotion.value)}</span>;
  }
  return (
    <span className="font-semibold text-foreground">
      {buyGetLabel(promotion.buyQuantity, promotion.getQuantity)}
    </span>
  );
}

export function PromotionScopeCell({ promotion }: { promotion: PromotionDto }) {
  const scope = scopeOf(promotion);

  if (scope === 'category') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
        <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{promotion.categoryName ?? 'Categoria'}</span>
      </span>
    );
  }

  if (scope === 'products') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
        <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="tabular">{number(promotion.productIds.length)}</span>
        <span>{promotion.productIds.length === 1 ? 'produto' : 'produtos'}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <ShoppingBasket className="size-4 shrink-0" aria-hidden="true" />
      Todo o cesto
    </span>
  );
}

/** The state badge plus the window it came from, so nobody guesses. */
export function PromotionWindow({ promotion, now }: { promotion: PromotionDto; now: number }) {
  const state = promotionState(promotion, now);

  let window = 'Sem limite de tempo';
  if (promotion.startsAt && promotion.endsAt) {
    window = `${formatDateTime(promotion.startsAt)} - ${formatDateTime(promotion.endsAt)}`;
  } else if (promotion.startsAt) {
    window = `Desde ${formatDateTime(promotion.startsAt)}`;
  } else if (promotion.endsAt) {
    window = `Ate ${formatDateTime(promotion.endsAt)}`;
  }

  return (
    <div className="flex flex-col gap-1">
      <Badge variant={STATE_VARIANTS[state]} size="default" dot>
        {STATE_LABELS[state]}
      </Badge>
      <span className="tabular text-xs text-muted-foreground">{window}</span>
    </div>
  );
}

export function PromotionUsage({ promotion }: { promotion: PromotionDto }) {
  if (promotion.usageLimit === null) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="tabular text-sm text-foreground">{number(promotion.usageCount)}</span>
        <span className="text-xs text-muted-foreground">sem limite</span>
      </div>
    );
  }

  const ratio = Math.min(100, (promotion.usageCount / promotion.usageLimit) * 100);
  const tone = ratio >= 100 ? 'destructive' : ratio >= 80 ? 'warning' : 'primary';

  return (
    <div className="flex w-28 flex-col items-end gap-1">
      <span className="tabular text-sm text-foreground">
        {number(promotion.usageCount)} / {number(promotion.usageLimit)}
      </span>
      <Progress value={ratio} tone={tone} size="sm" aria-label="Utilizacoes" />
    </div>
  );
}
