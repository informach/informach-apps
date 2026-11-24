import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILT_IN_RECIPES, DEFAULT_FONTS, type RunInputs } from "../../../shared/pipelines";
import { draftRequest } from "./prompt";
import {
  draftParts,
  type PipelineEditor,
  type PipelineStep,
  type RunProgress,
  type RunRecord,
  recordForDisk,
  restoredRecord,
  runPipeline,
  type StepState,
  stepsFor,
  stoppedAt,
} from "./runner";

const recipe = BUILT_IN_RECIPES[0];
if (!recipe) throw new Error("missing ready recipe");
const inputs: RunInputs = {
  recipeId: recipe.id,
  files: {},
  script: "x",
  textPalette: ["#ffffff"],
  fonts: DEFAULT_FONTS,
};

test("the draft goes in parts: a theory lesson by its background and shots, the rest by sentences", () => {
  assert.deepEqual(
    draftParts(13).map((p) => [p.id, p.label, p.lines]),
    [
      ["frases-1-6", "Frases 1–6", [0, 1, 2, 3, 4, 5]],
      ["frases-7-12", "Frases 7–12", [6, 7, 8, 9, 10, 11]],
      ["frases-13-13", "Frase 13", [12]],
    ],
  );
  assert.equal(draftParts(4).length, 1);
  const lecture = draftParts(12, [{ lines: [0, 1] }, { lines: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }]);
  assert.deepEqual(
    lecture.map((p) => [p.id, p.label, p.lines.length, p.shot, p.background ?? false]),
    [
      ["fundo", "Fundo", 0, undefined, true],
      ["corte-1", "Corte 1", 2, 0, false],
      ["corte-2-1", "Corte 2 (frases 3–10)", 8, 1, false],
      ["corte-2-2", "Corte 2 (frases 11–12)", 2, 1, false],
    ],
  );
});

/** What the steps before the draft hand it: the animation and `count` sentences. */
const narrated = (count: number): PipelineStep => ({
  id: "narration",
  label: "Narração",
  run: async (ctx) => {
    ctx.results.clip = { clipId: "animation-x", fps: 30, frames: count * 90 };
    ctx.results.piece = {
      start: 0,
      end: count * 3,
      coverage: 1,
      lines: Array.from({ length: count }, (_, i) => ({
        text: `Frase número ${i + 1}.`,
        start: i * 3,
        end: i * 3 + 3,
      })),
    };
    ctx.results.lessonStart = 0;
  },
});

const editorWith = (overrides: Partial<PipelineEditor>): PipelineEditor => ({
  importStudioProject: () => ({ summary: "", sceneArtboardId: null, imagePalette: [], boards: [] }),
  openNarration: async () => ({ clipId: "animation-x", fps: 30, frames: 1 }),
  activeArtboard: () => ({ id: "artboard-x", name: "Cena", width: 1440, height: 1080 }),
  designKit: () => ({ boards: [], palette: [] }),
  styleGuide: () => null,
  markLessonClip: () => undefined,
  lessonClips: () => [],
  setPalette: () => undefined,
  askAssistant: async () => ({ text: "", stopped: false, edits: 1 }),
  stopAssistant: () => undefined,
  assistantBusy: () => false,
  beginRun: () => undefined,
  endRun: () => undefined,
  partStart: () => null,
  undoPart: () => undefined,
  runPlace: () => ({ projectId: "project-x", artboardId: "artboard-x", clipId: "animation-x" }),
  resumeRun: () => true,
  openDemoArtboard: () => ({ id: "artboard-d", name: "D", width: 1920, height: 1080 }),
  setReferenceVideo: () => undefined,
  addPresenterStage: () => ({ slotId: "node-a", backgroundId: "node-b", lightId: "node-c" }),
  addArtboards: () => [],
  embedFonts: async () => [],
  ...overrides,
});

const bridge = {
  pipelineGuideRead: async () => {
    throw new Error("sem guia");
  },
} as unknown as Parameters<typeof runPipeline>[3]["bridge"];

test("a part that fails is undone and stops the run; continuing asks only for the parts left", async () => {
  const draft = stepsFor("game-scene").at(-1);
  if (!draft) throw new Error("missing draft");
  const steps = [narrated(15), draft];
  const asked: string[] = [];
  const undone: unknown[] = [];
  let project = 0;
  const saved: RunProgress[] = [];
  const failing = editorWith({
    // Each part starts from the project as it is; the third one runs out of time.
    partStart: () => ++project,
    undoPart: (before) => void undone.push(before),
    askAssistant: async (text) => {
      asked.push(/a parte (\d+) de (\d+)/.exec(text)?.slice(1).join("/") ?? "?");
      return asked.length === 3
        ? { text: "", stopped: false, edits: 5, error: "A IA demorou demais para responder." }
        : { text: "Feito.", stopped: false, edits: 2 };
    },
  });
  const states: StepState[] = [];
  const first = await runPipeline(
    recipe,
    inputs,
    steps,
    { editor: failing, bridge, signal: new AbortController().signal },
    (id, state) => {
      if (id === "draft") states.push(state);
    },
    { onCheckpoint: (progress) => saved.push(structuredClone(progress)) },
  );
  assert.equal(first.ok, false);
  assert.deepEqual(asked, ["1/3", "2/3", "3/3"]);
  // Only the failing part goes back, to the project as it was before it.
  assert.deepEqual(undone, [3]);
  assert.deepEqual(states.at(-1), {
    status: "failed",
    message:
      "Parte 3 de 3 · Frases 13–15: A IA demorou demais para responder. As 5 alterações feitas nesta parte foram desfeitas.",
  });
  const last = saved.at(-1);
  assert.ok(last);
  assert.deepEqual(last.done, ["narration"]);
  assert.deepEqual(last.results.draftDone, ["frases-1-6", "frases-7-12"]);

  const record: RunRecord = {
    version: 1,
    recipeId: recipe.id,
    inputs,
    place: { projectId: "project-x", artboardId: "artboard-x", clipId: "animation-x" },
    done: [...last.done],
    results: last.results,
    report: [...last.report],
    savedAt: 1,
  };
  assert.equal(
    stoppedAt(record, steps),
    "Pedir o rascunho da animação ao assistente (parte 3 de 3)",
  );

  // Continuing: the narration is not prepared again, and only the third part is asked.
  asked.length = 0;
  let narrations = 0;
  const again = await runPipeline(
    recipe,
    inputs,
    [{ ...steps[0], run: async () => void narrations++ } as PipelineStep, draft],
    {
      editor: editorWith({
        askAssistant: async (text) => {
          asked.push(/a parte (\d+) de (\d+)/.exec(text)?.slice(1).join("/") ?? "?");
          return { text: "", stopped: false, edits: 1 };
        },
      }),
      bridge,
      signal: new AbortController().signal,
    },
    () => undefined,
    { resume: record },
  );
  assert.equal(again.ok, true);
  assert.equal(narrations, 0);
  assert.deepEqual(asked, ["3/3"]);
  assert.match(again.report.join("\n"), /Frases 1–6: o assistente fez 2 alterações/);
});

test("a part's request names only its sentences in full and stays well under the message limit", () => {
  // A long script: 120 sentences of about 165 characters (20 000 in all).
  const lines = Array.from({ length: 120 }, (_, i) => ({
    text: `${"palavra ".repeat(20)}fim da frase ${i + 1}.`,
    from: i * 90,
    to: i * 90 + 80,
  }));
  const facts = {
    recipe,
    artboard: { id: "artboard-x", name: "Cena", width: 1920, height: 1080 },
    clip: { id: "animation-x", fps: 30, frames: 120 * 90 },
    lines,
    images: [],
    textPalette: ["#ffffff"],
    fonts: null,
    imagePalette: [],
    lessonStart: 0,
  };
  const text = draftRequest({
    ...facts,
    part: {
      label: "Frases 7–12",
      index: 1,
      total: 20,
      lines: [6, 7, 8, 9, 10, 11],
      done: ["Frases 1–6"],
    },
  });
  assert.ok(text.length < 32_000, `${text.length}`);
  assert.match(text, /a parte 2 de 20, Frases 7–12/);
  assert.match(text, /Anime agora só as frases 7–12 \(quadros 540–1070\)/);
  assert.match(text, /Já feito em partes anteriores: Frases 1–6/);
  assert.ok(text.includes(lines[6]?.text ?? "?"));
  assert.ok(!text.includes(lines[0]?.text ?? "?"));
  assert.match(text, /motion keys/);
  assert.match(text, /uma linha por frase desta parte/);
  // The whole draft at once (one part) keeps every sentence in full.
  assert.ok(draftRequest(facts).includes(lines[0]?.text ?? "?"));
});

test("a run kept in the profile continues only at the draft, without its media", () => {
  const steps = stepsFor(recipe.kind);
  const record: RunRecord = {
    version: 1,
    recipeId: recipe.id,
    inputs,
    place: { projectId: "project-x", artboardId: "artboard-x", clipId: "animation-x" },
    done: steps.slice(0, -1).map((s) => s.id),
    results: { presenter: { name: "aula.mp4", preview: new Uint8Array([1, 2]) }, draftTotal: 3 },
    report: ["ok"],
    savedAt: 5,
  };
  const disk = JSON.parse(JSON.stringify(recordForDisk(record)));
  assert.deepEqual(disk.results.presenter, { name: "aula.mp4" });
  const back = restoredRecord(disk, recipe);
  assert.ok(back);
  assert.equal(back.results.restored, true);
  assert.equal(stoppedAt(back, steps), "Pedir o rascunho da animação ao assistente (parte 1 de 3)");
  // Stopped before the draft, of another recipe, or not a record: started over.
  assert.equal(restoredRecord({ ...disk, done: [] }, recipe), null);
  assert.equal(restoredRecord({ ...disk, recipeId: "outra" }, recipe), null);
  assert.equal(restoredRecord("x", recipe), null);
});
