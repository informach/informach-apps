import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  type GuidedPlanV2,
  type GuidedStore,
  guidedStoreSchema,
  lessonPermissionAllowed,
  MAX_PLANS,
  newestGuided,
  newPlan,
  storeProblem,
} from "../src/shared/guidedPlan.ts";
import { GUIDED_DEFAULTS } from "../src/shared/guidedRecording.ts";
import { restoreSnapshot, withRuntimeOf } from "../src/shared/history.ts";
import type { Asset, Project } from "../src/shared/types.ts";

/** The guided plans live in the project (project.guided), outside the undo history. */

const root = await mkdtemp(join(tmpdir(), "ediaula-guided-store-"));
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
const { readGuidedDraft, writeGuidedDraft } = await import("../src/main/guidedDrafts.ts");
hooks.deregister();
after(() => rm(root, { recursive: true, force: true }));

const plan: GuidedPlanV2 = {
  ...newPlan("plano-1", "Blocos"),
  url: "https://plataforma.example/aula",
  steps: [
    {
      id: "a",
      speech: "Clique em Começar",
      at: 0,
      action: "click",
      target: {
        locator: {
          strategies: [{ by: "testid", value: "start" }],
          url: "https://plataforma.example/aula",
          point: { u: 0.5, v: 0.5 },
          fingerprint: {
            tag: "button",
            text: "Começar",
            rect: { x: 10, y: 20, width: 80, height: 30 },
            view: { width: 1920, height: 1080 },
            cursor: "pointer",
          },
        },
      },
    },
  ],
  audio: { path: "C:/aulas/voz.wav", duration: 30 },
};
const screen: Asset = {
  id: "tela",
  name: "Tela",
  path: "C:/aulas/tela.mp4",
  kind: "video",
  duration: 22,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: false,
  size: 10,
  proxyStatus: "none",
  cursor: "C:/aulas/cursor.json",
  guidedRun: "C:/aulas/guided-run.json",
};
const project: Project = {
  version: 1,
  id: "aula",
  name: "Aula",
  createdAt: 1,
  updatedAt: 2,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [screen],
  tracks: [],
  clips: [],
  guided: {
    plans: [plan],
    runs: [{ planId: "plano-1", step: 0, status: "failed", dir: "C:/take", at: 5 }],
    updatedAt: 9,
  },
};

test("plans, runs and the media's guided-run.json are saved and reopened with the project", async () => {
  const path = join(root, "aula.ediaula");
  await saveProject(path, project);
  const opened = await openProject(path);
  assert.deepEqual(opened.guided, project.guided);
  assert.equal(opened.assets[0].guidedRun, "C:/aulas/guided-run.json");
  // A plan kept by an older recorder (version 1) opens as a screen plan.
  const legacy = {
    ...project,
    guided: { plans: [{ ...GUIDED_DEFAULTS, steps: [] }] },
  };
  await saveProject(path, legacy);
  const migrated = await openProject(path);
  assert.equal(migrated.guided?.plans[0].version, 2);
  assert.equal(migrated.guided?.plans[0].mode, "screen");
  await assert.rejects(
    saveProject(path, { ...project, guided: { plans: [{ ...plan, mode: "nenhum" }] } }),
  );
});

test("undo and redo never take the plans back, and the media keeps its guided-run.json", () => {
  const before = { ...project, guided: { plans: [], updatedAt: 1 } };
  const now: Project = {
    ...project,
    assets: [{ ...screen, guidedRun: "C:/novo/guided-run.json" }],
  };
  const restored = restoreSnapshot(before, now, 10);
  assert.deepEqual(restored.guided, now.guided);
  assert.equal(withRuntimeOf(before, now).assets[0].guidedRun, "C:/novo/guided-run.json");
  const none = restoreSnapshot(project, { ...now, guided: undefined }, 10);
  assert.equal("guided" in none, false);
});

test("a draft newer than the project's plans wins; the draft survives a reopen", async () => {
  const draft: GuidedStore = {
    plans: [{ ...plan, name: "Blocos (rascunho)" }],
    updatedAt: 20,
  };
  await writeGuidedDraft("aula", draft);
  assert.deepEqual(await readGuidedDraft("aula"), guidedStoreSchema.parse(draft));
  assert.equal(await readGuidedDraft("outra"), null);
  // An id with characters a file name cannot have still gets its own draft.
  await writeGuidedDraft("aula/2", draft);
  assert.equal((await readGuidedDraft("aula/2"))?.plans[0].name, "Blocos (rascunho)");
  assert.equal(newestGuided(project.guided, draft), draft);
  assert.equal(newestGuided({ ...draft, updatedAt: 30 }, draft)?.updatedAt, 30);
  assert.equal(newestGuided(undefined, draft), draft);
  assert.equal(newestGuided(project.guided, null), project.guided);
});

test("a plan with a value left half typed says what to fix and is not saved yet", () => {
  const store: GuidedStore = { plans: [plan] };
  assert.equal(storeProblem(store), null);
  const negative = structuredClone(plan);
  negative.steps[0].at = -1;
  assert.equal(
    storeProblem({ plans: [negative] }),
    "No plano “Blocos”, etapa 1: confira “Ação em”. O plano será salvo quando o valor for válido.",
  );
  const unnamed = { ...structuredClone(plan), name: "", viewport: { width: 0, height: 1080 } };
  assert.match(storeProblem({ plans: [unnamed] }) ?? "", /“sem nome”: confira “Tamanho”/);
  const many = Array.from({ length: MAX_PLANS + 1 }, (_, i) => newPlan(`p-${i}`, `Plano ${i}`));
  assert.equal(storeProblem({ plans: many }), `Um projeto guarda até ${MAX_PLANS} planos.`);
  // The copy never uses the em dash or the en dash.
  assert.doesNotMatch(storeProblem({ plans: [negative] }) ?? "", /[\u2013\u2014]/);
});

test("the lesson page may go full screen and copy, and nothing else of the computer", () => {
  for (const allowed of ["fullscreen", "clipboard-sanitized-write"])
    assert.equal(lessonPermissionAllowed(allowed), true, allowed);
  for (const refused of [
    "media",
    "geolocation",
    "notifications",
    "clipboard-read",
    "display-capture",
    "openExternal",
    "hid",
    "serial",
    "usb",
    "fileSystem",
  ])
    assert.equal(lessonPermissionAllowed(refused), false, refused);
});
