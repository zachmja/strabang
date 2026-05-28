import { describe, it, expect } from "vitest";
import { generateLyric, mulberry32 } from "../src/lyrics/generator";

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
});
