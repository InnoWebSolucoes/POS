import type { Prisma } from '@prisma/client';
import {
  computeSale,
  generateInternalBarcode,
  suggestTenders,
  type CartModifier,
  type LineInput,
  type PaymentMethod,
} from '@pos/shared';
import { setSettings } from '../../src/lib/settings.js';
import { addCounts, seedSequences, type Counts, type EntityBundle, type SeedContext } from './common.js';
import {
  addMinutes,
  atTime,
  computeSeedSale,
  daysAgo,
  documentNumber,
  id,
  kz,
  money,
  round3,
} from './helpers.js';
import { writeSeedImage } from './images.js';
import { SeedLedger } from './stock.js';
import {
  BURGER,
  BURGER_INGREDIENTS,
  MENU_CATEGORIES,
  MENU_ITEMS,
  MODIFIER_GROUPS,
  TABLES,
} from './restaurant-menu.js';
import type { SeededUser } from './users.js';

/** Food cost as a share of the menu price - 32% is a normal kitchen. */
const FOOD_COST_RATIO = 0.32;
const HISTORY_DAYS = 21;

interface MenuProduct {
  id: string;
  name: string;
  priceMinor: number;
  costMinor: number;
  taxRateBps: number;
  station: string;
  pop: number;
  composite: boolean;
}

export async function seedRestaurant(ctx: SeedContext, bundle: EntityBundle): Promise<Counts> {
  const { client, rng, now } = ctx;
  const entityId = bundle.id;
  const dining = bundle.locations[0] as { id: string; name: string };

  const manager = bundle.users.get('manager') as SeededUser;
  const cashier = bundle.users.get('cashier') as SeededUser;
  const waiter = bundle.users.get('waiter') as SeededUser;
  const kitchen = bundle.users.get('kitchen') as SeededUser;

  /* -- Menu categories ------------------------------------------------------ */
  const categoryIds = new Map<string, string>();
  for (const category of MENU_CATEGORIES) categoryIds.set(category.key, id());

  await client.category.createMany({
    data: MENU_CATEGORIES.map((category, index) => ({
      id: categoryIds.get(category.key) as string,
      entityId,
      namePt: category.namePt,
      nameEn: category.nameEn,
      color: category.color,
      sortOrder: index,
      active: true,
    })),
  });

  /* -- Modifier groups ------------------------------------------------------ */
  const groupIds = new Map<string, string>();
  const modifierRows: Prisma.ModifierCreateManyInput[] = [];
  const modifiersByGroup = new Map<string, Array<{ id: string; name: string; delta: number }>>();

  for (const [index, group] of MODIFIER_GROUPS.entries()) {
    const groupId = id();
    groupIds.set(group.key, groupId);
    await client.modifierGroup.create({
      data: {
        id: groupId,
        entityId,
        namePt: group.namePt,
        nameEn: group.nameEn,
        type: group.type,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        sortOrder: index,
      },
    });

    const list: Array<{ id: string; name: string; delta: number }> = [];
    group.modifiers.forEach((modifier, order) => {
      const modifierId = id();
      modifierRows.push({
        id: modifierId,
        groupId,
        namePt: modifier.namePt,
        nameEn: modifier.nameEn,
        priceDeltaMinor: money(kz(modifier.priceKz)),
        sortOrder: order,
        available: true,
      });
      list.push({ id: modifierId, name: modifier.namePt, delta: kz(modifier.priceKz) });
    });
    modifiersByGroup.set(group.key, list);
  }
  await client.modifier.createMany({ data: modifierRows });

  /* -- Menu ----------------------------------------------------------------- */
  const productRows: Prisma.ProductCreateManyInput[] = [];
  const imageRows: Prisma.ProductImageCreateManyInput[] = [];
  const linkRows: Prisma.ProductModifierGroupCreateManyInput[] = [];
  const menu: MenuProduct[] = [];

  let sku = 0;
  let internalSeq = 0;
  let quickOrder = 0;

  for (const item of MENU_ITEMS) {
    const productId = id();
    sku += 1;
    internalSeq += 1;
    const priceMinor = kz(item.priceKz);
    const costMinor = Math.round(priceMinor * rng.float(FOOD_COST_RATIO - 0.06, FOOD_COST_RATIO + 0.08, 4));
    const quick = item.quick === true;
    if (quick) quickOrder += 1;

    productRows.push({
      id: productId,
      entityId,
      sku: `MNU-${String(sku).padStart(5, '0')}`,
      barcode: generateInternalBarcode(internalSeq),
      namePt: item.name,
      categoryId: categoryIds.get(item.category) as string,
      type: 'standard',
      unit: 'each',
      salePriceMinor: money(priceMinor),
      costPriceMinor: money(costMinor),
      avgCostMinor: money(costMinor),
      taxRateBps: bundle.taxRateBps,
      // A plate of muamba is cooked to order; the kitchen does not count it.
      trackStock: false,
      isMenuItem: true,
      prepStation: item.station,
      tileColor: item.tile,
      showInQuickGrid: quick,
      quickGridOrder: quick ? quickOrder : 0,
      available: true,
      active: true,
    });

    imageRows.push({
      id: id(),
      productId,
      url: writeSeedImage(item.name, { color: item.tile, prefix: bundle.slug }),
      alt: item.name,
      sortOrder: 0,
      isPrimary: true,
    });

    for (const groupKey of item.modifiers ?? []) {
      linkRows.push({
        id: id(),
        productId,
        groupId: groupIds.get(groupKey) as string,
        sortOrder: 0,
      });
    }

    menu.push({
      id: productId,
      name: item.name,
      priceMinor,
      costMinor,
      taxRateBps: bundle.taxRateBps,
      station: item.station,
      pop: item.pop ?? 1,
      composite: false,
    });
  }

  /* -- Ingredients behind the burger ---------------------------------------- */
  const ingredientIds = new Map<string, { id: string; cost: number; quantity: number }>();
  for (const ingredient of BURGER_INGREDIENTS) {
    const productId = id();
    sku += 1;
    internalSeq += 1;
    ingredientIds.set(ingredient.key, {
      id: productId,
      cost: kz(ingredient.costKz),
      quantity: ingredient.perBurger,
    });

    productRows.push({
      id: productId,
      entityId,
      sku: `ING-${String(sku).padStart(5, '0')}`,
      barcode: generateInternalBarcode(internalSeq),
      namePt: ingredient.name,
      categoryId: categoryIds.get('ingredientes') as string,
      type: 'standard',
      unit: ingredient.unit,
      salePriceMinor: money(kz(ingredient.priceKz)),
      costPriceMinor: money(kz(ingredient.costKz)),
      avgCostMinor: money(kz(ingredient.costKz)),
      taxRateBps: bundle.taxRateBps,
      trackStock: true,
      stockQuantity: 0,
      minStockLevel: ingredient.minStock,
      isMenuItem: false,
      available: true,
      active: true,
    });
  }

  /* -- The composite: one burger eats five ingredients ----------------------- */
  const burgerId = id();
  sku += 1;
  internalSeq += 1;
  const burgerPrice = kz(BURGER.priceKz);
  const burgerCost = BURGER_INGREDIENTS.reduce(
    (sum, ingredient) =>
      sum +
      kz(ingredient.costKz) * ingredient.perBurger * (1 + (ingredient.wastageBps ?? 0) / 10_000),
    0,
  );

  productRows.push({
    id: burgerId,
    entityId,
    sku: `MNU-${String(sku).padStart(5, '0')}`,
    barcode: generateInternalBarcode(internalSeq),
    namePt: BURGER.name,
    descriptionPt: 'Pao fresco, carne picada na grelha, queijo cheddar, alface e tomate.',
    categoryId: categoryIds.get(BURGER.category) as string,
    type: 'composite',
    unit: 'each',
    salePriceMinor: money(burgerPrice),
    costPriceMinor: money(Math.round(burgerCost)),
    avgCostMinor: money(Math.round(burgerCost)),
    taxRateBps: bundle.taxRateBps,
    // A composite holds no stock of its own; its components do.
    trackStock: false,
    isMenuItem: true,
    prepStation: BURGER.station,
    tileColor: BURGER.tile,
    showInQuickGrid: true,
    quickGridOrder: quickOrder + 1,
    available: true,
    active: true,
  });
  imageRows.push({
    id: id(),
    productId: burgerId,
    url: writeSeedImage(BURGER.name, { color: BURGER.tile, prefix: bundle.slug }),
    alt: BURGER.name,
    sortOrder: 0,
    isPrimary: true,
  });
  for (const groupKey of BURGER.modifiers) {
    linkRows.push({ id: id(), productId: burgerId, groupId: groupIds.get(groupKey) as string, sortOrder: 0 });
  }
  menu.push({
    id: burgerId,
    name: BURGER.name,
    priceMinor: burgerPrice,
    costMinor: Math.round(burgerCost),
    taxRateBps: bundle.taxRateBps,
    station: BURGER.station,
    pop: 6,
    composite: true,
  });

  await client.product.createMany({ data: productRows });
  await client.productImage.createMany({ data: imageRows });
  await client.productModifierGroup.createMany({ data: linkRows });

  await client.recipeComponent.createMany({
    data: BURGER_INGREDIENTS.map((ingredient) => ({
      id: id(),
      parentProductId: burgerId,
      componentProductId: (ingredientIds.get(ingredient.key) as { id: string }).id,
      quantity: ingredient.perBurger,
      unit: ingredient.unit,
      wastagePercentBps: ingredient.wastageBps ?? 0,
    })),
  });

  /* -- Opening stock for the ingredients ------------------------------------ */
  const ledger = new SeedLedger(entityId);
  const openingDate = atTime(daysAgo(HISTORY_DAYS + 1, now), 8, 0);

  for (const ingredient of BURGER_INGREDIENTS) {
    const entry = ingredientIds.get(ingredient.key) as { id: string; cost: number };
    ledger.move({
      productId: entry.id,
      locationId: dining.id,
      quantity: ingredient.stock,
      type: 'initial',
      unitCostMinor: entry.cost,
      reason: 'Stock inicial',
      reference: 'ABERTURA',
      userId: manager.id,
      userName: manager.name,
      createdAt: openingDate,
    });
  }

  /* -- Floor plan ------------------------------------------------------------ */
  const areaIds = {
    sala: id(),
    esplanada: id(),
  };

  await client.floorArea.createMany({
    data: [
      { id: areaIds.sala, entityId, name: 'Sala Principal', sortOrder: 0, width: 1200, height: 800 },
      { id: areaIds.esplanada, entityId, name: 'Esplanada', sortOrder: 1, width: 900, height: 600 },
    ],
  });

  const tableIds = new Map<string, string>();
  await client.restaurantTable.createMany({
    data: TABLES.map((table) => {
      const tableId = id();
      tableIds.set(table.name, tableId);
      return {
        id: tableId,
        entityId,
        areaId: areaIds[table.area],
        name: table.name,
        shape: table.shape,
        x: table.x,
        y: table.y,
        width: table.width,
        height: table.height,
        seats: table.seats,
        status: table.status,
        active: true,
      };
    }),
  });

  /* -- Three live tables, two live tickets ----------------------------------- */
  const live = await seedOpenOrders(ctx, {
    entityId,
    bundle,
    menu,
    modifiersByGroup,
    tableIds,
    waiter,
    kitchen,
  });

  /* -- Three weeks of closed bills ------------------------------------------- */
  const history = await seedRestaurantSales(ctx, {
    entityId,
    bundle,
    locationId: dining.id,
    menu,
    ledger,
    ingredients: BURGER_INGREDIENTS.map((ingredient) => ({
      ...(ingredientIds.get(ingredient.key) as { id: string; cost: number }),
      perBurger: ingredient.perBurger,
      wastageBps: ingredient.wastageBps ?? 0,
    })),
    burgerId,
    servers: [waiter, cashier, manager],
  });

  const stock = await ledger.flush(client);

  /* -- Settings and counters -------------------------------------------------- */
  await setSettings(entityId, {
    receiptHeader: 'Restaurante Muxima\nIlha do Cabo, Luanda\nNIF 5417998877',
    receiptFooter: 'Bom apetite! Servico nao incluido.',
    enabledPaymentMethods: ['cash', 'card', 'multicaixa_express', 'mobile_money'],
    defaultPaymentMethod: 'card',
    tipsEnabled: true,
    tipPresetsBps: [500, 1000, 1500],
    serviceChargeBps: 0,
    kdsWarnAfterMinutes: 8,
    kdsAlertAfterMinutes: 15,
    posTheme: 'dark',
  });

  const year = now.getFullYear();
  await seedSequences(client, entityId, [
    { key: 'order', scope: String(year), value: live.orderCount + history.orderNumbers },
    { key: 'ticket', scope: 'day', value: live.ticketCount },
    { key: 'receipt', scope: String(year), value: history.sales },
    { key: 'internal_barcode', scope: '', value: internalSeq },
    { key: 'internal_barcode', scope: 'sku', value: sku },
  ]);

  return addCounts(
    {
      entidades: 1,
      localizacoes: bundle.locations.length,
      utilizadores: bundle.users.size,
      categorias: MENU_CATEGORIES.length,
      produtos: productRows.length,
      imagens: imageRows.length,
      grupos_modificadores: MODIFIER_GROUPS.length,
      modificadores: modifierRows.length,
      receitas: BURGER_INGREDIENTS.length,
      areas: 2,
      mesas: TABLES.length,
      pedidos: live.orderCount,
      linhas_pedido: live.itemCount,
      tickets_cozinha: live.ticketCount,
      movimentos_stock: stock.movements,
      niveis_stock: stock.levels,
    },
    {
      vendas: history.sales,
      linhas_venda: history.lines,
      pagamentos: history.payments,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Open orders and kitchen tickets                                             */
/* -------------------------------------------------------------------------- */

interface OpenOrderInput {
  entityId: string;
  bundle: EntityBundle;
  menu: MenuProduct[];
  modifiersByGroup: Map<string, Array<{ id: string; name: string; delta: number }>>;
  tableIds: Map<string, string>;
  waiter: SeededUser;
  kitchen: SeededUser;
}

async function seedOpenOrders(
  ctx: SeedContext,
  input: OpenOrderInput,
): Promise<{ orderCount: number; itemCount: number; ticketCount: number }> {
  const { client, rng, now } = ctx;
  const { entityId, bundle, menu, modifiersByGroup, tableIds, waiter } = input;
  const year = now.getFullYear();

  const byName = (name: string): MenuProduct =>
    menu.find((item) => item.name === name) as MenuProduct;

  const extras = modifiersByGroup.get('extras') ?? [];
  const removal = modifiersByGroup.get('retirar') ?? [];
  const protein = modifiersByGroup.get('proteina') ?? [];

  interface PlannedItem {
    product: MenuProduct;
    quantity: number;
    course: number;
    seat: number | null;
    status: 'unsent' | 'sent' | 'in_progress';
    modifiers: CartModifier[];
    note?: string;
    ticket?: 'a' | 'b';
  }

  const plans: Array<{
    table: string;
    guests: number;
    status: string;
    openedMinutesAgo: number;
    items: PlannedItem[];
  }> = [
    {
      table: 'Mesa 1',
      guests: 3,
      status: 'sent',
      openedMinutesAgo: 35,
      items: [
        { product: byName('Pasteis de Bacalhau 4un'), quantity: 2, course: 1, seat: 1, status: 'sent', modifiers: [], ticket: 'a' },
        { product: byName('Cerveja Cuca 330ml'), quantity: 3, course: 0, seat: null, status: 'sent', modifiers: [] },
        { product: byName('Muamba de Galinha'), quantity: 2, course: 2, seat: 1, status: 'unsent', modifiers: removal[0] ? [toCartModifier(removal[0])] : [], note: 'Sem cebola, por favor.' },
        { product: byName('Funge de Bombo'), quantity: 2, course: 2, seat: 2, status: 'unsent', modifiers: protein[1] ? [toCartModifier(protein[1])] : [] },
      ],
    },
    {
      table: 'Mesa 4',
      guests: 6,
      status: 'sent',
      openedMinutesAgo: 52,
      items: [
        { product: byName('Picanha Grelhada'), quantity: 2, course: 1, seat: 1, status: 'in_progress', modifiers: extras[1] ? [toCartModifier(extras[1])] : [], ticket: 'b' },
        { product: byName('Frango Grelhado Meio'), quantity: 1, course: 1, seat: 3, status: 'in_progress', modifiers: [], ticket: 'b' },
        { product: byName('Batata Frita'), quantity: 3, course: 1, seat: null, status: 'in_progress', modifiers: [], ticket: 'b' },
        { product: byName('Vinho Tinto Casa da Torre 750ml'), quantity: 1, course: 0, seat: null, status: 'sent', modifiers: [] },
        { product: byName('Mousse de Chocolate'), quantity: 2, course: 3, seat: null, status: 'unsent', modifiers: [] },
      ],
    },
    {
      table: 'Mesa 11',
      guests: 2,
      status: 'open',
      openedMinutesAgo: 8,
      items: [
        { product: byName('Agua Mineral 500ml'), quantity: 2, course: 0, seat: null, status: 'unsent', modifiers: [] },
        { product: byName('Hamburguer Completo'), quantity: 1, course: 1, seat: 1, status: 'unsent', modifiers: extras[0] ? [toCartModifier(extras[0])] : [] },
        { product: byName('Salada Mista'), quantity: 1, course: 1, seat: 2, status: 'unsent', modifiers: [] },
      ],
    },
  ];

  const tickets: Record<'a' | 'b', { id: string; number: string; status: string; orderId: string }> = {
    a: { id: id(), number: 'T-001', status: 'new', orderId: '' },
    b: { id: id(), number: 'T-002', status: 'in_progress', orderId: '' },
  };

  let itemCount = 0;

  for (const [index, plan] of plans.entries()) {
    const orderId = id();
    const tableId = tableIds.get(plan.table) as string;
    const openedAt = addMinutes(now, -plan.openedMinutesAgo);

    const lines: LineInput[] = plan.items.map((item) => ({
      unitPriceMinor: item.product.priceMinor + item.modifiers.reduce((s, m) => s + m.priceDeltaMinor, 0),
      quantity: item.quantity,
      taxRateBps: item.product.taxRateBps,
      pricingMode: bundle.pricingMode,
      discount: null,
    }));
    const totals = computeSale(lines, null);

    await client.order.create({
      data: {
        id: orderId,
        entityId,
        tableId,
        orderNumber: documentNumber('ORD', year, index + 1),
        status: plan.status,
        serverId: waiter.id,
        serverName: waiter.name,
        guestCount: plan.guests,
        subtotalMinor: money(totals.subtotalMinor),
        discountMinor: money(totals.discountMinor),
        taxMinor: money(totals.taxMinor),
        serviceChargeMinor: money(0),
        tipMinor: money(0),
        totalMinor: money(totals.totalMinor),
        openedAt,
      },
    });

    await client.restaurantTable.update({
      where: { id: tableId },
      data: { status: 'occupied', activeOrderId: orderId },
    });

    for (const [ticketKey, ticket] of Object.entries(tickets) as Array<
      ['a' | 'b', (typeof tickets)['a']]
    >) {
      if (plan.items.some((item) => item.ticket === ticketKey) && !ticket.orderId) {
        ticket.orderId = orderId;
        const createdAt = addMinutes(openedAt, 6);
        await client.kitchenTicket.create({
          data: {
            id: ticket.id,
            entityId,
            orderId,
            ticketNumber: ticket.number,
            station: 'grill',
            status: ticket.status,
            course: 1,
            tableName: plan.table,
            serverName: waiter.name,
            createdAt,
            startedAt: ticket.status === 'in_progress' ? addMinutes(createdAt, 3) : null,
          },
        });
      }
    }

    const itemRows: Prisma.OrderItemCreateManyInput[] = plan.items.map((item, position) => {
      const line = lines[position] as LineInput;
      const computed = computeSale([line], null);
      const sent = item.status !== 'unsent';
      return {
        id: id(),
        orderId,
        productId: item.product.id,
        name: item.product.name,
        quantity: item.quantity,
        unitPriceMinor: money(line.unitPriceMinor),
        unitCostMinor: money(item.product.costMinor),
        taxRateBps: item.product.taxRateBps,
        discountMinor: money(0),
        totalMinor: money(computed.totalMinor),
        status: item.status,
        course: item.course,
        seat: item.seat,
        prepStation: item.product.station,
        note: item.note ?? null,
        modifiers: JSON.stringify(item.modifiers),
        ticketId: item.ticket ? tickets[item.ticket].id : null,
        sentAt: sent ? addMinutes(openedAt, 6) : null,
        createdAt: addMinutes(openedAt, rng.int(1, 5)),
      };
    });

    await client.orderItem.createMany({ data: itemRows });
    itemCount += itemRows.length;
  }

  return { orderCount: plans.length, itemCount, ticketCount: 2 };
}

function toCartModifier(modifier: { id: string; name: string; delta: number }): CartModifier {
  return { modifierId: modifier.id, name: modifier.name, priceDeltaMinor: modifier.delta };
}

/* -------------------------------------------------------------------------- */
/* Closed bills                                                                */
/* -------------------------------------------------------------------------- */

interface RestaurantSalesInput {
  entityId: string;
  bundle: EntityBundle;
  locationId: string;
  menu: MenuProduct[];
  ledger: SeedLedger;
  ingredients: Array<{ id: string; cost: number; perBurger: number; wastageBps: number }>;
  burgerId: string;
  servers: SeededUser[];
}

async function seedRestaurantSales(
  ctx: SeedContext,
  input: RestaurantSalesInput,
): Promise<{ sales: number; lines: number; payments: number; orderNumbers: number }> {
  const { client, rng, now } = ctx;
  const { entityId, bundle, locationId, menu, ledger, ingredients, burgerId, servers } = input;

  const saleRows: Prisma.SaleCreateManyInput[] = [];
  const lineRows: Prisma.SaleLineCreateManyInput[] = [];
  const paymentRows: Prisma.PaymentCreateManyInput[] = [];
  const methods: PaymentMethod[] = ['cash', 'card', 'multicaixa_express', 'mobile_money'];

  let receiptSeq = 0;

  for (let dayOffset = HISTORY_DAYS; dayOffset >= 1; dayOffset -= 1) {
    const day = daysAgo(dayOffset, now);
    const weekend = day.getDay() === 5 || day.getDay() === 6;
    const covers = rng.int(weekend ? 4 : 2, weekend ? 7 : 4);

    for (let i = 0; i < covers; i += 1) {
      const lunch = rng.chance(0.45);
      const date = atTime(day, lunch ? rng.int(12, 14) : rng.int(19, 22), rng.int(0, 59));
      const server = rng.pick(servers);

      const items = Array.from({ length: rng.int(2, 5) }, () =>
        rng.pickWeighted(menu, (item) => item.pop),
      ).filter((item, index, all) => all.findIndex((i2) => i2.id === item.id) === index);

      const lines: LineInput[] = items.map((item) => ({
        unitPriceMinor: item.priceMinor,
        quantity: rng.weightedIndex([60, 30, 10]) + 1,
        taxRateBps: item.taxRateBps,
        pricingMode: bundle.pricingMode,
        discount: null,
      }));

      const totals = computeSeedSale(lines, null);
      const saleId = id();
      receiptSeq += 1;
      const receiptNumber = documentNumber('FR', date.getFullYear(), receiptSeq);
      const tipMinor = rng.chance(0.55) ? Math.round(totals.totalMinor * rng.pick([0.05, 0.1, 0.15])) : 0;
      const cogsMinor = items.reduce(
        (sum, item, index) => sum + Math.round(item.costMinor * (lines[index] as LineInput).quantity),
        0,
      );

      saleRows.push({
        id: saleId,
        entityId,
        locationId,
        receiptNumber,
        channel: 'restaurant',
        status: 'completed',
        cashierId: server.id,
        cashierName: server.name,
        subtotalMinor: money(totals.subtotalMinor),
        discountMinor: money(totals.discountMinor),
        netMinor: money(totals.netMinor),
        taxMinor: money(totals.taxMinor),
        tipMinor: money(tipMinor),
        totalMinor: money(totals.totalMinor),
        cogsMinor: money(cogsMinor),
        taxBreakdown: JSON.stringify(totals.taxBreakdown),
        createdAt: date,
        completedAt: date,
      });

      items.forEach((item, index) => {
        const computed = totals.lines[index];
        const line = lines[index] as LineInput;
        if (!computed) return;
        lineRows.push({
          id: id(),
          saleId,
          productId: item.id,
          name: item.name,
          unit: 'each',
          quantity: line.quantity,
          unitPriceMinor: money(item.priceMinor),
          unitCostMinor: money(item.costMinor),
          discountMinor: money(computed.discountMinor),
          taxRateBps: item.taxRateBps,
          netMinor: money(computed.netMinor),
          taxMinor: money(computed.taxMinor),
          totalMinor: money(computed.grossMinor),
          sortOrder: index,
        });

        // Selling the burger draws down its recipe, exactly as consumeForSale does.
        if (item.id === burgerId) {
          for (const ingredient of ingredients) {
            const consumed = round3(
              ingredient.perBurger * line.quantity * (1 + ingredient.wastageBps / 10_000),
            );
            ledger.move({
              productId: ingredient.id,
              locationId,
              quantity: -consumed,
              type: 'composite_consumption',
              unitCostMinor: ingredient.cost,
              reference: receiptNumber,
              note: `Consumido por ${item.name}`,
              userId: server.id,
              userName: server.name,
              createdAt: date,
            });
          }
        }
      });

      const method = rng.pick(methods);
      const dueMinor = totals.totalMinor + tipMinor;
      const tendered = method === 'cash' ? (suggestTenders(dueMinor, 'AOA')[1] ?? dueMinor) : null;
      paymentRows.push({
        id: id(),
        saleId,
        method,
        amountMinor: money(dueMinor),
        tenderedMinor: tendered != null ? money(tendered) : null,
        changeMinor: tendered != null ? money(Math.max(0, tendered - dueMinor)) : null,
        reference: method === 'cash' ? null : `AUT${rng.int(100000, 999999)}`,
        status: 'confirmed',
        createdAt: date,
      });
    }
  }

  for (let i = 0; i < saleRows.length; i += 200) {
    await client.sale.createMany({ data: saleRows.slice(i, i + 200) });
  }
  for (let i = 0; i < lineRows.length; i += 200) {
    await client.saleLine.createMany({ data: lineRows.slice(i, i + 200) });
  }
  for (let i = 0; i < paymentRows.length; i += 200) {
    await client.payment.createMany({ data: paymentRows.slice(i, i + 200) });
  }

  return {
    sales: saleRows.length,
    lines: lineRows.length,
    payments: paymentRows.length,
    orderNumbers: 0,
  };
}
