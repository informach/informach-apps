import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestedNameSchema } from "../main/exportPayload";
import { elementSvgs } from "../renderer/src/pipelines/elements";
import { paletteFromPixels } from "../renderer/src/pipelines/imagePalette";
import { draftRequest } from "../renderer/src/pipelines/prompt";
import { failureText, runPipeline, stepsFor } from "../renderer/src/pipelines/runner";
import { paletteOf } from "../renderer/src/szProjectImport";
import {
  BUILT_IN_RECIPES,
  type BundledFont,
  DEFAULT_FONTS,
  duplicateRecipe,
  emptyRecipeStore,
  listRecipes,
  MAX_RECIPES,
  missingInputs,
  nearestWeight,
  originalRecipe,
  parseRecipeStore,
  type RunInputs,
  removeRecipe,
  restoreRecipe,
  salvageRecipeStore,
  saveRecipe,
  spokenScript,
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

test("a store that does not fit whole loses only what does not fit, and says so", () => {
  const mine = { ...BUILT_IN_RECIPES[1], id: "recipe-minha-1", name: "Minha" };
  const { store, complete } = salvageRecipeStore({
    version: 2,
    recipes: [
      // A field of a newer EdiSVG: the recipe stays, without it.
      { ...mine, voice: "feminina" },
      // A kind this EdiSVG does not know: only this one is left out.
      { ...mine, id: "recipe-outra", kind: "karaoke" },
      { ...mine, name: "Repetida" },
    ],
    hidden: ["recipe-cena-do-jogo", "não é id", "recipe-cena-do-jogo"],
  });
  assert.equal(complete, false);
  assert.deepEqual(store.recipes, [mine]);
  assert.deepEqual(store.hidden, ["recipe-cena-do-jogo"]);
  assert.equal(salvageRecipeStore(JSON.parse(JSON.stringify(store))).complete, true);
});

test("saving past the limit of recipes says so in Portuguese", () => {
  const demo = originalRecipe("recipe-demonstracao");
  assert.ok(demo);
  let store = emptyRecipeStore();
  for (let n = 1; n <= MAX_RECIPES; n++)
    store = saveRecipe(store, { ...demo, id: `recipe-n-${n}`, name: `R ${n}` });
  assert.throws(
    () => saveRecipe(store, { ...demo, id: "recipe-mais-uma", name: "Mais" }),
    /limite é de 100 receitas/,
  );
  // Editing one already saved still works at the limit.
  assert.equal(
    saveRecipe(store, { ...demo, id: "recipe-n-1", name: "Outra" }).recipes.length,
    MAX_RECIPES,
  );
});

test("the ready elements keep an accent of their own when the palette is short", () => {
  const accentOf = (palette: string[]) =>
    elementSvgs(palette)[0]?.svg.match(/stroke="(#[0-9a-f]{6})"/i)?.[1];
  assert.equal(accentOf(["#ffffff"]), "#ffb547");
  assert.equal(accentOf(["#ffffff", "#000000"]), "#ffb547");
  assert.equal(accentOf(["#ffffff", "#000000", "#ff0000"]), "#ff0000");
});

test("a run says what is missing, by the recipe's kind", () => {
  const [scene, demo] = BUILT_IN_RECIPES;
  if (!scene || !demo) throw new Error("missing ready recipes");
  assert.deepEqual(missingInputs(scene, { textPalette: ["#ffffff"] }), [
    "Projeto do Estúdio (.szproject.json)",
    "Áudio da aula (arquivo ou aula do EdiAula)",
    "Roteiro do trecho (fora dos colchetes)",
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
    fonts: DEFAULT_FONTS,
  };
  const deps = (signal: AbortSignal) => ({
    editor: {
      importStudioProject: () => ({
        summary: "",
        sceneArtboardId: "artboard-cena",
        imagePalette: [],
        boards: [],
      }),
      openNarration: async () => ({ clipId: "animation-x", fps: 30, frames: 1 }),
      activeArtboard: () => ({ id: "artboard-x", name: "Cena", width: 1440, height: 1080 }),
      setPalette: () => undefined,
      askAssistant: async () => ({ text: "", stopped: false, edits: 1 }),
      stopAssistant: () => undefined,
      beginRun: () => undefined,
      assistantBusy: () => false,
      endRun: () => undefined,
      openDemoArtboard: () => ({
        id: "artboard-d",
        name: "Demonstração",
        width: 1920,
        height: 1080,
      }),
      setReferenceVideo: () => undefined,
      addArtboards: () => [],
      embedFonts: async () => [],
    },
    bridge: {
      pipelineReadProject: async () => "",
      pipelineFonts: async () => [],
      pipelineFont: async () => {
        throw new Error("sem fontes");
      },
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
    fonts: {
      title: { family: "Baloo 2", weight: 700, assetId: "asset-titulo" },
      body: { family: "Nunito", weight: 400, assetId: "asset-corpo" },
      bodyBold: { family: "Nunito", weight: 700, assetId: "asset-negrito" },
    },
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
  assert.match(text, /Títulos: Baloo 2 700, recurso \[asset-titulo\]/);
  assert.match(text, /Corpo: Nunito 400, recurso \[asset-corpo\]; destaque no corpo: Nunito 700/);
  assert.match(text, /operation:'set-font'/);
  assert.match(text, /nas cores de texto e nas fontes acima/);
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
    fonts: null,
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
    fonts: null,
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

test("what is in [brackets] is a note, never looked for in the audio", () => {
  assert.equal(
    spokenScript("Clique em Salvar [mostrar o botão]. [pausa]\nPronto, [sorrir] está salvo!"),
    "Clique em Salvar.\nPronto, está salvo!",
  );
  // A bracket left open is text, as written.
  assert.equal(spokenScript("Veja [o mapa"), "Veja [o mapa");
  const scene = BUILT_IN_RECIPES[0];
  assert.ok(scene);
  assert.deepEqual(
    missingInputs(scene, { script: "[só anotação]", textPalette: ["#ffffff"] }).at(-1),
    "Roteiro do trecho (fora dos colchetes)",
  );
});

test("a recipe saved before the fonts reads with Baloo 2 and Nunito", () => {
  const { textPalette, name, style, kind } = BUILT_IN_RECIPES[1] ?? {};
  const { store, complete } = salvageRecipeStore({
    version: 1,
    recipes: [{ id: "recipe-antiga", name, kind, style, textPalette }],
    hidden: [],
  });
  assert.equal(complete, true);
  assert.deepEqual(store.recipes[0]?.fonts, { title: "Baloo 2", body: "Nunito" });
  assert.deepEqual(DEFAULT_FONTS, { title: "Baloo 2", body: "Nunito" });
});

test("each font takes the nearest weight its family has", () => {
  assert.equal(nearestWeight([400, 600, 700, 800], 700), 700);
  assert.equal(nearestWeight([400], 700), 400);
  assert.equal(nearestWeight([400, 700], 400), 400);
  // A tie goes to the heavier weight.
  assert.equal(nearestWeight([600, 800], 700), 800);
  assert.throws(() => nearestWeight([], 400));
});

test("a picture gives its colours: lightest first, darkest second, the most vivid last", () => {
  const pixels: number[] = [];
  const paint = (rgb: [number, number, number], n: number, alpha = 255) => {
    for (let i = 0; i < n; i++) pixels.push(...rgb, alpha);
  };
  paint([20, 30, 60], 50); // navy, the most used
  paint([250, 250, 245], 40); // near white
  paint([90, 140, 100], 30); // muted green
  paint([255, 60, 40], 20); // vivid red
  paint([252, 251, 246], 30); // the same white, a step away
  paint([0, 255, 0], 500, 0); // transparent: never counts
  assert.deepEqual(paletteFromPixels(pixels), ["#fbfaf5", "#141e3c", "#5a8c64", "#ff3c28"]);
  assert.deepEqual(paletteFromPixels([10, 10, 10, 255, 240, 240, 240, 255]), [
    "#0a0a0a",
    "#f0f0f0",
  ]);
  assert.deepEqual(paletteFromPixels([0, 0, 0, 0]), []);
});

test("the fonts step embeds the title's bold and the body's regular and bold; the balloon takes the body's bold", async () => {
  const demo = BUILT_IN_RECIPES[1];
  assert.ok(demo);
  const asked: string[] = [];
  const embedded: string[] = [];
  let balloonFont: string | undefined;
  let request = "";
  const font = (family: string, weight: number): BundledFont => ({
    family,
    weight,
    name: `${family.replace(/ /g, "")}-${weight}.ttf`,
    bytes: new Uint8Array([weight % 256]),
    notice: "SIL Open Font License 1.1",
  });
  const steps = stepsFor("screen-demo").filter((step) =>
    ["fonts", "elements", "draft"].includes(step.id),
  );
  const result = await runPipeline(
    demo,
    {
      recipeId: demo.id,
      files: {},
      script: "x",
      textPalette: ["#ffffff", "#1f2a44", "#ffb547"],
      fonts: { title: "Bebas Neue", body: "Nunito" },
    },
    steps,
    {
      editor: {
        importStudioProject: () => ({
          summary: "",
          sceneArtboardId: null,
          imagePalette: [],
          boards: [],
        }),
        openNarration: async () => ({ clipId: "animation-x", fps: 30, frames: 1 }),
        activeArtboard: () => ({ id: "artboard-x", name: "D", width: 1280, height: 720 }),
        setPalette: () => undefined,
        askAssistant: async (text) => {
          request = text;
          return { text: "", stopped: false, edits: 1 };
        },
        stopAssistant: () => undefined,
        beginRun: () => undefined,
        assistantBusy: () => false,
        endRun: () => undefined,
        openDemoArtboard: () => ({ id: "artboard-d", name: "D", width: 1280, height: 720 }),
        setReferenceVideo: () => undefined,
        addArtboards: (_items, fontAssetId) => {
          balloonFont = fontAssetId;
          return [];
        },
        embedFonts: async (fonts) => {
          embedded.push(...fonts.map((f) => f.name));
          return fonts.map((f) => `asset-${f.family.replace(/ /g, "")}-${f.weight}`);
        },
      },
      bridge: {
        pipelineReadProject: async () => "",
        pipelineFonts: async () => [
          { family: "Bebas Neue", group: "Títulos", weights: [400] },
          { family: "Nunito", group: "Arredondada", weights: [400, 600, 700, 800, 900] },
        ],
        pipelineFont: async (family, weight) => {
          asked.push(`${family} ${weight}`);
          return font(family, weight);
        },
        pipelineWords: async () => [],
        pipelineNarration: async () => new Uint8Array(),
        pipelineCancel: async () => undefined,
        onPipelineProgress: () => () => undefined,
        pipelineVideoFacts: async () => ({ width: 1, height: 1, duration: 1, clicks: null }),
        pipelineVideoPreview: async () => new Uint8Array(),
        pipelineVideoFrames: async () => [],
      },
      signal: new AbortController().signal,
    },
    () => undefined,
  );
  // The draft stops without a narration; the fonts and the elements came before it.
  assert.equal(result.ok, false);
  assert.equal(request, "");
  assert.deepEqual(asked, ["Bebas Neue 400", "Nunito 400", "Nunito 700"]);
  assert.deepEqual(embedded, ["BebasNeue-400.ttf", "Nunito-400.ttf", "Nunito-700.ttf"]);
  assert.equal(balloonFont, "asset-Nunito-700");
  assert.deepEqual(result.report, [
    "Fontes Bebas Neue nos títulos e Nunito no corpo, incorporadas ao projeto.",
  ]);

  // A family that does not come with EdiSVG stops the step, naming it.
  const missing = await runPipeline(
    demo,
    {
      recipeId: demo.id,
      files: {},
      script: "x",
      textPalette: ["#ffffff"],
      fonts: { title: "Comic Sans", body: "Nunito" },
    },
    steps.slice(0, 1),
    {
      editor: {} as never,
      bridge: { pipelineFonts: async () => [] } as never,
      signal: new AbortController().signal,
    },
    (_id, state) => {
      if (state.status === "failed") asked.push(state.message);
    },
  );
  assert.equal(missing.ok, false);
  assert.equal(asked.at(-1), "A fonte Comic Sans não vem com o EdiSVG: escolha outra.");
});
