import {
  FRACTIONAL_UNITS,
  PREP_STATION_LABELS,
  UNIT_LABELS,
  type ModifierGroupType,
  type PrepStation,
  type ProductType,
  type Unit,
} from '@pos/shared';

/** pt-PT labels without accents, as the rest of the codebase writes them. */

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  standard: 'Padrao',
  weighted: 'Pesado (por peso)',
  composite: 'Composto (com receita)',
  service: 'Servico',
};

export const PRODUCT_TYPE_HINTS: Record<ProductType, string> = {
  standard: 'Vendido a unidade, com stock proprio.',
  weighted: 'Vendido por peso ou medida; a quantidade e fraccionada.',
  composite: 'Feito a partir de outros produtos; o stock sai da receita.',
  service: 'Sem stock - mao de obra, entregas, taxas.',
};

export const MODIFIER_GROUP_TYPE_LABELS: Record<ModifierGroupType, string> = {
  required: 'Obrigatorio',
  optional: 'Opcional',
  removal: 'Remocao',
};

export const MODIFIER_GROUP_TYPE_HINTS: Record<ModifierGroupType, string> = {
  required: 'O cliente tem de escolher pelo menos uma opcao.',
  optional: 'Extras que o cliente pode juntar.',
  removal: 'Retirar ingredientes ("sem cebola").',
};

export function unitLabel(unit: Unit): string {
  return UNIT_LABELS[unit].pt;
}

export function unitShort(unit: Unit): string {
  return UNIT_LABELS[unit].short;
}

export function prepStationLabel(station: PrepStation): string {
  return PREP_STATION_LABELS[station].pt;
}

export function isFractional(unit: Unit): boolean {
  return FRACTIONAL_UNITS.includes(unit);
}

/** The unit a weighted product falls back to when the current one is discrete. */
export const DEFAULT_WEIGHTED_UNIT: Unit = 'kg';

/** Tile colours the restaurant grid offers, mirroring tailwind's `tile` palette. */
export const TILE_COLORS: Array<{ value: string; label: string }> = [
  { value: '#EF5B5B', label: 'Coral' },
  { value: '#F2814B', label: 'Laranja' },
  { value: '#A8213C', label: 'Bordeaux' },
  { value: '#16A34A', label: 'Verde' },
  { value: '#E0364A', label: 'Vermelho' },
  { value: '#2F80ED', label: 'Azul' },
  { value: '#D6499B', label: 'Magenta' },
  { value: '#0E9F9F', label: 'Turquesa' },
  { value: '#7C4DFF', label: 'Roxo' },
  { value: '#5B6B7C', label: 'Ardosia' },
];

/** A tracked product at or under its minimum is the one the owner must reorder. */
export function isLowStock(product: {
  trackStock: boolean;
  minStockLevel: number;
  stockQuantity: number;
}): boolean {
  return product.trackStock && product.minStockLevel > 0 && product.stockQuantity <= product.minStockLevel;
}

/** "Camisa Azul" -> "camisa-azul", for the online store slug. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Mirrors skuSegment() on the server, so a generated SKU looks like a real one. */
export function skuSegment(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
