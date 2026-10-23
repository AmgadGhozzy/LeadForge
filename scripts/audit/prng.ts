import { createHash } from 'node:crypto';

/**
 * Computes a SHA-256 hash of a UTF-8 string.
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Creates a deterministic 32-bit unsigned integer seed from an input string.
 */
export function createDeterministicSeed(input: string): number {
  const hash = sha256(input);
  return parseInt(hash.slice(0, 8), 16) >>> 0;
}

/**
 * Mulberry32 is a simple, high-quality 32-bit PRNG.
 * Produces deterministic pseudo-random floats in [0, 1).
 */
export function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically shuffles an array in-place or returns a new shuffled array
 * using the Fisher-Yates algorithm driven by the provided PRNG.
 */
export function deterministicShuffle<T>(array: readonly T[], prng: () => number): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}
