import { STRAVA_API_BASE, STRAVA_OAUTH_BASE } from "../config";
import type {
  StravaActivity,
  StravaTokenResponse,
} from "./types";

export interface StravaClientOptions {
  clientId: string;
  clientSecret: string;
  /** Override fetch (mainly for tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Override the sleep function (mainly for tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Max number of retries on 429. Defaults to 1. */
  maxRetries?: number;
  /** Cap on Retry-After honored (ms). Defaults to 60s. */
  maxBackoffMs?: number;
}

/**
 * Thin typed wrapper over the Strava v3 REST API.
 *
 * Only the endpoints this app needs: OAuth token exchange/refresh, reading a
 * single activity, and updating an activity's name.
 */
export class StravaClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly maxBackoffMs: number;

  constructor(options: StravaClientOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep =
      options.sleep ??
      ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = options.maxRetries ?? 1;
    this.maxBackoffMs = options.maxBackoffMs ?? 60_000;
  }

  /**
   * Issue an HTTP request, retrying once on 429 honoring Retry-After. Bulk
   * activity imports (e.g. a Garmin history sync) can trip Strava's
   * 100 req / 15 min limit; a single backoff is enough to ride out the window.
   */
  private async fetchWithRetry(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(url, init);
      if (res.status !== 429 || attempt >= this.maxRetries) return res;
      const retryAfter = Number(res.headers.get("Retry-After"));
      const waitMs = Math.min(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2000,
        this.maxBackoffMs,
      );
      await this.sleep(waitMs);
    }
  }

  /** Build the URL a user is redirected to in order to authorize the app. */
  authorizeUrl(params: {
    redirectUri: string;
    scope: string;
    state: string;
  }): string {
    const qs = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: params.redirectUri,
      response_type: "code",
      approval_prompt: "auto",
      scope: params.scope,
      state: params.state,
    });
    return `${STRAVA_OAUTH_BASE}/authorize?${qs.toString()}`;
  }

  /** Exchange an authorization code for access + refresh tokens. */
  async exchangeToken(code: string): Promise<StravaTokenResponse> {
    return this.tokenRequest({
      grant_type: "authorization_code",
      code,
    });
  }

  /** Use a refresh token to obtain a fresh access token. */
  async refreshToken(refreshToken: string): Promise<StravaTokenResponse> {
    return this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  async getActivity(
    activityId: number,
    accessToken: string,
  ): Promise<StravaActivity> {
    const res = await this.fetchWithRetry(
      `${STRAVA_API_BASE}/activities/${activityId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(
        `Strava getActivity ${activityId} failed: ${res.status} ${await safeText(res)}`,
      );
    }
    return (await res.json()) as StravaActivity;
  }

  /** Update an activity. Requires the activity:write scope. */
  async updateActivity(
    activityId: number,
    accessToken: string,
    update: { name?: string; description?: string },
  ): Promise<StravaActivity> {
    const res = await this.fetchWithRetry(
      `${STRAVA_API_BASE}/activities/${activityId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(update),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Strava updateActivity ${activityId} failed: ${res.status} ${await safeText(res)}`,
      );
    }
    return (await res.json()) as StravaActivity;
  }

  private async tokenRequest(
    extra: Record<string, string>,
  ): Promise<StravaTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      ...extra,
    });
    const res = await this.fetchWithRetry(`${STRAVA_OAUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      throw new Error(
        `Strava token request failed: ${res.status} ${await safeText(res)}`,
      );
    }
    return (await res.json()) as StravaTokenResponse;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
