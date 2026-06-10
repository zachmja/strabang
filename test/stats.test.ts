import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStatsStore, MemoryStatsStore } from "../src/store/statsStore";

describe("MemoryStatsStore", () => {
  it("increments independently per key", async () => {
    const store = new MemoryStatsStore();
    await store.increment("totalRenames");
    await store.increment("totalRenames");
    await store.increment("totalConnects");
    expect(await store.read()).toEqual({ totalRenames: 2, totalConnects: 1 });
  });
});

describe("FileStatsStore", () => {
  it("persists counters across instances", async () => {
    const dir = mkdtempSync(join(tmpdir(), "strabang-stats-"));
    const path = join(dir, "stats.json");
    try {
      const a = new FileStatsStore(path);
      await a.increment("totalRenames");
      await a.increment("totalConnects");
      await a.increment("totalRenames");

      const b = new FileStatsStore(path);
      expect(await b.read()).toEqual({ totalRenames: 2, totalConnects: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("starts from zero when the file is missing or corrupt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "strabang-stats-"));
    try {
      const store = new FileStatsStore(join(dir, "nope.json"));
      expect(await store.read()).toEqual({ totalRenames: 0, totalConnects: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
