import type { EntityMode } from '@pos/shared';

/**
 * Vocabulary for the platform console.
 *
 * The operator runs the platform; the client runs their business. Everything
 * named here is about accounts, types of business and service health - never
 * about a client's takings.
 */

/** The badge label in the client list. */
export const CONSOLE_MODE_LABELS: Record<EntityMode, string> = {
  retail: 'Retalho',
  restaurant: 'Restauracao',
  online: 'Loja online',
};

/** The short form used inside the "Por tipo" tile, where space is tight. */
export const CONSOLE_MODE_SHORT: Record<EntityMode, string> = {
  retail: 'retalho',
  restaurant: 'restauracao',
  online: 'online',
};

export type ConsoleBadgeVariant = 'default' | 'warning' | 'secondary';

/** One colour per kind of business, so the list scans by type at a glance. */
export const CONSOLE_MODE_BADGE: Record<EntityMode, ConsoleBadgeVariant> = {
  retail: 'default',
  restaurant: 'warning',
  online: 'secondary',
};

/** What the client picked at sign-up decides which product they get. */
export const CONSOLE_MODE_HINTS: Record<EntityMode, string> = {
  retail: 'Caixa, leitor de codigos e stock por artigo.',
  restaurant: 'Plano de sala, pedidos por mesa e ecra de cozinha.',
  online: 'Montra publica, carrinho e encomendas.',
};

/** "Todos" plus one entry per mode. */
export type ModeFilter = 'all' | EntityMode;

/**
 * Seconds of uptime as something a human reads: "3 h 12 m", "8 m".
 * Deliberately coarse - this is a liveness hint, not a metric.
 */
export function formatUptime(seconds: number | undefined): string | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);

  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} m`;
  if (minutes > 0) return `${minutes} m`;
  return `${total} s`;
}
