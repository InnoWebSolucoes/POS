import type { PrismaClient } from '@prisma/client';
import type { Role } from '@pos/shared';
import { hashPassword, hashPin } from '../../src/lib/auth.js';
import { id } from './helpers.js';

export interface UserSpec {
  key: string;
  name: string;
  email: string;
  role: Role;
  password: string;
  pin?: string;
  phone?: string;
  locationId?: string | null;
}

export interface SeededUser {
  id: string;
  key: string;
  name: string;
  email: string;
  role: Role;
  password: string;
  pin: string | null;
  entityLabel: string;
}

/**
 * Creates the demo accounts for one entity (or, with entityId null, the super
 * admin) and returns them keyed by role for the seeders that follow.
 */
export async function createUsers(
  client: PrismaClient,
  entityId: string | null,
  entityLabel: string,
  specs: UserSpec[],
): Promise<{ byKey: Map<string, SeededUser>; credentials: SeededUser[] }> {
  const byKey = new Map<string, SeededUser>();
  const credentials: SeededUser[] = [];

  for (const spec of specs) {
    const userId = id();
    await client.user.create({
      data: {
        id: userId,
        entityId,
        locationId: spec.locationId ?? null,
        name: spec.name,
        email: spec.email,
        passwordHash: await hashPassword(spec.password),
        role: spec.role,
        pinHash: spec.pin ? await hashPin(spec.pin) : null,
        phone: spec.phone ?? null,
        locale: 'pt-PT',
        active: true,
      },
    });

    const seeded: SeededUser = {
      id: userId,
      key: spec.key,
      name: spec.name,
      email: spec.email,
      role: spec.role,
      password: spec.password,
      pin: spec.pin ?? null,
      entityLabel,
    };
    byKey.set(spec.key, seeded);
    credentials.push(seeded);
  }

  return { byKey, credentials };
}

export const DEMO_PASSWORD = 'demo1234';
