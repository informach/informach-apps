import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { arquivosAlterados, exigePipelineCompleto } from "./ci-recreio-documentacao.mjs";

test("somente documentos delimitados usam o gate documental", () => {
  assert.equal(
    exigePipelineCompleto([
      "docs/recreio/operacao.md",
      "docs/recreio/evidencias/prova.json",
      "docs/estado-do-repositorio.md",
      "docs/audit-payload-policy.md",
      "apps/recreio/PRODUCAO.md",
    ]),
    false,
  );
  for (const arquivo of [
    "apps/recreio/src/app/page.tsx",
    "packages/config/src/jogos.json",
    ".github/workflows/ci.yml",
    "pnpm-lock.yaml",
    "docs/recreio/executar.ts",
    "docs/outro-produto.json",
  ])
    assert.equal(exigePipelineCompleto(["docs/recreio/operacao.md", arquivo]), true, arquivo);
});

test("o diff completo encontra código após mais de 300 documentos e conserva nomes especiais", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ci-documentacao-"));
  const alvo = path.resolve(dir);
  if (
    path.dirname(alvo) !== path.resolve(tmpdir()) ||
    !path.basename(alvo).startsWith("ci-documentacao-")
  )
    throw new Error("Limpeza fora do diretório de teste");
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commit = () => {
    git("add", ".");
    git("-c", "user.name=CI", "-c", "user.email=ci@example.test", "commit", "-m", "fixture");
    return git("rev-parse", "HEAD");
  };
  try {
    git("init");
    await writeFile(path.join(dir, "base.txt"), "base");
    const base = commit();
    await mkdir(path.join(dir, "docs/recreio"), { recursive: true });
    for (let i = 0; i < 305; i++)
      await writeFile(path.join(dir, `docs/recreio/${i}.md`), "documento");
    const docs = commit();
    assert.equal(exigePipelineCompleto(arquivosAlterados(base, docs, dir)), false);
    await mkdir(path.join(dir, "packages/exemplo"), { recursive: true });
    await writeFile(path.join(dir, "packages/exemplo/com espaço.ts"), "export const valor = 1;\n");
    const codigo = commit();
    const todos = arquivosAlterados(base, codigo, dir);
    assert.equal(todos.length, 306);
    assert.ok(todos.includes("packages/exemplo/com espaço.ts"));
    assert.equal(exigePipelineCompleto(todos), true);
  } finally {
    await rm(alvo, { recursive: true, force: true });
  }
});
