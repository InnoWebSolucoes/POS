import type { PrismaClient } from '@prisma/client';
import type { EntityMode, PricingMode } from '@pos/shared';
import { id } from './helpers.js';
import type { SeededUser } from './users.js';
import type { Rng } from './rng.js';

/** Everything a per-entity seeder needs to do its job. */
export interface SeedContext {
  client: PrismaClient;
  rng: Rng;
  /** Frozen "now" so one run produces one coherent timeline. */
  now: Date;
}

export interface SeededLocation {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface EntityBundle {
  id: string;
  slug: string;
  name: string;
  mode: EntityMode;
  currency: string;
  pricingMode: PricingMode;
  taxRateBps: number;
  locations: SeededLocation[];
  users: Map<string, SeededUser>;
}

export interface EntitySpec {
  name: string;
  slug: string;
  mode: EntityMode;
  nif: string;
  address: string;
  phone: string;
  email: string;
  accentColor: string;
  pricingMode?: PricingMode;
  taxRateBps?: number;
  locations: Array<{ name: string; address?: string; phone?: string; isDefault?: boolean }>;
}

export async function createEntity(
  client: PrismaClient,
  spec: EntitySpec,
): Promise<Omit<EntityBundle, 'users'>> {
  const entityId = id();
  const pricingMode = spec.pricingMode ?? 'inclusive';
  const taxRateBps = spec.taxRateBps ?? 1400;

  await client.entity.create({
    data: {
      id: entityId,
      name: spec.name,
      slug: spec.slug,
      mode: spec.mode,
      nif: spec.nif,
      address: spec.address,
      phone: spec.phone,
      email: spec.email,
      accentColor: spec.accentColor,
      currency: 'AOA',
      locale: 'pt-PT',
      pricingMode,
      costingMethod: 'weighted_average',
      defaultTaxRateBps: taxRateBps,
      active: true,
    },
  });

  const locations: SeededLocation[] = [];
  for (const location of spec.locations) {
    const locationId = id();
    const isDefault = location.isDefault ?? locations.length === 0;
    await client.location.create({
      data: {
        id: locationId,
        entityId,
        name: location.name,
        address: location.address ?? spec.address,
        phone: location.phone ?? spec.phone,
        isDefault,
        active: true,
      },
    });
    locations.push({ id: locationId, name: location.name, isDefault });
  }

  return {
    id: entityId,
    slug: spec.slug,
    name: spec.name,
    mode: spec.mode,
    currency: 'AOA',
    pricingMode,
    taxRateBps,
    locations,
  };
}

export interface SequenceSeed {
  key: string;
  scope?: string;
  value: number;
}

/**
 * Parks the counters exactly where the seeded documents left off, so the first
 * receipt a user rings up continues the numbering instead of colliding with it.
 */
export async function seedSequences(
  client: PrismaClient,
  entityId: string,
  rows: SequenceSeed[],
): Promise<void> {
  for (const row of rows) {
    if (row.value <= 0) continue;
    await client.sequence.create({
      data: { id: id(), entityId, key: row.key, scope: row.scope ?? '', value: row.value },
    });
  }
}

/** Counts printed in the closing summary. */
export type Counts = Record<string, number>;

export function addCounts(target: Counts, source: Counts): Counts {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
  return target;
}
