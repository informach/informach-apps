import { existsSync } from "node:fs";
import { access, cp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, ".next", "standalone", "apps", "edi");
await access(join(destination, "server.js"));
await cp(join(root, ".next", "static"), join(destination, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public")))
  await cp(join(root, "public"), join(destination, "public"), { recursive: true });
// The pre-deploy command needs no tsx, source checkout, devDependencies or credentials at build time.
await build({
  entryPoints: [join(root, "scripts", "setup-oauth.ts")],
  outfile: join(destination, "setup-oauth.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
});
console.log("Standalone server, static assets and desktop OAuth deployment command prepared.");
