import "dotenv/config";

export interface Config {
  port: number;
  baseUrl: string;
  strava: {
    clientId: string;
    clientSecret: string;
    /** OAuth scopes requested. activity:write is required to rename. */
    scope: string;
  };
  webhook: {
    /** Token echoed back during the GET subscription handshake. */
    verifyToken: string;
    /**
     * Path the webhook lives at (e.g. "/webhook" or "/webhook/<secret>").
     * Strava doesn't sign event POSTs, so a secret path segment is the
     * cheapest way to keep random scanners from forging events.
     */
    path: string;
  };
  /** Path to the JSON token store. */
  tokenStorePath: string;
  /** Path to the JSON aggregate-stats store (anonymous counters only). */
  statsPath: string;
  /** If true, rename every new activity. If false, only Strava's default titles. */
  renameAll: boolean;
  /**
   * If true, the generator may also draw from the explicit (profanity-allowed)
   * line banks. Default false: safe-for-work output only. Slurs are never
   * generated in either mode.
   */
  lyricsExplicit: boolean;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

/** Build config from the environment. Throws if required vars are missing. */
export function loadConfig(): Config {
  const port = Number(process.env.PORT ?? 3000);
  const baseUrl = (process.env.BASE_URL ?? `http://localhost:${port}`).replace(
    /\/$/,
    "",
  );

  return {
    port,
    baseUrl,
    strava: {
      clientId: required("STRAVA_CLIENT_ID"),
      clientSecret: required("STRAVA_CLIENT_SECRET"),
      scope: process.env.STRAVA_SCOPE ?? "activity:read_all,activity:write",
    },
    webhook: {
      verifyToken: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ?? "strabang",
      path: process.env.WEBHOOK_PATH_SECRET
        ? `/webhook/${process.env.WEBHOOK_PATH_SECRET}`
        : "/webhook",
    },
    tokenStorePath: process.env.TOKEN_STORE_PATH ?? "data/tokens.json",
    statsPath: process.env.STATS_PATH ?? "data/stats.json",
    renameAll: process.env.RENAME_ALL === "true",
    lyricsExplicit: process.env.LYRICS_EXPLICIT === "true",
  };
}

export const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";
export const STRAVA_API_BASE = "https://www.strava.com/api/v3";
