# CLAUDE.md

Guidance for AI agents working in this repo.

## What this is

**strabang** auto-renames Strava activities with generated Drake-style lines
(modeled on Bandók). Flow: athlete OAuths in → Strava POSTs a webhook event on
new activities → we fetch the activity, and if its title is a Strava default
("Morning Run"…), rename it with a generated line.

## Stack & commands

- Node.js >= 18, TypeScript 5 (strict, CommonJS), Express 4, Vitest, tsx.
- No database: athlete tokens persist to a JSON file (`data/tokens.json`,
  gitignored) via `FileTokenStore`. `MemoryTokenStore` is for tests.

| Command | Purpose |
| --- | --- |
| `npm run dev` | tsx watch on `src/index.ts` |
| `npm run build` / `npm start` | tsc to `dist/`, run `dist/index.js` |
| `npm test` | Vitest suite (`test/*.test.ts`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run webhook -- <create\|view\|delete>` | Manage the Strava push subscription |

CI: `.github/workflows/ci.yml` — typecheck, test, build, then asserts
`dist/index.js` exists (a `rootDir` regression once broke `npm start`).
No linter is configured; match surrounding style by hand.

## Layout

```
src/
  config.ts             env loading; STRAVA_OAUTH_BASE / STRAVA_API_BASE consts
  app.ts                createApp(deps) — all Express routes, DI'd
  index.ts              bootstrap: wire real config/client/store into createApp
  strava/client.ts      typed Strava v3 wrapper (OAuth, get/update activity, 429 retry)
  strava/types.ts       Strava API + webhook payload types  [FROZEN]
  store/tokenStore.ts   TokenStore interface, File + Memory impls
  services/renamer.ts   token refresh + rename decision logic
  lyrics/generator.ts   original Drake-style line generator (seeded mulberry32)
  scripts/manage-webhook.ts  push-subscription CLI
test/                   Vitest; mock StravaClient via plain objects + vi.fn()
```

## Frozen surfaces — do not change without explicit approval

1. **`src/strava/types.ts` and all request shapes in `src/strava/client.ts`.**
   These mirror Strava's documented API (OAuth params, token response,
   webhook event payload, activity update body). They were verified against
   the official docs (Authentication, Webhooks, updateActivityById).
   "Improving" a field name or type here is a correctness bug.
2. **Webhook handshake semantics in `app.ts`**: echo `hub.challenge` as JSON
   with HTTP 200; POST events must be acked 200 *before* processing (Strava's
   2-second window, retries 3x otherwise). Deauth events
   (`object_type=athlete`, `updates.authorized=="false"`) must delete tokens
   (API Agreement requirement).
3. **`TokenRecord` field semantics** (`store/tokenStore.ts`): `expiresAt` is
   unix *seconds* (matches Strava's `expires_at`), `scope` is what the athlete
   *actually granted* (not what we requested). Refresh tokens rotate — always
   persist the one from the latest response.
4. **`isDefaultTitle()` in `services/renamer.ts`**: the safety property
   "never clobber a title the athlete wrote" is the product's core promise.
   Only loosen via the explicit `RENAME_ALL` env flag.
5. **`lyrics/generator.ts` content policy**: lines must remain *original*
   writing, never verbatim Drake lyrics (copyright), and generation must stay
   templated/RNG with no external/model calls (Strava API Agreement forbids
   AI/ML use of its data; the README/PRIVACY assert we do none).

## Conventions

- Dependency injection everywhere: `createApp(deps)`, `RenamerDeps`, client
  takes `fetchImpl`/`sleep`/`now` overrides. Tests inject mocks; no module
  mocking/spying on imports.
- Time is injectable (`now?: () => number`) — seconds in renamer, ms in app.
  Watch the unit mismatch.
- Errors: throw `Error` with context strings; webhook handlers catch and
  `log()` instead of crashing; the rename pipeline runs after the HTTP ack.
- Config comes only from env via `loadConfig()`; never read `process.env`
  elsewhere. New vars must be added to `.env.example` with a comment.
- Token store writes must stay atomic (tmp file + rename).
- Docs that carry compliance weight: README's "Strava API Agreement
  compliance" table and PRIVACY.md. If behavior changes (data stored,
  retention, sharing), update both in the same commit.

## Fragile / known debt

- `npm start` depends on `rootDir: "src"` in tsconfig — CI guards this.
- OAuth state nonces are in-memory (10-min TTL, 10k cap): logins in flight
  across a restart fail; multi-instance deploys need a shared store.
- `FileTokenStore` is single-instance only; swap for a DB before scaling.
- `isDefaultTitle` only matches English default titles; other locales slip
  through silently (won't be renamed — safe failure direction).
- Webhook POSTs are unauthenticated by design (Strava doesn't sign);
  mitigation is the optional `WEBHOOK_PATH_SECRET` path segment.
- Dockerfile/fly.toml exist but have never been built/deployed for real
  (no Docker daemon in the dev sandbox); first `fly deploy` is unverified.
- The end-to-end loop against the real Strava API has never been run —
  awaiting API app credentials (signup in progress as of 2026-06-09).
