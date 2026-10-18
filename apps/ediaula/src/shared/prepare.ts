import type { Project } from "./types.ts";

/**
 * "Preparar aula": the steps that turn a recorded lesson into an edit to review, always in this
 * order. The cuts come before the inserts (an insert placed and then cut would lose its place)
 * and every overlay comes after them, anchored on the words they go with. Each step makes a
 * proposal or a draft the person approves, or is skipped with the reason; what was decided is
 * kept in the project (Project.prepare), so closing the lesson and opening it again goes on
 * from the step that was waiting.
 */

export const PREPARE_STEPS = [
  "transcribe",
  "section",
  "cuts",
  "inserts",
  "template",
  "zoom",
  "annotations",
  "captions",
  "cards",
  "check",
] as const;

export type PrepareStep = (typeof PREPARE_STEPS)[number];

/** done: approved or applied; skipped: left out (by the person, or it does not apply). */
export const PREPARE_DECISIONS = ["done", "skipped"] as const;
export type PrepareDecision = (typeof PREPARE_DECISIONS)[number];

export interface PrepareState {
  /** The step waiting for the person (or running). */
  step: PrepareStep;
  decisions: Partial<Record<PrepareStep, PrepareDecision>>;
  /** Why a step was skipped or what it left, one line each. */
  notes?: Partial<Record<PrepareStep, string>>;
}

export const PREPARE_LABEL: Record<PrepareStep, string> = {
  transcribe: "Transcrever",
  section: "Confirmar a seção do roteiro",
  cuts: "Cortes",
  inserts: "Inserções do apresentador",
  template: "Modelo do curso",
  zoom: "Zoom automático",
  annotations: "Anotações do Na tela",
  captions: "Legenda",
  cards: "Cartelas de abertura e encerramento",
  check: "Verificação antes de exportar",
};

export const PREPARE_HINT: Record<PrepareStep, string> = {
  transcribe:
    "Transcreve cada fonte que se ouve na aula uma vez só: a voz tirada de um vídeo não é transcrita de novo.",
  section: "Confere qual seção do roteiro esta gravação é antes de cortar pelo roteiro.",
  cuts: "Vícios, repetições, pausas longas e o que foi dito fora do roteiro, numa proposta só, por categoria.",
  inserts: "Encaixa as falas do apresentador do roteiro, todas de uma vez, como rascunho.",
  template:
    "Paleta, posição do apresentador, cursor, música e escolhas da limpeza do modelo salvo do curso.",
  zoom: "Zoom nos cliques das gravações de tela feitas no EdiAula.",
  annotations: 'Cada "Na tela" do roteiro vira uma anotação no começo da fala seguinte.',
  captions: "Legenda gravada no vídeo, com o estilo do modelo do curso.",
  cards: "Cartela de abertura e de encerramento.",
  check: "Silêncios, volume, duração, falas que faltam, legenda, letras pequenas e lacunas.",
};

/** A fresh pipeline, on its first step. */
export const startPrepare = (): PrepareState => ({ step: PREPARE_STEPS[0], decisions: {} });

/** The first step not decided yet, in order; null when every step is. */
export function nextStep(state: PrepareState | undefined): PrepareStep | null {
  return PREPARE_STEPS.find((s) => !state?.decisions[s]) ?? null;
}

/** Where to go on: the saved step when it is still open, else the first one not decided. */
export function resumeStep(state: PrepareState | undefined): PrepareStep | null {
  if (state && !state.decisions[state.step] && PREPARE_STEPS.includes(state.step)) {
    // A step is only ever waiting after every earlier one was decided.
    const index = PREPARE_STEPS.indexOf(state.step);
    if (PREPARE_STEPS.slice(0, index).every((s) => state.decisions[s])) return state.step;
  }
  return nextStep(state);
}

/**
 * Records the decision of the step waiting and moves on to the next one. Only the waiting step
 * can be decided: the order is fixed.
 */
export function decide(
  state: PrepareState | undefined,
  step: PrepareStep,
  decision: PrepareDecision,
  note?: string,
): PrepareState {
  const current = state ?? startPrepare();
  if (resumeStep(current) !== step) return current;
  const decisions = { ...current.decisions, [step]: decision };
  const notes = { ...current.notes };
  if (note) notes[step] = note;
  else delete notes[step];
  const next = PREPARE_STEPS.find((s) => !decisions[s]);
  return {
    step: next ?? step,
    decisions,
    ...(Object.keys(notes).length ? { notes } : {}),
  };
}

/** Opens a step again: it and every step after it are undecided, and it is the one waiting. */
export function reopen(state: PrepareState | undefined, step: PrepareStep): PrepareState {
  const index = PREPARE_STEPS.indexOf(step);
  const decisions: PrepareState["decisions"] = {};
  const notes: NonNullable<PrepareState["notes"]> = {};
  for (const s of PREPARE_STEPS.slice(0, index)) {
    const d = state?.decisions[s];
    if (d) decisions[s] = d;
    const n = state?.notes?.[s];
    if (n) notes[s] = n;
  }
  return { step, decisions, ...(Object.keys(notes).length ? { notes } : {}) };
}

/** Whether every step was decided. */
export const prepareFinished = (state: PrepareState | undefined): boolean =>
  !!state && nextStep(state) === null;

/**
 * Whether the voice of the lesson was already cleaned in the voice flow, before the presenter's
 * video was made from it: the voice was exported for it (Project.voiceMasters), a presenter's
 * video placed by the voice is on the timeline (Asset.origin), or the voice plays muted under the
 * presenter's own sound (Clip.mutedFor, of older lessons too). The presenter's video was made on
 * that clean voice: cutting the voice again would chop the presenter's video along with it.
 */
export function voiceAlreadyCleaned(
  project: Pick<Project, "voiceMasters" | "assets" | "clips">,
): boolean {
  if (project.voiceMasters?.length) return true;
  const used = new Set(project.clips.map((c) => c.assetId));
  return (
    project.clips.some((c) => !!c.mutedFor) ||
    project.assets.some((a) => a.origin === "presenter" && a.kind === "video" && used.has(a.id))
  );
}

/** Why a step does not apply to this lesson, known without reading any file; null when it does. */
export function skipReason(
  project: Pick<Project, "voiceMasters" | "script" | "assets" | "clips">,
  step: PrepareStep,
): string | null {
  const used = new Set(project.clips.map((c) => c.assetId));
  switch (step) {
    case "section":
      return project.script?.text ? null : "A aula não tem roteiro colado.";
    case "cuts":
      return voiceAlreadyCleaned(project)
        ? "A voz já foi limpa antes de gerar o vídeo do apresentador, e o vídeo foi encaixado por ela. Cortar a voz de novo picotaria o vídeo do apresentador junto, então esta etapa fica de fora. Para um corte pontual, use a aba Transcrição ou Revisar cortes."
        : null;
    case "inserts":
    case "annotations":
      return project.script?.text ? null : "A aula não tem roteiro colado.";
    case "zoom":
      return project.assets.some((a) => a.cursor && used.has(a.id))
        ? null
        : "Nenhuma gravação de tela do EdiAula na timeline: só elas guardam os cliques.";
    default:
      return null;
  }
}
