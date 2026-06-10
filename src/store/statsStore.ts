import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
} from "node:fs";
import { dirname } from "node:path";

/**
 * Aggregate, anonymous counters — integers only, never per-athlete data.
 * Exists so "how many renames/connects have ever happened" stays answerable
 * even though logs rotate and deauthed athletes are deleted from the token
 * store.
 */
export interface Stats {
  totalRenames: number;
  totalConnects: number;
}

export interface StatsStore {
  increment(key: keyof Stats): Promise<void>;
  read(): Promise<Stats>;
}

const EMPTY: Stats = { totalRenames: 0, totalConnects: 0 };

/** In-memory store, used by tests. */
export class MemoryStatsStore implements StatsStore {
  private stats: Stats = { ...EMPTY };

  async increment(key: keyof Stats): Promise<void> {
    this.stats[key] += 1;
  }

  async read(): Promise<Stats> {
    return { ...this.stats };
  }
}

/** JSON-file store; same atomic tmp-file + rename pattern as FileTokenStore. */
export class FileStatsStore implements StatsStore {
  constructor(private readonly path: string) {}

  private load(): Stats {
    if (!existsSync(this.path)) return { ...EMPTY };
    try {
      const data = JSON.parse(readFileSync(this.path, "utf8")) as Partial<Stats>;
      return {
        totalRenames: data.totalRenames ?? 0,
        totalConnects: data.totalConnects ?? 0,
      };
    } catch {
      return { ...EMPTY };
    }
  }

  private write(stats: Stats): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(stats, null, 2));
    renameSync(tmp, this.path);
  }

  async increment(key: keyof Stats): Promise<void> {
    const stats = this.load();
    stats[key] += 1;
    this.write(stats);
  }

  async read(): Promise<Stats> {
    return this.load();
  }
}
