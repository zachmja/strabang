import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

/** One athlete's stored credentials. Deliberately minimal — no profile PII. */
export interface TokenRecord {
  athleteId: number;
  accessToken: string;
  refreshToken: string;
  /** Unix seconds at which the access token expires. */
  expiresAt: number;
  /** Space-delimited scopes actually granted by the athlete. */
  scope: string;
}

export interface TokenStore {
  get(athleteId: number): Promise<TokenRecord | undefined>;
  set(record: TokenRecord): Promise<void>;
  delete(athleteId: number): Promise<void>;
  all(): Promise<TokenRecord[]>;
}

/** In-memory store, used by tests. */
export class MemoryTokenStore implements TokenStore {
  private readonly map = new Map<number, TokenRecord>();

  async get(athleteId: number): Promise<TokenRecord | undefined> {
    return this.map.get(athleteId);
  }

  async set(record: TokenRecord): Promise<void> {
    this.map.set(record.athleteId, record);
  }

  async delete(athleteId: number): Promise<void> {
    this.map.delete(athleteId);
  }

  async all(): Promise<TokenRecord[]> {
    return [...this.map.values()];
  }
}

/**
 * Simple JSON-file token store. Fine for a single-instance deployment; swap for
 * a real database (Postgres/SQLite) if you run multiple instances.
 */
export class FileTokenStore implements TokenStore {
  constructor(private readonly path: string) {}

  private read(): Record<string, TokenRecord> {
    if (!existsSync(this.path)) return {};
    try {
      return JSON.parse(readFileSync(this.path, "utf8")) as Record<
        string,
        TokenRecord
      >;
    } catch {
      return {};
    }
  }

  private write(data: Record<string, TokenRecord>): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(data, null, 2));
  }

  async get(athleteId: number): Promise<TokenRecord | undefined> {
    return this.read()[String(athleteId)];
  }

  async set(record: TokenRecord): Promise<void> {
    const data = this.read();
    data[String(record.athleteId)] = record;
    this.write(data);
  }

  async delete(athleteId: number): Promise<void> {
    const data = this.read();
    delete data[String(athleteId)];
    this.write(data);
  }

  async all(): Promise<TokenRecord[]> {
    return Object.values(this.read());
  }
}
