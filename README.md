# strabang

Auto-renames your Strava activities with freshly **generated Drake-style bars** —
the same idea as [Bandók](https://www.bandok.com/), but the titles are original
lines in a Drake vibe instead of film quotes.

Connect your Strava account once. Every time you finish a run or ride, strabang
catches the webhook event and renames the activity (e.g. _"Turned all that doubt
into distance — no days off"_).

> **Just want to use it?** A hosted instance runs at
> **<https://strabang.backroomslabs.com>** — click *Connect with Strava* and
> you're done. Everything below is for people who want to run or modify their
> own copy.

## How it works

```
Strava  --(activity created)-->  POST /webhook  -->  generate a line
   ^                                                       |
   |                                                       v
   +----------------  PUT /activities/{id} (name)  --------+
```

1. **OAuth** — `/connect` sends you to Strava; the callback stores your access +
   refresh tokens (`activity:read_all,activity:write`).
2. **Webhook** — Strava POSTs a `{ aspect_type: "create" }` event to `/webhook`.
   We ack immediately, then look up the activity, and rename it.
3. **Generator** — `src/lyrics/generator.ts` composes an original line from
   themed phrase banks (the come-up, loyalty, the 6, the flex) with a seeded RNG.

> The generated lines are **original** writing in a Drake-inspired style, not
> verbatim song lyrics, so there's nothing copyrighted bundled in the repo.

By default only Strava's auto-titles (`Morning Run`, `Lunch Ride`, …) are
overwritten, so your own custom titles are left alone. Set `RENAME_ALL=true` to
rename everything.

## Setup

### 1. Create a Strava API application

At <https://www.strava.com/settings/api> create an app. Note the **Client ID**
and **Client Secret**. Set the "Authorization Callback Domain" to the host of
your `BASE_URL` (e.g. `localhost` for dev, or your deploy domain).

### 2. Configure environment

```bash
cp .env.example .env
# fill in STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET
```

### 3. Install and run

```bash
npm install
npm run dev          # tsx watch, http://localhost:3000
# or
npm run build && npm start
```

### 4. Expose a public HTTPS URL for the webhook

Strava must be able to reach `/webhook`. In dev, tunnel it:

```bash
ngrok http 3000
# set BASE_URL=https://<your-ngrok-subdomain>.ngrok.app in .env, then restart
```

### 5. Subscribe to webhook events

```bash
npm run webhook -- create   # Strava verifies via GET /webhook, then sends events
npm run webhook -- view     # inspect the current subscription
npm run webhook -- delete   # remove it
```

There can be only **one** push subscription per Strava application.

### 6. Connect your account

Open `BASE_URL/connect`, authorize, then log an activity. It gets renamed within
a few seconds.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `STRAVA_CLIENT_ID` | — | Strava app client id (required) |
| `STRAVA_CLIENT_SECRET` | — | Strava app client secret (required) |
| `BASE_URL` | `http://localhost:3000` | Public URL Strava reaches |
| `PORT` | `3000` | Listen port |
| `STRAVA_SCOPE` | `activity:read_all,activity:write` | OAuth scopes |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | `strabang` | Echoed in the handshake |
| `TOKEN_STORE_PATH` | `data/tokens.json` | Where tokens are persisted |
| `STATS_PATH` | `data/stats.json` | Aggregate counters (total renames/connects — anonymous integers) |
| `RENAME_ALL` | `false` | Rename every activity vs. only default titles |
| `LYRICS_EXPLICIT` | `false` | Allow the profanity-included line banks (default is fully SFW; slurs are never generated in any mode) |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run with hot reload |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm test` | Run the vitest suite |
| `npm run typecheck` | Type-check without emitting |
| `npm run webhook -- <create\|view\|delete>` | Manage the push subscription |

## Project layout

```
src/
  config.ts             env loading + validation
  app.ts                express app factory (routes)
  index.ts              server bootstrap
  strava/
    client.ts           typed Strava v3 wrapper (oauth, get/update activity)
    types.ts            API + webhook payload types
  store/
    tokenStore.ts       TokenStore interface + file/memory implementations
  services/
    renamer.ts          token refresh + rename decision + action
  lyrics/
    generator.ts        original Drake-style line generator (seeded)
  scripts/
    manage-webhook.ts   subscription CLI
test/                   vitest unit tests
```

## Notes

- The JSON token store is fine for a single instance. For multi-instance
  deployments swap `FileTokenStore` for a database-backed `TokenStore`.
- The webhook handler responds `200` before doing work, to stay within Strava's
  ~2s ack window.

## Deploying to Fly.io

The repo ships a `Dockerfile` and `fly.toml` ready for Fly.io. The setup uses
one always-on shared-CPU machine plus a small persistent volume for the JSON
token store. Total runtime is well under Fly's $5/month base credit for a
solo user.

### 1. Install flyctl and sign in

```bash
brew install flyctl   # or: curl -L https://fly.io/install.sh | sh
fly auth login
```

### 2. Pick an app name and edit fly.toml

App names are globally unique. Edit the `app =` line in `fly.toml` if
`strabang` is taken (e.g. `strabang-zach`). Optionally change `primary_region`
to one near you (`fly platform regions` for the list).

### 3. Create the app and the volume

```bash
fly apps create <your-app-name>
fly volumes create strabang_data --size 1 --region <region> --app <your-app-name>
```

The volume name must match `[mounts].source` in `fly.toml`.

### 4. Set the secrets

```bash
fly secrets set --app <your-app-name> \
  STRAVA_CLIENT_ID=... \
  STRAVA_CLIENT_SECRET=... \
  STRAVA_WEBHOOK_VERIFY_TOKEN="$(openssl rand -hex 16)" \
  WEBHOOK_PATH_SECRET="$(openssl rand -hex 16)" \
  BASE_URL="https://<your-app-name>.fly.dev"
```

(`BASE_URL` doesn't have to be set as a secret — you can put it in `[env]`
in `fly.toml` instead — but secrets is fine and keeps the toml clean.)

### 5. Deploy

```bash
fly deploy --app <your-app-name>
```

After deploy, hit `https://<your-app-name>.fly.dev/healthz` — should return
`{"ok": true}`.

### 6. Update Strava and subscribe to webhooks

In <https://www.strava.com/settings/api>, set **Authorization Callback Domain**
to your Fly host (e.g. `your-app-name.fly.dev`, host only — no `https://`).

Then create the push subscription. The `manage-webhook` script runs from your
local machine and just needs the same env vars in your local `.env`:

```bash
# in your local .env
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_WEBHOOK_VERIFY_TOKEN=<same as the Fly secret>
WEBHOOK_PATH_SECRET=<same as the Fly secret>
BASE_URL=https://<your-app-name>.fly.dev

npm run webhook -- create
```

Strava will hit `https://<your-app-name>.fly.dev/webhook/<secret>` to validate
the callback. If you see `{ "id": <n> }` in the script's output, you're live.

### 7. Connect your Strava account

Open `https://<your-app-name>.fly.dev/connect`, authorize, then log an
activity. It should be renamed within seconds.

### Logs and ops

```bash
fly logs --app <your-app-name>       # tail logs
fly ssh console --app <your-app-name> # shell in
fly status --app <your-app-name>
```

## Strava API Agreement compliance

If you're going to invite anyone other than yourself to use a strabang
instance, you're operating under the
[Strava API Agreement](https://www.strava.com/legal/api). The clauses most
relevant to strabang and how this repo handles them:

| Clause | How strabang handles it |
| --- | --- |
| No AI/ML training on Strava data | The generator is templated/RNG, no external model calls. |
| 7-day cache limit on Strava Data | We don't cache — fetch the activity, decide, rename, discard. |
| Delete data on deauthorization | The webhook handler drops tokens on the `authorized=false` event. |
| HTTPS for Strava data in transit | All API calls hit `https://www.strava.com`; you must serve `/webhook` over HTTPS too. |
| Display only the requesting user's own data | The post-connect page shows only the connected athlete's first name. |
| Brand Guidelines | We use the official "Connect with Strava" button and "Powered by Strava" attribution. |
| Privacy policy required | See [PRIVACY.md](./PRIVACY.md). Set a contact address before inviting users. |
| Trademark restrictions | The app name "Strabang" arguably echoes the Strava mark; if Strava ever objects, rename it. |
| Token storage security | Default JSON store relies on filesystem perms; swap for an encrypted DB for multi-user deployments. |

## License

[MIT](./LICENSE).
