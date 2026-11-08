import assert from "node:assert/strict";
import { test } from "node:test";
import { runPipeline } from "../renderer/src/pipelines/runner";
import {
  BUILT_IN_RECIPES,
  duplicateRecipe,
  emptyRecipeStore,
  listRecipes,
  missingInputs,
  parseRecipeStore,
  type RunInputs,
  removeRecipe,
  restoreRecipe,
  saveRecipe,
} from "./pipelines";

test("the two ready recipes come first; an edit is kept over the original and Voltar brings it back", () => {
  let store = emptyRecipeStore();
  assert.deepEqual(
    listRecipes(store).map((r) => r.name),
    ["Cena animada do jogo", "Demonstração passo a passo"],
  );
  const scene = BUILT_IN_RECIPES[0];
  if (!scene) throw new Error("missing ready recipe");
  store = saveRecipe(store, { ...scene, style: "Só entradas suaves." });
  assert.equal(listRecipes(store)[0]?.style, "Só entradas suaves.");
  // Saved back exactly as it came: nothing is kept over it.
  store = saveRecipe(store, scene);
  assert.deepEqual(store.recipes, []);
  // Removed and restored.
  store = removeRecipe(store, scene.id);
  assert.deepEqual(
    listRecipes(store).map((r) => r.id),
    ["recipe-demonstracao"],
  );
  store = restoreRecipe(store, scene.id);
  assert.equal(listRecipes(store).length, 2);
});

test("a duplicate is the person's own recipe, with a free name, after the ready ones", () => {
  let store = duplicateRecipe(emptyRecipeStore(), "recipe-demonstracao", "recipe-minha-1");
  store = duplicateRecipe(store, "recipe-demonstracao", "recipe-minha-2");
  assert.deepEqual(
    listRecipes(store).map((r) => [r.id, r.name, r.kind]),
    [
      ["recipe-cena-do-jogo", "Cena animada do jogo", "game-scene"],
      ["recipe-demonstracao", "Demonstração passo a passo", "screen-demo"],
      ["recipe-minha-1", "Demonstração passo a passo (cópia)", "screen-demo"],
      ["recipe-minha-2", "Demonstração passo a passo (cópia 2)", "screen-demo"],
    ],
  );
  // A file from elsewhere or damaged reads as the ready recipes alone.
  assert.deepEqual(parseRecipeStore({ version: 9 }), emptyRecipeStore());
  assert.equal(parseRecipeStore(JSON.parse(JSON.stringify(store))).recipes.length, 2);
});

test("a run says what is missing, by the recipe's kind", () => {
  const [scene, demo] = BUILT_IN_RECIPES;
  if (!scene || !demo) throw new Error("missing ready recipes");
  assert.deepEqual(missingInputs(scene, { textPalette: ["#ffffff"] }), [
    "Projeto do Estúdio (.szproject.json)",
    "Áudio da aula (arquivo ou aula do EdiAula)",
    "Roteiro do trecho",
  ]);
  const audio = { token: "file-abcdefgh", name: "aula.mp3", kind: "audio" as const, size: 1 };
  assert.deepEqual(
    missingInputs(demo, { files: { audio }, script: "Abra a aba.", textPalette: ["#fff000"] }),
    ["Vídeo da demonstração"],
  );
  // A lesson of EdiAula is also an audio source.
  const lesson = { ...audio, kind: "lesson" as const, name: "Aula 3.ediaula" };
  const video = { ...audio, kind: "video" as const, name: "demo.mp4" };
  assert.deepEqual(
    missingInputs(demo, { files: { audio: lesson, video }, script: "x", textPalette: ["#000000"] }),
    [],
  );
});

test("the runner goes step by step, stops at a failure and at Cancelar", async () => {
  const recipe = BUILT_IN_RECIPES[0];
  if (!recipe) throw new Error("missing ready recipe");
  const inputs: RunInputs = {
    recipeId: recipe.id,
    files: {},
    script: "Uma frase.",
    textPalette: ["#ffffff"],
  };
  const deps = (signal: AbortSignal) => ({
    editor: { importStudioProject: () => ({ summary: "", sceneArtboardId: null }) },
    bridge: { pipelineReadProject: async () => "" },
    signal,
  });
  const log: string[] = [];
  const failed = await runPipeline(
    recipe,
    inputs,
    [
      { id: "a", label: "A", run: async (ctx) => void ctx.report.push("A feito") },
      {
        id: "b",
        label: "B",
        run: async () => {
          throw new Error("sem roteiro no áudio");
        },
      },
      { id: "c", label: "C", run: async () => void log.push("never") },
    ],
    deps(new AbortController().signal),
    (id, state) =>
      log.push(`${id}:${state.status}${state.status === "failed" ? `:${state.message}` : ""}`),
  );
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.report, ["A feito"]);
  assert.deepEqual(log.slice(3), [
    "a:running",
    "a:done",
    "b:running",
    "b:failed:sem roteiro no áudio",
    "c:cancelled",
  ]);

  const stop = new AbortController();
  const states: string[] = [];
  const cancelled = await runPipeline(
    recipe,
    inputs,
    [
      {
        id: "x",
        label: "X",
        run: async (ctx) => {
          stop.abort();
          ctx.signal.throwIfAborted();
        },
      },
      { id: "y", label: "Y", run: async () => undefined },
    ],
    deps(stop.signal),
    (id, state) => states.push(`${id}:${state.status}`),
  );
  assert.equal(cancelled.ok, false);
  assert.deepEqual(states.slice(2), ["x:running", "x:cancelled", "y:cancelled"]);
});
