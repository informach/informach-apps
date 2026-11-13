import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { APPS } from "../../packages/config/src/apps";
import { getCollectionApps } from "../../packages/config/src/collections";
import { getAppUrl } from "../../packages/config/src/domains";

// Every SSO client embeds its own registered origin into its browser bundle.
// Build the rest together and then each client with the origin from the catalog.
const turbo = createRequire(import.meta.url).resolve("turbo");
const clients = getCollectionApps("compasso");
const ssoApps = [APPS.conta, ...clients];
function build(filters: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, [turbo, "build", "--concurrency=2", ...filters], {
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build failed (${result.status ?? result.signal})`);
}

build(
  ssoApps.map((app) => `--filter=!@informach/${app.slug}`),
  process.env,
);
for (const app of clients) {
  const origin = getAppUrl(app.slug, "production");
  build([`--filter=@informach/${app.slug}`], {
    ...process.env,
    NEXT_PUBLIC_APP_URL: origin,
    BETTER_AUTH_URL: origin,
  });
}
