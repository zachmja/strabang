import { describe, it, expect } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { MemoryTokenStore } from "../src/store/tokenStore";
import { StravaClient } from "../src/strava/client";
import type { Config } from "../src/config";

function makeConfig(): Config {
  return {
    port: 0,
    baseUrl: "http://localhost",
    strava: {
      clientId: "cid",
      clientSecret: "csec",
      scope: "activity:read_all,activity:write",
    },
    webhook: { verifyToken: "v", path: "/webhook" },
    tokenStorePath: "/tmp/strabang-test.json",
    statsPath: "/tmp/strabang-stats-test.json",
    renameAll: false,
    lyricsExplicit: false,
  };
}

function listen(app: express.Express) {
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe("OAuth state lifecycle", () => {
  it("rejects a stale state nonce after the TTL expires", async () => {
    let nowMs = 1_000_000_000_000;
    const strava = new StravaClient({ clientId: "cid", clientSecret: "csec" });
    const app = createApp({
      config: makeConfig(),
      strava,
      store: new MemoryTokenStore(),
      generate: () => "x",
      log: () => {},
      now: () => nowMs,
    });
    const { url, close } = await listen(app);
    try {
      // Trigger /connect to plant a state; capture it from the redirect URL.
      const connect = await fetch(`${url}/connect`, { redirect: "manual" });
      const location = connect.headers.get("location") ?? "";
      const state = new URL(location).searchParams.get("state");
      expect(state).toBeTruthy();

      // Jump past the 10-minute TTL.
      nowMs += 11 * 60 * 1000;

      const cb = await fetch(
        `${url}/auth/callback?state=${state}&code=anything`,
      );
      expect(cb.status).toBe(400);
      const body = await cb.text();
      expect(body).toMatch(/Invalid or expired state/i);
    } finally {
      await close();
    }
  });
});
