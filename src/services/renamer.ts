import type { StravaClient } from "../strava/client";
import type { TokenRecord, TokenStore } from "../store/tokenStore";
import type { StatsStore } from "../store/statsStore";

/**
 * Strava's auto-generated titles look like "Morning Run", "Lunch Ride",
 * "Evening Weight Training". We only overwrite those by default so we never
 * clobber a title the athlete chose themselves.
 */
const DEFAULT_TITLE_RE =
  /^(Morning|Lunch|Afternoon|Evening|Night)\s+\w+/i;

export function isDefaultTitle(name: string): boolean {
  return DEFAULT_TITLE_RE.test(name.trim());
}

/**
 * Refresh anything expiring within this many seconds. Strava itself returns a
 * fresh token if the current one expires in <= 1 hour, so 5 min is comfortable.
 */
const REFRESH_BUFFER_SECONDS = 300;

export interface RenamerDeps {
  store: TokenStore;
  strava: StravaClient;
  generate: () => string;
  renameAll: boolean;
  now?: () => number; // unix seconds; injectable for tests
  log?: (msg: string) => void;
  /** Aggregate counters; a failed increment never fails the rename. */
  stats?: StatsStore;
}

export type RenameOutcome =
  | { status: "renamed"; name: string }
  | { status: "skipped"; reason: string };

/** Ensure the record's access token is valid, refreshing + persisting if not. */
async function ensureFreshToken(
  deps: RenamerDeps,
  record: TokenRecord,
): Promise<TokenRecord> {
  const now = (deps.now ?? (() => Math.floor(Date.now() / 1000)))();
  if (record.expiresAt - REFRESH_BUFFER_SECONDS > now) {
    return record;
  }
  const refreshed = await deps.strava.refreshToken(record.refreshToken);
  const updated: TokenRecord = {
    ...record,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: refreshed.expires_at,
  };
  await deps.store.set(updated);
  return updated;
}

/**
 * Handle one activity-create event: rename the activity with a generated line
 * unless the athlete isn't connected or already gave it a custom title.
 */
export async function handleActivityCreate(
  deps: RenamerDeps,
  ownerId: number,
  activityId: number,
): Promise<RenameOutcome> {
  const log = deps.log ?? (() => {});

  const existing = await deps.store.get(ownerId);
  if (!existing) {
    return { status: "skipped", reason: "athlete not connected" };
  }

  const record = await ensureFreshToken(deps, existing);
  const activity = await deps.strava.getActivity(activityId, record.accessToken);

  if (!deps.renameAll && !isDefaultTitle(activity.name)) {
    return { status: "skipped", reason: "custom title already set" };
  }

  const name = deps.generate();
  await deps.strava.updateActivity(activityId, record.accessToken, { name });
  log(`renamed activity ${activityId} -> "${name}"`);
  if (deps.stats) {
    await deps.stats
      .increment("totalRenames")
      .catch((err) => log(`stats increment failed: ${(err as Error).message}`));
  }
  return { status: "renamed", name };
}
