/**
 * Deterministic pseudo-random generator.
 *
 * The seed has to produce the SAME demo data on every machine and on every run,
 * so Math.random() is off limits. mulberry32 is a 32-bit state PRNG: tiny, fast
 * and perfectly good for picking product names and sale times.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** Float in [0, 1). */
  unit(): number {
    return this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max) rounded to `decimals` places. */
  float(min: number, max: number, decimals = 3): number {
    const value = min + this.next() * (max - min);
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Picks an index with probability proportional to its weight. */
  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
    if (total <= 0) return 0;
    let roll = this.next() * total;
    for (let i = 0; i < weights.length; i += 1) {
      roll -= Math.max(0, weights[i] as number);
      if (roll <= 0) return i;
    }
    return weights.length - 1;
  }

  pickWeighted<T>(items: readonly T[], weight: (item: T) => number): T {
    return items[this.weightedIndex(items.map(weight))] as T;
  }

  /** Fisher-Yates, non-destructive. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const a = out[i] as T;
      out[i] = out[j] as T;
      out[j] = a;
    }
    return out;
  }

  /** `count` distinct members, or the whole list when it is shorter. */
  sample<T>(items: readonly T[], count: number): T[] {
    return this.shuffle(items).slice(0, Math.min(count, items.length));
  }
}
