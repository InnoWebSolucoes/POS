import type { PrepStation, Unit } from '@pos/shared';

/**
 * Restaurante Muxima: an Angolan menu with a real kitchen behind it.
 *
 * `station` is what routes a line to a KDS screen, so it is set on every item -
 * the bar never sees the grelhados and the grill never sees the wine.
 */

export interface MenuCategorySeed {
  key: string;
  namePt: string;
  nameEn: string;
  color: string;
}

export const MENU_CATEGORIES: MenuCategorySeed[] = [
  { key: 'entradas', namePt: 'Entradas', nameEn: 'Starters', color: '#0E9F9F' },
  { key: 'principais', namePt: 'Pratos Principais', nameEn: 'Main Courses', color: '#A8213C' },
  { key: 'grelhados', namePt: 'Grelhados', nameEn: 'Grills', color: '#EF5B5B' },
  { key: 'sobremesas', namePt: 'Sobremesas', nameEn: 'Desserts', color: '#D6499B' },
  { key: 'bebidas', namePt: 'Bebidas', nameEn: 'Drinks', color: '#2F80ED' },
  { key: 'vinhos', namePt: 'Vinhos', nameEn: 'Wines', color: '#7C4DFF' },
  { key: 'ingredientes', namePt: 'Ingredientes', nameEn: 'Ingredients', color: '#5B6B7C' },
];

export interface MenuItemSeed {
  name: string;
  category: string;
  priceKz: number;
  station: PrepStation;
  tile: string;
  /** Relative popularity, used by the closed-bill history. */
  pop?: number;
  /** Modifier groups to attach, by key. */
  modifiers?: string[];
  quick?: boolean;
}

export const MENU_ITEMS: MenuItemSeed[] = [
  /* -- Entradas ------------------------------------------------------------ */
  { name: 'Pasteis de Bacalhau 4un', category: 'entradas', priceKz: 2500, station: 'fry', tile: '#F2814B', pop: 5, quick: true, modifiers: ['retirar'] },
  { name: 'Rissois de Camarao 4un', category: 'entradas', priceKz: 2300, station: 'fry', tile: '#F2814B', pop: 4 },
  { name: 'Croquetes de Carne 5un', category: 'entradas', priceKz: 2200, station: 'fry', tile: '#EF5B5B', pop: 3 },
  { name: 'Salada Mista', category: 'entradas', priceKz: 2200, station: 'salad', tile: '#16A34A', pop: 4, modifiers: ['retirar'] },
  { name: 'Salada de Polvo', category: 'entradas', priceKz: 4800, station: 'salad', tile: '#16A34A', pop: 2 },
  { name: 'Sopa de Peixe', category: 'entradas', priceKz: 2800, station: 'expo', tile: '#0E9F9F', pop: 3 },
  { name: 'Camarao Grelhado', category: 'entradas', priceKz: 5500, station: 'grill', tile: '#E0364A', pop: 3 },
  { name: 'Pao de Alho', category: 'entradas', priceKz: 1200, station: 'pastry', tile: '#F2814B', pop: 5, quick: true },

  /* -- Pratos Principais --------------------------------------------------- */
  { name: 'Muamba de Galinha', category: 'principais', priceKz: 4500, station: 'grill', tile: '#A8213C', pop: 9, quick: true, modifiers: ['retirar'] },
  { name: 'Calulu de Peixe', category: 'principais', priceKz: 5000, station: 'grill', tile: '#A8213C', pop: 7, quick: true, modifiers: ['retirar'] },
  { name: 'Feijoada a Angolana', category: 'principais', priceKz: 4800, station: 'grill', tile: '#A8213C', pop: 6, quick: true },
  { name: 'Moamba de Ginguba', category: 'principais', priceKz: 4600, station: 'grill', tile: '#A8213C', pop: 5 },
  { name: 'Cabidela de Frango', category: 'principais', priceKz: 4300, station: 'grill', tile: '#EF5B5B', pop: 4 },
  { name: 'Arroz de Marisco', category: 'principais', priceKz: 6800, station: 'grill', tile: '#E0364A', pop: 4 },
  { name: 'Bacalhau a Bras', category: 'principais', priceKz: 7500, station: 'fry', tile: '#F2814B', pop: 4 },
  { name: 'Caldeirada de Peixe', category: 'principais', priceKz: 6500, station: 'grill', tile: '#2F80ED', pop: 4 },
  { name: 'Funge de Bombo', category: 'principais', priceKz: 1200, station: 'expo', tile: '#5B6B7C', pop: 8, quick: true, modifiers: ['proteina'] },
  { name: 'Funge de Milho', category: 'principais', priceKz: 1200, station: 'expo', tile: '#5B6B7C', pop: 6, modifiers: ['proteina'] },
  { name: 'Arroz Branco', category: 'principais', priceKz: 1000, station: 'expo', tile: '#5B6B7C', pop: 7 },
  { name: 'Batata Frita', category: 'principais', priceKz: 1500, station: 'fry', tile: '#F2814B', pop: 7, quick: true },
  { name: 'Feijao de Oleo de Palma', category: 'principais', priceKz: 1800, station: 'expo', tile: '#F2814B', pop: 4 },

  /* -- Grelhados ------------------------------------------------------------ */
  { name: 'Picanha Grelhada', category: 'grelhados', priceKz: 9500, station: 'grill', tile: '#A8213C', pop: 6, quick: true, modifiers: ['extras', 'retirar'] },
  { name: 'Frango Grelhado Meio', category: 'grelhados', priceKz: 4200, station: 'grill', tile: '#EF5B5B', pop: 7, quick: true, modifiers: ['extras', 'retirar'] },
  { name: 'Espetada Mista', category: 'grelhados', priceKz: 5800, station: 'grill', tile: '#EF5B5B', pop: 5, modifiers: ['extras'] },
  { name: 'Costeleta de Porco', category: 'grelhados', priceKz: 5200, station: 'grill', tile: '#A8213C', pop: 4, modifiers: ['extras'] },
  { name: 'Carapau Grelhado', category: 'grelhados', priceKz: 3800, station: 'grill', tile: '#2F80ED', pop: 5 },
  { name: 'Garoupa Grelhada', category: 'grelhados', priceKz: 8500, station: 'grill', tile: '#2F80ED', pop: 3 },
  { name: 'Lulas Grelhadas', category: 'grelhados', priceKz: 6200, station: 'grill', tile: '#0E9F9F', pop: 3 },

  /* -- Sobremesas ----------------------------------------------------------- */
  { name: 'Mousse de Chocolate', category: 'sobremesas', priceKz: 1800, station: 'dessert', tile: '#7C4DFF', pop: 6, quick: true },
  { name: 'Pudim Abade de Priscos', category: 'sobremesas', priceKz: 2200, station: 'dessert', tile: '#D6499B', pop: 4 },
  { name: 'Cocada Amarela', category: 'sobremesas', priceKz: 1900, station: 'dessert', tile: '#F2814B', pop: 4 },
  { name: 'Salada de Fruta', category: 'sobremesas', priceKz: 1600, station: 'dessert', tile: '#16A34A', pop: 3 },
  { name: 'Gelado 2 Bolas', category: 'sobremesas', priceKz: 1500, station: 'dessert', tile: '#D6499B', pop: 4 },

  /* -- Bebidas -------------------------------------------------------------- */
  { name: 'Cerveja Cuca 330ml', category: 'bebidas', priceKz: 800, station: 'bar', tile: '#F2814B', pop: 10, quick: true },
  { name: "Cerveja N'Gola 330ml", category: 'bebidas', priceKz: 800, station: 'bar', tile: '#F2814B', pop: 6 },
  { name: 'Refrigerante Lata', category: 'bebidas', priceKz: 700, station: 'bar', tile: '#E0364A', pop: 8, quick: true },
  { name: 'Agua Mineral 500ml', category: 'bebidas', priceKz: 500, station: 'bar', tile: '#0E9F9F', pop: 9, quick: true },
  { name: 'Sumo Natural de Manga', category: 'bebidas', priceKz: 1500, station: 'bar', tile: '#F2814B', pop: 5 },
  { name: 'Cafe Expresso', category: 'bebidas', priceKz: 400, station: 'bar', tile: '#5B6B7C', pop: 7, quick: true },
  { name: 'Whisky Nacional Dose', category: 'bebidas', priceKz: 2500, station: 'bar', tile: '#A8213C', pop: 2 },

  /* -- Vinhos --------------------------------------------------------------- */
  { name: 'Vinho Tinto Casa da Torre 750ml', category: 'vinhos', priceKz: 8500, station: 'bar', tile: '#7C4DFF', pop: 3 },
  { name: 'Vinho Branco Gazela 750ml', category: 'vinhos', priceKz: 7500, station: 'bar', tile: '#7C4DFF', pop: 2 },
  { name: 'Vinho Verde Casal Garcia 750ml', category: 'vinhos', priceKz: 7800, station: 'bar', tile: '#7C4DFF', pop: 2 },
];

/** Stocked goods behind the composite burger. */
export interface IngredientSeed {
  key: string;
  name: string;
  priceKz: number;
  costKz: number;
  unit: Unit;
  /** Quantity consumed by one Hamburguer Completo. */
  perBurger: number;
  wastageBps?: number;
  stock: number;
  minStock: number;
}

export const BURGER_INGREDIENTS: IngredientSeed[] = [
  { key: 'pao', name: 'Pao de Hamburguer', priceKz: 400, costKz: 220, unit: 'each', perBurger: 1, stock: 180, minStock: 40 },
  { key: 'carne', name: 'Carne Picada', priceKz: 6500, costKz: 4200, unit: 'kg', perBurger: 0.18, wastageBps: 500, stock: 24, minStock: 8 },
  { key: 'queijo', name: 'Queijo Cheddar Fatia', priceKz: 300, costKz: 170, unit: 'each', perBurger: 2, stock: 220, minStock: 60 },
  { key: 'alface', name: 'Alface', priceKz: 800, costKz: 450, unit: 'each', perBurger: 0.15, stock: 40, minStock: 10 },
  { key: 'tomate', name: 'Tomate', priceKz: 1500, costKz: 900, unit: 'kg', perBurger: 0.06, wastageBps: 800, stock: 18, minStock: 6 },
];

export const BURGER = {
  name: 'Hamburguer Completo',
  category: 'grelhados',
  priceKz: 4900,
  station: 'grill' as PrepStation,
  tile: '#EF5B5B',
  modifiers: ['extras', 'retirar'],
};

export interface ModifierGroupSeed {
  key: string;
  namePt: string;
  nameEn: string;
  type: 'required' | 'optional' | 'removal';
  minSelect: number;
  maxSelect: number;
  modifiers: Array<{ namePt: string; nameEn: string; priceKz: number }>;
}

export const MODIFIER_GROUPS: ModifierGroupSeed[] = [
  {
    key: 'proteina',
    namePt: 'Escolha a proteina',
    nameEn: 'Choose your protein',
    type: 'required',
    minSelect: 1,
    maxSelect: 1,
    modifiers: [
      { namePt: 'Frango', nameEn: 'Chicken', priceKz: 0 },
      { namePt: 'Vaca', nameEn: 'Beef', priceKz: 800 },
      { namePt: 'Peixe', nameEn: 'Fish', priceKz: 500 },
    ],
  },
  {
    key: 'extras',
    namePt: 'Extras',
    nameEn: 'Extras',
    type: 'optional',
    minSelect: 0,
    maxSelect: 3,
    modifiers: [
      { namePt: 'Queijo extra', nameEn: 'Extra cheese', priceKz: 500 },
      { namePt: 'Bacon', nameEn: 'Bacon', priceKz: 800 },
      { namePt: 'Ovo estrelado', nameEn: 'Fried egg', priceKz: 300 },
    ],
  },
  {
    key: 'retirar',
    namePt: 'Retirar',
    nameEn: 'Remove',
    type: 'removal',
    minSelect: 0,
    maxSelect: 3,
    modifiers: [
      { namePt: 'Sem cebola', nameEn: 'No onion', priceKz: 0 },
      { namePt: 'Sem maionese', nameEn: 'No mayo', priceKz: 0 },
      { namePt: 'Sem picante', nameEn: 'No chilli', priceKz: 0 },
    ],
  },
];

export interface TableSeed {
  name: string;
  area: 'sala' | 'esplanada';
  shape: 'square' | 'circle' | 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  seats: number;
  status: 'available' | 'occupied' | 'attention' | 'reserved' | 'dirty';
}

/**
 * Two rooms on a grid that nothing overlaps: Sala Principal is 1200x800 and
 * Esplanada 900x600, and every table sits inside its own cell.
 */
export const TABLES: TableSeed[] = [
  { name: 'Mesa 1', area: 'sala', shape: 'square', x: 60, y: 60, width: 120, height: 120, seats: 4, status: 'occupied' },
  { name: 'Mesa 2', area: 'sala', shape: 'circle', x: 300, y: 60, width: 120, height: 120, seats: 2, status: 'available' },
  { name: 'Mesa 3', area: 'sala', shape: 'square', x: 540, y: 60, width: 120, height: 120, seats: 4, status: 'reserved' },
  { name: 'Mesa 4', area: 'sala', shape: 'rectangle', x: 780, y: 60, width: 220, height: 120, seats: 6, status: 'occupied' },
  { name: 'Mesa 5', area: 'sala', shape: 'square', x: 60, y: 260, width: 120, height: 120, seats: 4, status: 'available' },
  { name: 'Mesa 6', area: 'sala', shape: 'circle', x: 300, y: 260, width: 140, height: 140, seats: 6, status: 'dirty' },
  { name: 'Mesa 7', area: 'sala', shape: 'square', x: 540, y: 260, width: 120, height: 120, seats: 4, status: 'available' },
  { name: 'Mesa 8', area: 'sala', shape: 'rectangle', x: 780, y: 260, width: 220, height: 120, seats: 8, status: 'attention' },
  { name: 'Mesa 9', area: 'sala', shape: 'square', x: 60, y: 480, width: 120, height: 120, seats: 2, status: 'available' },
  { name: 'Mesa 10', area: 'sala', shape: 'circle', x: 300, y: 480, width: 120, height: 120, seats: 4, status: 'available' },
  { name: 'Mesa 11', area: 'sala', shape: 'square', x: 540, y: 480, width: 120, height: 120, seats: 4, status: 'occupied' },
  { name: 'Mesa 12', area: 'sala', shape: 'rectangle', x: 780, y: 480, width: 220, height: 140, seats: 8, status: 'reserved' },

  { name: 'Esplanada 1', area: 'esplanada', shape: 'circle', x: 60, y: 60, width: 120, height: 120, seats: 2, status: 'available' },
  { name: 'Esplanada 2', area: 'esplanada', shape: 'circle', x: 280, y: 60, width: 120, height: 120, seats: 2, status: 'available' },
  { name: 'Esplanada 3', area: 'esplanada', shape: 'square', x: 500, y: 60, width: 120, height: 120, seats: 4, status: 'dirty' },
  { name: 'Esplanada 4', area: 'esplanada', shape: 'square', x: 60, y: 280, width: 120, height: 120, seats: 4, status: 'available' },
  { name: 'Esplanada 5', area: 'esplanada', shape: 'rectangle', x: 280, y: 280, width: 200, height: 120, seats: 6, status: 'available' },
  { name: 'Esplanada 6', area: 'esplanada', shape: 'circle', x: 560, y: 280, width: 140, height: 140, seats: 4, status: 'reserved' },
];
