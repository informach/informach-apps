import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
const { openProject, projectJson, saveProject } = await import("../src/main/projects.ts");
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

test("o projeto chega ao processo principal como texto, com o teto de um arquivo, e é validado uma vez ao salvar", async () => {
  assert.deepEqual(projectJson(JSON.stringify(original)), original);
  assert.throws(() => projectJson(original), /inválido/);
  assert.throws(() => projectJson("{"));
  assert.throws(() => projectJson(" ".repeat(32 * 1024 ** 2 + 1)), /32 MB/);
  const path = join(root, "texto.ediaula");
  await assert.rejects(saveProject(path, projectJson(JSON.stringify({ ...original, version: 2 }))));
  await saveProject(path, projectJson(JSON.stringify(original)));
  assert.deepEqual(await openProject(path), original);
});

test("falha ao atualizar os recentes não vira falha de salvamento", async () => {
  const recent = join(root, "recent.json");
  await rm(recent, { force: true });
  // A folder where the list should be: writing it fails, the project is saved anyway.
  await mkdir(recent);
  try {
    const path = join(root, "sem-recentes.ediaula");
    await saveProject(path, { ...original, name: "Sem recentes" });
    assert.equal((await openProject(path)).name, "Sem recentes");
  } finally {
    await rm(recent, { recursive: true });
  }
});

test("projeto antigo com zooms em cada pedaço reabre com os zooms na mídia, sem perder nenhum", async () => {
  const zoom = (id: string, start: number) => ({
    id,
    start,
    end: start + 3,
    scale: 1.8,
    focus: [{ t: start + 1, x: 0.4, y: 0.4 }],
  });
  const zooms = [zoom("a", 1), zoom("b", 12), zoom("c", 25)];
  const piece = (id: string, start: number, at: number) => ({
    id,
    assetId: "screen",
    trackId: "v",
    start,
    in: at,
    duration: 10,
    volume: 1,
    zooms,
  });
  const path = join(root, "legacy.ediaula");
  const screen = {
    id: "screen",
    name: "Tela",
    path: join(root, "tela.mp4"),
    kind: "video",
    duration: 40,
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideo: true,
    hasAudio: true,
    size: 1,
    proxyStatus: "none",
  };
  await saveProject(path, {
    ...original,
    assets: [screen],
    clips: [
      piece("p1", 0, 0),
      piece("p2", 10, 10),
      { ...piece("p3", 20, 20), zooms: [zoom("d", 33)] },
    ],
  });
  const opened = await openProject(path);
  assert.ok(opened.clips.every((c) => !("zooms" in c)));
  assert.deepEqual(
    opened.assets[0].zooms?.map((z) => z.id),
    ["a", "b", "c", "d"],
  );
});
