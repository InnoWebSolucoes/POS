import { useTranslation } from 'react-i18next';
import { User } from 'lucide-react';

import { Badge, Button, Card } from '@/components/ui';
import { elapsed } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  ageTier,
  courseLabel,
  liveAgeSeconds,
  stationLabel,
  type AgeThresholds,
  type BoardEntry,
  type KdsTicketItem,
} from './kds-types';
import { TicketItemRow } from './ticket-item';
import type { TicketAction } from './use-kds';

/**
 * One ticket, sized to be read from two metres away.
 *
 * Colour is the alarm: neutral while there is time, amber past
 * settings.kdsWarnAfterMinutes, red and pulsing past kdsAlertAfterMinutes. The
 * stopwatch runs from a locally kept base so it ticks without refetching.
 */

type Tone = 'normal' | 'warning' | 'alert' | 'ready';

const TONE: Record<Tone, { card: string; band: string }> = {
  normal: { card: 'border-border', band: 'bg-muted text-foreground' },
  warning: { card: 'border-warning bg-warning/10', band: 'bg-warning text-warning-foreground' },
  alert: {
    card: 'border-destructive bg-destructive/15',
    band: 'bg-destructive text-destructive-foreground',
  },
  ready: { card: 'border-success bg-success/10', band: 'bg-success text-success-foreground' },
};

export interface TicketCardProps {
  entry: BoardEntry;
  nowMs: number;
  thresholds: AgeThresholds;
  canAct: boolean;
  busy: boolean;
  /** Just arrived over the socket - highlighted for a few seconds. */
  isNew: boolean;
  onAction: (ticketId: string, action: TicketAction) => void;
  onAdvanceItem: (item: KdsTicketItem) => void;
  onEightySix: (item: KdsTicketItem) => void;
}

export function TicketCard({
  entry,
  nowMs,
  thresholds,
  canAct,
  busy,
  isNew,
  onAction,
  onAdvanceItem,
  onEightySix,
}: TicketCardProps) {
  const { t, i18n } = useTranslation();
  const english = i18n.language.startsWith('en');
  const ticket = entry.ticket;

  const age = liveAgeSeconds(entry, nowMs);
  const tier = ageTier(age, thresholds);
  const tone: Tone = ticket.status === 'ready' ? 'ready' : tier;
  const palette = TONE[tone];

  return (
    <Card
      className={cn(
        'flex flex-col overflow-hidden border-4',
        palette.card,
        isNew && 'ring-4 ring-primary ring-offset-2 ring-offset-background',
      )}
      aria-label={`Pedido ${ticket.orderNumber}`}
    >
      <div
        className={cn(
          'flex items-start justify-between gap-3 px-4 py-3',
          palette.band,
          tone === 'alert' && 'animate-ticket-pulse',
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-kds-lg leading-none">
            {ticket.tableName ?? t('kds.counter', 'Balcao')}
          </p>
          <p className="mt-1 truncate text-kds leading-none opacity-90">#{ticket.orderNumber}</p>
        </div>
        <p className="tabular shrink-0 text-kds-lg leading-none" aria-label="Tempo de espera">
          {elapsed(age)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Badge variant="outline" size="lg">
          {stationLabel(ticket.station, english)}
        </Badge>
        <Badge variant="muted" size="lg">
          {courseLabel(ticket.course, english)}
        </Badge>
        {ticket.serverName && (
          <span className="inline-flex items-center gap-1.5 text-lg font-semibold text-muted-foreground">
            <User className="size-5" aria-hidden="true" />
            {ticket.serverName}
          </span>
        )}
        {isNew && (
          <Badge variant="default" size="lg">
            {t('kds.newTicket', 'Novo')}
          </Badge>
        )}
      </div>

      <ul className="flex flex-1 flex-col gap-2 p-3">
        {ticket.items.map((item) => (
          <TicketItemRow
            key={item.id}
            item={item}
            canAct={canAct}
            busy={busy}
            onAdvance={onAdvanceItem}
            onEightySix={onEightySix}
          />
        ))}
      </ul>

      {canAct && (
        <div className="flex flex-col gap-2 border-t border-border p-3">
          {ticket.status === 'new' && (
            <Button
              size="xl"
              block
              loading={busy}
              className="text-xl"
              onClick={() => onAction(ticket.id, 'start')}
            >
              {t('kds.start', 'Iniciar')}
            </Button>
          )}

          {ticket.status === 'in_progress' && (
            <Button
              size="xl"
              block
              variant="success"
              loading={busy}
              className="text-xl"
              onClick={() => onAction(ticket.id, 'ready')}
            >
              {t('kds.markReady', 'Marcar Pronto')}
            </Button>
          )}

          {ticket.status === 'ready' && (
            <>
              <Button
                size="xl"
                block
                loading={busy}
                className="text-xl"
                onClick={() => onAction(ticket.id, 'served')}
              >
                {t('kds.markServed', 'Marcar Servido')}
              </Button>
              <Button
                size="lg"
                block
                variant="outline"
                disabled={busy}
                onClick={() => onAction(ticket.id, 'recall')}
              >
                {t('kds.recall', 'Recuperar')}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export default TicketCard;
