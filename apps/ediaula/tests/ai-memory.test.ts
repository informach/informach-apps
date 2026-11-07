import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  createMemoryStore,
  MEMORY_INDEX,
  MEMORY_MAX_BYTES,
  parseMemory,
  runMemoryTool,
} from "../src/main/aiMemory.ts";
import { AI_TOOLS, isMemoryTool, MEMORY_TOOLS } from "../src/shared/aiTools.ts";

let root = "";
let n = 0;
before(async () => {
  root = await mkdtemp(join(tmpdir(), "ediaula-memory-"));
});
after(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A store over a fresh folder (created on the first memory). */
function fresh() {
  const dir = join(root, `m${++n}`, "ai-memory");
  return { dir, store: createMemoryStore(() => dir) };
}

const mp4 = {
  name: "ediaula-export-mp4-only",
  description: "Ao exportar, sair só o MP4, sem arquivos ao lado",
  type: "feedback" as const,
  body: "Exportar só o vídeo: formats [].\nWhy: a pessoa sobe só o MP4.\nHow to apply: export_video com formats [].",
};

const indexLines = (index: string): string[] =>
  index.split("\n").filter((l) => l.startsWith("- ["));

test("remember writes the memory file with its frontmatter and one index line", async () => {
  const { dir, store } = fresh();
  const out = await runMemoryTool(store, "remember", { ...mp4 });
  assert.equal(out.ok, true, out.text);
  assert.match(out.text, /feedback_ediaula_export_mp4_only\.md/);
  const text = await readFile(join(dir, "feedback_ediaula_export_mp4_only.md"), "utf8");
  assert.match(
    text,
    /^---\nname: ediaula-export-mp4-only\ndescription: .+\nmetadata:\n {2}type: feedback\n---\n\n/,
  );
  const parsed = parseMemory("feedback_ediaula_export_mp4_only.md", text);
  assert.equal(parsed?.description, mp4.description);
  assert.equal(parsed?.body, mp4.body);
  const index = await readFile(join(dir, MEMORY_INDEX), "utf8");
  assert.deepEqual(indexLines(index), [
    `- [Ediaula export mp4 only](feedback_ediaula_export_mp4_only.md) — ${mp4.description}`,
  ]);
});

test("the same name again updates that memory, even with another wording or type, never doubles it", async () => {
  const { dir, store } = fresh();
  await store.remember(mp4);
  const again = await runMemoryTool(store, "remember", {
    ...mp4,
    description: "Exportações: só o arquivo de vídeo",
    body: "Só o MP4 na exportação.",
  });
  assert.equal(again.ok, true);
  assert.match(again.text, /^Memória atualizada/);
  await store.remember({ ...mp4, type: "user", body: "Prefere só o MP4." });
  const files = (await readdir(dir)).filter((f) => f !== MEMORY_INDEX).sort();
  assert.deepEqual(files, ["user_ediaula_export_mp4_only.md"]);
  const index = await readFile(join(dir, MEMORY_INDEX), "utf8");
  assert.deepEqual(indexLines(index), [
    `- [Ediaula export mp4 only](user_ediaula_export_mp4_only.md) — ${mp4.description}`,
  ]);
  const [memory] = await store.list();
  assert.equal(memory?.body, "Prefere só o MP4.");
});

test("a name that would leave the folder is refused with a clear message and nothing is written", async () => {
  const { dir, store } = fresh();
  for (const name of [
    "../../x",
    "..\\x",
    "C:\\Windows\\x",
    "/etc/x",
    "Maiúscula",
    "a--b",
    "x".repeat(65),
  ]) {
    const out = await runMemoryTool(store, "remember", { ...mp4, name });
    assert.equal(out.ok, false, name);
    assert.match(out.text, /^Nome recusado/, name);
    assert.match(out.text, /caminhos e "\.\.\/" não são aceitos/);
  }
  const forget = await runMemoryTool(store, "forget", { name: "../MEMORY" });
  assert.equal(forget.ok, false);
  assert.match(forget.text, /^Nome recusado/);
  // Not even the folder was made, nor anything above it.
  await assert.rejects(readdir(join(dir, "..")), { code: "ENOENT" });
});

test("a memory over the size limit is refused", async () => {
  const { store } = fresh();
  const out = await runMemoryTool(store, "remember", {
    ...mp4,
    body: "a".repeat(MEMORY_MAX_BYTES),
  });
  assert.equal(out.ok, false);
  assert.match(out.text, /grande demais/);
  assert.deepEqual(await store.list(), []);
});

test("a link in place of the folder or of a memory file is refused", async () => {
  const { dir, store } = fresh();
  const elsewhere = join(root, `fora${n}`);
  await mkdir(elsewhere, { recursive: true });
  await mkdir(join(dir, ".."), { recursive: true });
  await symlink(elsewhere, dir, "junction");
  const out = await runMemoryTool(store, "remember", { ...mp4 });
  assert.equal(out.ok, false);
  assert.match(out.text, /não é uma pasta comum/);
  assert.deepEqual(await readdir(elsewhere), []);

  const other = fresh();
  await mkdir(join(other.dir, "feedback_ediaula_export_mp4_only.md"), { recursive: true });
  const blocked = await runMemoryTool(other.store, "remember", { ...mp4 });
  assert.equal(blocked.ok, false);
  assert.match(blocked.text, /não é um arquivo comum/);
});

test("the index stays consistent: concurrent memories, foreign lines kept, forget takes file and line", async () => {
  const { dir, store } = fresh();
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, MEMORY_INDEX),
    "# Minhas memórias\n\nTexto da pessoa.\n- [Outra](outra.md) — escrita à mão\n",
  );
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      store.remember({ ...mp4, name: `pref-${i}`, description: `Preferência ${i}` }),
    ),
  );
  let index = await readFile(join(dir, MEMORY_INDEX), "utf8");
  assert.ok(
    index.startsWith(
      "# Minhas memórias\n\nTexto da pessoa.\n- [Outra](outra.md) — escrita à mão\n",
    ),
  );
  const lines = indexLines(index);
  assert.equal(lines.length, 13);
  assert.equal(new Set(lines).size, 13);
  // Every write went through a temporary file that was renamed: none is left behind.
  const files = await readdir(dir);
  assert.deepEqual(
    files.filter((f) => f.endsWith(".tmp")),
    [],
  );
  assert.equal(files.filter((f) => f.startsWith("feedback_pref_")).length, 12);

  const forget = await runMemoryTool(store, "forget", { name: "pref-3" });
  assert.equal(forget.ok, true, forget.text);
  index = await readFile(join(dir, MEMORY_INDEX), "utf8");
  assert.ok(!index.includes("feedback_pref_3.md"));
  assert.ok(index.includes("outra.md"));
  assert.ok(!(await readdir(dir)).includes("feedback_pref_3.md"));
  const missing = await runMemoryTool(store, "forget", { name: "pref-3" });
  assert.equal(missing.ok, false);
  assert.match(missing.text, /Não há memória/);
});

test("the prompt carries every memory whole, and says how to save one", async () => {
  const { store } = fresh();
  assert.match(await store.prompt(), /No memories saved yet/);
  await store.remember(mp4);
  const prompt = await store.prompt();
  assert.match(prompt, /remember/);
  assert.match(prompt, /never details of a single lesson/);
  assert.ok(prompt.includes('<memory name="ediaula-export-mp4-only" type="feedback"'));
  assert.ok(prompt.includes("How to apply: export_video com formats []."));
  const listed = await runMemoryTool(store, "list_memories", {});
  assert.equal(listed.text, `- ediaula-export-mp4-only (feedback): ${mp4.description}`);
  const one = await runMemoryTool(store, "list_memories", { name: "ediaula-export-mp4-only" });
  assert.ok(one.text.includes(mp4.body));
});

test("the memory tools are known tools, and the only ones run outside the editor", () => {
  for (const name of MEMORY_TOOLS) assert.ok(Object.hasOwn(AI_TOOLS, name), name);
  assert.equal(isMemoryTool("export_video"), false);
  assert.equal(isMemoryTool("remember"), true);
  assert.equal(AI_TOOLS.list_memories.permission, "read");
});
