import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { APPS } from "../../packages/config/src/apps.ts";

const slug = process.argv[2];
if (!Object.values(APPS).some((app) => app.slug === slug && app.collection === "compasso"))
  throw new Error("Choose a registered Compasso consumer");
if (!process.env.npm_execpath || process.argv.length !== 3)
  throw new Error("Run the app e2e script through pnpm");
const result = spawnSync(
  process.execPath,
  [process.env.npm_execpath, "compasso:test:integration", "--apps-only", "--redis", "--optimized"],
  {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: { ...process.env, COMPASSO_TEST_APP: slug },
    windowsHide: true,
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
