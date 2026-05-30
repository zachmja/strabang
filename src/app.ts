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
}

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1.5rem;line-height:1.6;color:#111}
  h1{font-size:2rem;margin-bottom:.25rem}
  .sub{color:#666;margin-top:0}
  a.btn{display:inline-block;background:#fc4c02;color:#fff;text-decoration:none;padding:.65rem 1.1rem;border-radius:.5rem;font-weight:600;margin-top:1rem}
  code{background:#f3f3f3;padding:.1rem .35rem;border-radius:.25rem}
</style></head><body>${body}</body></html>`;

export function createApp(deps: AppDeps): Express {
  const { config, strava, store, generate } = deps;
  const log = deps.log ?? ((m: string) => console.log(m));
  const app = express();
  app.use(express.json());

  // Short-lived OAuth state nonces (CSRF protection on the redirect).
  const pendingStates = new Set<string>();

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
         <a class="btn" href="/connect">Connect with Strava</a>`,
      ),
    );
  });

  app.get("/connect", (_req: Request, res: Response) => {
    const state = randomBytes(16).toString("hex");
    pendingStates.add(state);
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
    if (!state || !pendingStates.has(state)) {
      return res.status(400).send(page("Error", `<h1>Invalid state</h1>`));
    }
    pendingStates.delete(state);
    if (!code) {
      return res.status(400).send(page("Error", `<h1>Missing code</h1>`));
    }

    try {
      const token = await strava.exchangeToken(code);
      if (!token.athlete) throw new Error("token response missing athlete");
      // Strava returns the actually-granted scope (the athlete may have
      // unchecked one of the requested scopes on the authorize page); store
      // that, not what we asked for.
      await store.set({
        athleteId: token.athlete.id,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_at,
        scope: token.scope ?? config.strava.scope,
        username: token.athlete.username ?? null,
      });
      const name = token.athlete.firstname ?? "athlete";
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
  app.get("/webhook", (req: Request, res: Response) => {
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
  app.post("/webhook", (req: Request, res: Response) => {
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
