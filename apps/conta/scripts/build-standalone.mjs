import { existsSync } from "node:fs";
import { access, cp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedNextOptions } from "@informach/config/next-testing";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = isolatedNextOptions().distDir ?? ".next";
const destination = join(root, dist, "standalone", "apps", "conta");
await access(join(destination, "server.js"));
await cp(join(root, dist, "static"), join(destination, dist, "static"), { recursive: true });
if (existsSync(join(root, "public")))
  await cp(join(root, "public"), join(destination, "public"), { recursive: true });
await build({
  entryPoints: [join(root, "scripts", "setup-oauth.ts")],
  outfile: join(destination, "setup-oauth.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
});
