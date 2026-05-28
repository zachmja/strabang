/**
 * Drake-style line generator.
 *
 * These lines are ORIGINAL phrases written to evoke the vibe and recurring
 * themes of Drake's catalogue (the come-up, loyalty, late-night drives through
 * the 6, blessings, "no days off") tuned for running and riding. They are NOT
 * verbatim song lyrics — the point is to *generate* fresh lines, not to copy
 * copyrighted material.
 */

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

const COME_UP = [
  "started with nothing but the open road",
  "turned all that doubt into distance",
  "the come-up don't take days off",
  "every mile is another receipt",
  "grinding quiet while the city sleeps",
  "long way up, never looking down",
  "earned this one step at a time",
  "out here collecting splits, not excuses",
];

const LOYALTY = [
  "loyal to the pace, loyal to the crew",
  "real ones already know the splits",
  "ran it solo but the day-ones felt it",
  "no new friends, just new personal bests",
  "kept the same heart, just a faster step",
];

const THE_SIX = [
  "city lights sittin' in the rearview",
  "reppin' the 6 from the first stride",
  "took the long way home through the block",
  "skyline watching every lap I take",
  "cold night, warm heart, empty streets",
];

const FLEX = [
  "feeling elevated, legs on cruise control",
  "heart rate high and the ego higher",
  "too locked in to feel the burn",
  "blessings landing on the pavement",
  "pace so clean it don't need a caption",
  "moving different since the last PR",
];

const CLOSERS = [
  "ayy",
  "yeah",
  "uh",
  "you already know",
  "for the city",
  "no days off",
];

const BANKS = [COME_UP, LOYALTY, THE_SIX, FLEX];

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export interface GenerateOptions {
  /** Provide a custom [0,1) RNG (e.g. seeded) for deterministic output. */
  rng?: () => number;
  /** Probability of appending an ad-lib closer. Default 0.5. */
  closerChance?: number;
}

/** Generate a single original Drake-style line. */
export function generateLyric(options: GenerateOptions = {}): string {
  const rng = options.rng ?? Math.random;
  const closerChance = options.closerChance ?? 0.5;

  const bank = pick(BANKS, rng);
  let line = pick(bank, rng);

  if (rng() < closerChance) {
    line = `${line} — ${pick(CLOSERS, rng)}`;
  }

  // Capitalize the first character for a cleaner activity title.
  return line.charAt(0).toUpperCase() + line.slice(1);
}
