/**
 * Demo seed.
 *
 *   npm run db:seed
 *
 * Creates three tenants - a supermarket, a restaurant and an online store - so
 * every mode of the system can be explored the moment the database is up.
 *
 * IDEMPOTENT: the three demo entities are identified by their slug and dropped
 * before being rebuilt, so running this twice leaves exactly the same database
 * as running it once. Nothing outside those slugs (and the super admin account)
 * is ever touched.
 *
 * DETERMINISTIC: every random choice comes from a seeded mulberry32 generator,
 * never Math.random(), so two runs produce the same catalogue, the same baskets
 * and the same totals. Only the timestamps move, because the history is always
 * anchored to "today".
 */
import { env } from '../src/lib/env.js';
import { hashPassword } from '../src/lib/auth.js';
import { prisma } from '../src/lib/prisma.js';
import { createEntity, addCounts, type Counts, type EntityBundle, type SeedContext } from './seed-data/common.js';
import { id } from './seed-data/helpers.js';
import { resetSeedImages, seedImageDir } from './seed-data/images.js';
import { Rng } from './seed-data/rng.js';
import { createUsers, DEMO_PASSWORD, type SeededUser, type UserSpec } from './seed-data/users.js';
import { seedRetail } from './seed-data/retail.js';
import { seedRestaurant } from './seed-data/restaurant.js';
import { seedOnline } from './seed-data/online.js';

/** Change this and every random choice in the demo data changes with it. */
const RANDOM_SEED = 20_260_918;

const RETAIL_SLUG = 'supermercado-kalunga';
const RESTAURANT_SLUG = 'restaurante-muxima';
const ONLINE_SLUG = 'loja-online-ginga';
const DEMO_SLUGS = [RETAIL_SLUG, RESTAURANT_SLUG, ONLINE_SLUG];

async function wipeDemoData(): Promise<number> {
  const entities = await prisma.entity.findMany({
    where: { slug: { in: DEMO_SLUGS } },
    select: { id: true },
  });
  const entityIds = entities.map((entity) => entity.id);

  if (entityIds.length > 0) {
    // Sequence has no relation to Entity (it is a bare counter table), so the
    // cascade cannot reach it - it has to go by hand.
    await prisma.sequence.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
  }

  // The super admin has no entity, so nothing cascades to it.
  await prisma.user.deleteMany({ where: { email: env.superAdmin.email, entityId: null } });

  return entityIds.length;
}

async function seedSuperAdmin(): Promise<SeededUser> {
  const userId = id();
  await prisma.user.create({
    data: {
      id: userId,
      entityId: null,
      name: 'Super Administrador',
      email: env.superAdmin.email,
      passwordHash: await hashPassword(env.superAdmin.password),
      role: 'super_admin',
      locale: 'pt-PT',
      active: true,
    },
  });

  return {
    id: userId,
    key: 'super_admin',
    name: 'Super Administrador',
    email: env.superAdmin.email,
    password: env.superAdmin.password,
    role: 'super_admin',
    pin: null,
    entityLabel: '(todas)',
  };
}

interface StaffSpec {
  key: string;
  name: string;
  local: string;
  role: UserSpec['role'];
  pin?: string;
  atDefaultLocation?: boolean;
}

function staffFor(slug: string, specs: StaffSpec[], locationId: string): UserSpec[] {
  return specs.map((spec) => ({
    key: spec.key,
    name: spec.name,
    email: `${spec.local}@${slug}.ao`,
    role: spec.role,
    password: DEMO_PASSWORD,
    pin: spec.pin,
    locationId: spec.atDefaultLocation === false ? null : locationId,
  }));
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const now = new Date();
  const rng = new Rng(RANDOM_SEED);
  const ctx: SeedContext = { client: prisma, rng, now };

  console.log('');
  console.log('  A preparar os dados de demonstracao...');

  const wiped = await wipeDemoData();
  if (wiped > 0) console.log(`  Removidas ${wiped} entidades de demonstracao anteriores.`);

  resetSeedImages();

  const credentials: SeededUser[] = [await seedSuperAdmin()];
  const totals: Counts = {};

  /* -- 1. Supermercado Kalunga (retalho) ------------------------------------ */
  const retailBase = await createEntity(prisma, {
    name: 'Supermercado Kalunga',
    slug: RETAIL_SLUG,
    mode: 'retail',
    nif: '5417123456',
    address: 'Rua Amilcar Cabral 210, Maianga, Luanda',
    phone: '+244 222 330 110',
    email: 'geral@kalunga.ao',
    accentColor: '#006AFF',
    pricingMode: 'inclusive',
    taxRateBps: 1400,
    locations: [
      { name: 'Loja Principal', isDefault: true },
      { name: 'Armazem', address: 'Zona Industrial do Cazenga, Luanda', isDefault: false },
    ],
  });

  const retailUsers = await createUsers(
    prisma,
    retailBase.id,
    retailBase.name,
    staffFor(
      RETAIL_SLUG,
      [
        { key: 'admin', name: 'Helena Gourgel', local: 'admin', role: 'entity_admin' },
        { key: 'manager', name: 'Alberto Chivinda', local: 'gerente', role: 'manager' },
        { key: 'cashier', name: 'Neusa Kiala', local: 'caixa', role: 'cashier', pin: '1234' },
        { key: 'cashier2', name: 'Bruno Sacramento', local: 'caixa2', role: 'cashier', pin: '2345' },
        { key: 'stock', name: 'Osvaldo Muanza', local: 'stock', role: 'stock_clerk' },
      ],
      (retailBase.locations[0] as { id: string }).id,
    ),
  );
  credentials.push(...retailUsers.credentials);

  const retail: EntityBundle = { ...retailBase, users: retailUsers.byKey };
  console.log('  Supermercado Kalunga: catalogo, stock e 90 dias de vendas...');
  addCounts(totals, await seedRetail(ctx, retail));

  /* -- 2. Restaurante Muxima ------------------------------------------------ */
  const restaurantBase = await createEntity(prisma, {
    name: 'Restaurante Muxima',
    slug: RESTAURANT_SLUG,
    mode: 'restaurant',
    nif: '5417998877',
    address: 'Ilha do Cabo 45, Luanda',
    phone: '+244 222 440 220',
    email: 'reservas@muxima.ao',
    accentColor: '#A8213C',
    pricingMode: 'inclusive',
    taxRateBps: 1400,
    locations: [{ name: 'Sala', isDefault: true }],
  });

  const restaurantUsers = await createUsers(
    prisma,
    restaurantBase.id,
    restaurantBase.name,
    staffFor(
      RESTAURANT_SLUG,
      [
        { key: 'admin', name: 'Mario Quiteque', local: 'admin', role: 'entity_admin' },
        { key: 'manager', name: 'Vanda Sebastiao', local: 'gerente', role: 'manager' },
        { key: 'cashier', name: 'Ilidio Massano', local: 'caixa', role: 'cashier', pin: '1234' },
        { key: 'stock', name: 'Geraldo Pascoal', local: 'stock', role: 'stock_clerk' },
        { key: 'waiter', name: 'Cristina Bumba', local: 'empregado', role: 'waiter', pin: '3456' },
        { key: 'kitchen', name: 'Chef Domingos Neto', local: 'cozinha', role: 'kitchen', pin: '4567' },
      ],
      (restaurantBase.locations[0] as { id: string }).id,
    ),
  );
  credentials.push(...restaurantUsers.credentials);

  const restaurant: EntityBundle = { ...restaurantBase, users: restaurantUsers.byKey };
  console.log('  Restaurante Muxima: menu, sala, mesas ocupadas e cozinha...');
  addCounts(totals, await seedRestaurant(ctx, restaurant));

  /* -- 3. Loja Online Ginga -------------------------------------------------- */
  const onlineBase = await createEntity(prisma, {
    name: 'Loja Online Ginga',
    slug: ONLINE_SLUG,
    mode: 'online',
    nif: '5417556644',
    address: 'Talatona, Edificio Ginga, Luanda',
    phone: '+244 222 550 330',
    email: 'apoio@ginga.ao',
    accentColor: '#7C4DFF',
    pricingMode: 'inclusive',
    taxRateBps: 1400,
    locations: [{ name: 'Armazem Talatona', isDefault: true }],
  });

  const onlineUsers = await createUsers(
    prisma,
    onlineBase.id,
    onlineBase.name,
    staffFor(
      ONLINE_SLUG,
      [
        { key: 'admin', name: 'Dilma Ferraz', local: 'admin', role: 'entity_admin' },
        { key: 'manager', name: 'Nuno Capemba', local: 'gerente', role: 'manager' },
        { key: 'cashier', name: 'Sara Lutucuta', local: 'caixa', role: 'cashier', pin: '1234' },
        { key: 'stock', name: 'Tiago Bengue', local: 'stock', role: 'stock_clerk' },
      ],
      (onlineBase.locations[0] as { id: string }).id,
    ),
  );
  credentials.push(...onlineUsers.credentials);

  const online: EntityBundle = { ...onlineBase, users: onlineUsers.byKey };
  console.log('  Loja Online Ginga: montra, encomendas e expedicao...');
  addCounts(totals, await seedOnline(ctx, online));

  printSummary(totals, credentials, Date.now() - startedAt);
}

/* -------------------------------------------------------------------------- */
/* Output                                                                      */
/* -------------------------------------------------------------------------- */

function rule(width = 88): string {
  return '-'.repeat(width);
}

function printSummary(totals: Counts, credentials: SeededUser[], elapsedMs: number): void {
  const label = (key: string): string => key.replace(/_/g, ' ');
  const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));

  console.log('');
  console.log(rule());
  console.log('  DADOS DE DEMONSTRACAO CRIADOS');
  console.log(rule());
  console.log('');
  console.log('  Entidades:');
  console.log('    1. Supermercado Kalunga   (retalho)     /supermercado-kalunga');
  console.log('    2. Restaurante Muxima     (restaurante) /restaurante-muxima');
  console.log('    3. Loja Online Ginga      (online)      /loja-online-ginga');
  console.log('');
  console.log('  Totais:');

  const columns = 3;
  const cells = entries.map(([key, value]) => `${label(key).padEnd(22)} ${String(value).padStart(6)}`);
  for (let i = 0; i < cells.length; i += columns) {
    console.log('    ' + cells.slice(i, i + columns).join('   '));
  }

  console.log('');
  console.log(rule());
  console.log('  CREDENCIAIS DE ACESSO');
  console.log(rule());
  const header =
    '  ' +
    'Entidade'.padEnd(24) +
    'Perfil'.padEnd(14) +
    'Email'.padEnd(34) +
    'Palavra-passe'.padEnd(14) +
    'PIN';
  console.log(header);
  console.log('  ' + rule(86));
  for (const user of credentials) {
    console.log(
      '  ' +
        user.entityLabel.slice(0, 23).padEnd(24) +
        user.role.padEnd(14) +
        user.email.padEnd(34) +
        user.password.padEnd(14) +
        (user.pin ?? '-'),
    );
  }
  console.log('');
  console.log(`  Imagens de demonstracao: ${seedImageDir()}`);
  console.log(`  Concluido em ${(elapsedMs / 1000).toFixed(1)}s.`);
  console.log('');
}

main()
  .catch((error: unknown) => {
    console.error('');
    console.error('  A seed falhou:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
