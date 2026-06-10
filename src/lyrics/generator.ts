/**
 * Drake-style line generator.
 *
 * Lines are ORIGINAL phrases written to evoke the vibe and recurring themes of
 * Drake's catalogue (the come-up, loyalty, late nights in the 6, soft hours,
 * trust issues, the flex) tuned for running and riding. They are NOT verbatim
 * song lyrics — the point is to *generate* fresh lines, not to copy
 * copyrighted material. The phrase data lives in ./banks.
 *
 * Two tiers: clean (default, safe for work) and explicit (profanity allowed,
 * opt-in via the `explicit` option / LYRICS_EXPLICIT env). Slurs are never
 * present in either tier.
 */
import { THEME_BANKS } from "./banks";

/** Deterministic PRNG (mulberry32) so output is reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLOSERS = [
  "ayy",
  "yeah",
  "uh",
  "you already know",
  "for the city",
  "no days off",
];

/** Flattened pools, computed once at module load. */
export const CLEAN_LINES: readonly string[] = THEME_BANKS.flatMap(
  (b) => b.clean,
);
export const ALL_LINES: readonly string[] = THEME_BANKS.flatMap((b) => [
  ...b.clean,
  ...b.explicit,
]);

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export interface GenerateOptions {
  /** Provide a custom [0,1) RNG (e.g. seeded) for deterministic output. */
  rng?: () => number;
  /** Probability of appending an ad-lib closer. Default 0.5. */
  closerChance?: number;
  /**
   * Draw from the explicit (profanity-allowed) banks as well. Default false:
   * output is fully safe for work.
   */
  explicit?: boolean;
}

/** Generate a single original Drake-style line. */
export function generateLyric(options: GenerateOptions = {}): string {
  const rng = options.rng ?? Math.random;
  const closerChance = options.closerChance ?? 0.5;
  const pool = options.explicit ? ALL_LINES : CLEAN_LINES;

  let line = pick(pool, rng);

  if (rng() < closerChance) {
    line = `${line} — ${pick(CLOSERS, rng)}`;
  }

  // Capitalize the first character for a cleaner activity title.
  return line.charAt(0).toUpperCase() + line.slice(1);
}
