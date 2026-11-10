import { findScriptPiece, type HeardWord, type ScriptPiece } from "@informach/edi-speech/piece";
import type { LessonClip } from "../../../shared/lessonClips";
import {
  type BundledFamily,
  type BundledFont,
  nearestWeight,
  type PickedFile,
  type Recipe,
  type RecipeKind,
  type RunInputs,
  spokenScript,
} from "../../../shared/pipelines";
import { elementSvgs } from "./elements";
import { type DraftBoard, type DraftFonts, type DraftKit, draftRequest } from "./prompt";

/**
 * Runs a recipe: its steps in order, each reporting progress, all stopped by Cancelar. A step that
 * fails stops the run and says why; what earlier steps did stays (the editor undoes it). Steps
 * hand their results to the next ones through `results`.
 */

/** What the assistant is doing during a pipeline's request (the assistant panel tells it). */
export interface AssistantActivity {
  /** In words: "Pensando", "Escrevendo as alterações"… */
  text: string;
  /** How much of it so far ("13 KB"), or empty. */
  detail: string;
  /** Edits applied to the project so far. */
  edits: number;
  /** Milliseconds since the request was sent. */
  elapsed: number;
}

/** The draft step's line while the assistant works: what it is doing, its edits and the time. */
export function assistantLine(activity: AssistantActivity): string {
  const doing = activity.text
    ? `${activity.text}${activity.detail ? ` (${activity.detail})` : ""}`
    : "Trabalhando";
  const made = activity.edits
    ? ` · ${activity.edits} ${activity.edits === 1 ? "alteração" : "alterações"}`
    : "";
  return `Assistente: ${doing}${made} · ${clock(activity.elapsed / 1000)}`;
}

/** What the editor offers the steps (app.js builds it). */
export interface PipelineEditor {
  /** Imports a studio project into the open file (one edit); returns what came in. */
  importStudioProject(source: string): {
    summary: string;
    sceneArtboardId: string | null;
    imagePalette: string[];
    boards: DraftBoard[];
  };
  /** The artboard open in the editor. */
  activeArtboard(): DraftBoard;
  /**
   * The design kit of the project (Arquivo › Importar kit de design): its "Kit · …" artboards and
   * its colours. Empty when no kit was imported.
   */
  designKit(): DraftKit;
  /** Records on the open artboard the lesson stretch an animation of a run is (lessonClips.ts). */
  markLessonClip(value: LessonClip): void;
  /** The lesson stretches recorded in the project whose animation is still there. */
  lessonClips(): LessonClip[];
  /** Sets the palette of the open artboard (the colour picker offers it). */
  setPalette(colors: string[]): void;
  /**
   * Asks the assistant in a new conversation (with frames to look at); resolves when it ends,
   * with the error that ended it, if any. `onActivity` hears what it is doing about every second.
   */
  askAssistant(
    text: string,
    shown: string,
    images?: { mediaType: string; data: string }[],
    onActivity?: (activity: AssistantActivity) => void,
  ): Promise<{ text: string; stopped: boolean; edits: number; error?: string }>;
  /** A new artboard of this size, opened (the transparent layer of a demonstration). */
  openDemoArtboard(value: { name: string; width: number; height: number }): DraftBoard;
  /** The demonstration video under the open artboard, from `offset` seconds of the animation. */
  setReferenceVideo(value: { bytes: Uint8Array; offset: number; duration: number }): void;
  /**
   * Artboards from SVG (the ready elements), keeping the open one open; their texts take the font
   * `fontAssetId` when given.
   */
  addArtboards(items: { name: string; svg: string }[], fontAssetId?: string): DraftBoard[];
  /**
   * Embeds fonts of the bundle in the project (their license notice with them); returns the asset
   * of each, in order. A font already in the project is not added twice.
   */
  embedFonts(fonts: BundledFont[]): Promise<string[]>;
  /** Stops the assistant's reply (Cancelar). */
  stopAssistant(): void;
  /** The assistant is writing a reply (a run then waits: it would edit the file meanwhile). */
  assistantBusy(): boolean;
  /** A run starts: every edit until endRun becomes one undo step. */
  beginRun(): void;
  endRun(): void;
  /**
   * Opens an animation as long as the narration (in the open artboard) and plays the narration
   * with it in the preview; returns the animation.
   */
  openNarration(value: {
    name: string;
    bytes: Uint8Array;
    duration: number;
    lessonStart: number;
    lines: { text: string; start: number; end: number }[];
  }): Promise<{ clipId: string; fps: number; frames: number }>;
}

/** What the main process offers the steps (preload). */
export interface VideoFacts {
  width: number;
  height: number;
  duration: number;
  clicks: { t: number; x: number; y: number }[] | null;
}

export interface PipelineBridge {
  pipelineReadProject(token: string): Promise<string>;
  pipelineFonts(): Promise<BundledFamily[]>;
  pipelineFont(family: string, weight: number): Promise<BundledFont>;
  pipelineVideoFacts(token: string): Promise<VideoFacts>;
  pipelineVideoPreview(token: string, seconds: number, jobId: string): Promise<Uint8Array>;
  pipelineVideoFrames(
    token: string,
    times: number[],
    jobId: string,
  ): Promise<{ mediaType: "image/jpeg"; data: string }[]>;
  /**
   * The screen of [from, to) of a lesson package as a video of its own (the timeline's cuts, the
   * clicks beside it), handed back as a picked video.
   */
  pipelineLessonVideo(token: string, from: number, to: number, jobId: string): Promise<PickedFile>;
  pipelineWords(token: string, kind: string, jobId: string): Promise<HeardWord[]>;
  pipelineNarration(
    token: string,
    kind: string,
    start: number,
    end: number,
    jobId: string,
  ): Promise<Uint8Array>;
  pipelineCancel(jobId: string): Promise<void>;
  onPipelineProgress(callback: (event: { jobId: string; ratio: number }) => void): () => void;
}

export interface StepContext {
  recipe: Recipe;
  inputs: RunInputs;
  editor: PipelineEditor;
  bridge: PipelineBridge;
  signal: AbortSignal;
  /** 0..1 of this step, with an optional detail ("Transcrevendo 40%"). */
  progress(ratio: number, detail?: string): void;
  /** What the step is doing when it cannot say how far it is (the assistant's draft). */
  status(detail: string): void;
  /** Results of earlier steps, by name. */
  results: Record<string, unknown>;
  /** Lines of the final report. */
  report: string[];
}

export interface PipelineStep {
  id: string;
  label: string;
  run(ctx: StepContext): Promise<void>;
}

export type StepState =
  | { status: "waiting" }
  /** Without `ratio` when the step cannot say how far it is. */
  | { status: "running"; ratio?: number; detail?: string }
  | { status: "done" }
  | { status: "failed"; message: string }
  | { status: "cancelled" };

const importProject: PipelineStep = {
  id: "import-project",
  label: "Importar o projeto do Estúdio",
  async run(ctx) {
    const file = ctx.inputs.files.project;
    if (!file) throw new Error("Escolha o projeto do Estúdio.");
    ctx.progress(0.1, "Lendo o projeto");
    const source = await ctx.bridge.pipelineReadProject(file.token);
    ctx.signal.throwIfAborted();
    ctx.progress(0.5, "Montando as pranchetas");
    const result = ctx.editor.importStudioProject(source);
    // Without the game's stage there is no Cena to animate: the draft would go into an image.
    if (!result.sceneArtboardId)
      throw new Error(
        "O projeto não tem a cena do jogo 2D (o palco): as imagens foram importadas, mas não há Cena para animar.",
      );
    ctx.results.sceneArtboardId = result.sceneArtboardId;
    ctx.results.imagePalette = result.imagePalette;
    ctx.results.images = result.boards;
    ctx.report.push(result.summary);
  },
};

/**
 * Runs a main-process job of a step: Cancelar stops it there (the transcription, FFmpeg), and
 * what comes back after Cancelar is not used.
 */
async function job<T>(ctx: StepContext, run: (jobId: string) => Promise<T>): Promise<T> {
  ctx.signal.throwIfAborted();
  const jobId = `pipeline-${crypto.randomUUID()}`;
  const cancel = () => void ctx.bridge.pipelineCancel(jobId);
  ctx.signal.addEventListener("abort", cancel, { once: true });
  try {
    return await run(jobId);
  } finally {
    ctx.signal.removeEventListener("abort", cancel);
    ctx.signal.throwIfAborted();
  }
}

/** Seconds as minutes and seconds ("6:05"). */
export const clock = (s: number) =>
  `${Math.floor(s / 60)}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;

/**
 * The script's stretch in the lesson audio: the words of the audio (a lesson's transcripts, or the
 * file transcribed now), then the sentences of the script among them. A sentence that is not heard
 * stops the run, naming it.
 */
const findPiece: PipelineStep = {
  id: "find-piece",
  label: "Ouvir a aula e achar o trecho do roteiro",
  async run(ctx) {
    const audio = ctx.inputs.files.audio;
    if (!audio) throw new Error("Escolha o áudio da aula.");
    const lesson = audio.kind === "lesson";
    ctx.progress(0, lesson ? "Abrindo o pacote da aula" : "Transcrevendo o áudio");
    const words: HeardWord[] = await job(ctx, async (jobId) => {
      // A package without transcripts has its narration transcribed now.
      const stop = ctx.bridge.onPipelineProgress((event) => {
        if (event.jobId === jobId)
          ctx.progress(
            event.ratio * 0.9,
            lesson ? "Transcrevendo a narração da aula" : "Transcrevendo o áudio",
          );
      });
      try {
        return await ctx.bridge.pipelineWords(audio.token, audio.kind, jobId);
      } finally {
        stop();
      }
    });
    ctx.progress(0.95, "Procurando o roteiro");
    const spoken = spokenScript(ctx.inputs.script);
    if (!spoken) throw new Error("O roteiro só tem texto entre colchetes: nada para ouvir.");
    const piece: ScriptPiece = findScriptPiece(words, spoken);
    ctx.results.piece = piece;
    ctx.report.push(
      `Trecho achado na aula de ${clock(piece.start)} a ${clock(piece.end)}, com ${piece.lines.length} ${piece.lines.length === 1 ? "frase" : "frases"}.`,
    );
  },
};

/** Breath kept before the first sentence and after the last one. */
const LEAD = 0.4;
const TAIL = 0.8;

/** The narration of the stretch, cut from the audio, and an animation as long as it. */
const prepareNarration: PipelineStep = {
  id: "narration",
  label: "Preparar a narração na prévia",
  async run(ctx) {
    const audio = ctx.inputs.files.audio;
    const piece = ctx.results.piece as ScriptPiece | undefined;
    if (!audio || !piece) throw new Error("O trecho do roteiro não foi achado.");
    const start = Math.max(0, piece.start - LEAD);
    const end = piece.end + TAIL;
    ctx.progress(0.2, "Cortando o áudio do trecho");
    const bytes = await job(ctx, (jobId) =>
      ctx.bridge.pipelineNarration(audio.token, audio.kind, start, end, jobId),
    );
    ctx.progress(0.7, "Criando a animação");
    const clip = await ctx.editor.openNarration({
      name: ctx.recipe.name,
      bytes,
      duration: end - start,
      lessonStart: start,
      lines: piece.lines.map((l) => ({ text: l.text, start: l.start - start, end: l.end - start })),
    });
    ctx.results.clip = clip;
    ctx.results.lessonStart = start;
    // The stretch of the lesson this animation is, on the artboard it is made in: the next run
    // sees these phrases done, and the animation goes back to the lesson at these seconds.
    const lesson = ctx.inputs.lesson;
    if (lesson && audio.kind === "lesson")
      ctx.editor.markLessonClip({
        clipId: clip.clipId,
        kind: ctx.recipe.kind,
        lessonId: lesson.id,
        section: lesson.section,
        start,
        end,
        phrases: lesson.phrases,
      });
  },
};

/** The demonstration's state for the next steps. */
interface DemoVideo {
  /** The video the frames come from: the one picked, or the screen made from the package. */
  token: string;
  name: string;
  facts: VideoFacts;
  /** Animation second the video starts at (the breath before the first sentence). */
  offset: number;
  /** Seconds of video in the stretch. */
  duration: number;
}

/**
 * The screen demonstration: an artboard of the video's size (the transparent layer), the video
 * under it in the preview from the moment the stretch starts, and the clicks saved with it. With a
 * lesson package the video is the screen of the stretch, made from the package's recordings with
 * the cuts of the lesson; a picked video starts where the stretch does.
 */
const prepareVideo: PipelineStep = {
  id: "video",
  label: "Preparar o vídeo da demonstração",
  async run(ctx) {
    const audio = ctx.inputs.files.audio;
    const piece = ctx.results.piece as ScriptPiece | undefined;
    if (!piece) throw new Error("O trecho do roteiro não foi achado.");
    let file = ctx.inputs.files.video;
    if (audio?.kind === "lesson") {
      ctx.progress(0.05, "Montando a tela do trecho com os cortes da aula");
      file = await job(ctx, (jobId) =>
        ctx.bridge.pipelineLessonVideo(audio.token, piece.start, piece.end + TAIL, jobId),
      );
    }
    if (!file) throw new Error("Escolha o vídeo da demonstração.");
    ctx.progress(0.1, "Lendo o vídeo");
    const facts = await ctx.bridge.pipelineVideoFacts(file.token);
    const offset = piece.start - Math.max(0, piece.start - LEAD);
    const wanted = piece.end + TAIL - piece.start;
    const duration = Math.min(wanted, facts.duration || wanted);
    if (duration < 0.5) throw new Error("O vídeo é curto demais para o trecho.");
    ctx.signal.throwIfAborted();
    ctx.editor.openDemoArtboard({
      name: `Demonstração · ${file.name}`.slice(0, 120),
      width: facts.width,
      height: facts.height,
    });
    ctx.progress(0.4, "Preparando a prévia do vídeo");
    const bytes = await job(ctx, (jobId) =>
      ctx.bridge.pipelineVideoPreview(file.token, duration, jobId),
    );
    ctx.editor.setReferenceVideo({ bytes, offset, duration });
    const video: DemoVideo = { token: file.token, name: file.name, facts, offset, duration };
    ctx.results.video = video;
    const clicks = facts.clicks?.filter((c) => c.t <= duration).length ?? 0;
    ctx.report.push(
      `Demonstração ${facts.width}×${facts.height}: ${
        facts.clicks === null
          ? "sem cursor salvo; o assistente olha os quadros do vídeo"
          : `${clicks} ${clicks === 1 ? "clique gravado" : "cliques gravados"} no trecho`
      }.`,
    );
    if (wanted > (facts.duration || wanted) + 0.5)
      ctx.report.push("O vídeo acaba antes da narração do trecho.");
  },
};

/**
 * The fonts of the run in the project: the title's (bold) and the body's (regular, and bold for
 * emphasis), each the nearest weight the family has. They go in as fonts of the project, so the
 * animation looks the same on any computer and in every export.
 */
const embedFonts: PipelineStep = {
  id: "fonts",
  label: "Incorporar as fontes de título e corpo",
  async run(ctx) {
    ctx.progress(0.1, "Lendo as fontes");
    const families = await ctx.bridge.pipelineFonts();
    const weightsOf = (family: string) => {
      const found = families.find((item) => item.family === family);
      if (!found) throw new Error(`A fonte ${family} não vem com o EdiSVG: escolha outra.`);
      return found.weights;
    };
    const { title, body } = ctx.inputs.fonts;
    const wanted = [
      { family: title, weight: nearestWeight(weightsOf(title), 700) },
      { family: body, weight: nearestWeight(weightsOf(body), 400) },
      { family: body, weight: nearestWeight(weightsOf(body), 700) },
    ];
    const files: BundledFont[] = [];
    for (const font of wanted) {
      ctx.signal.throwIfAborted();
      files.push(await ctx.bridge.pipelineFont(font.family, font.weight));
    }
    ctx.signal.throwIfAborted();
    ctx.progress(0.6, "Incorporando ao projeto");
    const [titleId, bodyId, boldId] = await ctx.editor.embedFonts(files);
    if (!titleId || !bodyId || !boldId) throw new Error("As fontes não entraram no projeto.");
    const fonts: DraftFonts = {
      title: { family: title, weight: files[0]?.weight ?? 700, assetId: titleId },
      body: { family: body, weight: files[1]?.weight ?? 400, assetId: bodyId },
      bodyBold: { family: body, weight: files[2]?.weight ?? 700, assetId: boldId },
    };
    ctx.results.fonts = fonts;
    ctx.report.push(
      title === body
        ? `Fonte ${title} nos títulos e no corpo, incorporada ao projeto.`
        : `Fontes ${title} nos títulos e ${body} no corpo, incorporadas ao projeto.`,
    );
  },
};

/** The ready arrow, balloon, highlight and click mark, in the run's text palette and body font. */
const addElements: PipelineStep = {
  id: "elements",
  label: "Criar os elementos prontos (seta, balão, destaque e clique)",
  async run(ctx) {
    const fonts = ctx.results.fonts as DraftFonts | undefined;
    ctx.results.elements = ctx.editor.addArtboards(
      elementSvgs(ctx.inputs.textPalette),
      fonts?.bodyBold.assetId,
    );
  },
};

/** The palette of the open artboard: the text colours first, then the images' (no repeats). */
const applyPalettes: PipelineStep = {
  id: "palettes",
  label: "Aplicar as paletas de texto e das imagens",
  async run(ctx) {
    const images = (ctx.results.imagePalette as string[] | undefined) ?? [];
    const colors = [
      ...new Set([...ctx.inputs.textPalette, ...images].map((c) => c.toLowerCase())),
    ].slice(0, 64);
    ctx.editor.setPalette(colors);
    ctx.results.palette = colors;
  },
};

/** The draft: the assistant animates the scene, each action in the time of its sentence. */
const draftWithAssistant: PipelineStep = {
  id: "draft",
  label: "Pedir o rascunho da animação ao assistente",
  async run(ctx) {
    const clip = ctx.results.clip as { clipId: string; fps: number; frames: number } | undefined;
    const piece = ctx.results.piece as ScriptPiece | undefined;
    const lessonStart = ctx.results.lessonStart as number | undefined;
    if (!clip || !piece || lessonStart === undefined)
      throw new Error("A narração não foi preparada.");
    const frame = (seconds: number) =>
      Math.max(0, Math.min(clip.frames, Math.round((seconds - lessonStart) * clip.fps)));
    const video = ctx.results.video as DemoVideo | undefined;
    let images: { mediaType: string; data: string }[] = [];
    let demo: Parameters<typeof draftRequest>[0]["demo"];
    if (video) {
      // Up to four frames, a moment into the first sentences, for the assistant to look at.
      const pickedLines = piece.lines.slice(0, 4);
      const times = pickedLines.map((l) =>
        Math.max(0, Math.min(video.duration - 0.1, l.start - piece.start + 0.3)),
      );
      if (times.length) {
        ctx.progress(0.02, "Tirando quadros do vídeo");
        images = await job(ctx, (jobId) =>
          ctx.bridge.pipelineVideoFrames(video.token, times, jobId),
        );
      }
      demo = {
        video: { name: video.name, width: video.facts.width, height: video.facts.height },
        clicks:
          video.facts.clicks
            ?.filter((c) => c.t <= video.duration)
            .map((c) => ({ frame: Math.round((c.t + video.offset) * clip.fps), x: c.x, y: c.y })) ??
          null,
        elements: (ctx.results.elements as DraftBoard[] | undefined) ?? [],
        attached: pickedLines.map((l, i) => ({
          frame: Math.round(((times[i] ?? 0) + video.offset) * clip.fps),
          text: l.text,
        })),
      };
    }
    const request = draftRequest({
      recipe: ctx.recipe,
      artboard: ctx.editor.activeArtboard(),
      clip: { id: clip.clipId, fps: clip.fps, frames: clip.frames },
      lines: piece.lines.map((l) => ({ text: l.text, from: frame(l.start), to: frame(l.end) })),
      images: (ctx.results.images as DraftBoard[] | undefined) ?? [],
      textPalette: ctx.inputs.textPalette,
      fonts: (ctx.results.fonts as DraftFonts | undefined) ?? null,
      imagePalette: (ctx.results.imagePalette as string[] | undefined) ?? [],
      kit: ctx.editor.designKit(),
      lessonStart,
      ...(demo ? { demo } : {}),
    });
    // Cancelar while the frames were taken: the assistant is never asked.
    ctx.signal.throwIfAborted();
    const stop = () => ctx.editor.stopAssistant();
    ctx.signal.addEventListener("abort", stop, { once: true });
    try {
      // How far the assistant is cannot be known: the line says what it is doing and for how long.
      ctx.status("O assistente está animando");
      const turn = await ctx.editor.askAssistant(
        request,
        `Pipeline "${ctx.recipe.name}": montar o rascunho da animação (${piece.lines.length} ${piece.lines.length === 1 ? "frase" : "frases"}, tempos e imagens enviados).`,
        images,
        (activity) => ctx.status(assistantLine(activity)),
      );
      ctx.signal.throwIfAborted();
      if (turn.stopped) throw new Error("O assistente foi interrompido antes de terminar.");
      // Ended by a time limit or a failing client: what it did so far is not a finished draft.
      if (turn.error)
        throw new Error(
          turn.edits
            ? `${turn.error} As ${turn.edits === 1 ? "1 alteração feita" : `${turn.edits} alterações feitas`} até ali ficaram no projeto.`
            : turn.error,
        );
      if (!turn.edits)
        throw new Error(
          `O assistente não alterou o projeto${turn.text.trim() ? `: ${turn.text.trim().slice(0, 300)}` : "."} Veja o painel Assistente.`,
        );
      ctx.report.push(
        `O assistente fez ${turn.edits} ${turn.edits === 1 ? "alteração" : "alterações"} no rascunho.`,
      );
      if (turn.text.trim()) ctx.report.push(turn.text.trim().slice(0, 2000));
    } finally {
      ctx.signal.removeEventListener("abort", stop);
    }
  },
};

/** The steps of each kind of recipe, in order. */
export function stepsFor(kind: RecipeKind): PipelineStep[] {
  if (kind === "game-scene")
    return [
      importProject,
      findPiece,
      prepareNarration,
      applyPalettes,
      embedFonts,
      draftWithAssistant,
    ];
  return [
    findPiece,
    prepareVideo,
    prepareNarration,
    applyPalettes,
    embedFonts,
    addElements,
    draftWithAssistant,
  ];
}

/** What failed, in the person's words: without Electron's "Error invoking remote method" wrapper. */
export function failureText(error: unknown): string {
  const text = error instanceof Error ? error.message : "A etapa falhou.";
  return (
    text.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, "") || "A etapa falhou."
  );
}

export interface RunOutcome {
  ok: boolean;
  report: string[];
  results: Record<string, unknown>;
}

export async function runPipeline(
  recipe: Recipe,
  inputs: RunInputs,
  steps: readonly PipelineStep[],
  deps: { editor: PipelineEditor; bridge: PipelineBridge; signal: AbortSignal },
  onState: (stepId: string, state: StepState) => void,
): Promise<RunOutcome> {
  const results: Record<string, unknown> = {};
  const report: string[] = [];
  for (const step of steps) onState(step.id, { status: "waiting" });
  for (const [index, step] of steps.entries()) {
    if (deps.signal.aborted) {
      for (const rest of steps.slice(index)) onState(rest.id, { status: "cancelled" });
      return { ok: false, report, results };
    }
    onState(step.id, { status: "running", ratio: 0 });
    try {
      await step.run({
        recipe,
        inputs,
        editor: deps.editor,
        bridge: deps.bridge,
        signal: deps.signal,
        results,
        report,
        progress: (ratio, detail) =>
          onState(step.id, {
            status: "running",
            ratio: Math.max(0, Math.min(1, ratio)),
            ...(detail ? { detail } : {}),
          }),
        status: (detail) => onState(step.id, { status: "running", detail }),
      });
      onState(step.id, { status: "done" });
    } catch (error) {
      const cancelled = deps.signal.aborted;
      onState(
        step.id,
        cancelled ? { status: "cancelled" } : { status: "failed", message: failureText(error) },
      );
      for (const rest of steps.slice(index + 1)) onState(rest.id, { status: "cancelled" });
      return { ok: false, report, results };
    }
  }
  return { ok: true, report, results };
}
