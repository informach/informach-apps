import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestedNameSchema } from "../main/exportPayload";
import { draftRequest } from "../renderer/src/pipelines/prompt";
import { failureText, runPipeline } from "../renderer/src/pipelines/runner";
import { paletteOf } from "../renderer/src/szProjectImport";
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
    editor: {
      importStudioProject: () => ({
        summary: "",
        sceneArtboardId: null,
        imagePalette: [],
        boards: [],
      }),
      openNarration: async () => ({ clipId: "animation-x", fps: 30, frames: 1 }),
      activeArtboard: () => ({ id: "artboard-x", name: "Cena", width: 1440, height: 1080 }),
      setPalette: () => undefined,
      askAssistant: async () => ({ text: "", stopped: false, edits: 1 }),
      stopAssistant: () => undefined,
      beginRun: () => undefined,
      endRun: () => undefined,
      openDemoArtboard: () => ({
        id: "artboard-d",
        name: "Demonstração",
        width: 1920,
        height: 1080,
      }),
      setReferenceVideo: () => undefined,
      addArtboards: () => [],
    },
    bridge: {
      pipelineReadProject: async () => "",
      pipelineWords: async () => [],
      pipelineNarration: async () => new Uint8Array(),
      pipelineCancel: async () => undefined,
      onPipelineProgress: () => () => undefined,
      pipelineVideoFacts: async () => ({ width: 1920, height: 1080, duration: 10, clicks: null }),
      pipelineVideoPreview: async () => new Uint8Array(),
      pipelineVideoFrames: async () => [],
    },
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

test("a failure from the main process is said without Electron's wrapper", () => {
  assert.equal(
    failureText(
      new Error(
        "Error invoking remote method 'pipeline:words': Error: A transcrição ainda não está instalada.",
      ),
    ),
    "A transcrição ainda não está instalada.",
  );
  assert.equal(
    failureText(new Error("Não achei esse roteiro no áudio.")),
    "Não achei esse roteiro no áudio.",
  );
  assert.equal(failureText("x"), "A etapa falhou.");
});

test("the assistant gets the recipe, where to work, each sentence's frames, the images and the colours", () => {
  const text = draftRequest({
    recipe: { name: "Cena animada do jogo", kind: "game-scene", style: "Entradas suaves." },
    artboard: { id: "artboard-cena", name: "Cena · A Chave do Farol", width: 1440, height: 1080 },
    clip: { id: "animation-n", fps: 30, frames: 300 },
    lines: [
      { text: "O personagem precisa encontrar a chave.", from: 12, to: 120 },
      { text: "Quando ele pegar a chave, o aviso muda.", from: 186, to: 280 },
    ],
    images: [{ id: "artboard-heroi", name: "aventureiro", width: 64, height: 64 }],
    textPalette: ["#ffffff", "#143d35"],
    imagePalette: ["#46536e"],
    lessonStart: 135.6,
  });
  assert.match(text, /Entradas suaves\./);
  assert.match(text, /"Cena · A Chave do Farol" \[artboard-cena\], 1440×1080/);
  assert.match(text, /\[animation-n\], 30 FPS, 300 quadros .* em 2:15\.6 da aula/);
  assert.match(text, /1\. Quadros 12–120: "O personagem precisa encontrar a chave\."/);
  assert.match(text, /2\. Quadros 186–280:/);
  assert.match(text, /- aventureiro \[artboard-heroi\] 64×64/);
  assert.match(text, /Textos: #ffffff, #143d35 \(a primeira é a principal\)/);
  assert.match(text, /Não edite as pranchetas das imagens/);
});

test("the images' palette: the colours most shapes paint with, as #rrggbb", () => {
  const shape = (attrs: Record<string, string>, children: unknown[] = []) => ({ attrs, children });
  const palette = paletteOf(
    [
      {
        viewBox: [0, 0, 10, 10],
        nodes: [
          shape({ fill: "#FFF" }),
          shape({ fill: "#ffffff", stroke: "#123456" }),
          shape({ fill: "none" }, [shape({ fill: "#123456" }), shape({ fill: "url(#g)" })]),
        ],
      },
      { viewBox: [0, 0, 10, 10], nodes: [shape({ fill: "#abcdef" }), shape({ fill: "#ffffff" })] },
    ],
    2,
  );
  assert.deepEqual(palette, ["#ffffff", "#123456"]);
});

test("a suggested export name is a plain Windows file name", () => {
  assert.equal(
    suggestedNameSchema.parse("Narração · Cena animada do jogo (começa em 2m15s)"),
    "Narração · Cena animada do jogo (começa em 2m15s)",
  );
  for (const bad of ["a/b", "a\b", "c:x", "nome.", ".oculto", "xy", ""])
    assert.equal(suggestedNameSchema.safeParse(bad).success, false, JSON.stringify(bad));
});

test("for a screen demonstration the assistant also gets the video, the clicks, the frames and the elements", () => {
  const text = draftRequest({
    recipe: { name: "Demonstração passo a passo", kind: "screen-demo", style: "Setas amarelas." },
    artboard: { id: "artboard-demo", name: "Demonstração · tela.mp4", width: 1920, height: 1080 },
    clip: { id: "animation-d", fps: 30, frames: 240 },
    lines: [{ text: "Abra a aba de programação.", from: 12, to: 90 }],
    images: [],
    textPalette: ["#ffffff", "#1f2a44", "#ffb547"],
    imagePalette: [],
    lessonStart: 70,
    demo: {
      video: { name: "tela.mp4", width: 1920, height: 1080 },
      clicks: [{ frame: 40, x: 812, y: 96 }],
      elements: [{ id: "artboard-seta", name: "Seta", width: 240, height: 120 }],
      attached: [{ frame: 21, text: "Abra a aba de programação." }],
    },
  });
  assert.match(text, /O vídeo "tela\.mp4" \(1920×1080\) fica por baixo desta prancheta/);
  assert.match(text, /camada transparente sobre o vídeo no EdiAula: não desenhe fundo/);
  assert.match(text, /Cliques gravados \(quadro: x, y\): 40: 812, 96\./);
  assert.match(text, /Quadros anexados, na ordem: quadro 21 \("Abra a aba de programação\."\)/);
  assert.match(text, /- Seta \[artboard-seta\] 240×120/);
  // A demonstration has no studio images: that section is left out.
  assert.doesNotMatch(text, /Imagens do projeto/);
  const without = draftRequest({
    recipe: { name: "Demonstração passo a passo", kind: "screen-demo", style: "" },
    artboard: { id: "artboard-demo", name: "D", width: 1280, height: 720 },
    clip: { id: "animation-d", fps: 30, frames: 60 },
    lines: [{ text: "Clique em salvar.", from: 0, to: 50 }],
    images: [],
    textPalette: ["#ffffff"],
    imagePalette: [],
    lessonStart: 0,
    demo: {
      video: { name: "outro.mp4", width: 1280, height: 720 },
      clicks: null,
      elements: [],
      attached: [],
    },
  });
  assert.match(without, /O vídeo não tem cursor salvo: veja os quadros anexados/);
});
