import type { Prisma } from '@prisma/client';
import { generateInternalBarcode, makeEan13, type Unit } from '@pos/shared';
import { AUDIT_ACTIONS } from '../../src/lib/audit.js';
import { setSettings } from '../../src/lib/settings.js';
import {
  CUSTOMER_NAMES,
  RETAIL_CATEGORIES,
  RETAIL_ITEMS,
  RETAIL_SUPPLIERS,
} from './retail-catalogue.js';
import { addCounts, seedSequences, type Counts, type EntityBundle, type SeedContext } from './common.js';
import { atTime, daysAgo, documentNumber, id, kz, money, round3, slugify } from './helpers.js';
import { writeSeedImage } from './images.js';
import { SeedLedger } from './stock.js';
import { planSales, writeSales, type SalesCustomer, type SalesProduct } from './retail-sales.js';
import type { SeededUser } from './users.js';

/** 90 days of history, as the brief asks. */
const HISTORY_DAYS = 90;

const SKU_PREFIX: Record<string, string> = {
  bebidas: 'BEB',
  mercearia: 'MER',
  frescos: 'FRE',
  padaria: 'PAD',
  laticinios: 'LAT',
  limpeza: 'LIM',
  higiene: 'HIG',
  vestuario: 'VES',
};

const TSHIRT_SIZES = ['S', 'M', 'L', 'XL'];
const TSHIRT_COLORS: Array<{ name: string; code: string }> = [
  { name: 'Branco', code: 'BR' },
  { name: 'Preto', code: 'PR' },
  { name: 'Azul', code: 'AZ' },
];

interface BuiltProduct extends SalesProduct {
  categoryId: string;
  supplierId: string;
  barcode: string;
  minStock: number;
  targetStock: number;
  tile: string | null;
  quick: boolean;
  low: boolean;
}

export async function seedRetail(ctx: SeedContext, bundle: EntityBundle): Promise<Counts> {
  const { client, rng, now } = ctx;
  const entityId = bundle.id;
  const shop = bundle.locations[0] as { id: string; name: string };
  const warehouse = (bundle.locations[1] ?? bundle.locations[0]) as { id: string; name: string };

  const admin = bundle.users.get('admin') as SeededUser;
  const manager = bundle.users.get('manager') as SeededUser;
  const cashier = bundle.users.get('cashier') as SeededUser;
  const cashier2 = bundle.users.get('cashier2') as SeededUser;
  const stockClerk = bundle.users.get('stock') as SeededUser;

  /* -- Categories ---------------------------------------------------------- */
  const categoryIds = new Map<string, string>();
  for (const category of RETAIL_CATEGORIES) categoryIds.set(category.key, id());

  const categoryRows: Prisma.CategoryCreateManyInput[] = RETAIL_CATEGORIES.map((category, index) => ({
    id: categoryIds.get(category.key) as string,
    entityId,
    parentId: category.parent ? (categoryIds.get(category.parent) as string) : null,
    namePt: category.namePt,
    nameEn: category.nameEn,
    color: category.color,
    sortOrder: index,
    active: true,
  }));
  await client.category.createMany({ data: categoryRows });

  /* -- Suppliers ------------------------------------------------------------ */
  const supplierIds = new Map<string, string>();
  for (const supplier of RETAIL_SUPPLIERS) supplierIds.set(supplier.key, id());

  await client.supplier.createMany({
    data: RETAIL_SUPPLIERS.map((supplier) => ({
      id: supplierIds.get(supplier.key) as string,
      entityId,
      name: supplier.name,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      nif: supplier.nif,
      paymentTerms: supplier.paymentTerms,
      notes: supplier.notes ?? null,
      active: true,
    })),
  });

  /* -- Products ------------------------------------------------------------- */
  const rootKey = (key: string): string =>
    RETAIL_CATEGORIES.find((c) => c.key === key)?.parent ?? key;

  const products: BuiltProduct[] = [];
  const productRows: Prisma.ProductCreateManyInput[] = [];
  const imageRows: Prisma.ProductImageCreateManyInput[] = [];

  let manufacturerSeq = 0;
  let internalSeq = 0;
  let skuSeq = 0;
  let weightedSeq = 0;
  let quickOrder = 0;

  for (const item of RETAIL_ITEMS) {
    const weighted = item.weighted === true;
    const productId = id();
    const priceMinor = kz(item.priceKz);
    const costMinor = Math.round(priceMinor * rng.float(0.6, 0.75, 4));
    const taxRateBps = item.taxRateBps ?? bundle.taxRateBps;
    const unit: Unit = weighted ? 'kg' : (item.unit ?? 'each');

    // A weighted product is looked up by the item code embedded in the scale
    // barcode, and lib/products matches that code against the SKU - so the SKU
    // has to be the five digit code the scale prints.
    weightedSeq += weighted ? 1 : 0;
    skuSeq += weighted ? 0 : 1;
    const sku = weighted
      ? String(10_000 + weightedSeq)
      : `${SKU_PREFIX[rootKey(item.category)] ?? 'PRD'}-${String(skuSeq).padStart(5, '0')}`;

    manufacturerSeq += weighted ? 0 : 1;
    internalSeq += weighted ? 1 : 0;
    const barcode = weighted
      ? generateInternalBarcode(internalSeq)
      : makeEan13('620' + String(manufacturerSeq).padStart(9, '0'));

    const minStock = weighted ? rng.int(8, 20) : rng.int(6, 24);
    const targetStock = item.low
      ? round3(minStock * rng.float(0.15, 0.7, 2))
      : weighted
        ? round3(minStock * rng.float(1.6, 4, 2))
        : round3(minStock * rng.float(2.5, 6, 2));

    const quick = item.quick === true;
    if (quick) quickOrder += 1;

    const imageUrl = writeSeedImage(item.name, { color: item.tile ?? null, prefix: bundle.slug });

    products.push({
      id: productId,
      name: item.name,
      sku,
      unit,
      priceMinor,
      costMinor,
      taxRateBps,
      weighted,
      pop: item.pop ?? 1,
      categoryKey: rootKey(item.category),
      categoryId: categoryIds.get(item.category) as string,
      supplierId: supplierIds.get(item.supplier) as string,
      barcode,
      minStock,
      targetStock,
      tile: item.tile ?? null,
      quick,
      low: item.low === true,
    });

    productRows.push({
      id: productId,
      entityId,
      sku,
      barcode,
      namePt: item.name,
      categoryId: categoryIds.get(item.category) as string,
      supplierId: supplierIds.get(item.supplier) as string,
      type: weighted ? 'weighted' : 'standard',
      unit,
      salePriceMinor: money(priceMinor),
      costPriceMinor: money(costMinor),
      avgCostMinor: money(costMinor),
      taxRateBps,
      trackStock: true,
      stockQuantity: 0,
      minStockLevel: minStock,
      tileColor: item.tile ?? null,
      showInQuickGrid: quick,
      quickGridOrder: quick ? quickOrder : 0,
      available: true,
      active: true,
    });

    imageRows.push({
      id: id(),
      productId,
      url: imageUrl,
      alt: item.name,
      sortOrder: 0,
      isPrimary: true,
    });
  }

  /* -- The clothing rail: one product, twelve variants ---------------------- */
  const tshirtId = id();
  skuSeq += 1;
  manufacturerSeq += 1;
  const tshirtPrice = kz(4500);
  const tshirtCost = kz(2600);

  productRows.push({
    id: tshirtId,
    entityId,
    sku: `VES-${String(skuSeq).padStart(5, '0')}`,
    barcode: makeEan13('620' + String(manufacturerSeq).padStart(9, '0')),
    namePt: 'T-Shirt Basica',
    nameEn: 'Basic T-Shirt',
    descriptionPt: 'T-shirt de algodao, corte classico. Disponivel em quatro tamanhos e tres cores.',
    categoryId: categoryIds.get('vestuario') as string,
    supplierId: supplierIds.get('mercearia') as string,
    type: 'standard',
    unit: 'each',
    salePriceMinor: money(tshirtPrice),
    costPriceMinor: money(tshirtCost),
    avgCostMinor: money(tshirtCost),
    taxRateBps: bundle.taxRateBps,
    trackStock: true,
    stockQuantity: 0,
    minStockLevel: 12,
    tileColor: '#5B6B7C',
    showInQuickGrid: false,
    available: true,
    active: true,
  });
  imageRows.push({
    id: id(),
    productId: tshirtId,
    url: writeSeedImage('T-Shirt Basica', { color: '#5B6B7C', prefix: bundle.slug }),
    alt: 'T-Shirt Basica',
    sortOrder: 0,
    isPrimary: true,
  });

  const variantRows: Prisma.ProductVariantCreateManyInput[] = [];
  const variantStock: Array<{ id: string; quantity: number; cost: number }> = [];

  for (const size of TSHIRT_SIZES) {
    for (const color of TSHIRT_COLORS) {
      internalSeq += 1;
      const variantId = id();
      const isXl = size === 'XL';
      variantRows.push({
        id: variantId,
        productId: tshirtId,
        entityId,
        sku: `TSH-${size}-${color.code}`,
        barcode: generateInternalBarcode(internalSeq),
        options: JSON.stringify({ Tamanho: size, Cor: color.name }),
        salePriceMinor: isXl ? money(kz(5000)) : null,
        costPriceMinor: money(isXl ? kz(2900) : tshirtCost),
        avgCostMinor: money(isXl ? kz(2900) : tshirtCost),
        stockQuantity: 0,
        minStockLevel: 2,
        active: true,
      });
      variantStock.push({
        id: variantId,
        quantity: rng.int(2, 16),
        cost: isXl ? kz(2900) : tshirtCost,
      });
    }
  }

  await client.product.createMany({ data: productRows });
  await client.productVariant.createMany({ data: variantRows });
  await client.productImage.createMany({ data: imageRows });

  /* -- Customers ------------------------------------------------------------ */
  const customerRows: Prisma.CustomerCreateManyInput[] = [];
  const customers: SalesCustomer[] = [];
  let loyaltySeq = 0;

  CUSTOMER_NAMES.forEach((name, index) => {
    const customerId = id();
    const hasCard = index < 12;
    if (hasCard) loyaltySeq += 1;

    // A little history from before the 90-day window, so the tiers are not all
    // bronze on day one.
    const baseSpend =
      index < 2 ? kz(1_150_000) : index < 5 ? kz(320_000) : index < 9 ? kz(75_000) : 0;

    customerRows.push({
      id: customerId,
      entityId,
      name,
      phone: `+244 9${rng.int(10, 99)} ${rng.int(100, 999)} ${rng.int(100, 999)}`,
      email: rng.chance(0.5) ? `${slugify(name).split('-').slice(0, 2).join('.')}@mail.co.ao` : null,
      nif: rng.chance(0.2) ? String(rng.int(100_000_000, 999_999_999)) + '5' : null,
      address: rng.chance(0.4) ? `Bairro Maianga, Luanda` : null,
      loyaltyCardNumber: hasCard ? makeEan13('98' + String(loyaltySeq).padStart(10, '0')) : null,
      points: hasCard ? Math.floor(baseSpend / 20_000) : 0,
      tier: 'none',
      lifetimeSpendMinor: money(baseSpend),
      orderCount: baseSpend > 0 ? rng.int(4, 40) : 0,
      active: true,
    });
    customers.push({ id: customerId, name, loyalty: hasCard });
  });

  await client.customer.createMany({ data: customerRows });

  /* -- Ninety days of trading ----------------------------------------------- */
  const plan = planSales({
    rng,
    now,
    days: HISTORY_DAYS,
    baseSalesPerDay: 3,
    products,
    customers,
    cashiers: [
      { user: cashier, weight: 48 },
      { user: cashier2, weight: 30 },
      { user: manager, weight: 16 },
      { user: admin, weight: 6 },
    ],
    refundUser: manager,
    pricingMode: bundle.pricingMode,
    couponCode: 'BEBIDAS10',
    couponCategory: 'bebidas',
    couponBps: 1000,
  });

  /* -- Opening stock -------------------------------------------------------- */
  const ledger = new SeedLedger(entityId);
  const openingDate = atTime(daysAgo(HISTORY_DAYS + 1, now), 7, 30);

  for (const product of products) {
    const sold = plan.soldByProduct.get(product.id) ?? 0;
    // Whatever the shelf must have held for today's quantity to be the target.
    const opening = round3(Math.max(product.targetStock + sold, sold));
    ledger.move({
      productId: product.id,
      locationId: shop.id,
      quantity: opening,
      type: 'initial',
      unitCostMinor: product.costMinor,
      reason: 'Stock inicial',
      reference: 'ABERTURA',
      userId: stockClerk.id,
      userName: stockClerk.name,
      createdAt: openingDate,
    });

    // Bulk lines also sit in the back store.
    if (!product.weighted && rng.chance(0.55)) {
      ledger.move({
        productId: product.id,
        locationId: warehouse.id,
        quantity: round3(product.minStock * rng.float(1, 4, 1)),
        type: 'initial',
        unitCostMinor: product.costMinor,
        reason: 'Stock inicial',
        reference: 'ABERTURA',
        userId: stockClerk.id,
        userName: stockClerk.name,
        createdAt: openingDate,
      });
    }
  }

  for (const variant of variantStock) {
    ledger.move({
      productId: tshirtId,
      variantId: variant.id,
      locationId: shop.id,
      quantity: variant.quantity,
      type: 'initial',
      unitCostMinor: variant.cost,
      reason: 'Stock inicial',
      reference: 'ABERTURA',
      userId: stockClerk.id,
      userName: stockClerk.name,
      createdAt: openingDate,
    });
  }

  const salesResult = await writeSales({
    client,
    entityId,
    locationId: shop.id,
    ledger,
    plan,
    loyaltyEarnPerMinor: 10_000,
    vipThresholds: { bronze: 5_000_000, silver: 25_000_000, gold: 100_000_000 },
  });

  /* -- Purchase orders, and one of them actually received -------------------- */
  const poCounts = await seedPurchaseOrders(ctx, {
    entityId,
    products,
    supplierIds,
    shopId: shop.id,
    ledger,
    stockClerk,
    manager,
  });

  const { movements, levels } = await ledger.flush(client);

  /* -- Promotions ------------------------------------------------------------ */
  const croissant = products.find((p) => p.name === 'Croissant') as BuiltProduct;
  const couponUses = plan.sales.filter((s) => s.promotionCode === 'BEBIDAS10').length;

  await client.promotion.createMany({
    data: [
      {
        id: id(),
        entityId,
        code: 'BEBIDAS10',
        namePt: '10% em todas as bebidas',
        nameEn: '10% off all drinks',
        type: 'percent_off',
        value: 1000,
        categoryId: categoryIds.get('bebidas') as string,
        usageLimit: 500,
        usageCount: couponUses,
        startsAt: daysAgo(30, now),
        endsAt: daysAgo(-60, now),
        active: true,
      },
      {
        id: id(),
        entityId,
        code: 'CROISSANT2X1',
        namePt: 'Leve 3 croissants, pague 2',
        nameEn: 'Buy 2 croissants, get 1 free',
        type: 'buy_x_get_y',
        value: 0,
        productIds: JSON.stringify([croissant.id]),
        buyQuantity: 2,
        getQuantity: 1,
        usageCount: 0,
        startsAt: daysAgo(14, now),
        endsAt: daysAgo(-30, now),
        active: true,
      },
      {
        id: id(),
        entityId,
        code: 'KALUNGA500',
        namePt: '500 Kz de desconto acima de 5 000 Kz',
        nameEn: '500 Kz off baskets over 5 000 Kz',
        type: 'fixed_off',
        value: kz(500),
        minSpendMinor: money(kz(5000)),
        usageLimit: 200,
        usageCount: 0,
        startsAt: daysAgo(7, now),
        endsAt: daysAgo(-45, now),
        active: true,
      },
    ],
  });

  /* -- Notifications and audit trail ----------------------------------------- */
  const lowProducts = products.filter((p) => p.low);
  await client.notification.createMany({
    data: lowProducts.map((product) => ({
      id: id(),
      entityId,
      level: 'warning',
      titlePt: 'Stock baixo',
      titleEn: 'Low stock',
      bodyPt: `${product.name}: abaixo do minimo de ${product.minStock}.`,
      bodyEn: `${product.name}: below the minimum of ${product.minStock}.`,
      link: `/inventory/products/${product.id}`,
      createdAt: daysAgo(1, now),
    })),
  });

  const recentSales = plan.sales.slice(-6);
  await client.auditLog.createMany({
    data: [
      {
        id: id(),
        entityId,
        userId: admin.id,
        userName: admin.name,
        action: AUDIT_ACTIONS.ENTITY_CREATE,
        targetType: 'entity',
        targetId: entityId,
        details: JSON.stringify({ name: bundle.name }),
        createdAt: openingDate,
      },
      {
        id: id(),
        entityId,
        userId: manager.id,
        userName: manager.name,
        action: AUDIT_ACTIONS.PRICE_CHANGE,
        targetType: 'product',
        targetId: (products[0] as BuiltProduct).id,
        details: JSON.stringify({
          before: (products[0] as BuiltProduct).priceMinor - 5000,
          after: (products[0] as BuiltProduct).priceMinor,
        }),
        createdAt: daysAgo(21, now),
      },
      {
        id: id(),
        entityId,
        userId: stockClerk.id,
        userName: stockClerk.name,
        action: AUDIT_ACTIONS.STOCK_RECEIPT,
        targetType: 'stock_receipt',
        targetId: poCounts.receiptId,
        details: JSON.stringify({ reference: poCounts.receiptReference }),
        createdAt: daysAgo(20, now),
      },
      ...recentSales.map((sale) => ({
        id: id(),
        entityId,
        userId: sale.cashier.id,
        userName: sale.cashier.name,
        action: AUDIT_ACTIONS.SALE_CREATE,
        targetType: 'sale',
        targetId: sale.id,
        details: JSON.stringify({ receiptNumber: sale.receiptNumber, totalMinor: sale.totals.totalMinor }),
        createdAt: sale.date,
      })),
    ],
  });

  /* -- Settings and counters -------------------------------------------------- */
  await setSettings(entityId, {
    receiptHeader: 'Supermercado Kalunga\nRua Amilcar Cabral 210, Maianga - Luanda\nNIF 5417123456',
    receiptFooter: 'Obrigado pela sua preferencia! Trocas ate 8 dias com talao.',
    enabledPaymentMethods: ['cash', 'card', 'multicaixa_express', 'mobile_money', 'bank_transfer', 'store_credit'],
    defaultPaymentMethod: 'cash',
    lowStockAlertsEnabled: true,
    tipsEnabled: false,
    autoLogoutMinutes: 20,
    posTheme: 'light',
  });

  const currentYear = now.getFullYear();
  await seedSequences(client, entityId, [
    ...[...plan.receiptCounters.entries()].map(([year, value]) => ({
      key: 'receipt',
      scope: String(year),
      value,
    })),
    ...[...plan.refundCounters.entries()].map(([year, value]) => ({
      key: 'refund',
      scope: String(year),
      value,
    })),
    { key: 'purchase_order', scope: String(currentYear), value: poCounts.purchaseOrders },
    { key: 'stock_receipt', scope: String(currentYear), value: 1 },
    { key: 'loyalty_card', scope: '', value: loyaltySeq },
    { key: 'internal_barcode', scope: '', value: internalSeq },
    { key: 'internal_barcode', scope: 'sku', value: skuSeq },
  ]);

  return addCounts(
    {
      entidades: 1,
      localizacoes: bundle.locations.length,
      utilizadores: bundle.users.size,
      categorias: categoryRows.length,
      fornecedores: RETAIL_SUPPLIERS.length,
      produtos: productRows.length,
      variantes: variantRows.length,
      imagens: imageRows.length,
      clientes: customerRows.length,
      vendas: salesResult.sales,
      linhas_venda: salesResult.saleLines,
      pagamentos: salesResult.payments,
      devolucoes: salesResult.refunds,
      pontos_fidelidade: salesResult.loyaltyTransactions,
      movimentos_stock: movements,
      niveis_stock: levels,
      promocoes: 3,
      notificacoes: lowProducts.length,
    },
    { encomendas_compra: poCounts.purchaseOrders, recepcoes: 1 },
  );
}

/* -------------------------------------------------------------------------- */
/* Purchase orders                                                             */
/* -------------------------------------------------------------------------- */

interface PurchaseOrderInput {
  entityId: string;
  products: BuiltProduct[];
  supplierIds: Map<string, string>;
  shopId: string;
  ledger: SeedLedger;
  stockClerk: SeededUser;
  manager: SeededUser;
}

async function seedPurchaseOrders(
  ctx: SeedContext,
  input: PurchaseOrderInput,
): Promise<{ purchaseOrders: number; receiptId: string; receiptReference: string }> {
  const { client, rng, now } = ctx;
  const { entityId, products, supplierIds, shopId, ledger, stockClerk } = input;
  const year = now.getFullYear();

  const bySupplier = (key: string): BuiltProduct[] =>
    products.filter((p) => p.supplierId === supplierIds.get(key));

  const specs: Array<{
    supplier: string;
    status: string;
    lineCount: number;
    sentDaysAgo: number | null;
    expectedDaysAhead: number;
    receivedRatio: number;
    note: string;
  }> = [
    {
      supplier: 'mercearia',
      status: 'draft',
      lineCount: 5,
      sentDaysAgo: null,
      expectedDaysAhead: 7,
      receivedRatio: 0,
      note: 'Reposicao mensal de mercearia.',
    },
    {
      supplier: 'bebidas',
      status: 'sent',
      lineCount: 6,
      sentDaysAgo: 5,
      expectedDaysAhead: 2,
      receivedRatio: 0,
      note: 'Encomenda de bebidas para o fim de semana.',
    },
    {
      supplier: 'frescos',
      status: 'partially_received',
      lineCount: 4,
      sentDaysAgo: 12,
      expectedDaysAhead: -4,
      receivedRatio: 0.5,
      note: 'Fornecedor entregou apenas metade da fruta.',
    },
    {
      supplier: 'mercearia',
      status: 'received',
      lineCount: 5,
      sentDaysAgo: 25,
      expectedDaysAhead: -20,
      receivedRatio: 1,
      note: 'Recebido e conferido.',
    },
  ];

  let receiptId = '';
  let receiptReference = '';

  for (const [index, spec] of specs.entries()) {
    const pool = bySupplier(spec.supplier).filter((p) => !p.weighted || spec.supplier === 'frescos');
    const chosen = rng.sample(pool, spec.lineCount);
    const purchaseOrderId = id();
    const reference = documentNumber('PO', year, index + 1);

    const lines = chosen.map((product) => {
      const quantity = product.weighted ? rng.int(10, 40) : rng.int(12, 96);
      return {
        id: id(),
        purchaseOrderId,
        productId: product.id,
        quantity,
        receivedQuantity: round3(quantity * spec.receivedRatio),
        unitCostMinor: money(product.costMinor),
      };
    });

    const totalCost = lines.reduce(
      (sum, line) => sum + Number(line.unitCostMinor) * line.quantity,
      0,
    );

    await client.purchaseOrder.create({
      data: {
        id: purchaseOrderId,
        entityId,
        supplierId: supplierIds.get(spec.supplier) as string,
        reference,
        status: spec.status,
        expectedDate: daysAgo(-spec.expectedDaysAhead, now),
        sentAt: spec.sentDaysAgo != null ? daysAgo(spec.sentDaysAgo, now) : null,
        note: spec.note,
        totalCostMinor: money(totalCost),
        createdAt: daysAgo(spec.sentDaysAgo != null ? spec.sentDaysAgo + 1 : 2, now),
        lines: { createMany: { data: lines.map(({ purchaseOrderId: _po, ...rest }) => rest) } },
      },
    });

    // The fully received order actually moved stock, so it needs a receipt and
    // matching ledger entries.
    if (spec.receivedRatio === 1) {
      receiptId = id();
      receiptReference = documentNumber('ENT', year, 1);
      const receivedAt = daysAgo(20, now);

      await client.stockReceipt.create({
        data: {
          id: receiptId,
          entityId,
          locationId: shopId,
          supplierId: supplierIds.get(spec.supplier) as string,
          purchaseOrderId,
          reference: receiptReference,
          invoiceNumber: `FT ${year}/${rng.int(1000, 9999)}`,
          note: 'Recepcao total da encomenda.',
          totalCostMinor: money(totalCost),
          userId: stockClerk.id,
          createdAt: receivedAt,
          lines: {
            createMany: {
              data: lines.map((line) => ({
                id: id(),
                productId: line.productId,
                quantity: line.quantity,
                unitCostMinor: line.unitCostMinor,
              })),
            },
          },
        },
      });

      for (const line of lines) {
        ledger.move({
          productId: line.productId,
          locationId: shopId,
          quantity: line.quantity,
          type: 'receipt',
          unitCostMinor: Number(line.unitCostMinor),
          reference: receiptReference,
          userId: stockClerk.id,
          userName: stockClerk.name,
          createdAt: receivedAt,
        });
      }
    }
  }

  return { purchaseOrders: specs.length, receiptId, receiptReference };
}
