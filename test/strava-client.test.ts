import { describe, it, expect, vi } from "vitest";
import { StravaClient } from "../src/strava/client";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("StravaClient 429 retry", () => {
  it("retries once on 429 honoring Retry-After and returns the second response", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "3" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 1, name: "ok" }));
    const client = new StravaClient({
      clientId: "c",
      clientSecret: "s",
      fetchImpl,
      sleep,
    });

    const activity = await client.getActivity(1, "tok");

    expect(activity.name).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("gives up after maxRetries and throws on persistent 429", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("rate limited", { status: 429 }));
    const client = new StravaClient({
      clientId: "c",
      clientSecret: "s",
      fetchImpl,
      sleep: () => Promise.resolve(),
      maxRetries: 1,
    });

    await expect(client.getActivity(1, "tok")).rejects.toThrow(/429/);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("caps the backoff at maxBackoffMs", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", {
          status: 429,
          headers: { "Retry-After": "9999" }, // 9999 seconds
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 1, name: "ok" }));
    const client = new StravaClient({
      clientId: "c",
      clientSecret: "s",
      fetchImpl,
      sleep,
      maxBackoffMs: 5000,
    });

    await client.getActivity(1, "tok");
    expect(sleep).toHaveBeenCalledWith(5000);
  });
});
