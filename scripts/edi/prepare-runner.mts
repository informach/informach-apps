import { appendFile } from "node:fs/promises";
import { assertPortalReady } from "./portal-readiness.mts";
import { releaseEnvironment } from "./release-configuration.mts";

if (!process.env.GITHUB_ENV || process.env.GITHUB_ACTIONS !== "true")
  throw new Error("Runner configuration is only written inside GitHub Actions");
if (process.argv.includes("--check-secrets")) {
  for (const name of ["EDI_HAS_UPDATE_SIGNING_KEY", "EDI_HAS_DISTRIBUTION_TOKEN"])
    if (process.env[name] !== "true")
      throw new Error(`Missing required release credential: ${name}`);
}
const configuration = releaseEnvironment(process.env);
if (process.argv.includes("--check-portal")) {
  const portalUrl = configuration.EDI_PORTAL_URL;
  if (!portalUrl) throw new Error("Missing validated portal origin");
  await assertPortalReady(portalUrl);
}
const lines = Object.entries(configuration).map(([name, value]) => {
  if (/[\r\n\0]/.test(value)) throw new Error(`Unsafe runner configuration: ${name}`);
  return `${name}=${value}\n`;
});
await appendFile(process.env.GITHUB_ENV, lines.join(""), "utf8");
console.log("Validated public suite configuration; private credentials were not exported.");
