import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

assert.equal(process.argv.length, 4);
const meta = JSON.parse(await readFile(process.argv[2], "utf8"));
assert.ok(meta.inputs && typeof meta.inputs === "object");
const inputs = Object.keys(meta.inputs).map((p) =>
  resolve(process.argv[3], p).replaceAll("\\", "/"),
);
for (const file of [
  "restaurar-backup.ts",
  "leitura-s3.ts",
  "cluster-isolado.ts",
  "atualizar-copia-privada.ts",
  "normalizar-fotografias.ts",
])
  assert.ok(
    inputs.some((p) => p.endsWith(`/apps/recreio/scripts/backup/${file}`)),
    `Missing private recovery module: ${file}`,
  );
for (const forbidden of [
  "/packages/db/src/index.ts",
  "/packages/db/src/client.ts",
  "/packages/db/src/job-runs.ts",
  "/packages/auth/src/index.ts",
])
  assert.ok(
    !inputs.some((p) => p.endsWith(forbidden)),
    `Original application composition bundled: ${forbidden}`,
  );
assert.ok(!inputs.some((p) => p.includes("/better-auth/") || p.includes("/@better-auth/")));
process.stdout.write("Private recovery has no original application database/auth composition\n");
