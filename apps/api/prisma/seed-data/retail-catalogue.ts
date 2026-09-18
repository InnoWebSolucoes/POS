import type { Unit } from '@pos/shared';

/**
 * The Supermercado Kalunga catalogue.
 *
 * Prices are written in whole Kwanza and converted to centimos by kz(); the
 * database never sees anything but integer minor units. Tax follows the Angolan
 * pattern the demo wants to show off: 14% standard, 7% on staples, 0% on
 * unprocessed fresh produce - which gives the tax breakdown report three bands.
 */

export const TAX_STANDARD = 1400;
export const TAX_REDUCED = 700;
export const TAX_EXEMPT = 0;

export interface CategorySeed {
  key: string;
  namePt: string;
  nameEn: string;
  color: string;
  parent?: string;
}

export const RETAIL_CATEGORIES: CategorySeed[] = [
  { key: 'bebidas', namePt: 'Bebidas', nameEn: 'Drinks', color: '#2F80ED' },
  { key: 'refrigerantes', namePt: 'Refrigerantes', nameEn: 'Soft Drinks', color: '#E0364A', parent: 'bebidas' },
  { key: 'aguas', namePt: 'Aguas', nameEn: 'Water', color: '#0E9F9F', parent: 'bebidas' },
  { key: 'cervejas', namePt: 'Cervejas', nameEn: 'Beer', color: '#F2814B', parent: 'bebidas' },
  { key: 'vinhos', namePt: 'Vinhos', nameEn: 'Wine', color: '#A8213C', parent: 'bebidas' },

  { key: 'mercearia', namePt: 'Mercearia', nameEn: 'Grocery', color: '#F2814B' },
  { key: 'massas', namePt: 'Massas', nameEn: 'Pasta', color: '#EF5B5B', parent: 'mercearia' },
  { key: 'arroz', namePt: 'Arroz', nameEn: 'Rice', color: '#5B6B7C', parent: 'mercearia' },
  { key: 'oleos', namePt: 'Oleos', nameEn: 'Oils', color: '#F2814B', parent: 'mercearia' },
  { key: 'conservas', namePt: 'Conservas', nameEn: 'Tinned Goods', color: '#7C4DFF', parent: 'mercearia' },

  { key: 'frescos', namePt: 'Frescos', nameEn: 'Fresh', color: '#16A34A' },
  { key: 'frutas', namePt: 'Frutas', nameEn: 'Fruit', color: '#16A34A', parent: 'frescos' },
  { key: 'legumes', namePt: 'Legumes', nameEn: 'Vegetables', color: '#0E9F9F', parent: 'frescos' },
  { key: 'talho', namePt: 'Talho', nameEn: 'Butcher', color: '#A8213C', parent: 'frescos' },
  { key: 'peixaria', namePt: 'Peixaria', nameEn: 'Fishmonger', color: '#2F80ED', parent: 'frescos' },

  { key: 'padaria', namePt: 'Padaria', nameEn: 'Bakery', color: '#F2814B' },
  { key: 'laticinios', namePt: 'Laticinios', nameEn: 'Dairy', color: '#D6499B' },
  { key: 'limpeza', namePt: 'Limpeza', nameEn: 'Cleaning', color: '#2F80ED' },
  { key: 'higiene', namePt: 'Higiene', nameEn: 'Personal Care', color: '#7C4DFF' },
  { key: 'vestuario', namePt: 'Vestuario', nameEn: 'Clothing', color: '#5B6B7C' },
];

export interface SupplierSeed {
  key: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  nif: string;
  paymentTerms: string;
  notes?: string;
}

export const RETAIL_SUPPLIERS: SupplierSeed[] = [
  {
    key: 'bebidas',
    name: 'Distribuidora Angolana de Bebidas, Lda',
    contactName: 'Joaquim Ferreira',
    phone: '+244 923 114 220',
    email: 'encomendas@dab.co.ao',
    address: 'Rua Che Guevara 145, Maianga, Luanda',
    nif: '5401118820',
    paymentTerms: '30 dias',
    notes: 'Entrega as tercas e sextas de manha.',
  },
  {
    key: 'mercearia',
    name: 'Grupo Mercantil Luanda, SA',
    contactName: 'Maria Domingos',
    phone: '+244 912 776 431',
    email: 'comercial@gml.ao',
    address: 'Zona Industrial do Cazenga, Luanda',
    nif: '5417009912',
    paymentTerms: '45 dias',
    notes: 'Desconto de 3% acima de 5 000 000 Kz por encomenda.',
  },
  {
    key: 'frescos',
    name: 'Frescos do Kwanza, Lda',
    contactName: 'Paulo Kiala',
    phone: '+244 931 204 887',
    email: 'paulo.kiala@frescoskwanza.ao',
    address: 'Mercado do Kicolo, Cacuaco, Luanda',
    nif: '5400772315',
    paymentTerms: 'Pronto pagamento',
    notes: 'Fruta e legumes entregues diariamente as 05:00.',
  },
];

export interface ItemSeed {
  name: string;
  category: string;
  supplier: string;
  /** Sale price in whole Kwanza (converted to centimos by kz()). */
  priceKz: number;
  taxRateBps?: number;
  unit?: Unit;
  weighted?: boolean;
  tile?: string;
  quick?: boolean;
  /** Relative likelihood of landing in a basket; 1 is the norm. */
  pop?: number;
  /** Deliberately thin stock so the reorder report has something to flag. */
  low?: boolean;
}

export const RETAIL_ITEMS: ItemSeed[] = [
  /* -- Bebidas / Refrigerantes -------------------------------------------- */
  { name: 'Coca-Cola Lata 330ml', category: 'refrigerantes', supplier: 'bebidas', priceKz: 450, pop: 6, quick: true, tile: '#E0364A' },
  { name: 'Coca-Cola 1.5L', category: 'refrigerantes', supplier: 'bebidas', priceKz: 1200, pop: 4 },
  { name: 'Coca-Cola Zero Lata 330ml', category: 'refrigerantes', supplier: 'bebidas', priceKz: 450, pop: 2 },
  { name: 'Fanta Laranja Lata 330ml', category: 'refrigerantes', supplier: 'bebidas', priceKz: 450, pop: 3 },
  { name: 'Sprite Lata 330ml', category: 'refrigerantes', supplier: 'bebidas', priceKz: 450, pop: 2 },
  { name: 'Sumol Ananas 330ml', category: 'refrigerantes', supplier: 'bebidas', priceKz: 500, pop: 3 },
  { name: 'Compal Manga 1L', category: 'refrigerantes', supplier: 'bebidas', priceKz: 1100, pop: 2 },
  { name: 'Red Bull 250ml', category: 'refrigerantes', supplier: 'bebidas', priceKz: 1500, pop: 1 },

  /* -- Bebidas / Aguas ----------------------------------------------------- */
  { name: 'Agua Pura 1.5L', category: 'aguas', supplier: 'bebidas', priceKz: 350, pop: 8, quick: true, tile: '#0E9F9F' },
  { name: 'Agua Pura 0.5L', category: 'aguas', supplier: 'bebidas', priceKz: 200, pop: 6 },
  { name: 'Agua Pedras 1L', category: 'aguas', supplier: 'bebidas', priceKz: 900, pop: 1 },
  { name: 'Agua Bela 5L', category: 'aguas', supplier: 'bebidas', priceKz: 1500, pop: 2 },

  /* -- Bebidas / Cervejas -------------------------------------------------- */
  { name: 'Cerveja Cuca 330ml', category: 'cervejas', supplier: 'bebidas', priceKz: 400, pop: 9, quick: true, tile: '#F2814B' },
  { name: 'Cerveja Cuca Lata 330ml', category: 'cervejas', supplier: 'bebidas', priceKz: 450, pop: 5 },
  { name: "Cerveja N'Gola 330ml", category: 'cervejas', supplier: 'bebidas', priceKz: 400, pop: 4 },
  { name: 'Cerveja Eka 330ml', category: 'cervejas', supplier: 'bebidas', priceKz: 400, pop: 3 },
  { name: 'Cerveja Heineken 330ml', category: 'cervejas', supplier: 'bebidas', priceKz: 750, pop: 2 },
  { name: 'Grade Cuca 24x330ml', category: 'cervejas', supplier: 'bebidas', priceKz: 8500, pop: 1 },

  /* -- Bebidas / Vinhos ---------------------------------------------------- */
  { name: 'Vinho Verde Casal Garcia 750ml', category: 'vinhos', supplier: 'bebidas', priceKz: 3500, pop: 1 },
  { name: 'Vinho Tinto Periquita 750ml', category: 'vinhos', supplier: 'bebidas', priceKz: 4500, pop: 1 },
  { name: 'Vinho Branco Gazela 750ml', category: 'vinhos', supplier: 'bebidas', priceKz: 3200, pop: 1 },
  { name: 'Vinho do Porto Ferreira 750ml', category: 'vinhos', supplier: 'bebidas', priceKz: 7800, pop: 1 },

  /* -- Mercearia / Massas -------------------------------------------------- */
  { name: 'Esparguete Milaneza 500g', category: 'massas', supplier: 'mercearia', priceKz: 700, taxRateBps: 700, pop: 5 },
  { name: 'Macarrao Cotovelo 500g', category: 'massas', supplier: 'mercearia', priceKz: 650, taxRateBps: 700, pop: 4 },
  { name: 'Massa Parafuso 500g', category: 'massas', supplier: 'mercearia', priceKz: 700, taxRateBps: 700, pop: 3 },

  /* -- Mercearia / Arroz --------------------------------------------------- */
  { name: 'Arroz Agulha 1kg', category: 'arroz', supplier: 'mercearia', priceKz: 1200, taxRateBps: 700, pop: 9, quick: true, tile: '#5B6B7C' },
  { name: 'Arroz Agulha 5kg', category: 'arroz', supplier: 'mercearia', priceKz: 5500, taxRateBps: 700, pop: 3 },
  { name: 'Arroz Basmati 1kg', category: 'arroz', supplier: 'mercearia', priceKz: 2500, taxRateBps: 700, pop: 1 },

  /* -- Mercearia / Oleos --------------------------------------------------- */
  { name: 'Oleo de Palma 1L', category: 'oleos', supplier: 'mercearia', priceKz: 2500, taxRateBps: 700, pop: 6, quick: true, tile: '#F2814B' },
  { name: 'Oleo de Girassol 1L', category: 'oleos', supplier: 'mercearia', priceKz: 1800, taxRateBps: 700, pop: 5 },
  { name: 'Oleo Alimentar 5L', category: 'oleos', supplier: 'mercearia', priceKz: 8500, taxRateBps: 700, pop: 2 },
  { name: 'Azeite Extra Virgem 750ml', category: 'oleos', supplier: 'mercearia', priceKz: 6500, pop: 1 },

  /* -- Mercearia / Conservas ----------------------------------------------- */
  { name: 'Atum em Oleo 120g', category: 'conservas', supplier: 'mercearia', priceKz: 850, pop: 6 },
  { name: 'Sardinha em Tomate 125g', category: 'conservas', supplier: 'mercearia', priceKz: 700, pop: 5 },
  { name: 'Feijao Cozido 400g', category: 'conservas', supplier: 'mercearia', priceKz: 900, pop: 3 },
  { name: 'Ervilhas em Conserva 400g', category: 'conservas', supplier: 'mercearia', priceKz: 850, pop: 2 },
  { name: 'Tomate Pelado 400g', category: 'conservas', supplier: 'mercearia', priceKz: 800, pop: 3 },

  /* -- Mercearia ----------------------------------------------------------- */
  { name: 'Fuba de Milho 1kg', category: 'mercearia', supplier: 'mercearia', priceKz: 900, taxRateBps: 700, pop: 8, quick: true, tile: '#F2814B' },
  { name: 'Farinha de Bombo 1kg', category: 'mercearia', supplier: 'mercearia', priceKz: 1000, taxRateBps: 700, pop: 6 },
  { name: 'Feijao Catarino 1kg', category: 'mercearia', supplier: 'mercearia', priceKz: 1800, taxRateBps: 700, pop: 5 },
  { name: 'Acucar Branco 1kg', category: 'mercearia', supplier: 'mercearia', priceKz: 1100, taxRateBps: 700, pop: 6 },
  { name: 'Sal Refinado 1kg', category: 'mercearia', supplier: 'mercearia', priceKz: 350, taxRateBps: 700, pop: 4 },
  { name: 'Farinha de Trigo 1kg', category: 'mercearia', supplier: 'mercearia', priceKz: 950, taxRateBps: 700, pop: 4 },
  { name: 'Massa de Tomate 70g', category: 'mercearia', supplier: 'mercearia', priceKz: 300, pop: 5 },
  { name: 'Cafe Ginga Moido 250g', category: 'mercearia', supplier: 'mercearia', priceKz: 2200, pop: 2 },

  /* -- Frescos (pesados) --------------------------------------------------- */
  { name: 'Banana', category: 'frutas', supplier: 'frescos', priceKz: 800, taxRateBps: 0, weighted: true, quick: true, tile: '#16A34A', pop: 7 },
  { name: 'Maca Golden', category: 'frutas', supplier: 'frescos', priceKz: 2200, taxRateBps: 0, weighted: true, quick: true, tile: '#E0364A', pop: 4 },
  { name: 'Laranja', category: 'frutas', supplier: 'frescos', priceKz: 1200, taxRateBps: 0, weighted: true, quick: true, tile: '#F2814B', pop: 5 },
  { name: 'Abacaxi', category: 'frutas', supplier: 'frescos', priceKz: 1500, taxRateBps: 0, weighted: true, quick: true, tile: '#D6499B', pop: 2 },
  { name: 'Tomate', category: 'legumes', supplier: 'frescos', priceKz: 1500, taxRateBps: 0, weighted: true, quick: true, tile: '#E0364A', pop: 7 },
  { name: 'Cebola', category: 'legumes', supplier: 'frescos', priceKz: 1100, taxRateBps: 0, weighted: true, quick: true, tile: '#7C4DFF', pop: 6 },
  { name: 'Batata', category: 'legumes', supplier: 'frescos', priceKz: 1300, taxRateBps: 0, weighted: true, quick: true, tile: '#5B6B7C', pop: 6 },
  { name: 'Batata Doce', category: 'legumes', supplier: 'frescos', priceKz: 900, taxRateBps: 0, weighted: true, quick: true, tile: '#F2814B', pop: 3 },
  { name: 'Carne de Vaca', category: 'talho', supplier: 'frescos', priceKz: 6500, taxRateBps: 0, weighted: true, quick: true, tile: '#A8213C', pop: 4 },
  { name: 'Frango Inteiro', category: 'talho', supplier: 'frescos', priceKz: 3200, taxRateBps: 0, weighted: true, quick: true, tile: '#EF5B5B', pop: 5 },
  { name: 'Peixe Carapau', category: 'peixaria', supplier: 'frescos', priceKz: 2800, taxRateBps: 0, weighted: true, quick: true, tile: '#2F80ED', pop: 5 },

  /* -- Padaria ------------------------------------------------------------- */
  { name: 'Pao de Forma 500g', category: 'padaria', supplier: 'frescos', priceKz: 1500, taxRateBps: 700, pop: 6, quick: true, tile: '#F2814B' },
  { name: 'Pao Frances', category: 'padaria', supplier: 'frescos', priceKz: 100, taxRateBps: 700, pop: 10, quick: true, tile: '#EF5B5B' },
  { name: 'Croissant', category: 'padaria', supplier: 'frescos', priceKz: 450, pop: 4 },
  { name: 'Pao de Leite 6un', category: 'padaria', supplier: 'frescos', priceKz: 1200, taxRateBps: 700, pop: 3 },
  { name: 'Bolo de Chocolate Fatia', category: 'padaria', supplier: 'frescos', priceKz: 900, pop: 2 },

  /* -- Laticinios ---------------------------------------------------------- */
  { name: 'Leite Nido 400g', category: 'laticinios', supplier: 'mercearia', priceKz: 4500, taxRateBps: 700, pop: 6, quick: true, tile: '#D6499B' },
  { name: 'Leite Nido 900g', category: 'laticinios', supplier: 'mercearia', priceKz: 9000, taxRateBps: 700, pop: 3 },
  { name: 'Leite UHT Meio Gordo 1L', category: 'laticinios', supplier: 'mercearia', priceKz: 1200, taxRateBps: 700, pop: 6 },
  { name: 'Iogurte Natural 4x125g', category: 'laticinios', supplier: 'frescos', priceKz: 1600, pop: 3 },
  { name: 'Queijo Flamengo Fatiado 200g', category: 'laticinios', supplier: 'frescos', priceKz: 2800, pop: 3, low: true },
  { name: 'Manteiga Mimosa 250g', category: 'laticinios', supplier: 'frescos', priceKz: 2500, pop: 2 },
  { name: 'Ovos Frescos Duzia', category: 'laticinios', supplier: 'frescos', priceKz: 2200, taxRateBps: 0, pop: 5 },

  /* -- Limpeza ------------------------------------------------------------- */
  { name: 'Sabao Omo 1kg', category: 'limpeza', supplier: 'mercearia', priceKz: 2800, pop: 5, quick: true, tile: '#2F80ED' },
  { name: 'Detergente Loica Fairy 1L', category: 'limpeza', supplier: 'mercearia', priceKz: 1500, pop: 4 },
  { name: 'Lixivia 2L', category: 'limpeza', supplier: 'mercearia', priceKz: 900, pop: 4 },
  { name: 'Papel Higienico 4 rolos', category: 'limpeza', supplier: 'mercearia', priceKz: 1400, pop: 5 },
  { name: 'Esfregao Multiusos', category: 'limpeza', supplier: 'mercearia', priceKz: 400, pop: 3, low: true },

  /* -- Higiene ------------------------------------------------------------- */
  { name: 'Pasta de Dentes Colgate 100ml', category: 'higiene', supplier: 'mercearia', priceKz: 1200, pop: 4 },
  { name: 'Sabonete Protex', category: 'higiene', supplier: 'mercearia', priceKz: 600, pop: 5 },
  { name: 'Shampoo Palmolive 350ml', category: 'higiene', supplier: 'mercearia', priceKz: 2200, pop: 2 },
  { name: 'Desodorizante Rexona 150ml', category: 'higiene', supplier: 'mercearia', priceKz: 2500, pop: 2 },
  { name: 'Fralda Pampers M 30un', category: 'higiene', supplier: 'mercearia', priceKz: 8500, pop: 2, low: true },
];

/** Angolan names for the demo customer book. */
export const CUSTOMER_NAMES: string[] = [
  'Ana Cristina Pereira',
  'Joao Baptista Mendes',
  'Maria de Fatima Silva',
  'Domingos Kiala Nzuzi',
  'Esperanca Manuel Gomes',
  'Paulo Roberto Cardoso',
  'Isabel Nascimento Costa',
  'Antonio Kudissanga Neto',
  'Luisa Cabral Fernandes',
  'Manuel dos Santos Vieira',
  'Teresa Bengui Lourenco',
  'Carlos Alberto Muanda',
  'Joana Mateus Quissanga',
  'Fernando Kapata Sebastiao',
  'Rosa Domingas Andre',
  'Jose Eduardo Cassoma',
  'Marta Sofia Ribeiro',
  'Adao Francisco Tchivela',
  'Celestina Nzinga Bento',
  'Rui Miguel Almeida',
  'Beatriz Kambua Diogo',
  'Nelson Kiluanje Pinto',
  'Sonia Patricia Morais',
  'Edgar Bamba Teixeira',
  'Julieta Ndala Chimuco',
];

export const LUANDA_STREETS: string[] = [
  'Rua Amilcar Cabral',
  'Avenida Deolinda Rodrigues',
  'Rua Rainha Ginga',
  'Largo do Kinaxixi',
  'Avenida Revolucao de Outubro',
  'Rua Comandante Gika',
  'Bairro Talatona, Rua 12',
  'Avenida 21 de Janeiro',
  'Rua Nossa Senhora da Muxima',
  'Bairro Alvalade, Rua Che Guevara',
];
