import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

assert.equal(process.argv.length, 4, "Expected native metafile and its build working directory");
const meta = JSON.parse(await readFile(process.argv[2], "utf8"));
assert.ok(meta.inputs && typeof meta.inputs === "object");
const entradas = Object.keys(meta.inputs).map((p) =>
  resolve(process.argv[3], p).replaceAll("\\", "/"),
);
for (const arquivo of [
  "reconciliar-publicacao.ts",
  "fila-repository.ts",
  "reconciliar-fila.ts",
  "arquivos-privados.ts",
  "politica-repository.ts",
  "capturar-e-publicar.ts",
  "abandono-repository.ts",
  "publicacao-repository.ts",
  "retirada-repository.ts",
])
  assert.ok(
    entradas.some(
      (p) =>
        p.endsWith(`/apps/recreio/scripts/backup/${arquivo}`) ||
        p === `apps/recreio/scripts/backup/${arquivo}`,
    ),
    `Missing native control: ${arquivo}`,
  );
assert.ok(
  !entradas.some((p) => /(?:^|\/)packages\/auth\/src\/index\.ts$/.test(p)),
  "Native backup must import the audit subpath, not the login composition",
);
assert.ok(
  !entradas.some((p) => p.includes("/better-auth/") || p.includes("/@better-auth/")),
  "Native backup must not bundle Better Auth",
);
process.stdout.write("Native backup control and audit boundary verified\n");
