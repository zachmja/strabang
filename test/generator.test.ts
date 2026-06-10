import { describe, it, expect } from "vitest";
import {
  generateLyric,
  mulberry32,
  CLEAN_LINES,
  ALL_LINES,
} from "../src/lyrics/generator";
import { THEME_BANKS } from "../src/lyrics/banks";

describe("generateLyric", () => {
  it("is deterministic for a fixed seed", () => {
    const a = generateLyric({ rng: mulberry32(42) });
    const b = generateLyric({ rng: mulberry32(42) });
    expect(a).toBe(b);
  });

  it("produces a non-empty capitalized line", () => {
    const line = generateLyric({ rng: mulberry32(7) });
    expect(line.length).toBeGreaterThan(0);
    expect(line[0]).toBe(line[0].toUpperCase());
  });

  it("omits the ad-lib closer when closerChance is 0", () => {
    const line = generateLyric({ rng: mulberry32(1), closerChance: 0 });
    expect(line).not.toContain(" — ");
  });

  it("appends a closer when closerChance is 1", () => {
    const line = generateLyric({ rng: mulberry32(1), closerChance: 1 });
    expect(line).toContain(" — ");
  });

  it("never draws from the explicit banks unless explicit is set", () => {
    const cleanSet = new Set(CLEAN_LINES.map((l) => l.toLowerCase()));
    for (let seed = 0; seed < 500; seed++) {
      const line = generateLyric({ rng: mulberry32(seed), closerChance: 0 });
      expect(cleanSet.has(line.toLowerCase())).toBe(true);
    }
  });

  it("can draw explicit lines when explicit mode is enabled", () => {
    const explicitOnly = new Set(
      THEME_BANKS.flatMap((b) => b.explicit).map((l) => l.toLowerCase()),
    );
    let sawExplicit = false;
    for (let seed = 0; seed < 500 && !sawExplicit; seed++) {
      const line = generateLyric({
        rng: mulberry32(seed),
        closerChance: 0,
        explicit: true,
      });
      if (explicitOnly.has(line.toLowerCase())) sawExplicit = true;
    }
    expect(sawExplicit).toBe(true);
  });
});

describe("lyric banks content policy", () => {
  const PROFANITY =
    /\b(fuck\w*|shit\w*|bitch\w*|goddamn|motherfucker\w*|ass|damn\w*|hell)\b/i;
  // Slur screen written as patterns rather than full words on purpose.
  const SLURS = /n[i1e]gg|f[a@]gg|r[e3]t[a@]rd|k[i1]ke|tr[a@]nn/i;

  it("has a meaningfully larger pool in explicit mode", () => {
    expect(CLEAN_LINES.length).toBeGreaterThanOrEqual(150);
    expect(ALL_LINES.length).toBeGreaterThan(CLEAN_LINES.length);
  });

  it("keeps the clean tier free of profanity", () => {
    for (const bank of THEME_BANKS) {
      for (const line of bank.clean) {
        expect(line, `clean line in "${bank.key}" contains profanity`).not.toMatch(
          PROFANITY,
        );
      }
    }
  });

  it("contains no slurs in any tier, ever", () => {
    for (const line of ALL_LINES) {
      expect(line).not.toMatch(SLURS);
    }
  });

  it("keeps every line activity-title sized", () => {
    for (const line of ALL_LINES) {
      expect(line.length).toBeGreaterThan(0);
      expect(line.length).toBeLessThanOrEqual(65);
    }
  });

  it("has no duplicate lines across banks", () => {
    const seen = new Set<string>();
    for (const line of ALL_LINES) {
      const key = line.toLowerCase().trim();
      expect(seen.has(key), `duplicate line: ${line}`).toBe(false);
      seen.add(key);
    }
  });
});
