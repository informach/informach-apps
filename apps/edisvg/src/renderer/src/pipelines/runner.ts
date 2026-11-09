import { findScriptPiece, type HeardWord, type ScriptPiece } from "@informach/edi-speech/piece";
import type { Recipe, RecipeKind, RunInputs } from "../../../shared/pipelines";

/**
 * Runs a recipe: its steps in order, each reporting progress, all stopped by Cancelar. A step that
 * fails stops the run and says why; what earlier steps did stays (the editor undoes it). Steps
 * hand their results to the next ones through `results`.
 */

/** What the editor offers the steps (app.js builds it). */
export interface PipelineEditor {
  /** Imports a studio project into the open file (one edit); returns what came in. */
  importStudioProject(source: string): { summary: string; sceneArtboardId: string | null };
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
export interface PipelineBridge {
  pipelineReadProject(token: string): Promise<string>;
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

/** The steps of each kind of recipe, in order. */
export function stepsFor(kind: RecipeKind): PipelineStep[] {
  if (kind === "game-scene") return [importProject, findPiece, prepareNarration];
  return [findPiece, prepareNarration];
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
