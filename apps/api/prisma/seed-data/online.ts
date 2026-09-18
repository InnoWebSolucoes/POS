import type { Prisma } from '@prisma/client';
import {
  makeEan13,
  type OnlineOrderStatus,
  type PaymentGateway,
  type Unit,
} from '@pos/shared';
import { setSettings } from '../../src/lib/settings.js';
import { addCounts, seedSequences, type Counts, type EntityBundle, type SeedContext } from './common.js';
import {
  atTime,
  computeSeedSale,
  daysAgo,
  documentNumber,
  id,
  kz,
  money,
  slugify,
} from './helpers.js';
import { writeSeedImage } from './images.js';
import { SeedLedger } from './stock.js';
import type { SeededUser } from './users.js';

/**
 * Loja Online Ginga: a storefront catalogue with descriptions, slugs and more
 * than one image per product, plus orders sitting at every step of the
 * fulfilment lifecycle.
 */

interface OnlineItemSeed {
  name: string;
  category: string;
  priceKz: number;
  description: string;
  unit?: Unit;
  weightGrams?: number;
  tile: string;
}

const ONLINE_CATEGORIES: Array<{ key: string; namePt: string; nameEn: string; color: string }> = [
  { key: 'moda', namePt: 'Moda', nameEn: 'Fashion', color: '#D6499B' },
  { key: 'electronica', namePt: 'Electronica', nameEn: 'Electronics', color: '#2F80ED' },
  { key: 'casa', namePt: 'Casa e Cozinha', nameEn: 'Home & Kitchen', color: '#F2814B' },
  { key: 'beleza', namePt: 'Beleza', nameEn: 'Beauty', color: '#7C4DFF' },
  { key: 'mercearia', namePt: 'Mercearia', nameEn: 'Grocery', color: '#16A34A' },
];

const ONLINE_ITEMS: OnlineItemSeed[] = [
  { name: 'Camisa de Linho Branca', category: 'moda', priceKz: 12500, description: 'Camisa de linho leve, ideal para o calor de Luanda. Corte regular.', weightGrams: 300, tile: '#D6499B' },
  { name: 'Vestido Estampado Ginga', category: 'moda', priceKz: 18900, description: 'Vestido midi com estampado inspirado nos tecidos tradicionais angolanos.', weightGrams: 400, tile: '#A8213C' },
  { name: 'Calcas de Ganga Slim', category: 'moda', priceKz: 15500, description: 'Ganga elastica de cinco bolsos, lavagem escura.', weightGrams: 600, tile: '#2F80ED' },
  { name: 'T-Shirt Algodao Preta', category: 'moda', priceKz: 6500, description: 'Algodao penteado 180g, gola redonda reforcada.', weightGrams: 220, tile: '#5B6B7C' },
  { name: 'Sapatilhas Urbanas', category: 'moda', priceKz: 28500, description: 'Sapatilhas leves com sola de borracha antiderrapante.', weightGrams: 900, tile: '#EF5B5B' },
  { name: 'Bolsa de Pano Capulana', category: 'moda', priceKz: 9500, description: 'Bolsa feita a mao com tecido capulana e forro interior.', weightGrams: 350, tile: '#F2814B' },
  { name: 'Chapeu de Palha', category: 'moda', priceKz: 5500, description: 'Chapeu de palha natural com fita de algodao.', weightGrams: 180, tile: '#F2814B' },
  { name: 'Cinto de Pele Castanho', category: 'moda', priceKz: 7800, description: 'Pele genuina com fivela em metal escovado.', weightGrams: 250, tile: '#A8213C' },

  { name: 'Auscultadores Bluetooth', category: 'electronica', priceKz: 32500, description: 'Auscultadores sem fios com 30 horas de autonomia e estojo de carregamento.', weightGrams: 280, tile: '#2F80ED' },
  { name: 'Coluna Portatil 20W', category: 'electronica', priceKz: 24900, description: 'Coluna resistente a agua, bluetooth 5.3, 12 horas de musica.', weightGrams: 650, tile: '#0E9F9F' },
  { name: 'Powerbank 20000mAh', category: 'electronica', priceKz: 18500, description: 'Carrega um telemovel quatro vezes, com duas portas USB e USB-C.', weightGrams: 420, tile: '#5B6B7C' },
  { name: 'Carregador Rapido 65W', category: 'electronica', priceKz: 11500, description: 'Carregador GaN compacto com tres portas.', weightGrams: 150, tile: '#7C4DFF' },
  { name: 'Rato Sem Fios', category: 'electronica', priceKz: 8500, description: 'Rato silencioso de 2.4 GHz com autonomia de 12 meses.', weightGrams: 120, tile: '#2F80ED' },
  { name: 'Teclado Compacto', category: 'electronica', priceKz: 16500, description: 'Teclado 75% com layout portugues e retroiluminacao branca.', weightGrams: 700, tile: '#5B6B7C' },
  { name: 'Cabo USB-C 2m', category: 'electronica', priceKz: 3500, description: 'Cabo trancado com suporte a carregamento rapido de 100W.', weightGrams: 90, tile: '#0E9F9F' },
  { name: 'Suporte de Telemovel', category: 'electronica', priceKz: 4500, description: 'Suporte de secretaria em aluminio, angulo ajustavel.', weightGrams: 200, tile: '#5B6B7C' },

  { name: 'Panela de Pressao 6L', category: 'casa', priceKz: 34500, description: 'Aco inoxidavel com valvula de seguranca dupla. Serve seis pessoas.', weightGrams: 3200, tile: '#F2814B' },
  { name: 'Jogo de Facas 6 Pecas', category: 'casa', priceKz: 21500, description: 'Laminas de aco alemao com suporte de madeira.', weightGrams: 1800, tile: '#A8213C' },
  { name: 'Liquidificadora 800W', category: 'casa', priceKz: 28900, description: 'Copo de vidro de 1.5L e quatro velocidades.', weightGrams: 2600, tile: '#EF5B5B' },
  { name: 'Conjunto de Toalhas', category: 'casa', priceKz: 12500, description: 'Tres toalhas de algodao egipcio 500g/m2.', weightGrams: 1400, tile: '#0E9F9F' },
  { name: 'Garrafa Termica 1L', category: 'casa', priceKz: 9800, description: 'Mantem quente 12 horas e frio 24 horas.', weightGrams: 500, tile: '#2F80ED' },
  { name: 'Candeeiro de Mesa LED', category: 'casa', priceKz: 14500, description: 'Tres temperaturas de luz e porta USB integrada.', weightGrams: 800, tile: '#F2814B' },
  { name: 'Tabuleiro de Servir Madeira', category: 'casa', priceKz: 7500, description: 'Madeira de acacia tratada, com pegas laterais.', weightGrams: 900, tile: '#F2814B' },

  { name: 'Creme Hidratante Corporal', category: 'beleza', priceKz: 6500, description: 'Manteiga de karite e oleo de coco, 400ml.', weightGrams: 450, tile: '#D6499B' },
  { name: 'Oleo de Cabelo Natural', category: 'beleza', priceKz: 5500, description: 'Mistura de oleo de ricino e argan para cabelo crespo.', weightGrams: 220, tile: '#7C4DFF' },
  { name: 'Perfume Ginga 100ml', category: 'beleza', priceKz: 42500, description: 'Notas de citrinos, jasmim e madeira. Edicao Luanda.', weightGrams: 380, tile: '#A8213C' },
  { name: 'Kit Barba Completo', category: 'beleza', priceKz: 15500, description: 'Oleo, balsamo, pente e tesoura numa caixa de oferta.', weightGrams: 600, tile: '#5B6B7C' },
  { name: 'Protector Solar FPS50', category: 'beleza', priceKz: 8900, description: 'Textura leve, resistente a agua, 200ml.', weightGrams: 240, tile: '#F2814B' },

  { name: 'Cafe Ginga Grao 1kg', category: 'mercearia', priceKz: 9500, description: 'Cafe arabica de Angola torrado em pequenos lotes.', weightGrams: 1000, tile: '#A8213C' },
  { name: 'Mel Natural do Huambo 500g', category: 'mercearia', priceKz: 7800, description: 'Mel cru de produtores do planalto central.', weightGrams: 520, tile: '#F2814B' },
  { name: 'Cesta Gourmet Angolana', category: 'mercearia', priceKz: 45000, description: 'Cafe, mel, cocada, gindungo e compotas numa cesta de oferta.', weightGrams: 3000, tile: '#16A34A' },
];

const SHIPPING_TARGETS: Array<{
  name: string;
  phone: string;
  line1: string;
  city: string;
  province: string;
}> = [
  { name: 'Ana Cristina Pereira', phone: '+244 923 445 118', line1: 'Rua Rainha Ginga 87, 3 Dto', city: 'Luanda', province: 'Luanda' },
  { name: 'Nelson Kiluanje Pinto', phone: '+244 912 007 665', line1: 'Condominio Talatona Park, Bloco C', city: 'Luanda', province: 'Luanda' },
  { name: 'Marta Sofia Ribeiro', phone: '+244 935 221 904', line1: 'Avenida 4 de Fevereiro 210', city: 'Benguela', province: 'Benguela' },
  { name: 'Edgar Bamba Teixeira', phone: '+244 924 778 310', line1: 'Bairro Compao, Rua 7', city: 'Benguela', province: 'Benguela' },
  { name: 'Beatriz Kambua Diogo', phone: '+244 991 336 208', line1: 'Rua Che Guevara 45, Alvalade', city: 'Luanda', province: 'Luanda' },
  { name: 'Rui Miguel Almeida', phone: '+244 926 884 512', line1: 'Largo do Kinaxixi 12', city: 'Luanda', province: 'Luanda' },
];

const ORDER_PLAN: Array<{
  status: OnlineOrderStatus;
  gateway: PaymentGateway;
  fulfilment: 'delivery' | 'pickup';
  daysAgo: number;
  guest?: boolean;
}> = [
  { status: 'pending', gateway: 'multicaixa_express', fulfilment: 'delivery', daysAgo: 0 },
  { status: 'pending', gateway: 'bank_transfer', fulfilment: 'pickup', daysAgo: 1, guest: true },
  { status: 'processing', gateway: 'multicaixa_express', fulfilment: 'delivery', daysAgo: 2 },
  { status: 'processing', gateway: 'stripe', fulfilment: 'delivery', daysAgo: 3 },
  { status: 'shipped', gateway: 'multicaixa_express', fulfilment: 'delivery', daysAgo: 6 },
  { status: 'shipped', gateway: 'cash_on_delivery', fulfilment: 'delivery', daysAgo: 8, guest: true },
  { status: 'delivered', gateway: 'paypal', fulfilment: 'delivery', daysAgo: 14 },
  { status: 'delivered', gateway: 'multicaixa_express', fulfilment: 'pickup', daysAgo: 21 },
];

interface OnlineProduct {
  id: string;
  name: string;
  priceMinor: number;
  costMinor: number;
  taxRateBps: number;
}

export async function seedOnline(ctx: SeedContext, bundle: EntityBundle): Promise<Counts> {
  const { client, rng, now } = ctx;
  const entityId = bundle.id;
  const warehouse = bundle.locations[0] as { id: string; name: string };
  const stockClerk = bundle.users.get('stock') as SeededUser;

  /* -- Catalogue ------------------------------------------------------------ */
  const categoryIds = new Map<string, string>();
  for (const category of ONLINE_CATEGORIES) categoryIds.set(category.key, id());

  await client.category.createMany({
    data: ONLINE_CATEGORIES.map((category, index) => ({
      id: categoryIds.get(category.key) as string,
      entityId,
      namePt: category.namePt,
      nameEn: category.nameEn,
      color: category.color,
      sortOrder: index,
      active: true,
    })),
  });

  const productRows: Prisma.ProductCreateManyInput[] = [];
  const imageRows: Prisma.ProductImageCreateManyInput[] = [];
  const products: OnlineProduct[] = [];
  const ledger = new SeedLedger(entityId);
  const openingDate = atTime(daysAgo(45, now), 9, 0);

  ONLINE_ITEMS.forEach((item, index) => {
    const productId = id();
    const priceMinor = kz(item.priceKz);
    const costMinor = Math.round(priceMinor * rng.float(0.55, 0.7, 4));

    productRows.push({
      id: productId,
      entityId,
      sku: `GNG-${String(index + 1).padStart(5, '0')}`,
      barcode: makeEan13('621' + String(index + 1).padStart(9, '0')),
      namePt: item.name,
      descriptionPt: item.description,
      categoryId: categoryIds.get(item.category) as string,
      type: 'standard',
      unit: item.unit ?? 'each',
      salePriceMinor: money(priceMinor),
      costPriceMinor: money(costMinor),
      avgCostMinor: money(costMinor),
      taxRateBps: bundle.taxRateBps,
      trackStock: true,
      stockQuantity: 0,
      minStockLevel: 5,
      tileColor: item.tile,
      showInQuickGrid: false,
      publishOnline: true,
      onlineSlug: slugify(item.name),
      weightGrams: item.weightGrams ?? null,
      available: true,
      active: true,
    });

    // The storefront gallery wants more than one angle.
    ['frente', 'detalhe', 'embalagem'].forEach((angle, order) => {
      imageRows.push({
        id: id(),
        productId,
        url: writeSeedImage(`${item.name} ${angle}`, { color: item.tile, prefix: bundle.slug }),
        alt: `${item.name} - ${angle}`,
        sortOrder: order,
        isPrimary: order === 0,
      });
    });

    products.push({
      id: productId,
      name: item.name,
      priceMinor,
      costMinor,
      taxRateBps: bundle.taxRateBps,
    });

    ledger.move({
      productId,
      locationId: warehouse.id,
      quantity: rng.int(12, 60),
      type: 'initial',
      unitCostMinor: costMinor,
      reason: 'Stock inicial',
      reference: 'ABERTURA',
      userId: stockClerk.id,
      userName: stockClerk.name,
      createdAt: openingDate,
    });
  });

  await client.product.createMany({ data: productRows });
  await client.productImage.createMany({ data: imageRows });

  /* -- Shoppers and their addresses ----------------------------------------- */
  const customerRows: Prisma.CustomerCreateManyInput[] = [];
  const addressRows: Prisma.ShippingAddressCreateManyInput[] = [];
  const shoppers: Array<{ id: string; name: string; addressId: string; phone: string }> = [];

  for (const target of SHIPPING_TARGETS) {
    const customerId = id();
    const addressId = id();
    const email = `${slugify(target.name).split('-').slice(0, 2).join('.')}@mail.co.ao`;

    customerRows.push({
      id: customerId,
      entityId,
      name: target.name,
      phone: target.phone,
      email,
      address: `${target.line1}, ${target.city}`,
      active: true,
    });
    addressRows.push({
      id: addressId,
      customerId,
      label: 'Casa',
      recipient: target.name,
      phone: target.phone,
      line1: target.line1,
      city: target.city,
      province: target.province,
      country: 'AO',
      isDefault: true,
    });
    shoppers.push({ id: customerId, name: target.name, addressId, phone: target.phone });
  }

  await client.customer.createMany({ data: customerRows });
  await client.shippingAddress.createMany({ data: addressRows });

  /* -- Orders across the whole lifecycle ------------------------------------- */
  const year = now.getFullYear();
  let orderSeq = 0;
  let lineCount = 0;

  for (const plan of ORDER_PLAN) {
    orderSeq += 1;
    const orderNumber = documentNumber('WEB', year, orderSeq);
    const createdAt = atTime(daysAgo(plan.daysAgo, now), rng.int(9, 21), rng.int(0, 59));
    const shopper = rng.pick(shoppers);

    const chosen = rng.sample(products, rng.int(1, 4));
    const lines = chosen.map((product) => ({
      product,
      quantity: rng.weightedIndex([70, 22, 8]) + 1,
    }));

    const totals = computeSeedSale(
      lines.map((line) => ({
        unitPriceMinor: line.product.priceMinor,
        quantity: line.quantity,
        taxRateBps: line.product.taxRateBps,
        pricingMode: bundle.pricingMode,
        discount: null,
      })),
      null,
    );

    const shippingMinor = plan.fulfilment === 'pickup' ? 0 : kz(rng.pick([1500, 2500, 3500]));
    const paid = plan.status !== 'pending';
    const orderId = id();

    await client.onlineOrder.create({
      data: {
        id: orderId,
        entityId,
        orderNumber,
        customerId: plan.guest ? null : shopper.id,
        guestName: plan.guest ? shopper.name : null,
        guestEmail: plan.guest ? `${slugify(shopper.name)}@mail.co.ao` : null,
        guestPhone: plan.guest ? shopper.phone : null,
        shippingAddressId: plan.fulfilment === 'delivery' && !plan.guest ? shopper.addressId : null,
        fulfilmentMethod: plan.fulfilment,
        pickupLocationId: plan.fulfilment === 'pickup' ? warehouse.id : null,
        status: plan.status,
        paymentStatus: paid ? 'confirmed' : 'pending',
        paymentGateway: plan.gateway,
        paymentReference: paid ? `${plan.gateway.slice(0, 3).toUpperCase()}${rng.int(100000, 999999)}` : null,
        subtotalMinor: money(totals.subtotalMinor),
        shippingMinor: money(shippingMinor),
        discountMinor: money(totals.discountMinor),
        taxMinor: money(totals.taxMinor),
        totalMinor: money(totals.totalMinor + shippingMinor),
        trackingNumber:
          plan.status === 'shipped' || plan.status === 'delivered'
            ? `CTT${rng.int(100000000, 999999999)}AO`
            : null,
        carrier: plan.status === 'shipped' || plan.status === 'delivered' ? 'Correios de Angola' : null,
        note: plan.fulfilment === 'pickup' ? 'Levantamento na loja apos confirmacao.' : null,
        createdAt,
        confirmedAt: paid ? createdAt : null,
        shippedAt:
          plan.status === 'shipped' || plan.status === 'delivered'
            ? atTime(daysAgo(Math.max(0, plan.daysAgo - 1), now), 11, 0)
            : null,
        deliveredAt:
          plan.status === 'delivered'
            ? atTime(daysAgo(Math.max(0, plan.daysAgo - 3), now), 15, 30)
            : null,
        lines: {
          createMany: {
            data: lines.map((line, index) => {
              const computed = totals.lines[index];
              return {
                id: id(),
                productId: line.product.id,
                name: line.product.name,
                quantity: line.quantity,
                unitPriceMinor: money(line.product.priceMinor),
                unitCostMinor: money(line.product.costMinor),
                taxRateBps: line.product.taxRateBps,
                totalMinor: money(computed ? computed.grossMinor : 0),
              };
            }),
          },
        },
      },
    });
    lineCount += lines.length;

    // Stock leaves the warehouse once the parcel does.
    if (plan.status === 'shipped' || plan.status === 'delivered') {
      for (const line of lines) {
        ledger.move({
          productId: line.product.id,
          locationId: warehouse.id,
          quantity: -line.quantity,
          type: 'sale',
          unitCostMinor: line.product.costMinor,
          reference: orderNumber,
          note: `Encomenda online ${orderNumber}`,
          createdAt: atTime(daysAgo(Math.max(0, plan.daysAgo - 1), now), 11, 0),
        });
      }
    }
  }

  /* -- An abandoned cart, so the storefront has something to recover ---------- */
  const cartId = id();
  const cartOwner = shoppers[0] as { id: string };
  const cartItems = rng.sample(products, 2);
  await client.cart.create({
    data: {
      id: cartId,
      entityId,
      customerId: cartOwner.id,
      sessionId: null,
      createdAt: daysAgo(2, now),
      items: {
        createMany: {
          data: cartItems.map((product) => ({
            id: id(),
            productId: product.id,
            variantKey: '',
            quantity: 1,
          })),
        },
      },
    },
  });

  await client.wishlistItem.createMany({
    data: rng.sample(products, 3).map((product) => ({
      id: id(),
      customerId: cartOwner.id,
      productId: product.id,
    })),
  });

  const stock = await ledger.flush(client);

  /* -- Settings and counters -------------------------------------------------- */
  await setSettings(entityId, {
    receiptHeader: 'Loja Online Ginga\nwww.ginga.ao\nNIF 5417556644',
    receiptFooter: 'Obrigado por comprar na Ginga! Devolucoes ate 14 dias.',
    enabledPaymentMethods: ['multicaixa_express', 'card', 'bank_transfer'],
    defaultPaymentMethod: 'multicaixa_express',
    lowStockAlertsEnabled: true,
    tipsEnabled: false,
    posTheme: 'light',
  });

  await seedSequences(client, entityId, [
    { key: 'online_order', scope: String(year), value: orderSeq },
    { key: 'internal_barcode', scope: 'sku', value: ONLINE_ITEMS.length },
  ]);

  return addCounts(
    {
      entidades: 1,
      localizacoes: bundle.locations.length,
      utilizadores: bundle.users.size,
      categorias: ONLINE_CATEGORIES.length,
      produtos: productRows.length,
      imagens: imageRows.length,
      clientes: customerRows.length,
      moradas: addressRows.length,
      movimentos_stock: stock.movements,
      niveis_stock: stock.levels,
    },
    {
      encomendas_online: orderSeq,
      linhas_encomenda: lineCount,
      carrinhos: 1,
      favoritos: 3,
    },
  );
}
