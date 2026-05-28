# strabang

Auto-renames your Strava activities with freshly **generated Drake-style bars** —
the same idea as [Bandók](https://www.bandok.com/), but the titles are original
lines in a Drake vibe instead of film quotes.

Connect your Strava account once. Every time you finish a run or ride, strabang
catches the webhook event and renames the activity (e.g. _"Turned all that doubt
into distance — no days off"_).

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
| `RENAME_ALL` | `false` | Rename every activity vs. only default titles |

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
