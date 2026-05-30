# strabang privacy policy

_Last updated: 2026-05-30_

This document describes what data strabang accesses, what it stores, and how
to remove it. It exists to satisfy the Strava API Agreement, GDPR / UK GDPR,
and to be straight with you.

If you are running strabang only for yourself on your own machine, you are both
the operator and the only user — there is no third party in the loop.

## What we access (via the Strava API)

When you click **Connect with Strava** you grant strabang an OAuth token
with the scopes you see on Strava's consent screen (by default
`activity:read_all,activity:write`). With that token strabang can:

- Read the activity that triggered a webhook event (name, sport type).
- Update that activity's name.

That's the whole API surface strabang uses.

## What we store

Per-athlete, in the configured token store (`data/tokens.json` by default):

| Field | Why |
| --- | --- |
| `athleteId` | Key the token by Strava's `owner_id` so webhook events resolve. |
| `accessToken` | Required to call the API on your behalf. |
| `refreshToken` | Required to mint a new access token when the current one expires. |
| `expiresAt` | Lets us refresh proactively instead of after a 401. |
| `scope` | The scopes you actually granted (you can uncheck on the consent screen). |

We do **not** store: your name, email, profile photo, activity contents,
location, splits, kudos, comments, segment efforts, or anything else from
the Strava response. Your first name is shown once on the post-connect
greeting page and then thrown away.

## What we do not do

- We do **not** share any data with third parties.
- We do **not** sell or rent any data.
- We do **not** use Strava data (or anything else) to train AI/ML models.
  The "Drake-style" lines are produced by a tiny templated random generator
  bundled in this repo (`src/lyrics/generator.ts`) with no external calls.
- We do **not** advertise.
- We do **not** cache activity data beyond the lifetime of a single request.

## How long we keep it

Tokens persist until one of the following happens, after which we delete
them within minutes:

- You revoke strabang from your Strava settings (Settings → My Apps).
  Strava sends us a deauthorization webhook and we drop your tokens.
- You delete the row yourself from the configured token store.

## Security

- Strava data is only ever transmitted over HTTPS.
- The token store is on the host running strabang. The default JSON-file
  store relies on filesystem permissions for security; if you run strabang
  for anyone other than yourself, use a database with encryption at rest.

## Your rights

You can at any time:

- **Revoke access** from <https://www.strava.com/settings/apps>. This both
  invalidates the tokens and triggers strabang to delete them.
- **Request deletion** of your stored tokens out-of-band by emailing the
  operator (below) — useful if you want immediate deletion without waiting
  for the deauth event to propagate.

## Contact

Questions or deletion requests: _set this to your contact address before
inviting other users._
