import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const app = resolve(import.meta.dirname, "..");
const localRequire = createRequire(resolve(app, "package.json"));
const vitestRequire = createRequire(localRequire.resolve("vitest/package.json"));
const executable = resolve(
  dirname(vitestRequire.resolve("vite-node/package.json")),
  "vite-node.mjs",
);
const result = spawnSync(
  process.execPath,
  [
    executable,
    "--config",
    resolve(app, "vitest.config.ts"),
    resolve(app, "scripts/laboratory-coverage.ts"),
  ],
  {
    cwd: app,
    stdio: "inherit",
    windowsHide: true,
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
