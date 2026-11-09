import { findScriptPiece, type HeardWord, type ScriptPiece } from "@informach/edi-speech/piece";
import type { Recipe, RecipeKind, RunInputs } from "../../../shared/pipelines";
import { elementSvgs } from "./elements";
import { type DraftBoard, draftRequest } from "./prompt";

/**
 * Runs a recipe: its steps in order, each reporting progress, all stopped by Cancelar. A step that
 * fails stops the run and says why; what earlier steps did stays (the editor undoes it). Steps
 * hand their results to the next ones through `results`.
 */

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
  /** Sets the palette of the open artboard (the colour picker offers it). */
  setPalette(colors: string[]): void;
  /** Asks the assistant in a new conversation (with frames to look at); resolves when it ends. */
  askAssistant(
    text: string,
    shown: string,
    images?: { mediaType: string; data: string }[],
  ): Promise<{ text: string; stopped: boolean; edits: number }>;
  /** A new artboard of this size, opened (the transparent layer of a demonstration). */
  openDemoArtboard(value: { name: string; width: number; height: number }): DraftBoard;
  /** The demonstration video under the open artboard, from `offset` seconds of the animation. */
  setReferenceVideo(value: { bytes: Uint8Array; offset: number; duration: number }): void;
  /** Artboards from SVG (the ready elements), keeping the open one open. */
  addArtboards(items: { name: string; svg: string }[]): DraftBoard[];
  /** Stops the assistant's reply (Cancelar). */
  stopAssistant(): void;
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
  pipelineVideoFacts(token: string): Promise<VideoFacts>;
  pipelineVideoPreview(token: string, seconds: number): Promise<Uint8Array>;
  pipelineVideoFrames(
    token: string,
    times: number[],
  ): Promise<{ mediaType: "image/jpeg"; data: string }[]>;
  pipelineWords(token: string, kind: string, jobId: string): Promise<HeardWord[]>;
  pipelineNarration(token: string, kind: string, start: number, end: number): Promise<Uint8Array>;
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
  | { status: "running"; ratio: number; detail?: string }
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
    ctx.results.sceneArtboardId = result.sceneArtboardId;
    ctx.results.imagePalette = result.imagePalette;
    ctx.results.images = result.boards;
    ctx.report.push(result.summary);
  },
};

const clock = (s: number) =>
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
    const jobId = `pipeline-${crypto.randomUUID()}`;
    const stop = ctx.bridge.onPipelineProgress((event) => {
      if (event.jobId === jobId) ctx.progress(event.ratio * 0.9, "Transcrevendo o áudio");
    });
    const cancel = () => void ctx.bridge.pipelineCancel(jobId);
    ctx.signal.addEventListener("abort", cancel, { once: true });
    let words: HeardWord[];
    try {
      ctx.progress(
        0,
        audio.kind === "lesson" ? "Lendo as transcrições da aula" : "Transcrevendo o áudio",
      );
      words = await ctx.bridge.pipelineWords(audio.token, audio.kind, jobId);
    } finally {
      stop();
      ctx.signal.removeEventListener("abort", cancel);
    }
    ctx.signal.throwIfAborted();
    ctx.progress(0.95, "Procurando o roteiro");
    const piece: ScriptPiece = findScriptPiece(words, ctx.inputs.script);
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
    const bytes = await ctx.bridge.pipelineNarration(audio.token, audio.kind, start, end);
    ctx.signal.throwIfAborted();
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
  },
};

/** The demonstration's state for the next steps. */
interface DemoVideo {
  name: string;
  facts: VideoFacts;
  /** Animation second the video starts at (the breath before the first sentence). */
  offset: number;
  /** Seconds of video in the stretch. */
  duration: number;
}

/**
 * The screen demonstration: an artboard of the video's size (the transparent layer), the video
 * under it in the preview from the moment the stretch starts, and the clicks saved with it.
 */
const prepareVideo: PipelineStep = {
  id: "video",
  label: "Preparar o vídeo da demonstração",
  async run(ctx) {
    const file = ctx.inputs.files.video;
    const piece = ctx.results.piece as ScriptPiece | undefined;
    if (!file || !piece) throw new Error("Escolha o vídeo da demonstração.");
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
    const bytes = await ctx.bridge.pipelineVideoPreview(file.token, duration);
    ctx.signal.throwIfAborted();
    ctx.editor.setReferenceVideo({ bytes, offset, duration });
    const video: DemoVideo = { name: file.name, facts, offset, duration };
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

/** The ready arrow, balloon, highlight and click mark, in the run's text palette. */
const addElements: PipelineStep = {
  id: "elements",
  label: "Criar os elementos prontos (seta, balão, destaque e clique)",
  async run(ctx) {
    ctx.results.elements = ctx.editor.addArtboards(elementSvgs(ctx.inputs.textPalette));
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
      const file = ctx.inputs.files.video;
      if (file && times.length) {
        ctx.progress(0.02, "Tirando quadros do vídeo");
        images = await ctx.bridge.pipelineVideoFrames(file.token, times);
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
      imagePalette: (ctx.results.imagePalette as string[] | undefined) ?? [],
      lessonStart,
      ...(demo ? { demo } : {}),
    });
    const stop = () => ctx.editor.stopAssistant();
    ctx.signal.addEventListener("abort", stop, { once: true });
    try {
      ctx.progress(0.05, "O assistente está animando");
      const turn = await ctx.editor.askAssistant(
        request,
        `Pipeline "${ctx.recipe.name}": montar o rascunho da animação (${piece.lines.length} ${piece.lines.length === 1 ? "frase" : "frases"}, tempos e imagens enviados).`,
        images,
      );
      ctx.signal.throwIfAborted();
      if (turn.stopped) throw new Error("O assistente foi interrompido antes de terminar.");
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
    return [importProject, findPiece, prepareNarration, applyPalettes, draftWithAssistant];
  return [
    findPiece,
    prepareVideo,
    prepareNarration,
    applyPalettes,
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
