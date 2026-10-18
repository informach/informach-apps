import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import type { Project } from "../src/shared/types.ts";

// The editor's store resolves the app's import aliases; here they point at the sources.
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
// Saving goes nowhere: only the history is under test.
Object.assign(globalThis, { window: { api: { saveProject: async () => {} } } });
const { runAsAi, useProject } = await import("../src/renderer/src/state/project.ts");
hooks.deregister();

const project = (id: string): Project => ({
  version: 1,
  id,
  name: "v0",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [],
  tracks: [],
  clips: [],
});

const rename = (name: string) => (p: Project) => ({ ...p, name });

test("an edit the person makes while an AI call waits stays the person's", async () => {
  useProject.getState().load(null as unknown as string, project("p1"));
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const call = runAsAi(
    { origin: "ai", key: "ai:c1", conversation: "p1", turn: "t1", projectId: "p1" },
    async (commit) => {
      commit(rename("ia-1"));
      await gate;
      commit(rename("ia-2"));
      return "pronto";
    },
  );
  // Meanwhile the person edits (a drop, an imported recording, Aplicar): a plain commit.
  await Promise.resolve();
  assert.equal(useProject.getState().commit(rename("pessoa")), true);
  release();
  const { value, refused } = await call;
  assert.deepEqual([value, refused], ["pronto", false]);
  const { pastMeta, project: now } = useProject.getState();
  assert.equal(now?.name, "ia-2");
  assert.deepEqual(
    pastMeta.map((m) => m.origin),
    ["ai", "user", "ai"],
    "the person's edit is a step of its own between the AI's",
  );
  assert.ok(!pastMeta[1].key && !pastMeta[1].turn, "and carries nothing of the AI");
  // The AI's undo takes back only its own last step; the person's edit stops it.
  assert.equal(
    useProject.getState().undoAi((e) => e.conversation === "p1", 5),
    1,
  );
  assert.equal(useProject.getState().project?.name, "pessoa");
  assert.equal(
    useProject.getState().undoAi((e) => e.conversation === "p1", 5),
    0,
  );
});

test("an AI call never writes into a lesson opened in the meantime", async () => {
  useProject.getState().load(null as unknown as string, project("p1"));
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const call = runAsAi({ origin: "ai", key: "ai:c2", projectId: "p1" }, async (commit) => {
    await gate;
    return commit(rename("ia"));
  });
  useProject.getState().load(null as unknown as string, project("p2"));
  release();
  const { value, refused } = await call;
  assert.deepEqual([value, refused], [false, true]);
  assert.equal(useProject.getState().project?.name, "v0");
  assert.equal(useProject.getState().past.length, 0);
});
