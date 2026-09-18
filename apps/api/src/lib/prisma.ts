import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * BigInt is how money is stored, but JSON.stringify refuses to serialise it.
 * Every monetary value in this system fits comfortably inside a double
 * (9e15 centimos is 90 trillion Kwanza), so the wire format is a plain number
 * and the client never has to deal with BigInt at all.
 */
declare global {
  interface BigInt {
    toJSON(): number;
  }
}

// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function toJSON(this: bigint): number {
  const n = Number(this);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Monetary value ${this.toString()} exceeds safe integer range.`);
  }
  return n;
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProduction ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!env.isProduction) globalForPrisma.prisma = prisma;

/** Transaction client type, for helpers that must run inside a transaction. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** SQLite cannot take concurrent writers; serialise transactions defensively. */
export const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
