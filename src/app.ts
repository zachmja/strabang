import express, { type Express, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import type { Config } from "./config";
import type { StravaClient } from "./strava/client";
import type { TokenStore } from "./store/tokenStore";
import type { StravaWebhookEvent } from "./strava/types";
import { handleActivityCreate } from "./services/renamer";

export interface AppDeps {
  config: Config;
  strava: StravaClient;
  store: TokenStore;
  generate: () => string;
  log?: (msg: string) => void;
  /** Injectable clock (ms epoch); for tests. */
  now?: () => number;
}

// Official Strava brand assets (hosted by Strava). Required by their Brand
// Guidelines for any "connect" entry point and as attribution wherever Strava
// data is shown.
const STRAVA_CONNECT_BTN =
  "https://developers.strava.com/images/btn_strava_connectwith_orange.png";
const STRAVA_POWERED_BY =
  "https://developers.strava.com/images/api_logo_pwrdBy_strava_horiz_light.png";

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1.5rem;line-height:1.6;color:#111}
  h1{font-size:2rem;margin-bottom:.25rem}
  .sub{color:#666;margin-top:0}
  .connect{display:inline-block;margin-top:1rem}
  .connect img{height:48px;display:block}
  footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid #eee;color:#666;font-size:.875rem}
  footer img{height:30px;vertical-align:middle;margin-left:.5rem}
  code{background:#f3f3f3;padding:.1rem .35rem;border-radius:.25rem}
</style></head><body>${body}
<footer>
  Powered by
  <a href="https://www.strava.com" rel="noopener">
    <img src="${STRAVA_POWERED_BY}" alt="Strava">
  </a>
</footer>
</body></html>`;

/** OAuth state nonces are valid for this long before being swept. */
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/** Cap to keep the in-memory set bounded even under abuse. */
const OAUTH_STATE_MAX = 10_000;

export function createApp(deps: AppDeps): Express {
  const { config, strava, store, generate } = deps;
  const log = deps.log ?? ((m: string) => console.log(m));
  const now = deps.now ?? (() => Date.now());
  const app = express();
  app.use(express.json());

  // OAuth state nonces (CSRF protection on the redirect). Keyed by nonce,
  // value is the expiry timestamp. Swept lazily on each /connect.
  const pendingStates = new Map<string, number>();
  function sweepStates(): void {
    const cutoff = now();
    for (const [k, exp] of pendingStates) {
      if (exp <= cutoff) pendingStates.delete(k);
    }
    // Hard cap: if still over budget after sweeping, drop oldest insertions.
    while (pendingStates.size > OAUTH_STATE_MAX) {
      const first = pendingStates.keys().next().value;
      if (first === undefined) break;
      pendingStates.delete(first);
    }
  }

  app.get("/", (_req: Request, res: Response) => {
    const sample = generate();
    res.send(
      page(
        "strabang",
        `<h1>strabang</h1>
         <p class="sub">Your Strava activities, renamed with Drake-style bars.</p>
         <p>Connect Strava and every new run/ride gets a freshly generated line
         like:</p>
         <blockquote><em>"${escapeHtml(sample)}"</em></blockquote>
         <a class="connect" href="/connect">
           <img src="${STRAVA_CONNECT_BTN}" alt="Connect with Strava">
         </a>`,
      ),
    );
  });

  app.get("/connect", (_req: Request, res: Response) => {
    sweepStates();
    const state = randomBytes(16).toString("hex");
    pendingStates.set(state, now() + OAUTH_STATE_TTL_MS);
    const url = strava.authorizeUrl({
      redirectUri: `${config.baseUrl}/auth/callback`,
      scope: config.strava.scope,
      state,
    });
    res.redirect(url);
  });

  app.get("/auth/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;
    if (error) {
      return res.status(400).send(page("Denied", `<h1>Authorization denied</h1>`));
    }
    const expiresAt = state ? pendingStates.get(state) : undefined;
    if (!state || expiresAt === undefined || expiresAt <= now()) {
      pendingStates.delete(state ?? "");
      return res.status(400).send(page("Error", `<h1>Invalid or expired state</h1>`));
    }
    pendingStates.delete(state);
    if (!code) {
      return res.status(400).send(page("Error", `<h1>Missing code</h1>`));
    }

    try {
      const token = await strava.exchangeToken(code);
      if (!token.athlete) throw new Error("token response missing athlete");
      // Capture the first name before discarding the athlete object — we
      // greet with it once but deliberately don't persist any profile PII.
      // Strava returns the actually-granted scope (the athlete may have
      // unchecked one of the requested scopes on the authorize page); store
      // that, not what we asked for.
      const name = token.athlete.firstname ?? "athlete";
      await store.set({
        athleteId: token.athlete.id,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_at,
        scope: token.scope ?? config.strava.scope,
      });
      res.send(
        page(
          "Connected",
          `<h1>You're connected, ${escapeHtml(name)} 🏃</h1>
           <p class="sub">New activities will be renamed automatically.</p>
           <p>Go log a run — strabang takes it from here.</p>`,
        ),
      );
    } catch (err) {
      log(`oauth callback error: ${(err as Error).message}`);
      res.status(500).send(page("Error", `<h1>Could not connect to Strava</h1>`));
    }
  });

  // Webhook subscription validation handshake.
  app.get(config.webhook.path, (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === config.webhook.verifyToken) {
      return res.status(200).json({ "hub.challenge": challenge });
    }
    return res.sendStatus(403);
  });

  // Webhook event delivery. Must ack within ~2s, so we respond first and
  // process the event afterwards.
  app.post(config.webhook.path, (req: Request, res: Response) => {
    res.sendStatus(200);
    const event = req.body as StravaWebhookEvent;
    if (!event) return;

    if (event.object_type === "activity" && event.aspect_type === "create") {
      handleActivityCreate(
        { store, strava, generate, renameAll: config.renameAll, log },
        event.owner_id,
        event.object_id,
      ).catch((err) => log(`rename failed: ${(err as Error).message}`));
      return;
    }

    // Deauthorization: the athlete revoked our app. Tokens are now dead;
    // drop them so we don't keep trying to refresh.
    if (
      event.object_type === "athlete" &&
      event.aspect_type === "update" &&
      event.updates?.authorized === "false"
    ) {
      store
        .delete(event.owner_id)
        .then(() => log(`deauthorized athlete ${event.owner_id}; tokens dropped`))
        .catch((err) => log(`deauth cleanup failed: ${(err as Error).message}`));
    }
  });

  app.get("/healthz", (_req: Request, res: Response) => res.json({ ok: true }));

  return app;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
