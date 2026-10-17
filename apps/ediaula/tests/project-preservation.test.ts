import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { Project } from "../src/shared/types.ts";

// Only Electron's profile location is replaced. Validation, backups, serialized
// writes, flushing, renaming and reopen all execute against an isolated disk tree.
const root = await mkdtemp(join(tmpdir(), "ediaula-project-preservation-"));
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "electron")
      return {
        url: `data:text/javascript,${encodeURIComponent(`export const app = { getPath: () => ${JSON.stringify(root)} };`)}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const { openProject, saveProject } = await import("../src/main/projects.ts");
hooks.deregister();
after(() => rm(root, { recursive: true }));

const original: Project = {
  version: 1,
  id: "preserved",
  name: "Aula de recuperação",
  createdAt: 1,
  updatedAt: 2,
  settings: { width: 1280, height: 720, fps: 30 },
  assets: [],
  tracks: [],
  clips: [],
};

test("projeto salvo reabre com dados de extensão e cópia de segurança do estado anterior", async () => {
  const path = join(root, "lesson.ediaula");
  const project = { ...original, customExtension: { caption: "Texto de recuperação" } };
  await saveProject(path, project);
  assert.deepEqual(await openProject(path), project);
  const changed = { ...project, name: "Aula atualizada", updatedAt: 3 };
  await saveProject(path, changed);
  assert.deepEqual(await openProject(path), changed);
  const backups = join(root, ".backups", "lesson");
  const [name] = await readdir(backups);
  assert.ok(name);
  assert.deepEqual(JSON.parse(await readFile(join(backups, name), "utf8")), project);
});

test("dados inválidos e destino indisponível não substituem o projeto existente", async () => {
  const path = join(root, "original.ediaula");
  await saveProject(path, original);
  const previous = await readFile(path);
  await assert.rejects(saveProject(path, { ...original, settings: { fps: 0 } }));
  assert.deepEqual(await readFile(path), previous);
  const blocker = join(root, "not-a-directory");
  await writeFile(blocker, "keep");
  await assert.rejects(saveProject(join(blocker, "lesson.ediaula"), original));
  assert.equal(await readFile(blocker, "utf8"), "keep");
  assert.deepEqual(await readFile(path), previous);
  await saveProject(path, { ...original, name: "Recuperado" });
  assert.equal((await openProject(path)).name, "Recuperado");
});
