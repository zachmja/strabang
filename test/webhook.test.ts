import { describe, it, expect, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { MemoryTokenStore } from "../src/store/tokenStore";
import type { StravaClient } from "../src/strava/client";
import type { Config } from "../src/config";

function makeConfig(overrides: Partial<Config["webhook"]> = {}): Config {
  return {
    port: 0,
    baseUrl: "http://localhost",
    strava: {
      clientId: "cid",
      clientSecret: "csec",
      scope: "activity:read_all,activity:write",
    },
    webhook: { verifyToken: "verify-me", path: "/webhook", ...overrides },
    tokenStorePath: "/tmp/strabang-test.json",
    renameAll: false,
  };
}

function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

describe("webhook routes", () => {
  it("echoes hub.challenge on a valid handshake", async () => {
    const store = new MemoryTokenStore();
    const strava = {} as StravaClient;
    const app = createApp({
      config: makeConfig(),
      strava,
      store,
      generate: () => "x",
      log: () => {},
    });
    const { url, close } = await listen(app);
    try {
      const res = await fetch(
        `${url}/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc`,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ "hub.challenge": "abc" });
    } finally {
      await close();
    }
  });

  it("403s on a bad verify token", async () => {
    const app = createApp({
      config: makeConfig(),
      strava: {} as StravaClient,
      store: new MemoryTokenStore(),
      generate: () => "x",
      log: () => {},
    });
    const { url, close } = await listen(app);
    try {
      const res = await fetch(
        `${url}/webhook?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=abc`,
      );
      expect(res.status).toBe(403);
    } finally {
      await close();
    }
  });

  it("serves on a secret path when one is configured, and 404s on /webhook", async () => {
    const app = createApp({
      config: makeConfig({ path: "/webhook/s3cret" }),
      strava: {} as StravaClient,
      store: new MemoryTokenStore(),
      generate: () => "x",
      log: () => {},
    });
    const { url, close } = await listen(app);
    try {
      const okRes = await fetch(
        `${url}/webhook/s3cret?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=z`,
      );
      expect(okRes.status).toBe(200);
      const missRes = await fetch(
        `${url}/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=z`,
      );
      expect(missRes.status).toBe(404);
    } finally {
      await close();
    }
  });

  it("drops tokens on a deauthorization event", async () => {
    const store = new MemoryTokenStore();
    await store.set({
      athleteId: 42,
      accessToken: "a",
      refreshToken: "r",
      expiresAt: 9_999_999_999,
      scope: "activity:read,activity:write",
    });
    const log = vi.fn();
    const app = createApp({
      config: makeConfig(),
      strava: {} as StravaClient,
      store,
      generate: () => "x",
      log,
    });
    const { url, close } = await listen(app);
    try {
      const res = await fetch(`${url}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object_type: "athlete",
          object_id: 42,
          aspect_type: "update",
          owner_id: 42,
          subscription_id: 1,
          event_time: 1,
          updates: { authorized: "false" },
        }),
      });
      expect(res.status).toBe(200);
      // store.delete runs after the response — give it a tick.
      await new Promise((r) => setTimeout(r, 20));
      expect(await store.get(42)).toBeUndefined();
    } finally {
      await close();
    }
  });
});
