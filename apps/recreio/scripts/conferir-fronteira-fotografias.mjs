import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

assert.equal(
  process.argv.length,
  4,
  "Expected snapshot migration worker metafile and build directory",
);
const meta = JSON.parse(await readFile(process.argv[2], "utf8"));
assert.ok(meta.inputs && typeof meta.inputs === "object");
const entradas = Object.keys(meta.inputs).map((p) =>
  resolve(process.argv[3], p).replaceAll("\\", "/"),
);
for (const arquivo of [
  "apps/recreio/scripts/migrar-fotografias.ts",
  "apps/recreio/src/features/objetos/entregas.ts",
  "apps/recreio/src/features/objetos/migracao-repository.ts",
  "apps/recreio/src/features/objetos/leitor-publicado.ts",
  "apps/recreio/src/features/objetos/s3.ts",
  "packages/auth/src/audit.ts",
])
  assert.ok(
    entradas.some((p) => p.endsWith(`/${arquivo}`)),
    `Missing native migration worker component: ${arquivo}`,
  );
for (const proibido of [
  "/packages/auth/src/index.ts",
  "/apps/recreio/src/lib/env.ts",
  "/apps/recreio/src/lib/billing.ts",
  "/packages/emails/",
  "/packages/ai-core/",
  "/packages/jogo-morada/",
  "/packages/morada-arte/",
  "/better-auth/",
  "/@better-auth/",
  "/@sendgrid/",
  "/next/dist/",
  "/node_modules/stripe/",
  "/node_modules/ioredis/",
])
  assert.ok(
    !entradas.some((p) => p.includes(proibido)),
    `Forbidden snapshot migration worker dependency: ${proibido}`,
  );
assert.ok(
  !entradas.some((p) => /\/apps\/(?!recreio\/)/.test(p)),
  "Migration worker must not import another app",
);
process.stdout.write("Native snapshot migration worker composition and audit boundary verified\n");
