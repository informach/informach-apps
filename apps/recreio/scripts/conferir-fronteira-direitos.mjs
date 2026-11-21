import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

assert.equal(process.argv.length, 4, "Expected rights worker metafile and build directory");
const meta = JSON.parse(await readFile(process.argv[2], "utf8"));
assert.ok(meta.inputs && typeof meta.inputs === "object");
const entradas = Object.keys(meta.inputs).map((p) =>
  resolve(process.argv[3], p).replaceAll("\\", "/"),
);
for (const arquivo of [
  "apps/recreio/scripts/processar-direitos.ts",
  "apps/recreio/scripts/direitos/rodada.ts",
  "apps/recreio/src/features/direitos/livro/armazenamento.ts",
  "apps/recreio/src/features/direitos/financeiro-runtime.ts",
  "apps/recreio/src/features/objetos/runtime-factory.ts",
  "packages/auth/src/audit.ts",
])
  assert.ok(
    entradas.some((p) => p.endsWith(`/${arquivo}`)),
    `Missing native worker component: ${arquivo}`,
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
])
  assert.ok(
    !entradas.some((p) => p.includes(proibido)),
    `Forbidden rights worker dependency: ${proibido}`,
  );
assert.ok(
  !entradas.some((p) => /\/apps\/(?!recreio\/)/.test(p)),
  "Rights worker must not import another app",
);
process.stdout.write("Native rights worker composition and audit boundary verified\n");
