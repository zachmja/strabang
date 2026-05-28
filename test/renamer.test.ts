import { describe, it, expect, vi } from "vitest";
import {
  handleActivityCreate,
  isDefaultTitle,
  type RenamerDeps,
} from "../src/services/renamer";
import { MemoryTokenStore, type TokenRecord } from "../src/store/tokenStore";
import type { StravaClient } from "../src/strava/client";

const NOW = 1_000_000;

function makeRecord(overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    athleteId: 1,
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: NOW + 3600,
    scope: "activity:write",
    ...overrides,
  };
}

function makeStrava(activityName: string) {
  return {
    getActivity: vi.fn().mockResolvedValue({ id: 99, name: activityName }),
    updateActivity: vi.fn().mockResolvedValue({ id: 99, name: "x" }),
    refreshToken: vi.fn().mockResolvedValue({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_at: NOW + 7200,
    }),
  } as unknown as StravaClient & {
    getActivity: ReturnType<typeof vi.fn>;
    updateActivity: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
  };
}

function deps(
  store: MemoryTokenStore,
  strava: ReturnType<typeof makeStrava>,
  renameAll = false,
): RenamerDeps {
  return {
    store,
    strava,
    generate: () => "Generated bar",
    renameAll,
    now: () => NOW,
  };
}

describe("isDefaultTitle", () => {
  it("matches Strava defaults", () => {
    expect(isDefaultTitle("Morning Run")).toBe(true);
    expect(isDefaultTitle("Lunch Ride")).toBe(true);
    expect(isDefaultTitle("Evening Weight Training")).toBe(true);
  });
  it("rejects custom titles", () => {
    expect(isDefaultTitle("Hill repeats with the crew")).toBe(false);
  });
});

describe("handleActivityCreate", () => {
  it("skips when athlete is not connected", async () => {
    const store = new MemoryTokenStore();
    const strava = makeStrava("Morning Run");
    const out = await handleActivityCreate(deps(store, strava), 1, 99);
    expect(out).toEqual({ status: "skipped", reason: "athlete not connected" });
    expect(strava.getActivity).not.toHaveBeenCalled();
  });

  it("renames a default-titled activity", async () => {
    const store = new MemoryTokenStore();
    await store.set(makeRecord());
    const strava = makeStrava("Morning Run");
    const out = await handleActivityCreate(deps(store, strava), 1, 99);
    expect(out).toEqual({ status: "renamed", name: "Generated bar" });
    expect(strava.updateActivity).toHaveBeenCalledWith(99, "access", {
      name: "Generated bar",
    });
  });

  it("leaves custom titles alone unless renameAll is set", async () => {
    const store = new MemoryTokenStore();
    await store.set(makeRecord());
    const strava = makeStrava("Tempo with the day-ones");
    const out = await handleActivityCreate(deps(store, strava), 1, 99);
    expect(out).toEqual({ status: "skipped", reason: "custom title already set" });
    expect(strava.updateActivity).not.toHaveBeenCalled();
  });

  it("renames custom titles when renameAll is true", async () => {
    const store = new MemoryTokenStore();
    await store.set(makeRecord());
    const strava = makeStrava("Tempo with the day-ones");
    const out = await handleActivityCreate(deps(store, strava, true), 1, 99);
    expect(out.status).toBe("renamed");
  });

  it("refreshes and persists an expired token before acting", async () => {
    const store = new MemoryTokenStore();
    await store.set(makeRecord({ expiresAt: NOW - 10 }));
    const strava = makeStrava("Morning Run");
    await handleActivityCreate(deps(store, strava), 1, 99);
    expect(strava.refreshToken).toHaveBeenCalledWith("refresh");
    expect(strava.getActivity).toHaveBeenCalledWith(99, "new-access");
    const stored = await store.get(1);
    expect(stored?.accessToken).toBe("new-access");
    expect(stored?.refreshToken).toBe("new-refresh");
  });
});
