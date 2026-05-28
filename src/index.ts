import { loadConfig } from "./config";
import { StravaClient } from "./strava/client";
import { FileTokenStore } from "./store/tokenStore";
import { generateLyric } from "./lyrics/generator";
import { createApp } from "./app";

function main(): void {
  const config = loadConfig();
  const strava = new StravaClient({
    clientId: config.strava.clientId,
    clientSecret: config.strava.clientSecret,
  });
  const store = new FileTokenStore(config.tokenStorePath);
  const app = createApp({
    config,
    strava,
    store,
    generate: () => generateLyric(),
  });

  app.listen(config.port, () => {
    console.log(`strabang listening on ${config.baseUrl}`);
    console.log(`Connect a Strava account at ${config.baseUrl}/connect`);
  });
}

main();
