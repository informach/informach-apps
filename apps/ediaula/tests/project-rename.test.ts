import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import type { Project } from "../src/shared/types.ts";

/**
 * Renaming the open lesson while the person goes on editing (lib/projectFiles.ts renameLesson):
 * no save lands on the old file while it moves, and an edit made meanwhile is saved in the new
 * one instead of being taken as already saved.
 */

const src = new URL("../src/", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@shared/"))
      return { url: new URL(`shared/${specifier.slice(8)}.ts`, src).href, shortCircuit: true };
    if (specifier.startsWith("@/"))
      return {
        url: new URL(`renderer/src/${specifier.slice(2)}.ts`, src).href,
        shortCircuit: true,
      };
    if (
      specifier.startsWith("./") &&
      context.parentURL?.includes("/renderer/src/") &&
      !/\.[a-z]+$/i.test(specifier)
    )
      return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const saves: { path: string; project: Project }[] = [];
Object.assign(globalThis, {
  window: {
    api: {
      saveProject: async (path: string, json: string) => {
        saves.push({ path, project: JSON.parse(json) });
      },
    },
  },
});
const { holdingSaves, useProject } = await import("../src/renderer/src/state/project.ts");
hooks.deregister();

const lesson: Project = {
  version: 1,
  id: "p",
  name: "Rascunho",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [],
  tracks: [],
  clips: [],
};
const OLD = "C:/aulas/Rascunho.ediaula";
const NEW = "C:/aulas/Aula final.ediaula";

test("an edit made while the file is renamed is saved in the renamed file", async () => {
  useProject.getState().load(OLD, lesson);
  let asked: Promise<boolean> = Promise.resolve(true);
  await holdingSaves(async () => {
    // The file is moving: the person edits, and a save is asked for meanwhile.
    useProject.getState().commit((p) => ({ ...p, palette: "farol" }));
    asked = useProject.getState().saveNow();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(saves.length, 0, "no save while the file moves");
    useProject.getState().renamed(NEW, "Aula final");
    // The edit is not taken as saved by the rename.
    assert.equal(useProject.getState().saveState, "pending");
  });
  // The save asked for meanwhile waited for the rename, and wrote where the lesson is now.
  await asked;
  await useProject.getState().flush();
  assert.ok(saves.length > 0);
  assert.ok(
    saves.every((s) => s.path === NEW),
    "everything went to the new file",
  );
  const last = saves.at(-1)?.project;
  assert.equal(last?.name, "Aula final");
  assert.equal(last?.palette, "farol");
  assert.equal(useProject.getState().saveState, "saved");
});

test("a rename with nothing new to save leaves the lesson saved", async () => {
  saves.length = 0;
  useProject.getState().load(OLD, lesson);
  await holdingSaves(async () => useProject.getState().renamed(NEW, "Aula final"));
  assert.equal(useProject.getState().saveState, "saved");
  await useProject.getState().flush();
  assert.equal(saves.length, 0, "the file already holds it");
});
