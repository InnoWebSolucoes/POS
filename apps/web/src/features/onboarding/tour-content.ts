import {
  Banknote,
  ChefHat,
  Globe,
  LayoutGrid,
  PackageCheck,
  ReceiptText,
  Scale,
  ScanBarcode,
  Send,
  Settings2,
  Store,
  Truck,
  TrendingUp,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { EntityMode, Permission } from '@pos/shared';

/**
 * The reference someone opens when they are stuck.
 *
 * Deliberately NOT a wizard. A forced sequence of overlays is fine in a demo
 * and awful at 11:40 on a Saturday with four people at the till - it steals the
 * screen from someone who is mid-shift and has already learnt the answer. So
 * this is a short list of cards, each one a job the product actually does, with
 * a button that opens the real screen.
 *
 * Every card is written the way the owner would describe the job to a new
 * employee: what it is, what happens, and nothing about how it is implemented.
 */

export interface TourCard {
  key: string;
  /** The job, as a person would say it out loud. */
  title: string;
  /** Two sentences. The first says what it is, the second what actually happens. */
  body: [string, string];
  /** Where the job is done. Must resolve in App.tsx's route table. */
  to: string;
  cta: string;
  icon: LucideIcon;
  /**
   * Every one of these is required to see the card. A card whose button lands
   * on a redirect is worse than no card - it reads as the product being broken.
   */
  requires: Permission[];
  /** Renders the register's key hint under the body, where it belongs. */
  showScanHint?: boolean;
}

export interface TourSection {
  key: string;
  title: string;
  cards: TourCard[];
}

/* -------------------------------------------------------------------------- */
/* Retail                                                                      */
/* -------------------------------------------------------------------------- */

const RETAIL: TourCard[] = [
  {
    key: 'scan',
    title: 'Leia o codigo de barras e o artigo entra na venda',
    body: [
      'A caixa esta sempre a ouvir o leitor, mesmo que o ultimo toque tenha sido noutro sitio do ecra.',
      'Passe o leitor pelo codigo do artigo e ele entra na venda com o preco certo, sem escrever nada.',
    ],
    to: '/pos',
    cta: 'Abrir caixa',
    icon: ScanBarcode,
    requires: ['sale:create'],
    showScanHint: true,
  },
  {
    key: 'weighed',
    title: 'Produtos ao peso',
    body: [
      'Um artigo marcado como venda ao peso pede a quantidade em quilos antes de entrar na venda.',
      'Se a balanca imprimir etiqueta com codigo de barras, a leitura ja traz o peso e o preco calculados.',
    ],
    to: '/produtos',
    cta: 'Ver produtos',
    icon: Scale,
    requires: ['product:read'],
  },
  {
    key: 'tender',
    title: 'Receber pagamento e dividir entre metodos',
    body: [
      'No fim da venda escolha como o cliente paga: numerario, Multicaixa, transferencia ou credito de loja.',
      'Pode juntar varios metodos na mesma venda e o troco do numerario aparece calculado.',
    ],
    to: '/pos',
    cta: 'Abrir caixa',
    icon: Banknote,
    requires: ['sale:create'],
  },
  {
    key: 'profit',
    title: 'Ver o lucro do dia',
    body: [
      'Vender muito e ganhar pouco e a surpresa mais cara que ha, por isso o lucro tem um ecra proprio.',
      'Os resultados mostram quanto vendeu, quanto custou a mercadoria e o que sobrou, no periodo que escolher.',
    ],
    to: '/relatorios/resultados',
    cta: 'Abrir resultados',
    icon: TrendingUp,
    requires: ['report:financial'],
  },
];

/* -------------------------------------------------------------------------- */
/* Restaurant                                                                  */
/* -------------------------------------------------------------------------- */

const RESTAURANT: TourCard[] = [
  {
    key: 'open-table',
    title: 'Abrir uma mesa no plano de sala',
    body: [
      'O plano de sala mostra as mesas na mesma posicao em que estao na sala, com a cor a dizer o estado.',
      'Toque numa mesa livre para a abrir e o pedido comeca vazio, pronto a receber os pratos.',
    ],
    to: '/restaurante/sala',
    cta: 'Abrir plano de sala',
    icon: LayoutGrid,
    requires: ['restaurant:table'],
  },
  {
    key: 'add-items',
    title: 'Adicionar pratos e opcoes',
    body: [
      'Dentro da mesa escolha os pratos pelo menu, agrupados tal como estao na carta.',
      'Quando um prato tem escolhas - ponto da carne, acompanhamento, sem cebola - o sistema pergunta antes de o juntar.',
    ],
    to: '/restaurante/sala',
    cta: 'Abrir plano de sala',
    icon: UtensilsCrossed,
    requires: ['restaurant:order'],
  },
  {
    key: 'send',
    title: 'Enviar para a cozinha',
    body: [
      'Os pratos ficam por enviar ate carregar em enviar, para poder corrigir um engano antes de a cozinha o ver.',
      'Depois de enviados aparecem no ecra da cozinha por ordem de chegada e a mesa fica a saber quando estao prontos.',
    ],
    to: '/restaurante/pedidos',
    cta: 'Ver pedidos abertos',
    icon: Send,
    requires: ['restaurant:order'],
  },
  {
    key: 'kitchen',
    title: 'O ecra da cozinha',
    body: [
      'Cada pedido enviado vira um talao no ecra da cozinha, com o tempo a contar desde que entrou.',
      'A cozinha marca o talao como pronto e a sala ve logo que o prato pode sair.',
    ],
    to: '/kds',
    cta: 'Abrir ecra de cozinha',
    icon: ChefHat,
    requires: ['restaurant:kds'],
  },
  {
    key: 'bill',
    title: 'Fechar e dividir a conta',
    body: [
      'Ao fechar a mesa aparece o total da conta com tudo o que foi servido.',
      'Pode dividir por pessoa ou por artigo e receber cada parte com o metodo que cada cliente quiser.',
    ],
    to: '/restaurante/sala',
    cta: 'Abrir plano de sala',
    icon: ReceiptText,
    requires: ['restaurant:bill'],
  },
];

/* -------------------------------------------------------------------------- */
/* Online store                                                                */
/* -------------------------------------------------------------------------- */

const ONLINE: TourCard[] = [
  {
    key: 'publish',
    title: 'Publicar um produto na loja',
    body: [
      'Um produto so aparece na loja online depois de o publicar, por isso pode preparar o catalogo com calma.',
      'Abra o produto, ligue a venda online, confirme a foto e o preco, e guarde.',
    ],
    to: '/produtos?online=true',
    cta: 'Ver produtos da loja',
    icon: Globe,
    requires: ['product:write'],
  },
  {
    key: 'receive-order',
    title: 'Receber uma encomenda',
    body: [
      'As encomendas novas entram na lista e avisam o tablet mal o cliente termine a compra.',
      'Abra a encomenda para ver os artigos, a morada de entrega e como foi paga.',
    ],
    to: '/loja-online/encomendas',
    cta: 'Ver encomendas',
    icon: PackageCheck,
    requires: ['online:order:read'],
  },
  {
    key: 'ship',
    title: 'Expedir e notificar o cliente',
    body: [
      'Quando a encomenda sai, mude o estado para expedida - o stock ja foi descontado na confirmacao.',
      'O cliente e avisado da mudanca e pode acompanhar o estado pelo numero da encomenda.',
    ],
    to: '/loja-online/encomendas',
    cta: 'Ver encomendas',
    icon: Truck,
    requires: ['online:order:write'],
  },
];

/* -------------------------------------------------------------------------- */
/* Everything else, whatever the business sells                                */
/* -------------------------------------------------------------------------- */

const COMMON: TourCard[] = [
  {
    key: 'receive-stock',
    title: 'Dar entrada de mercadoria',
    body: [
      'Sempre que chega mercadoria, de entrada com as quantidades e o custo que pagou.',
      'E dai que sai o stock que a caixa desconta e a margem que os relatorios mostram.',
    ],
    to: '/stock/entrada',
    cta: 'Dar entrada',
    icon: PackageCheck,
    requires: ['inventory:receive'],
  },
  {
    key: 'people',
    title: 'Escolher o que cada pessoa ve',
    body: [
      'Cada pessoa da equipa entra com a sua conta e so ve os ecras do seu trabalho.',
      'O perfil e apenas o ponto de partida: pode ajustar pessoa a pessoa, por exemplo esconder os lucros de quem esta na caixa.',
    ],
    to: '/utilizadores',
    cta: 'Abrir equipa',
    icon: Users,
    requires: ['user:write'],
  },
  {
    key: 'settings',
    title: 'Precos, IVA e recibo',
    body: [
      'As definicoes do negocio decidem o que sai impresso no recibo e como o IVA e calculado.',
      'Comece pelo nome, NIF e moeda - e o que os seus clientes vao ver em cada compra.',
    ],
    to: '/definicoes',
    cta: 'Abrir definicoes',
    icon: Settings2,
    requires: ['settings:write'],
  },
];

const BY_MODE: Record<EntityMode, { title: string; cards: TourCard[] }> = {
  retail: { title: 'Vender na loja', cards: RETAIL },
  restaurant: { title: 'Servir a sala', cards: RESTAURANT },
  online: { title: 'Vender online', cards: ONLINE },
};

const FALLBACK: TourCard = {
  key: 'fallback',
  title: 'Comece pelo seu negocio',
  body: [
    'Ainda nao ha nada aqui a que tenha acesso, o que normalmente quer dizer que a conta acabou de ser criada.',
    'Abra as definicoes do negocio ou fale com quem administra a conta para lhe dar acesso.',
  ],
  to: '/definicoes',
  cta: 'Abrir definicoes',
  icon: Store,
  requires: ['settings:read'],
};

/**
 * The cards this member should actually see, in reading order.
 *
 * Mode first, because that is the job they were hired to do, then the handful
 * of cards that apply to every business. A card the member cannot reach is
 * dropped rather than disabled: a greyed-out row invites a tap and teaches
 * nothing.
 */
export function tourSections(
  mode: EntityMode | null,
  can: (permission: Permission) => boolean,
): TourSection[] {
  const allowed = (cards: TourCard[]) =>
    cards.filter((card) => card.requires.every((permission) => can(permission)));

  const sections: TourSection[] = [];

  if (mode) {
    const group = BY_MODE[mode];
    const cards = allowed(group.cards);
    if (cards.length > 0) sections.push({ key: `mode-${mode}`, title: group.title, cards });
  }

  const common = allowed(COMMON);
  if (common.length > 0) sections.push({ key: 'common', title: 'Manter o negocio a andar', cards: common });

  if (sections.length === 0) {
    const cards = allowed([FALLBACK]);
    sections.push({
      key: 'fallback',
      title: 'Por onde comecar',
      cards: cards.length > 0 ? cards : [{ ...FALLBACK, requires: [] }],
    });
  }

  return sections;
}
