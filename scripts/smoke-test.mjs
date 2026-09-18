#!/usr/bin/env node
/**
 * End-to-end smoke test against a running API.
 *
 *   npm run dev          (in one terminal)
 *   node scripts/smoke-test.mjs
 *
 * Walks the full lifecycle of a product - arriving from a supplier, sitting on
 * the shelf, being sold, and landing in the profit and loss - and asserts the
 * numbers agree at every step. If this passes, the system genuinely works;
 * if it fails, it names the step and the expectation.
 */

const BASE = process.env.SMOKE_API_URL || 'http://localhost:4000';
const EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@pos.local';
const PASSWORD = process.env.SUPERADMIN_PASSWORD || 'admin123';

let token = null;
let entityId = null;
let passed = 0;
let failed = 0;

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';

function ok(label, detail = '') {
  passed += 1;
  console.log(`  ${GREEN}pass${RESET} ${label}${detail ? ` ${DIM}${detail}${RESET}` : ''}`);
}

function fail(label, detail) {
  failed += 1;
  console.log(`  ${RED}FAIL${RESET} ${label}`);
  if (detail) console.log(`       ${RED}${detail}${RESET}`);
}

function check(label, condition, detail) {
  if (condition) ok(label, detail);
  else fail(label, detail);
  return condition;
}

function section(title) {
  console.log(`\n${title}`);
}

async function call(method, path, body, options = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token && !options.anonymous) headers.Authorization = `Bearer ${token}`;
  if (entityId && !options.anonymous) headers['X-Entity-Id'] = entityId;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: response.status, data };
}

function money(minor) {
  return `${(minor / 100).toFixed(2)} Kz`;
}

async function main() {
  console.log(`\nSmoke test against ${BASE}`);

  /* ---------------------------------------------------------------- health */
  section('Health');
  const health = await call('GET', '/api/health');
  if (!check('API is up', health.status === 200, `status ${health.status}`)) {
    console.log(`\n${RED}The API is not responding. Start it with: npm run dev${RESET}\n`);
    process.exit(1);
  }
  check('database is reachable', health.data?.database === 'up');

  /* ------------------------------------------------------------------ auth */
  section('Authentication');
  const badLogin = await call('POST', '/api/auth/login', { email: EMAIL, password: 'wrong-password' }, { anonymous: true });
  check('rejects a wrong password', badLogin.status === 401);
  check(
    'does not reveal whether the account exists',
    !JSON.stringify(badLogin.data ?? '').toLowerCase().includes('nao encontrado'),
  );

  const login = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD }, { anonymous: true });
  if (!check('super admin can sign in', login.status === 200, `status ${login.status}`)) {
    console.log(`\n${RED}Could not sign in as ${EMAIL}. Run: npm run db:seed${RESET}\n`);
    process.exit(1);
  }
  token = login.data.token;
  check('issues an access token', typeof token === 'string' && token.length > 20);
  check('returns the permission set', Array.isArray(login.data.user?.permissions));

  const unauth = await call('GET', '/api/products', undefined, { anonymous: true });
  check('rejects unauthenticated reads', unauth.status === 401);

  /* ---------------------------------------------------------------- tenancy */
  section('Entity');
  const stamp = Date.now();
  const created = await call('POST', '/api/entities', {
    name: `Smoke Test ${stamp}`,
    mode: 'retail',
    currency: 'AOA',
    pricingMode: 'inclusive',
    defaultTaxRateBps: 1400,
  });
  if (!check('creates an entity', created.status === 201 || created.status === 200, JSON.stringify(created.data)?.slice(0, 200))) {
    process.exit(1);
  }
  entityId = created.data.id ?? created.data.entity?.id;
  check('entity has an id', Boolean(entityId));

  const locations = await call('GET', `/api/entities/${entityId}/locations`);
  const locationId = Array.isArray(locations.data) ? locations.data[0]?.id : locations.data?.data?.[0]?.id;
  check('a default location was created with it', Boolean(locationId));

  /* -------------------------------------------------------------- catalogue */
  section('Catalogue');
  const category = await call('POST', '/api/categories', { namePt: 'Bebidas', nameEn: 'Drinks' });
  const categoryId = category.data?.id;
  check('creates a category', Boolean(categoryId), `status ${category.status}`);

  // 1200,00 Kz retail, tax-inclusive at 14%.
  const SALE_PRICE = 120_000;
  const COST_PRICE = 70_000;

  const product = await call('POST', '/api/products', {
    namePt: 'Refrigerante Smoke 350ml',
    sku: `SMOKE-${stamp}`,
    barcode: '4006381333931',
    categoryId,
    type: 'standard',
    unit: 'each',
    salePriceMinor: SALE_PRICE,
    costPriceMinor: COST_PRICE,
    taxRateBps: 1400,
    trackStock: true,
    minStockLevel: 5,
  });
  const productId = product.data?.id;
  if (!check('creates a product', Boolean(productId), JSON.stringify(product.data)?.slice(0, 200))) process.exit(1);
  check('starts with zero stock', (product.data?.stockQuantity ?? 0) === 0);

  const lookup = await call('GET', '/api/products/lookup?code=4006381333931');
  check('barcode lookup finds it', lookup.data?.found === true, `found=${lookup.data?.found}`);

  const missing = await call('GET', '/api/products/lookup?code=9999999999994');
  check('unknown barcode answers 200 with found:false', missing.status === 200 && missing.data?.found === false);

  /* ------------------------------------------------------------------ stock */
  section('Stock receipt');
  const RECEIVED = 20;
  const receipt = await call('POST', '/api/inventory/receipts', {
    locationId,
    invoiceNumber: `INV-${stamp}`,
    lines: [{ productId, quantity: RECEIVED, unitCostMinor: COST_PRICE }],
  });
  check('receives stock from a supplier', receipt.status === 201 || receipt.status === 200, JSON.stringify(receipt.data)?.slice(0, 200));

  const afterReceipt = await call('GET', `/api/products/${productId}`);
  check(
    `stock rose to ${RECEIVED}`,
    afterReceipt.data?.stockQuantity === RECEIVED,
    `got ${afterReceipt.data?.stockQuantity}`,
  );
  check(
    'weighted-average cost was captured',
    Number(afterReceipt.data?.costPriceMinor ?? afterReceipt.data?.avgCostMinor ?? 0) > 0,
  );

  /* ------------------------------------------------------------------- sale */
  section('Checkout');
  const QTY = 3;
  const expectedTotal = SALE_PRICE * QTY;

  const sale = await call('POST', '/api/sales', {
    channel: 'pos',
    locationId,
    idempotencyKey: `smoke-${stamp}`,
    lines: [
      {
        key: 'l1',
        productId,
        name: 'Refrigerante Smoke 350ml',
        sku: `SMOKE-${stamp}`,
        unit: 'each',
        type: 'standard',
        quantity: QTY,
        unitPriceMinor: SALE_PRICE,
        taxRateBps: 1400,
      },
    ],
    payments: [{ method: 'cash', amountMinor: expectedTotal, tenderedMinor: 500_000 }],
  });

  if (!check('completes a sale', sale.status === 201 || sale.status === 200, JSON.stringify(sale.data)?.slice(0, 300))) {
    process.exit(1);
  }
  const saleId = sale.data?.id;
  check('issues a receipt number', Boolean(sale.data?.receiptNumber), sale.data?.receiptNumber);
  check(`total is ${money(expectedTotal)}`, sale.data?.totalMinor === expectedTotal, `got ${sale.data?.totalMinor}`);
  check(
    'change was calculated',
    sale.data?.changeMinor === 500_000 - expectedTotal,
    `got ${sale.data?.changeMinor}`,
  );
  check(
    'net + tax equals the total',
    Number(sale.data?.netMinor) + Number(sale.data?.taxMinor) === Number(sale.data?.totalMinor),
  );
  check(
    'tax is 14% of the net amount',
    Math.abs(Math.round(Number(sale.data?.netMinor) * 0.14) - Number(sale.data?.taxMinor)) <= 1,
    `net ${sale.data?.netMinor} tax ${sale.data?.taxMinor}`,
  );
  check(
    `COGS was frozen at ${money(COST_PRICE * QTY)}`,
    Number(sale.data?.cogsMinor) === COST_PRICE * QTY,
    `got ${sale.data?.cogsMinor}`,
  );

  const replay = await call('POST', '/api/sales', {
    channel: 'pos',
    locationId,
    idempotencyKey: `smoke-${stamp}`,
    lines: [
      {
        key: 'l1',
        productId,
        name: 'Refrigerante Smoke 350ml',
        sku: `SMOKE-${stamp}`,
        unit: 'each',
        type: 'standard',
        quantity: QTY,
        unitPriceMinor: SALE_PRICE,
        taxRateBps: 1400,
      },
    ],
    payments: [{ method: 'cash', amountMinor: expectedTotal, tenderedMinor: 500_000 }],
  });
  check(
    'replaying the same sale is idempotent (offline queue safety)',
    replay.data?.id === saleId,
    `got ${replay.data?.id === saleId ? 'same sale' : 'a DUPLICATE sale'}`,
  );

  const afterSale = await call('GET', `/api/products/${productId}`);
  check(
    `stock fell to ${RECEIVED - QTY}`,
    afterSale.data?.stockQuantity === RECEIVED - QTY,
    `got ${afterSale.data?.stockQuantity}`,
  );

  /* ----------------------------------------------------------------- ledger */
  section('Stock ledger');
  const movements = await call('GET', `/api/inventory/movements?productId=${productId}`);
  const rows = movements.data?.data ?? movements.data ?? [];
  check('movements were recorded', Array.isArray(rows) && rows.length >= 2, `${rows.length} rows`);
  const netMovement = rows.reduce((total, row) => total + Number(row.quantity ?? 0), 0);
  check(
    'the ledger reconciles with the stock on hand',
    netMovement === RECEIVED - QTY,
    `ledger ${netMovement} vs stock ${afterSale.data?.stockQuantity}`,
  );

  /* ------------------------------------------------------------------- P&L */
  section('Reporting');
  const dashboard = await call('GET', '/api/reports/dashboard');
  check('dashboard responds', dashboard.status === 200, `status ${dashboard.status}`);
  check(
    `revenue includes the sale (${money(expectedTotal)})`,
    Number(dashboard.data?.revenueMinor ?? 0) >= expectedTotal,
    `got ${dashboard.data?.revenueMinor}`,
  );
  check(
    'COGS reached the P&L',
    Number(dashboard.data?.cogsMinor ?? 0) >= COST_PRICE * QTY,
    `got ${dashboard.data?.cogsMinor}`,
  );

  const revenue = Number(dashboard.data?.revenueMinor ?? 0);
  const cogs = Number(dashboard.data?.cogsMinor ?? 0);
  check(
    'gross profit equals revenue minus COGS',
    Number(dashboard.data?.grossProfitMinor ?? 0) === revenue - cogs,
    `${dashboard.data?.grossProfitMinor} vs ${revenue - cogs}`,
  );

  const pl = await call('GET', '/api/reports/profit-loss');
  check('profit and loss report responds', pl.status === 200, `status ${pl.status}`);

  /* ---------------------------------------------------------------- refund */
  section('Refund');
  const saleDetail = await call('GET', `/api/sales/${saleId}`);
  const lineId = saleDetail.data?.lines?.[0]?.id;
  if (lineId) {
    const refund = await call('POST', '/api/sales/refunds', {
      saleId,
      lines: [{ saleLineId: lineId, quantity: 1, reason: 'defective', restock: true }],
      method: 'original',
    });
    check('processes a refund', refund.status === 201 || refund.status === 200, JSON.stringify(refund.data)?.slice(0, 200));

    const afterRefund = await call('GET', `/api/products/${productId}`);
    check(
      'the returned unit went back into stock',
      afterRefund.data?.stockQuantity === RECEIVED - QTY + 1,
      `got ${afterRefund.data?.stockQuantity}`,
    );
  } else {
    fail('processes a refund', 'could not read the sale line id');
  }

  /* ------------------------------------------------------------------ RBAC */
  section('Access control');
  const cashier = await call('POST', '/api/users', {
    name: 'Caixa Smoke',
    email: `caixa-${stamp}@smoke.test`,
    password: 'smoke12345',
    role: 'cashier',
  });
  check('creates a cashier', cashier.status === 201 || cashier.status === 200, JSON.stringify(cashier.data)?.slice(0, 160));

  const cashierLogin = await call(
    'POST',
    '/api/auth/login',
    { email: `caixa-${stamp}@smoke.test`, password: 'smoke12345' },
    { anonymous: true },
  );

  if (cashierLogin.status === 200) {
    const adminToken = token;
    token = cashierLogin.data.token;

    const asCashier = await call('GET', `/api/products/${productId}`);
    check(
      'a cashier never receives the cost price',
      asCashier.data?.costPriceMinor === undefined && asCashier.data?.avgCostMinor === undefined,
      `costPriceMinor=${asCashier.data?.costPriceMinor}`,
    );

    const blocked = await call('GET', '/api/reports/profit-loss');
    check('a cashier cannot open the P&L', blocked.status === 403, `status ${blocked.status}`);

    token = adminToken;
  } else {
    fail('cashier can sign in', `status ${cashierLogin.status}`);
  }

  /* ---------------------------------------------------------------- summary */
  console.log(`\n${'='.repeat(56)}`);
  if (failed === 0) {
    console.log(`${GREEN}  ${passed} checks passed. The system works end to end.${RESET}`);
  } else {
    console.log(`${RED}  ${failed} of ${passed + failed} checks failed.${RESET}`);
  }
  console.log(`${DIM}  Test entity: Smoke Test ${stamp} (${entityId})${RESET}`);
  console.log(`${'='.repeat(56)}\n`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${RED}Smoke test crashed:${RESET}`, error.message);
  process.exit(1);
});
