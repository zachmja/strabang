/**
 * Manage the single Strava push subscription for this app.
 *
 *   npm run webhook -- create   # subscribe; Strava will GET /webhook to verify
 *   npm run webhook -- view     # list current subscription(s)
 *   npm run webhook -- delete   # remove (pass id, or it deletes the first one)
 *
 * Your BASE_URL must be a public HTTPS URL Strava can reach.
 */
import { loadConfig, STRAVA_API_BASE } from "../config";

async function main(): Promise<void> {
  const config = loadConfig();
  const action = process.argv[2];
  const base = `${STRAVA_API_BASE}/push_subscriptions`;
  const auth = {
    client_id: config.strava.clientId,
    client_secret: config.strava.clientSecret,
  };

  if (action === "create") {
    const body = new URLSearchParams({
      ...auth,
      callback_url: `${config.baseUrl}${config.webhook.path}`,
      verify_token: config.webhook.verifyToken,
    });
    const res = await fetch(base, { method: "POST", body });
    console.log(res.status, await res.text());
    return;
  }

  if (action === "view") {
    const qs = new URLSearchParams(auth);
    const res = await fetch(`${base}?${qs}`);
    console.log(res.status, await res.text());
    return;
  }

  if (action === "delete") {
    let id = process.argv[3];
    if (!id) {
      const qs = new URLSearchParams(auth);
      const list = (await (await fetch(`${base}?${qs}`)).json()) as Array<{
        id: number;
      }>;
      if (!list.length) {
        console.log("No subscriptions to delete.");
        return;
      }
      id = String(list[0].id);
    }
    const qs = new URLSearchParams(auth);
    const res = await fetch(`${base}/${id}?${qs}`, { method: "DELETE" });
    console.log(res.status, res.status === 204 ? "deleted" : await res.text());
    return;
  }

  console.log("Usage: npm run webhook -- <create|view|delete> [id]");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
