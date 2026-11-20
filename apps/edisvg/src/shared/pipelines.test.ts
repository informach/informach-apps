import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestedNameSchema } from "../main/exportPayload";
import { elementSvgs } from "../renderer/src/pipelines/elements";
import { draftRequest, guideStyleRequest, parseGuideStyle } from "../renderer/src/pipelines/prompt";
import {
  clock,
  failureText,
  type PipelineBridge,
  type PipelineEditor,
  type PipelineStep,
  runPipeline,
  type StepState,
  stepsFor,
} from "../renderer/src/pipelines/runner";
import { paletteOf } from "../renderer/src/szProjectImport";
import {
  BUILT_IN_RECIPES,
  type BundledFont,
  DEFAULT_FONTS,
  duplicateRecipe,
  emptyRecipeStore,
  fromLesson,
  listRecipes,
  MAX_RECIPES,
  missingInputs,
  nearestWeight,
  originalRecipe,
  parseRecipeStore,
  RECIPE_INPUTS,
  type RunInputs,
  removeRecipe,
  restoreRecipe,
  salvageRecipeStore,
  saveRecipe,
  spokenScript,
  withGuide,
} from "./pipelines";

test("the three ready recipes come first; an edit is kept over the original and Voltar brings it back", () => {
  let store = emptyRecipeStore();
  assert.deepEqual(
    listRecipes(store).map((r) => r.name),
    ["Cena animada do jogo", "Demonstração passo a passo", "Aula teórica com a apresentadora"],
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
    ["recipe-demonstracao", "recipe-aula-teorica"],
  );
  store = restoreRecipe(store, scene.id);
  assert.equal(listRecipes(store).length, 3);
});

test("a duplicate is the person's own recipe, with a free name, after the ready ones", () => {
  let store = duplicateRecipe(emptyRecipeStore(), "recipe-demonstracao", "recipe-minha-1");
  store = duplicateRecipe(store, "recipe-demonstracao", "recipe-minha-2");
  assert.deepEqual(
    listRecipes(store).map((r) => [r.id, r.name, r.kind]),
    [
      ["recipe-cena-do-jogo", "Cena animada do jogo", "game-scene"],
      ["recipe-demonstracao", "Demonstração passo a passo", "screen-demo"],
      ["recipe-aula-teorica", "Aula teórica com a apresentadora", "presenter-talk"],
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
    "Áudio da aula (arquivo ou pacote da aula do EdiAula)",
    "Roteiro do trecho (fora dos colchetes)",
  ]);
  const audio = { token: "file-abcdefgh", name: "aula.mp3", kind: "audio" as const, size: 1 };
  assert.deepEqual(
    missingInputs(demo, { files: { audio }, script: "Abra a aba.", textPalette: ["#fff000"] }),
    ["Vídeo da demonstração"],
  );
  // EdiAula's package of the lesson is also an audio source, and brings the screen with it.
  const lesson = { ...audio, kind: "lesson" as const, name: "Aula 3.zip" };
  assert.deepEqual(
    missingInputs(demo, { files: { audio: lesson }, script: "x", textPalette: ["#000000"] }),
    [],
  );
  const [audioInput, videoInput] = RECIPE_INPUTS["screen-demo"];
  if (!audioInput || !videoInput) throw new Error("inputs");
  assert.equal(fromLesson(videoInput, { audio: lesson }), true);
  assert.equal(fromLesson(videoInput, { audio }), false);
  assert.equal(fromLesson(audioInput, { audio: lesson }), false);
});

/** An editor and a main process that do nothing, for running steps; `editor` replaces parts. */
const stubDeps = (
  signal: AbortSignal,
  editor: Partial<PipelineEditor> = {},
  bridge: Partial<PipelineBridge> = {},
) => ({
  editor: {
    importStudioProject: () => ({
      summary: "",
      sceneArtboardId: "artboard-cena",
      imagePalette: [],
      boards: [],
    }),
    openNarration: async () => ({ clipId: "animation-x", fps: 30, frames: 1 }),
    activeArtboard: () => ({ id: "artboard-x", name: "Cena", width: 1440, height: 1080 }),
    designKit: () => ({ boards: [], palette: [] }),
    styleGuide: () => null,
    markLessonClip: () => undefined,
    lessonClips: () => [],
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
    addPresenterStage: () => ({
      slotId: "node-espaco",
      backgroundId: "node-fundo",
      lightId: "node-luz",
    }),
    addArtboards: () => [],
    embedFonts: async () => [],
    ...editor,
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
    pipelineGuideRead: async () => {
      throw new Error("sem guia");
    },
    pipelineGuideStyle: async () => null,
    pipelineGuideStyleSave: async () => undefined,
    onPipelineProgress: () => () => undefined,
    pipelineVideoFacts: async () => ({ width: 1920, height: 1080, duration: 10, clicks: null }),
    pipelinePresenter: async () => {
      throw new Error("sem apresentadora");
    },
    pipelineVideoPreview: async () => new Uint8Array(),
    pipelineVideoFrames: async () => [],
    pipelineLessonVideo: async () => {
      throw new Error("sem pacote");
    },
    ...bridge,
  },
  signal,
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
  const deps = (signal: AbortSignal) => stubDeps(signal);
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

test("while the assistant drafts, the step says what it is doing; a turn ended by an error fails", async () => {
  const recipe = BUILT_IN_RECIPES[0];
  const draft = stepsFor("game-scene").at(-1);
  if (!recipe || !draft) throw new Error("missing ready recipe");
  const inputs: RunInputs = {
    recipeId: recipe.id,
    files: {},
    script: "Oi.",
    textPalette: ["#ffffff"],
    fonts: DEFAULT_FONTS,
  };
  // What the earlier steps hand the draft: the narration's animation and the sentences.
  const narrated: PipelineStep = {
    id: "narration",
    label: "Narração",
    run: async (ctx) => {
      ctx.results.clip = { clipId: "animation-x", fps: 30, frames: 90 };
      ctx.results.piece = {
        start: 0,
        end: 3,
        coverage: 1,
        lines: [{ text: "Oi.", start: 0, end: 3 }],
      };
      ctx.results.lessonStart = 0;
    },
  };
  const draftWith = async (turn: Awaited<ReturnType<PipelineEditor["askAssistant"]>>) => {
    const states: StepState[] = [];
    const outcome = await runPipeline(
      recipe,
      inputs,
      [narrated, draft],
      stubDeps(new AbortController().signal, {
        askAssistant: async (_text, _shown, _images, onActivity) => {
          onActivity?.({
            text: "Escrevendo as alterações",
            detail: "13 KB",
            edits: 2,
            elapsed: 125_000,
          });
          return turn;
        },
      }),
      (id, state) => {
        if (id === draft.id) states.push(state);
      },
    );
    return { outcome, states };
  };

  const finished = await draftWith({ text: "", stopped: false, edits: 3 });
  assert.equal(finished.outcome.ok, true);
  // No percentage: how far the assistant is cannot be known, what it does and for how long can.
  assert.deepEqual(finished.states.slice(2, 4), [
    { status: "running", detail: "O assistente está animando" },
    {
      status: "running",
      detail: "Assistente: Escrevendo as alterações (13 KB) · 2 alterações · 2:05",
    },
  ]);

  const cut = await draftWith({
    text: "",
    stopped: false,
    edits: 4,
    error: "A IA demorou demais para responder.",
  });
  assert.equal(cut.outcome.ok, false);
  assert.deepEqual(cut.states.at(-1), {
    status: "failed",
    message:
      "A IA demorou demais para responder. As 4 alterações feitas até ali ficaram no projeto.",
  });
});

test("with a lesson package, the demonstration's video is the screen of the stretch, made from it", async () => {
  const demo = BUILT_IN_RECIPES[1];
  const steps = stepsFor("screen-demo");
  const video = steps.find((s) => s.id === "video");
  if (!demo || !video) throw new Error("missing ready recipe");
  const lesson = {
    token: "file-pacote-0001",
    name: "Aula 3.zip",
    kind: "lesson" as const,
    size: 9,
  };
  const made = {
    token: "file-tela-000001",
    name: "Tela da aula (2:15 a 2:25)",
    kind: "video" as const,
    size: 9,
  };
  const asked: unknown[] = [];
  const located: PipelineStep = {
    id: "find-piece",
    label: "Trecho",
    run: async (ctx) => {
      ctx.results.piece = { start: 135.98, end: 144.9, coverage: 1, lines: [] };
    },
  };
  const outcome = await runPipeline(
    demo,
    {
      recipeId: demo.id,
      files: { audio: lesson },
      script: "Abra a aba.",
      textPalette: ["#ffffff"],
      fonts: DEFAULT_FONTS,
    },
    [located, video],
    stubDeps(
      new AbortController().signal,
      {},
      {
        pipelineLessonVideo: async (token, from, to) => {
          asked.push(["lesson-video", token, from, Number(to.toFixed(2))]);
          return made;
        },
        pipelineVideoFacts: async (token) => {
          asked.push(["facts", token]);
          return { width: 1920, height: 1080, duration: 9.72, clicks: [{ t: 1, x: 10, y: 20 }] };
        },
        pipelineVideoPreview: async (token) => {
          asked.push(["preview", token]);
          return new Uint8Array();
        },
      },
    ),
    () => undefined,
  );
  assert.equal(outcome.ok, true);
  // From the first sentence to the breath after the last; then read as any picked video.
  assert.deepEqual(asked, [
    ["lesson-video", "file-pacote-0001", 135.98, 145.7],
    ["facts", "file-tela-000001"],
    ["preview", "file-tela-000001"],
  ]);
  assert.equal((outcome.results.video as { token: string }).token, "file-tela-000001");
  assert.match(outcome.report.join("\n"), /Demonstração 1920×1080: 1 clique gravado no trecho\./);
});

test("a run on a lesson package records on its artboard the stretch and phrases its animation is", async () => {
  const scene = BUILT_IN_RECIPES[0];
  const narration = stepsFor("game-scene").find((s) => s.id === "narration");
  if (!scene || !narration) throw new Error("missing ready recipe");
  const lesson = {
    token: "file-pacote-0001",
    name: "Aula 3.zip",
    kind: "lesson" as const,
    size: 9,
  };
  const located: PipelineStep = {
    id: "find-piece",
    label: "Trecho",
    run: async (ctx) => {
      ctx.results.piece = { start: 135.98, end: 144.9, coverage: 1, lines: [] };
    },
  };
  const marked: unknown[] = [];
  const inputs = {
    recipeId: scene.id,
    files: { audio: lesson },
    script: "Tá vendo?",
    textPalette: ["#ffffff"],
    fonts: DEFAULT_FONTS,
    lesson: { id: "pgte1jhfsnary", section: 5, phrases: ["Tá vendo?"] },
  };
  const deps = stubDeps(new AbortController().signal, {
    openNarration: async () => ({ clipId: "animation-cena", fps: 30, frames: 300 }),
    markLessonClip: (value) => marked.push(value),
  });
  const outcome = await runPipeline(scene, inputs, [located, narration], deps, () => undefined);
  assert.equal(outcome.ok, true);
  assert.deepEqual(marked, [
    {
      clipId: "animation-cena",
      kind: "game-scene",
      lessonId: "pgte1jhfsnary",
      section: 5,
      start: 135.98 - 0.4,
      end: 144.9 + 0.8,
      phrases: ["Tá vendo?"],
    },
  ]);
  // An audio file is no lesson: nothing to record.
  marked.length = 0;
  const file = { ...lesson, kind: "audio" as const, name: "aula.mp3" };
  await runPipeline(
    scene,
    { ...inputs, files: { audio: file } },
    [located, narration],
    deps,
    () => undefined,
  );
  assert.deepEqual(marked, []);
});

test("a duration reads as minutes and seconds", () => {
  assert.equal(clock(0), "0:00");
  assert.equal(clock(65.4), "1:05");
  assert.equal(clock(40 * 60), "40:00");
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

test("a recipe keeps its style guide picture; the assistant is told to follow the attached parts", () => {
  const recipe = BUILT_IN_RECIPES[0];
  if (!recipe) throw new Error("missing ready recipe");
  const guide = { id: `guide-${"a".repeat(32)}`, name: "style guide.png" };
  // Kept with the recipe and taken away again; a ready recipe without it is the original.
  let store = saveRecipe(emptyRecipeStore(), withGuide(recipe, guide));
  assert.deepEqual(listRecipes(store)[0]?.guideImage, guide);
  store = saveRecipe(store, withGuide(listRecipes(store)[0] ?? recipe, undefined));
  assert.deepEqual(store.recipes, []);
  assert.equal("guideImage" in withGuide(recipe, undefined), false);
  // Only ids of the profile's store, and a name.
  assert.throws(() =>
    saveRecipe(emptyRecipeStore(), { ...recipe, guideImage: { id: "x", name: "a" } }),
  );
  // A store of an older EdiSVG (no guide) still reads; one of a newer keeps the guide.
  assert.equal(
    parseRecipeStore({ version: 1, recipes: [recipe] }).recipes[0]?.guideImage,
    undefined,
  );
  const facts = {
    recipe: { name: "Cena animada do jogo", kind: "game-scene" as const, style: "" },
    artboard: { id: "artboard-cena", name: "Cena", width: 1440, height: 1080 },
    clip: { id: "animation-n", fps: 30, frames: 300 },
    lines: [{ text: "Olá.", from: 0, to: 30 }],
    images: [],
    textPalette: ["#ffffff"],
    fonts: null,
    imagePalette: [],
    lessonStart: 0,
  };
  const text = draftRequest({ ...facts, guideParts: 3 });
  assert.match(text, /## Guia de estilo da receita \(imagem anexada\)/);
  assert.match(
    text,
    /As 3 primeiras imagens anexadas são o guia de estilo, em partes de cima para baixo/,
  );
  assert.match(text, /discordarem .* vale o guia/);
  // The guide comes before the recipe's own words.
  assert.ok(text.indexOf("## Guia de estilo da receita") < text.indexOf("## O que a pessoa pediu"));
  assert.match(
    draftRequest({ ...facts, guideParts: 1 }),
    /A primeira imagem anexada é o guia de estilo/,
  );
  assert.doesNotMatch(draftRequest(facts), /Guia de estilo da receita/);
  // With a demonstration, its frames come after the guide's parts.
  const demo = draftRequest({
    ...facts,
    guideParts: 2,
    demo: {
      video: { name: "demo.mp4", width: 1280, height: 720 },
      clicks: null,
      elements: [],
      attached: [{ frame: 10, text: "Olá." }],
    },
  });
  assert.match(demo, /Quadros anexados \(depois do guia de estilo\), na ordem: quadro 10/);
});

test("with a design kit in the project, the assistant gets its pieces and colours, and how to change their texts", () => {
  const facts = {
    recipe: { name: "Cena animada do jogo", kind: "game-scene" as const, style: "" },
    artboard: { id: "artboard-cena", name: "Cena", width: 1440, height: 1080 },
    clip: { id: "animation-n", fps: 30, frames: 300 },
    lines: [{ text: "Olá.", from: 0, to: 30 }],
    images: [],
    textPalette: ["#ffffff"],
    fonts: null,
    imagePalette: [],
    lessonStart: 0,
  };
  const text = draftRequest({
    ...facts,
    kit: {
      boards: [
        { id: "artboard-dica", name: "Kit · baloes · balao-dica-amarelo", width: 420, height: 88 },
        { id: "artboard-zappy", name: "Kit · personagens · zappy-feliz", width: 512, height: 512 },
      ],
      palette: ["#fff3c4", "#1b5cf3"],
    },
  });
  assert.match(text, /## Kit de design do projeto/);
  assert.match(text, /- Kit · baloes · balao-dica-amarelo \[artboard-dica\] 420×88/);
  assert.match(text, /- Kit · personagens · zappy-feliz \[artboard-zappy\] 512×512/);
  assert.match(text, /Cores do kit: #fff3c4, #1b5cf3\./);
  assert.match(text, /substituições \(overrides\)\. Não edite as pranchetas do kit/);
  // No kit, no section.
  assert.doesNotMatch(draftRequest(facts), /Kit de design/);
  assert.doesNotMatch(
    draftRequest({ ...facts, kit: { boards: [], palette: [] } }),
    /Kit de design/,
  );
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

test("with a style guide, its colours and fonts drive the run; the recipe's only without one", async () => {
  const demo = BUILT_IN_RECIPES[1];
  assert.ok(demo);
  const guide = { id: `guide-${"b".repeat(32)}`, name: "style guide.png" };
  assert.deepEqual(
    stepsFor("screen-demo", true)
      .map((s) => s.id)
      .slice(0, 2),
    ["guide", "find-piece"],
  );
  assert.ok(!stepsFor("screen-demo").some((s) => s.id === "guide"));
  assert.equal(stepsFor("game-scene", true)[0]?.id, "guide");
  const asked: string[] = [];
  let palette: string[] = [];
  let questions = 0;
  const steps = stepsFor("screen-demo", true).filter((s) =>
    ["guide", "palettes", "fonts"].includes(s.id),
  );
  const run = (guided: boolean) =>
    runPipeline(
      demo,
      {
        recipeId: demo.id,
        files: {},
        script: "Uma frase.",
        textPalette: demo.textPalette,
        fonts: DEFAULT_FONTS,
        ...(guided ? { guideImage: guide } : {}),
      },
      steps,
      stubDeps(
        new AbortController().signal,
        {
          setPalette: (colors) => {
            palette = colors;
          },
          askAssistant: async () => {
            questions++;
            return { text: "", stopped: false, edits: 0 };
          },
          embedFonts: async (fonts) => fonts.map((f) => `asset-${f.weight}`),
        },
        {
          // Read by an earlier run: kept with the picture, nothing is asked.
          pipelineGuideStyle: async (id) =>
            id === guide.id
              ? {
                  textPalette: ["#ffffff", "#0f1a33", "#ffc02e"],
                  fonts: { title: "Bebas Neue", body: "Nunito" },
                }
              : null,
          pipelineFonts: async () => [
            { family: "Bebas Neue", group: "Títulos", weights: [400] },
            { family: "Baloo 2", group: "Infantil", weights: [400, 700] },
            { family: "Nunito", group: "Arredondada", weights: [400, 700] },
          ],
          pipelineFont: async (family, weight) => {
            asked.push(`${family} ${weight}`);
            return {
              family,
              weight,
              name: `${family} ${weight}`,
              bytes: new Uint8Array(1),
              notice: "",
            };
          },
        },
      ),
      () => undefined,
    );
  const guided = await run(true);
  assert.equal(guided.ok, true, guided.report.join(" "));
  assert.equal(questions, 0);
  assert.deepEqual(palette, ["#ffffff", "#0f1a33", "#ffc02e"]);
  assert.deepEqual(asked, ["Bebas Neue 400", "Nunito 400", "Nunito 700"]);
  assert.match(
    guided.report[0] ?? "",
    /Do guia de estilo: cores #ffffff, #0f1a33, #ffc02e; Bebas Neue nos títulos e Nunito no corpo\./,
  );
  // No guide: the recipe's colours and Baloo 2 + Nunito.
  asked.length = 0;
  assert.equal((await run(false)).ok, true);
  assert.deepEqual(palette, demo.textPalette);
  assert.deepEqual(asked, ["Baloo 2 700", "Nunito 400", "Nunito 700"]);
});

test("the guide is read as JSON only, from the fonts that come with EdiSVG", () => {
  const families = ["Baloo 2", "Nunito", "Bebas Neue"];
  const question = guideStyleRequest(4, families);
  assert.match(question, /As 4 imagens anexadas são um guia de estilo/);
  assert.match(question, /responda só com um JSON/);
  assert.match(question, /Baloo 2, Nunito, Bebas Neue/);
  assert.match(guideStyleRequest(1, families), /A imagem anexada é um guia de estilo/);
  // The JSON alone or in a code block; names in any case, colours in lower case.
  assert.deepEqual(
    parseGuideStyle(
      'Aqui está:\n```json\n{"textPalette": ["#FFFFFF", "#0F1A33", "#FFC02E"], "fonts": {"title": "baloo 2", "body": "Nunito"}}\n```',
      families,
    ),
    { textPalette: ["#ffffff", "#0f1a33", "#ffc02e"], fonts: { title: "Baloo 2", body: "Nunito" } },
  );
  assert.throws(() => parseGuideStyle("Não consegui ler.", families), /não devolveu as cores/);
  assert.throws(
    () =>
      parseGuideStyle(
        '{"textPalette": ["#ffffff", "#000000"], "fonts": {"title": "Inter", "body": "Nunito"}}',
        families,
      ),
    /A fonte dos títulos do guia \(Inter\) não vem com o EdiSVG/,
  );
  assert.throws(
    () =>
      parseGuideStyle(
        '{"textPalette": ["branco"], "fonts": {"title": "Nunito", "body": "Nunito"}}',
        families,
      ),
    /não são válidas/,
  );
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
        designKit: () => ({ boards: [], palette: [] }),
        styleGuide: () => null,
        markLessonClip: () => undefined,
        lessonClips: () => [],
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
        addPresenterStage: () => ({
          slotId: "node-espaco",
          backgroundId: "node-fundo",
          lightId: "node-luz",
        }),
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
        pipelineGuideRead: async () => {
          throw new Error("sem guia");
        },
        pipelineGuideStyle: async () => null,
        pipelineGuideStyleSave: async () => undefined,
        onPipelineProgress: () => () => undefined,
        pipelineVideoFacts: async () => ({ width: 1, height: 1, duration: 1, clicks: null }),
        pipelinePresenter: async () => {
          throw new Error("sem apresentadora");
        },
        pipelineVideoPreview: async () => new Uint8Array(),
        pipelineVideoFrames: async () => [],
        pipelineLessonVideo: async () => {
          throw new Error("sem pacote");
        },
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
  assert.equal(asked.at(-1), "A fonte Comic Sans não vem com o EdiSVG.");
});

test("a theory lesson hears her video, sets her stage at each shot and keeps it free in the draft", async () => {
  const recipe = BUILT_IN_RECIPES.find((r) => r.kind === "presenter-talk");
  if (!recipe) throw new Error("missing ready recipe");
  assert.deepEqual(
    stepsFor("presenter-talk").map((s) => s.id),
    ["find-piece", "presenter", "narration", "framing", "palettes", "fonts", "draft"],
  );
  const video = { token: "file-prof-000001", name: "prof.mp4", kind: "video" as const, size: 9 };
  // Only the video is asked: it is the narration too.
  assert.deepEqual(missingInputs(recipe, { files: {}, script: "Oi.", textPalette: ["#000000"] }), [
    "Vídeo da apresentadora (MP4 com a voz dela, fundo verde)",
  ]);
  assert.deepEqual(
    missingInputs(recipe, { files: { video }, script: "Oi.", textPalette: ["#000000"] }),
    [],
  );
  const word = (text: string, start: number) => ({ text, start, end: start + 0.4 });
  const words = [
    word("Hoje", 10),
    word("vamos", 10.5),
    word("falar", 11),
    word("de", 11.5),
    word("energia.", 12),
    word("Ela", 20),
    word("muda", 20.5),
    word("de", 21),
    word("forma.", 21.5),
  ];
  const asked: unknown[] = [];
  const requests: string[] = [];
  let stage: Parameters<PipelineEditor["addPresenterStage"]>[0] | undefined;
  let reference: Parameters<PipelineEditor["setReferenceVideo"]>[0] | undefined;
  const outcome = await runPipeline(
    recipe,
    {
      recipeId: recipe.id,
      files: { video },
      script: "Hoje vamos falar de energia. [ela sorri] Ela muda de forma.",
      textPalette: recipe.textPalette,
      fonts: DEFAULT_FONTS,
    },
    stepsFor("presenter-talk").filter((s) => s.id !== "fonts"),
    stubDeps(
      new AbortController().signal,
      {
        openNarration: async (value) => {
          asked.push(["narration", Number(value.duration.toFixed(2)), value.lessonStart]);
          return { clipId: "animation-aula", fps: 30, frames: Math.ceil(value.duration * 30) };
        },
        activeArtboard: () => ({ id: "artboard-d", name: "Aula", width: 1920, height: 1080 }),
        askAssistant: async (text) => {
          requests.push(text);
          return requests.length === 1
            ? { text: '{"posicoes": ["close-right", "medium-left"]}', stopped: false, edits: 0 }
            : { text: "1. título; 2. diagrama", stopped: false, edits: 5 };
        },
        addPresenterStage: (value) => {
          stage = value;
          return { slotId: "node-espaco", backgroundId: "node-fundo", lightId: "node-luz" };
        },
        setReferenceVideo: (value) => {
          reference = value;
        },
      },
      {
        pipelineWords: async (token, kind) => {
          asked.push(["words", token, kind]);
          return words;
        },
        pipelineNarration: async (token, kind, start, end) => {
          asked.push(["cut", token, kind, start, Number(end.toFixed(2))]);
          return new Uint8Array([1]);
        },
        // Standing, recorded in portrait, as in the approved lesson.
        pipelineVideoFacts: async () => ({
          width: 1080,
          height: 1920,
          duration: 22.5,
          clicks: null,
        }),
        pipelinePresenter: async (token, from, seconds) => {
          asked.push(["presenter", token, from, Number(seconds.toFixed(2))]);
          return {
            screen: "#14b43c",
            person: { left: 0.2, top: 0.05, right: 0.8, bottom: 1 },
            preview: new Uint8Array([7]),
          };
        },
      },
    ),
    () => undefined,
  );
  assert.equal(outcome.ok, true, outcome.report.join("\n"));
  // Her video is heard and cut; the stretch ends where the video does (22.5 s).
  assert.deepEqual(asked, [
    ["words", "file-prof-000001", "video"],
    ["presenter", "file-prof-000001", 9.6, 12.9],
    ["cut", "file-prof-000001", "video", 9.6, 22.5],
    ["narration", 12.9, 9.6],
  ]);
  // Two shots, cut at frame 0 and halfway through the pause (12.4–20 s: frames 84–312): her spot
  // and the light behind her where the approved lesson had them; the background in the ink.
  assert.ok(stage);
  const keys = (list: { frame: number; x: number; y: number; scale: number }[]) =>
    list.map((k) => [k.frame, Math.round(k.x * 10) / 10, Math.round(k.y * 10) / 10, k.scale]);
  assert.deepEqual(
    [stage.clipId, stage.width, stage.height, stage.background],
    ["animation-aula", 1920, 1080, "#101b35"],
  );
  assert.deepEqual([stage.slot.width, stage.slot.height], [607.5, 1080]);
  assert.deepEqual(keys(stage.slot.keys), [
    [0, 801.4, 0, 2.3],
    [198, -106.7, 0, 1.8],
  ]);
  assert.deepEqual(
    [stage.light.color, stage.light.radius, keys(stage.light.keys)],
    [
      "#ffc23c",
      520,
      [
        [0, 1506, 520, 1.5],
        [198, 446, 560, 1.2],
      ],
    ],
  );
  assert.deepEqual(
    stage.guides.map((g) => `${g.axis} ${g.position}`),
    ["x 84", "x 960", "x 1836", "y 92", "y 1008"],
  );
  assert.deepEqual(reference, {
    bytes: new Uint8Array([7]),
    offset: 0,
    duration: 12.9,
    slotId: "node-espaco",
    mediaType: "video/webm",
  });
  const framing = requests[0] ?? "";
  assert.ok(framing.includes('"close-right" (Médio curto à direita)'), framing);
  assert.ok(framing.includes("nada de plano inteiro, americano ou dela no centro"));
  assert.ok(framing.includes('1. 0.4–2.8 s: "Hoje vamos falar de energia."'));
  const draft = requests[1] ?? "";
  for (const said of [
    '[node-espaco] "Apresentadora (espaço)" (travado), [node-fundo] "Fundo"',
    '[node-luz] "Fundo · luz atrás da apresentadora"',
    "Corte 1, quadros 0–198, frases 1: Médio curto à direita. Conteúdo em x 84–960, centralizado em x 522; na altura, entre y 92 e 1008, centralizado em y 550.",
    "Corte 2, quadros 198–387, frases 2: Médio à esquerda. Conteúdo em x 960–1836, centralizado em x 1398",
    'stroke explícito: "none"',
    "Listas de no máximo 3 itens",
  ])
    assert.ok(draft.includes(said), said);
  assert.doesNotMatch(draft, /## Imagens do projeto/);
  const report = outcome.report.join("\n");
  assert.match(report, /fundo #14b43c: ela ocupa de 20% a 80% da largura/);
  assert.ok(
    report.includes("0:09.6–0:16.2 do vídeo: Médio curto à direita (x 0.781, y 1.15, escala 2.3)"),
    report,
  );
  assert.ok(
    report.includes("0:16.2–0:22.5 do vídeo: Médio à esquerda (x 0.229, y 0.9, escala 1.8)"),
  );
  assert.doesNotMatch(report, /Atenção/);
});

test("a presenter far from the middle of her video is said to reach the content's column", async () => {
  const recipe = BUILT_IN_RECIPES.find((r) => r.kind === "presenter-talk");
  const framing = stepsFor("presenter-talk").find((s) => s.id === "framing");
  if (!recipe || !framing) throw new Error("missing");
  const outcome = await runPipeline(
    recipe,
    {
      recipeId: recipe.id,
      files: {},
      script: "Oi.",
      textPalette: recipe.textPalette,
      fonts: DEFAULT_FONTS,
    },
    [
      {
        id: "setup",
        label: "",
        run: async (ctx) => {
          ctx.results.piece = {
            start: 1,
            end: 9,
            coverage: 1,
            lines: [{ text: "Oi.", start: 1, end: 9 }],
          };
          ctx.results.clip = { clipId: "animation-a", fps: 30, frames: 270 };
          // She stands at the left edge of a landscape video.
          ctx.results.presenter = {
            name: "v.mp4",
            video: { width: 1920, height: 1080 },
            person: { left: 0, top: 0, right: 0.3, bottom: 1 },
            start: 0.6,
            end: 9.6,
            preview: new Uint8Array(),
            board: { id: "artboard-a", name: "A", width: 1920, height: 1080 },
          };
        },
      },
      framing,
    ],
    stubDeps(new AbortController().signal, {
      askAssistant: async () => ({
        text: '{"posicoes": ["medium-right"]}',
        stopped: false,
        edits: 0,
      }),
    }),
    () => undefined,
  );
  assert.equal(outcome.ok, true);
  assert.match(
    outcome.report.join("\n"),
    /Atenção: no plano Médio à direita, ela chega a x \d+, dentro da coluna do conteúdo \(84–960\)\./,
  );
});
