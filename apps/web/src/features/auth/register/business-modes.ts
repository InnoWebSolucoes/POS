import { Globe, ShoppingCart, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { EntityMode } from '@pos/shared';

/**
 * The three kinds of business the platform knows how to be.
 *
 * This is not a cosmetic preference: the mode a client picks on sign-up decides
 * which dashboard they land on, which navigation they get and which workflows
 * exist for them at all. So each card says plainly what the choice turns on,
 * instead of asking a shop owner to guess from a label.
 */

export interface BusinessModeOption {
  mode: EntityMode;
  icon: LucideIcon;
  title: string;
  /** One honest line about what this is. */
  tagline: string;
  /** What choosing this actually switches on. */
  features: readonly string[];
}

export const BUSINESS_MODES: readonly BusinessModeOption[] = [
  {
    mode: 'retail',
    icon: ShoppingCart,
    title: 'Retalho / Supermercado',
    tagline: 'Balcao de venda rapida com leitor de codigo de barras',
    features: [
      'Caixa com leitura de codigos de barras e som de confirmacao',
      'Produtos ao peso (fruta, talho) com grelha visual',
      'Gestao de stock, entradas e inventario',
      'Relatorios de margem e lucro',
    ],
  },
  {
    mode: 'restaurant',
    icon: UtensilsCrossed,
    title: 'Restaurante / Bar',
    tagline: 'Mesas, pedidos e ecra de cozinha',
    features: [
      'Plano de sala com mesas e estados em tempo real',
      'Ementa com opcoes, extras e pratos por tempos',
      'Ecra de cozinha (KDS) por posto de preparacao',
      'Divisao de conta e gorjetas',
    ],
  },
  {
    mode: 'online',
    icon: Globe,
    title: 'Loja Online',
    tagline: 'Montra publica com carrinho e encomendas',
    features: [
      'Loja publica com catalogo e carrinho',
      'Checkout com entrega ou recolha na loja',
      'Gestao de encomendas e expedicao',
      'Stock sincronizado com a loja fisica',
    ],
  },
];

export function businessMode(mode: EntityMode | null): BusinessModeOption | undefined {
  return BUSINESS_MODES.find((option) => option.mode === mode);
}
