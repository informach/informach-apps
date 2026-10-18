import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { Project } from "../src/shared/types.ts";

// Only Electron's profile location is replaced: the files are written and read for real.
const root = await mkdtemp(join(tmpdir(), "ediaula-project-files-"));
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
const {
  duplicateProject,
  listBackups,
  openProject,
  recentProjects,
  renameProject,
  restoreBackup,
  saveProject,
} = await import("../src/main/projects.ts");
hooks.deregister();
after(() => rm(root, { recursive: true }));

const lesson = (name: string): Project => ({
  version: 1,
  id: "original",
  name,
  createdAt: 1,
  updatedAt: 2,
  settings: { width: 1280, height: 720, fps: 30 },
  assets: [],
  tracks: [{ id: "t", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
  clips: [],
  proposals: [
    {
      id: "pr",
      projectId: "original",
      title: "Cortes",
      revision: 1,
      createdAt: 1,
      items: [
        {
          id: "i",
          start: 1,
          end: 2,
          reason: "repetição",
          anchors: [{ clipId: "c", assetId: "a", start: 1, end: 2 }],
          status: "pending",
        },
      ],
    },
  ],
});

test("duplicating makes a lesson of its own beside the original", async () => {
  const path = join(root, "Aula 1.ediaula");
  await saveProject(path, lesson("Aula 1"));
  const first = await duplicateProject(path);
  assert.equal(first.path, join(root, "Aula 1 (cópia).ediaula"));
  const copy = await openProject(first.path);
  assert.equal(copy.name, "Aula 1 (cópia)");
  assert.notEqual(copy.id, "original");
  assert.equal(copy.proposals?.[0].projectId, copy.id, "the proposals go with the copy");
  assert.deepEqual(copy.tracks, lesson("Aula 1").tracks);
  // A second copy does not overwrite the first.
  const second = await duplicateProject(path);
  assert.equal(second.path, join(root, "Aula 1 (cópia) (2).ediaula"));
  assert.equal((await openProject(path)).id, "original", "the original stays as it was");
});

test("renaming moves the file and its backups, and the recent list follows", async () => {
  const path = join(root, "Rascunho.ediaula");
  await saveProject(path, lesson("Rascunho"));
  await saveProject(path, { ...lesson("Rascunho"), updatedAt: 3 });
  assert.equal((await listBackups(path)).length, 1);
  const target = await renameProject(path, "Aula final");
  assert.equal(target, join(root, "Aula final.ediaula"));
  assert.ok(!existsSync(path));
  assert.equal((await openProject(target)).name, "Aula final");
  assert.equal((await listBackups(target)).length, 1, "the backups came along");
  const recent = await recentProjects();
  assert.ok(recent.some((r) => r.path === target) && !recent.some((r) => r.path === path));
  // Same file name: only the name inside changes.
  assert.equal(await renameProject(target, "aula final"), target);
  assert.equal((await openProject(target)).name, "aula final");
  await assert.rejects(renameProject(target, "   "), /nome/);
});

test("restoring a backup keeps the current state as a backup first", async () => {
  const path = join(root, "Restaurar.ediaula");
  await saveProject(path, lesson("Versão 1"));
  await saveProject(path, lesson("Versão 2"));
  const [backup] = await listBackups(path);
  assert.equal(backup.name, "Versão 1");
  assert.equal(backup.clips, 0);
  // Make it older than the next backup, as ten minutes of editing would.
  const dir = join(root, ".backups", "Restaurar");
  const old = new Date(Date.now() - 60 * 60 * 1000);
  await utimes(join(dir, backup.id), old, old);
  const restored = await restoreBackup(path, backup.id);
  assert.equal(restored.name, "Versão 1");
  assert.equal((await openProject(path)).name, "Versão 1");
  const backups = await listBackups(path);
  assert.equal(backups.length, 2);
  assert.equal(backups[0].name, "Versão 2", "what it was before restoring is the newest backup");
  const files = await readdir(dir);
  assert.equal(files.filter((f) => f.endsWith(".ediaula")).length, 2);
  // The list comes from the index beside the copies, not from reading each one.
  const index = JSON.parse(await readFile(join(dir, "indice.json"), "utf8"));
  assert.deepEqual(Object.keys(index).sort(), files.filter((f) => f.endsWith(".ediaula")).sort());
  // Restoring that one takes the restore back.
  await restoreBackup(path, backups[0].id);
  assert.equal(JSON.parse(await readFile(path, "utf8")).name, "Versão 2");
  for (const bad of ["../Restaurar.ediaula", "x.ediaula", "2026-01-01-00-00-00.json"])
    await assert.rejects(restoreBackup(path, bad), /inválida/);
  await assert.rejects(restoreBackup(path, "2020-01-01-00-00-00.ediaula"), /não existe/);
});

test("the list of backups does not read the copies again, and learns the ones made before", async () => {
  const path = join(root, "Indice.ediaula");
  await saveProject(path, lesson("Primeira"));
  await saveProject(path, lesson("Segunda"));
  const dir = join(root, ".backups", "Indice");
  const [copy] = (await readdir(dir)).filter((f) => f.endsWith(".ediaula"));
  // A copy that changed on disk is still listed as the index says: it is read only to restore.
  const original = await readFile(join(dir, copy), "utf8");
  await writeFile(join(dir, copy), original.replace('"Primeira"', '"Mudada"'));
  assert.equal((await listBackups(path))[0].name, "Primeira");
  // Without the index (copies made before it), the list reads each copy once and keeps it.
  await rm(join(dir, "indice.json"));
  assert.equal((await listBackups(path))[0].name, "Mudada");
  assert.ok(existsSync(join(dir, "indice.json")));
});
