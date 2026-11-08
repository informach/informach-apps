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
}

/** What the main process offers the steps (preload). */
export interface PipelineBridge {
  pipelineReadProject(token: string): Promise<string>;
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

/** The steps of each kind of recipe, in order. */
export function stepsFor(kind: RecipeKind): PipelineStep[] {
  if (kind === "game-scene") return [importProject];
  return [];
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
        cancelled
          ? { status: "cancelled" }
          : {
              status: "failed",
              message: error instanceof Error ? error.message : "A etapa falhou.",
            },
      );
      for (const rest of steps.slice(index + 1)) onState(rest.id, { status: "cancelled" });
      return { ok: false, report, results };
    }
  }
  return { ok: true, report, results };
}
