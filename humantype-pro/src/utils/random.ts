/**
 * HumanType Pro — Randomness helpers.
 *
 * Humans are noisy. These helpers give the engine well-shaped randomness:
 * uniform ranges, gaussian jitter (most keystrokes near the mean, occasional
 * outliers) and weighted coin flips.
 */

/** Uniform random float in [min, max). */
export function range(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Uniform random integer in [min, max] (inclusive). */
export function intRange(min: number, max: number): number {
  return Math.floor(range(min, max + 1));
}

/** Returns `true` with the given probability (0–1). */
export function chance(probability: number): boolean {
  return Math.random() < probability;
}

/** Pick a random element from an array. */
export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Standard-normal sample via the Box–Muller transform. Mean 0, stddev 1.
 * Real key-press intervals follow a roughly log-normal/normal distribution, so
 * gaussian jitter feels far more human than a flat uniform spread.
 */
export function gaussian(): number {
  let u = 0;
  let v = 0;
  // Avoid log(0).
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Apply gaussian jitter to a base value.
 * @param base     The mean value.
 * @param variance Fractional spread (0 = no jitter, 1 = stddev == base).
 * @param min      Hard floor so values never go negative/silly.
 */
export function jitter(base: number, variance: number, min = 0): number {
  const value = base * (1 + gaussian() * variance);
  return Math.max(min, value);
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
