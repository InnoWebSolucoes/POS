/**
 * Permission and privilege-escalation tests.
 *
 * Every check here is a way somebody inside a business could try to reach access
 * the owner never gave them. They run against a live API inside throwaway
 * businesses, so nothing here can touch real data.
 *
 *   npm run test:permissions
 */

const API = process.env.API_URL ?? 'http://localhost:4000';
const PW = 'Password123!';
const stamp = process.env.STAMP ?? String(process.hrtime.bigint()).slice(-9);

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

async function call(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* an empty body is fine */
  }
  return { status: response.status, body };
}

const auth = (token) => ({ authorization: `Bearer ${token}` });
const tokenOf = (body) => body?.accessToken ?? body?.token ?? null;

/** Signs a business up and returns the owner session. */
async function newBusiness(label, mode) {
  const email = `owner-${label}-${stamp}@teste.ao`;
  const response = await call('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      businessName: `Teste ${label} ${stamp}`,
      mode,
      ownerName: 'Dona Ana',
      email,
      password: PW,
      currency: 'AOA',
      locale: 'pt-PT',
    }),
  });
  if (response.status >= 300) {
    throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { token: tokenOf(response.body), email };
}

async function hire(ownerToken, label, role) {
  const email = `${label}-${stamp}@teste.ao`;
  const response = await call('/api/users', {
    method: 'POST',
    headers: auth(ownerToken),
    body: JSON.stringify({ name: label, email, password: PW, role }),
  });
  if (response.status >= 300) {
    throw new Error(`hire ${role} failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { id: response.body.id, email };
}

async function signIn(email) {
  const response = await call('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PW }),
  });
  return tokenOf(response.body);
}

/** What the interface will believe this member may do. */
async function sessionPermissions(token) {
  const response = await call('/api/auth/me', { headers: auth(token) });
  return response.body?.permissions ?? response.body?.user?.permissions ?? [];
}

/** What the server believes this member may do. */
async function effectiveFor(token, userId) {
  const response = await call(`/api/users/${userId}/permissions`, { headers: auth(token) });
  return response.body?.effective ?? [];
}

async function setPermissions(token, userId, permissions) {
  return call(`/api/users/${userId}/permissions`, {
    method: 'PUT',
    headers: auth(token),
    body: JSON.stringify({ permissions }),
  });
}

async function main() {
  console.log(`\nPermission tests against ${API}\n`);

  const owner = await newBusiness('principal', 'retail');
  const neighbour = await newBusiness('vizinho', 'restaurant');

  const manager = await hire(owner.token, 'gestor', 'manager');
  const cashier = await hire(owner.token, 'caixa', 'cashier');
  const outsider = await hire(neighbour.token, 'estranho', 'manager');

  const staff = await call('/api/users', { headers: auth(owner.token) });
  const ownerId = (staff.body?.data ?? []).find((user) => user.role === 'entity_admin')?.id;

  /* ------------------------------------------------------------------ */
  console.log('Per-member tuning reaches the interface');

  const cashierDefaults = await effectiveFor(owner.token, cashier.id);
  check('a cashier sees no cost prices by default', !cashierDefaults.includes('product:cost'));

  const granted = await setPermissions(owner.token, cashier.id, [
    ...new Set([...cashierDefaults, 'report:read']),
  ]);
  check('the owner may grant beyond the role', granted.status === 200, `got ${granted.status}`);

  const cashierSession = await sessionPermissions(await signIn(cashier.email));
  check(
    'a granted permission reaches the session the interface reads',
    cashierSession.includes('report:read'),
    'the owner would hand over access the member could never reach',
  );

  const trimmed = cashierSession.filter((permission) => permission !== 'customer:write');
  const revoked = await setPermissions(owner.token, cashier.id, trimmed);
  check('the owner may revoke part of the role', revoked.status === 200, `got ${revoked.status}`);

  const cashierToken = await signIn(cashier.email);
  check(
    'a revoked permission disappears from that session',
    !(await sessionPermissions(cashierToken)).includes('customer:write'),
    'the interface would still draw a button that fails at the server',
  );

  const blocked = await call('/api/customers', {
    method: 'POST',
    headers: auth(cashierToken),
    body: JSON.stringify({ name: 'Cliente Teste' }),
  });
  check(
    'the server refuses the revoked action, not only the interface',
    blocked.status === 403,
    `got ${blocked.status}`,
  );

  /* ------------------------------------------------------------------ */
  console.log('\nNobody hands themselves more');

  const managerDefaults = await effectiveFor(owner.token, manager.id);
  const delegated = await setPermissions(owner.token, manager.id, [
    ...new Set([...managerDefaults, 'user:write']),
  ]);
  check('the owner may delegate staff management', delegated.status === 200);

  const managerToken = await signIn(manager.email);
  const managerPermissions = await sessionPermissions(managerToken);
  check('the manager now manages staff', managerPermissions.includes('user:write'));
  check('and still holds no settings access', !managerPermissions.includes('settings:write'));

  const self = await setPermissions(managerToken, manager.id, [
    ...new Set([...managerPermissions, 'settings:write']),
  ]);
  check('a member cannot edit their own permissions', self.status === 403, `got ${self.status}`);

  const overreach = await setPermissions(managerToken, cashier.id, [
    ...new Set([...(await effectiveFor(managerToken, cashier.id)), 'settings:write']),
  ]);
  check(
    'a manager cannot grant access they do not hold',
    overreach.status === 403,
    `got ${overreach.status}`,
  );

  /* ------------------------------------------------------------------ */
  console.log('\nThe side doors around the permission editor');

  const minted = await call('/api/users', {
    method: 'POST',
    headers: auth(managerToken),
    body: JSON.stringify({
      name: 'Conta Fantasma',
      email: `fantasma-${stamp}@teste.ao`,
      password: PW,
      role: 'entity_admin',
    }),
  });
  check(
    'a manager cannot create an account stronger than their own',
    minted.status === 403,
    `got ${minted.status} - they could sign in as it and hold everything`,
  );

  const takeover = await call(`/api/users/${ownerId}/password`, {
    method: 'POST',
    headers: auth(managerToken),
    body: JSON.stringify({ password: 'NovaPass123!' }),
  });
  check(
    'a manager cannot reset the owner password',
    takeover.status === 403,
    `got ${takeover.status} - whoever sets a password can sign in as that person`,
  );

  const demoted = await call(`/api/users/${ownerId}`, {
    method: 'PATCH',
    headers: auth(managerToken),
    body: JSON.stringify({ role: 'cashier' }),
  });
  check('a manager cannot demote the owner', demoted.status === 403, `got ${demoted.status}`);

  const removed = await call(`/api/users/${ownerId}`, {
    method: 'DELETE',
    headers: auth(managerToken),
  });
  check('a manager cannot remove the owner', removed.status === 403, `got ${removed.status}`);

  const promotedToPin = await call(`/api/users/${ownerId}/pin`, {
    method: 'POST',
    headers: auth(managerToken),
    body: JSON.stringify({ pin: '4321' }),
  });
  check(
    'a manager cannot set a PIN on the owner account',
    promotedToPin.status === 403,
    `got ${promotedToPin.status}`,
  );

  const platform = await call('/api/users', {
    method: 'POST',
    headers: auth(owner.token),
    body: JSON.stringify({
      name: 'Falso Operador',
      email: `operador-${stamp}@teste.ao`,
      password: PW,
      role: 'super_admin',
    }),
  });
  check(
    'an owner cannot mint a platform operator',
    platform.status === 403,
    `got ${platform.status}`,
  );

  /* ------------------------------------------------------------------ */
  console.log('\nOne business cannot reach into another');

  const crossRead = await call(`/api/users/${outsider.id}/permissions`, {
    headers: auth(owner.token),
  });
  check(
    'an owner cannot read a member of another business',
    crossRead.status === 404 || crossRead.status === 403,
    `got ${crossRead.status}`,
  );

  const crossWrite = await setPermissions(owner.token, outsider.id, ['entity:read']);
  check(
    'an owner cannot rewrite permissions in another business',
    crossWrite.status === 404 || crossWrite.status === 403,
    `got ${crossWrite.status}`,
  );

  const forged = await call(`/api/users/${outsider.id}/permissions`, {
    headers: { ...auth(owner.token), 'x-entity-id': 'qualquer-entidade' },
  });
  check(
    'forging the tenant header changes nothing for a normal user',
    forged.status === 404 || forged.status === 403,
    `got ${forged.status}`,
  );

  /* ------------------------------------------------------------------ */
  console.log('\nA business cannot lock itself out');

  const ownerEffective = await effectiveFor(owner.token, ownerId);
  const strip = await setPermissions(
    owner.token,
    ownerId,
    ownerEffective.filter((permission) => permission !== 'user:write'),
  );
  check(
    'the last staff manager keeps staff management',
    strip.status === 403 || strip.status === 409,
    `got ${strip.status}`,
  );

  /* ------------------------------------------------------------------ */
  console.log('\nResetting puts a member back on their role');

  const reset = await call(`/api/users/${cashier.id}/permissions/reset`, {
    method: 'POST',
    headers: auth(owner.token),
  });
  check('a member can be put back on the role defaults', reset.status === 200);

  const restored = await effectiveFor(owner.token, cashier.id);
  check('the tuning is gone', !restored.includes('report:read'));
  check('and what the role gives is back', restored.includes('customer:write'));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\nThe run itself failed:', error.message);
  process.exit(1);
});
