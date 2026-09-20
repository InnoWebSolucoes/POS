#!/usr/bin/env node
/**
 * Exercises every "add" in the product against a running API.
 *
 *   npm run dev            (one terminal)
 *   node scripts/test-create-flows.mjs
 *
 * If a screen has a button that creates something, the endpoint behind it is
 * called here. The point is to answer one question honestly: can a client
 * actually add each kind of thing, or does something fail the moment they try?
 *
 * Everything is created inside a throwaway entity, so running this never
 * touches the demo data.
 */

const BASE = process.env.SMOKE_API_URL || 'http://localhost:4000';
const EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@pos.local';
const PASSWORD = process.env.SUPERADMIN_PASSWORD || 'admin123';

const G = '\u001b[32m';
const R = '\u001b[31m';
const Y = '\u001b[33m';
const D = '\u001b[2m';
const X = '\u001b[0m';

let token = null;
let entityId = null;
const results = [];

function record(area, what, ok, detail) {
  results.push({ area, what, ok, detail });
  const mark = ok ? `${G}pass${X}` : `${R}FAIL${X}`;
  console.log(`  ${mark} ${what}${detail ? ` ${D}${detail}${X}` : ''}`);
}

async function call(method, path, body, opts = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token && !opts.anonymous) headers.Authorization = `Bearer ${token}`;
  if (entityId && !opts.anonymous) headers['X-Entity-Id'] = entityId;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch (error) {
    return { status: 0, data: { error: { message: error.message } } };
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const created = (r) => r.status === 200 || r.status === 201;
const why = (r) =>
  r.status === 0
    ? 'no connection'
    : `${r.status} ${JSON.stringify(r.data?.error?.message ?? r.data?.error ?? r.data)?.slice(0, 120)}`;

function section(title) {
  console.log(`\n${title}`);
}

async function main() {
  console.log(`\nTesting every create flow against ${BASE}\n${'='.repeat(60)}`);

  /* ------------------------------------------------------------- setup -- */
  const login = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD }, { anonymous: true });
  if (!created(login)) {
    console.error(`\n${R}Cannot sign in as ${EMAIL}. Is the API running? ${why(login)}${X}\n`);
    process.exit(1);
  }
  token = login.data.token;

  const stamp = Date.now();

  section('Tenancy');
  const entity = await call('POST', '/api/entities', {
    name: `Teste Criacao ${stamp}`,
    mode: 'restaurant', // restaurant unlocks the most surface area
    currency: 'AOA',
    defaultTaxRateBps: 1400,
  });
  record('tenancy', 'criar entidade (cliente)', created(entity), why(entity));
  if (!created(entity)) {
    console.error(`\n${R}Cannot continue without an entity.${X}\n`);
    process.exit(1);
  }
  entityId = entity.data.id;

  const locations = await call('GET', `/api/entities/${entityId}/locations`);
  const locationId = (Array.isArray(locations.data) ? locations.data : locations.data?.data ?? [])[0]?.id;
  record('tenancy', 'localizacao criada com a entidade', Boolean(locationId));

  const location2 = await call('POST', `/api/entities/${entityId}/locations`, {
    name: 'Armazem Teste',
  });
  record('tenancy', 'criar localizacao', created(location2), why(location2));

  const user = await call('POST', '/api/users', {
    name: 'Empregado Teste',
    email: `emp-${stamp}@teste.ao`,
    password: 'teste12345',
    role: 'waiter',
  });
  record('tenancy', 'criar utilizador (membro da equipa)', created(user), why(user));

  /* --------------------------------------------------------- catalogue -- */
  section('Catalogo');
  const category = await call('POST', '/api/categories', { namePt: 'Bebidas', nameEn: 'Drinks' });
  record('catalogue', 'criar categoria', created(category), why(category));
  const categoryId = category.data?.id;

  const sub = await call('POST', '/api/categories', { namePt: 'Refrigerantes', parentId: categoryId });
  record('catalogue', 'criar subcategoria (arvore)', created(sub), why(sub));

  const supplier = await call('POST', '/api/suppliers', {
    name: `Distribuidora ${stamp}`,
    phone: '+244923000111',
  });
  record('catalogue', 'criar fornecedor', created(supplier), why(supplier));
  const supplierId = supplier.data?.id;

  const product = await call('POST', '/api/products', {
    namePt: 'Refrigerante Teste 350ml',
    sku: `TEST-${stamp}`,
    categoryId,
    supplierId,
    type: 'standard',
    unit: 'each',
    salePriceMinor: 120000,
    costPriceMinor: 70000,
    taxRateBps: 1400,
    minStockLevel: 5,
    // Published, so the storefront cart check further down has something it is
    // actually allowed to sell. The shop correctly refuses unpublished stock.
    publishOnline: true,
  });
  record('catalogue', 'criar produto', created(product), why(product));
  const productId = product.data?.id;

  const weighted = await call('POST', '/api/products', {
    namePt: 'Banana Teste',
    sku: `TESTW-${stamp}`,
    categoryId,
    type: 'weighted',
    unit: 'kg',
    salePriceMinor: 90000,
    costPriceMinor: 50000,
    taxRateBps: 0,
    showInQuickGrid: true,
  });
  record('catalogue', 'criar produto ao peso', created(weighted), why(weighted));

  const service = await call('POST', '/api/products', {
    namePt: 'Servico Teste',
    sku: `TESTS-${stamp}`,
    type: 'service',
    unit: 'each',
    salePriceMinor: 500000,
    taxRateBps: 1400,
  });
  record('catalogue', 'criar servico', created(service), why(service));

  const parent = await call('POST', '/api/products', {
    namePt: 'T-Shirt Teste',
    sku: `TESTV-${stamp}`,
    type: 'standard',
    unit: 'each',
    salePriceMinor: 350000,
    costPriceMinor: 180000,
    taxRateBps: 1400,
  });
  const parentId = parent.data?.id;
  record('catalogue', 'criar produto base para variantes', created(parent), why(parent));

  if (parentId) {
    const matrix = await call('POST', `/api/products/${parentId}/variants/matrix`, {
      axes: [
        { name: 'Tamanho', values: ['S', 'M', 'L'] },
        { name: 'Cor', values: ['Branco', 'Preto'] },
      ],
    });
    const body = matrix.data?.data ?? matrix.data;
    const list = Array.isArray(body) ? body : body?.created ?? body?.variants ?? [];
    const count = Array.isArray(list) ? list.length : 0;
    record('catalogue', 'gerar matriz de variantes', created(matrix) && count > 0, `${count} variantes ${created(matrix) ? '' : why(matrix)}`);
  }

  const group = await call('POST', '/api/products/modifier-groups', {
    namePt: 'Escolha a proteina',
    type: 'required',
    minSelect: 1,
    maxSelect: 1,
  });
  record('catalogue', 'criar grupo de opcoes', created(group), why(group));
  const groupId = group.data?.id;

  if (groupId) {
    const modifier = await call('POST', `/api/products/modifier-groups/${groupId}/modifiers`, {
      namePt: 'Frango',
      priceDeltaMinor: 0,
    });
    record('catalogue', 'criar opcao (modificador)', created(modifier), why(modifier));
  }

  const ingredient = await call('POST', '/api/products', {
    namePt: 'Pao Teste',
    sku: `TESTI-${stamp}`,
    type: 'standard',
    unit: 'each',
    salePriceMinor: 20000,
    costPriceMinor: 8000,
    taxRateBps: 0,
  });
  const ingredientId = ingredient.data?.id;

  const composite = await call('POST', '/api/products', {
    namePt: 'Hamburguer Teste',
    sku: `TESTC-${stamp}`,
    type: 'composite',
    unit: 'each',
    salePriceMinor: 450000,
    taxRateBps: 1400,
    isMenuItem: true,
    prepStation: 'grill',
    components: ingredientId ? [{ componentProductId: ingredientId, quantity: 1, unit: 'each' }] : [],
  });
  record('catalogue', 'criar produto composto (receita)', created(composite), why(composite));

  if (composite.data?.id && ingredientId) {
    const recipe = await call('PUT', `/api/products/${composite.data.id}/recipe`, {
      components: [{ componentProductId: ingredientId, quantity: 2, unit: 'each', wastagePercentBps: 500 }],
    });
    record('catalogue', 'editar receita (lista de materiais)', created(recipe), why(recipe));
  }

  const promotion = await call('POST', '/api/promotions', {
    code: `TESTE${stamp % 100000}`,
    namePt: 'Promocao Teste',
    type: 'percent_off',
    value: 1000,
    active: true,
  });
  record('catalogue', 'criar promocao', created(promotion), why(promotion));

  /* ------------------------------------------------------------- stock -- */
  section('Stock');
  const receipt = await call('POST', '/api/inventory/receipts', {
    locationId,
    supplierId,
    invoiceNumber: `FT-${stamp}`,
    lines: [
      { productId, quantity: 50, unitCostMinor: 70000 },
      ...(ingredientId ? [{ productId: ingredientId, quantity: 100, unitCostMinor: 8000 }] : []),
    ],
  });
  record('stock', 'criar entrada de stock', created(receipt), why(receipt));

  const adjust = await call('POST', '/api/inventory/adjustments', {
    productId,
    locationId,
    quantityDelta: -2,
    reason: 'damage',
    note: 'Teste de quebra',
  });
  record('stock', 'criar ajuste de stock', created(adjust), why(adjust));

  const transfer = await call('POST', '/api/inventory/transfers', {
    fromLocationId: locationId,
    toLocationId: location2.data?.id,
    lines: [{ productId, quantity: 5 }],
  });
  record('stock', 'criar transferencia', created(transfer), why(transfer));

  const stocktake = await call('POST', '/api/inventory/stocktakes', { locationId });
  record('stock', 'criar inventario fisico', created(stocktake), why(stocktake));

  const po = await call('POST', '/api/suppliers/purchase-orders', {
    supplierId,
    lines: [{ productId, quantity: 20, unitCostMinor: 70000 }],
  });
  record('stock', 'criar encomenda a fornecedor', created(po), why(po));

  /* --------------------------------------------------------- customers -- */
  section('Clientes');
  const customer = await call('POST', '/api/customers', {
    name: 'Cliente Teste',
    phone: `+24492${String(stamp).slice(-7)}`,
    email: `cli-${stamp}@teste.ao`,
  });
  record('customers', 'criar cliente', created(customer), why(customer));
  const customerId = customer.data?.id;

  if (customerId) {
    const points = await call('POST', `/api/customers/${customerId}/loyalty/adjust`, {
      points: 100,
      note: 'Teste',
    });
    record('customers', 'ajustar pontos de fidelidade', created(points), why(points));

    const credit = await call('POST', `/api/customers/${customerId}/store-credit`, {
      amountMinor: 100000,
      note: 'Teste',
    });
    record('customers', 'adicionar credito de loja', created(credit), why(credit));
  }

  /* -------------------------------------------------------- restaurant -- */
  section('Restaurante');
  const area = await call('POST', '/api/restaurant/areas', { name: 'Sala Teste', width: 1200, height: 800 });
  record('restaurant', 'criar zona (plano de sala)', created(area), why(area));
  const areaId = area.data?.id;

  let tableId = null;
  if (areaId) {
    const table = await call('POST', '/api/restaurant/tables', {
      areaId,
      name: 'Mesa T1',
      shape: 'square',
      x: 100,
      y: 100,
      width: 120,
      height: 120,
      seats: 4,
    });
    record('restaurant', 'criar mesa', created(table), why(table));
    tableId = table.data?.id;

    const layout = await call('POST', '/api/restaurant/tables/layout', {
      tables: tableId ? [{ id: tableId, areaId, x: 200, y: 150, width: 120, height: 120, rotation: 0, shape: 'circle', seats: 6, name: 'Mesa T1' }] : [],
    });
    record('restaurant', 'guardar disposicao (arrastar e largar)', created(layout), why(layout));
  }

  let orderId = null;
  if (tableId) {
    const order = await call('POST', '/api/restaurant/orders', { tableId, guestCount: 2 });
    record('restaurant', 'abrir mesa (criar pedido)', created(order), why(order));
    orderId = order.data?.id;
  }

  if (orderId && composite.data?.id) {
    const items = await call('POST', `/api/restaurant/orders/${orderId}/items`, {
      items: [{ productId: composite.data.id, quantity: 2, course: 1 }],
    });
    record('restaurant', 'adicionar artigos ao pedido', created(items), why(items));

    const bill = await call('GET', `/api/restaurant/orders/${orderId}/bill`);
    const billTotal = bill.data?.totalMinor ?? bill.data?.total ?? 0;
    record(
      'restaurant',
      'ver total da conta (o empregado ve quanto cobrar)',
      created(bill) && Number(billTotal) > 0,
      `total ${Number(billTotal) / 100} Kz ${created(bill) ? '' : why(bill)}`,
    );

    const send = await call('POST', `/api/restaurant/orders/${orderId}/send`, {});
    record('restaurant', 'enviar para a cozinha (cria ticket)', created(send), why(send));

    const tickets = await call('GET', '/api/kds/tickets');
    const list = tickets.data?.data ?? tickets.data ?? [];
    record('restaurant', 'ticket aparece no ecra de cozinha', Array.isArray(list) && list.length > 0, `${list.length} tickets`);
  }

  /* ------------------------------------------------------------ selling -- */
  section('Vendas');
  const sale = await call('POST', '/api/sales', {
    channel: 'pos',
    locationId,
    idempotencyKey: `create-test-${stamp}`,
    lines: [
      {
        key: 'l1',
        productId,
        name: 'Refrigerante Teste 350ml',
        sku: `TEST-${stamp}`,
        unit: 'each',
        type: 'standard',
        quantity: 2,
        unitPriceMinor: 120000,
        taxRateBps: 1400,
      },
    ],
    payments: [{ method: 'cash', amountMinor: 240000, tenderedMinor: 500000 }],
    customerId,
  });
  record('selling', 'criar venda na caixa', created(sale), why(sale));
  const saleId = sale.data?.id;

  const held = await call('POST', '/api/sales/hold', {
    channel: 'pos',
    holdLabel: 'Cliente de casaco azul',
    lines: [
      {
        key: 'l1',
        productId,
        name: 'Refrigerante Teste 350ml',
        sku: `TEST-${stamp}`,
        unit: 'each',
        type: 'standard',
        quantity: 1,
        unitPriceMinor: 120000,
        taxRateBps: 1400,
      },
    ],
    payments: [],
  });
  record('selling', 'suspender venda (park)', created(held), why(held));

  if (saleId) {
    const detail = await call('GET', `/api/sales/${saleId}`);
    const lineId = detail.data?.lines?.[0]?.id;
    if (lineId) {
      const refund = await call('POST', '/api/sales/refunds', {
        saleId,
        lines: [{ saleLineId: lineId, quantity: 1, reason: 'defective', restock: true }],
        method: 'original',
      });
      record('selling', 'criar devolucao', created(refund), why(refund));
    } else {
      record('selling', 'criar devolucao', false, 'nao foi possivel ler a linha da venda');
    }
  }

  /* -------------------------------------------------------------- online -- */
  section('Loja online');
  const slug = entity.data?.slug;
  const cart = await call('POST', '/api/online/cart', { entitySlug: slug, sessionId: `sess-${stamp}` }, { anonymous: true });
  record('online', 'criar carrinho', created(cart), why(cart));
  // Some endpoints answer { data: {...} } and some answer the object directly.
  const cartId = cart.data?.data?.id ?? cart.data?.id;

  if (cartId && productId) {
    const item = await call('POST', `/api/online/cart/${cartId}/items`, { productId, quantity: 1 }, { anonymous: true });
    record('online', 'adicionar ao carrinho', created(item), why(item));
  } else {
    // A skipped check is not a passing check - say so out loud.
    record('online', 'adicionar ao carrinho', false, 'sem carrinho para testar');
  }

  /* ------------------------------------------------------------ settings -- */
  section('Definicoes');
  const settings = await call('PATCH', '/api/settings', { receiptFooter: 'Obrigado! Teste.' });
  record('settings', 'guardar definicoes', created(settings), why(settings));

  const taxes = await call('PUT', '/api/settings/tax-rates', {
    rates: [
      { id: 'iva14', namePt: 'IVA 14%', rateBps: 1400 },
      { id: 'exempt', namePt: 'Isento', rateBps: 0 },
    ],
  });
  record('settings', 'guardar taxas de imposto', created(taxes), why(taxes));

  /* ------------------------------------------------------------ summary -- */
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'='.repeat(60)}`);
  if (failed.length === 0) {
    console.log(`${G}  All ${results.length} create flows work.${X}`);
  } else {
    console.log(`${R}  ${failed.length} of ${results.length} create flows FAILED:${X}`);
    for (const f of failed) console.log(`${R}    - [${f.area}] ${f.what}${X}  ${D}${f.detail}${X}`);
  }
  console.log(`${D}  Test entity: ${entity.data?.name} (${entityId})${X}`);
  console.log(`${'='.repeat(60)}\n`);

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${R}Crashed:${X}`, error.message);
  process.exit(1);
});
