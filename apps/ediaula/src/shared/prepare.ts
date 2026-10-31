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
  "recording",
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
  recording: "Revisar a gravação",
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
  recording:
    "O que a gravação deixou para decidir: a tela gravada com a voz segurada, as tentativas de Errei, voltar e os lembretes.",
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

/** Every draft and proposal of "Preparar aula" is by "preparar:<step>", the step that made it. */
export const PREPARE_AUTHOR = "preparar";

export const prepareAuthor = (step: PrepareStep): string => `${PREPARE_AUTHOR}:${step}`;

/** Whether a draft or proposal comes from "Preparar aula" ("preparar" alone: older lessons). */
export const isPrepareAuthor = (by: string | undefined): boolean =>
  by === PREPARE_AUTHOR || !!by?.startsWith(`${PREPARE_AUTHOR}:`);

/** The step that made a draft or proposal of "Preparar aula"; null for one of an older lesson. */
export function authorStep(by: string | undefined): PrepareStep | null {
  if (!by?.startsWith(`${PREPARE_AUTHOR}:`)) return null;
  const step = by.slice(PREPARE_AUTHOR.length + 1);
  return PREPARE_STEPS.find((s) => s === step) ?? null;
}

/**
 * What resolving a draft or proposal of "Preparar aula" in the review bar decides: the step that
 * made it, applied is done and discarded is skipped, only while that step is the one waiting
 * (one made before a "Refazer" decides nothing). One of an older lesson, of no step, decides the
 * step waiting. `state` comes back as it was when nothing is decided.
 */
export function resolveReview(
  state: PrepareState | undefined,
  by: string | undefined,
  outcome: "applied" | "discarded",
  note?: string,
): PrepareState | undefined {
  if (!isPrepareAuthor(by)) return state;
  const step = resumeStep(state);
  if (!step || (authorStep(by) ?? step) !== step) return state;
  return decide(
    state,
    step,
    outcome === "applied" ? "done" : "skipped",
    outcome === "applied" ? note : "Descartada na revisão.",
  );
}

/** Marks steps done out of turn (the course template applied from its offer covers several). */
export function markDone(
  state: PrepareState | undefined,
  steps: readonly PrepareStep[],
  note: string,
): PrepareState {
  const current = state ?? startPrepare();
  const decisions = { ...current.decisions };
  const notes = { ...current.notes };
  for (const s of steps)
    if (!decisions[s]) {
      decisions[s] = "done";
      notes[s] = note;
    }
  const step = PREPARE_STEPS.find((s) => !decisions[s]) ?? current.step;
  return { step, decisions, notes };
}

/**
 * The media of "Voz e câmera" takes: the presenter filmed by the recorder (a camera of a take,
 * Asset.origin "presenter") and every other source of that take (its voice). The voice and the
 * video were recorded together, so cutting the voice cuts the video with it (cleanup.ts
 * cutTargets): they are cut like any live recording, never kept out as the voice flow is.
 */
export function filmedTogether(project: Pick<Project, "assets">): Set<string> {
  const takes = new Set(
    project.assets.flatMap((a) =>
      a.origin === "presenter" && a.recording?.role === "camera" ? [a.recording.id] : [],
    ),
  );
  return new Set(
    project.assets.filter((a) => a.recording && takes.has(a.recording.id)).map((a) => a.id),
  );
}

/**
 * The media of the voice flow: a voice recorded alone with its takes (Asset.voiceTakes), the
 * voice exported to make the presenter's video (Project.voiceMasters), the presenter's video
 * placed by it (Asset.origin) and a voice playing muted under the presenter's own sound
 * (Clip.mutedFor, of older lessons too). That voice is cleaned in the voice flow, before the
 * presenter's video is made from it. A "Voz e câmera" take is not part of it unless its voice
 * was exported (filmedTogether).
 */
export function voiceLinkedMedia(
  project: Pick<Project, "voiceMasters" | "assets" | "clips">,
): Set<string> {
  const out = new Set<string>();
  const together = filmedTogether(project);
  for (const a of project.assets)
    if ((a.origin === "presenter" || a.voiceTakes) && !together.has(a.id)) out.add(a.id);
  for (const c of project.clips) if (c.mutedFor) out.add(c.assetId);
  for (const m of project.voiceMasters ?? [])
    for (const piece of m.pieces) for (const seg of piece.sourceMap) out.add(seg.assetId);
  return out;
}

/** Whether a voice of the voice flow is heard in the lesson (voiceLinkedMedia). */
export const voiceAlreadyCleaned = (
  project: Pick<Project, "voiceMasters" | "assets" | "clips">,
): boolean => {
  const used = new Set(project.clips.map((c) => c.assetId));
  return [...voiceLinkedMedia(project)].some((id) => used.has(id));
};

/**
 * Whether the presenter's video made from the exported voice is in the lesson (not the one
 * filmed together with the voice by "Voz e câmera").
 */
export const presenterInLesson = (project: Pick<Project, "assets" | "clips">): boolean => {
  const used = new Set(project.clips.map((c) => c.assetId));
  const together = filmedTogether(project);
  return (
    project.clips.some((c) => !!c.mutedFor) ||
    project.assets.some(
      (a) =>
        a.origin === "presenter" && a.kind === "video" && used.has(a.id) && !together.has(a.id),
    )
  );
};

/**
 * Voices heard in the lesson that are not part of the voice flow: a microphone recorded live
 * with the screen, a narration recorded over it. Their hesitations and pauses are still cut.
 */
export function liveVoices(
  project: Pick<Project, "voiceMasters" | "assets" | "clips" | "tracks">,
): Set<string> {
  const linked = voiceLinkedMedia(project);
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const out = new Set<string>();
  for (const c of project.clips) {
    const t = tracks.get(c.trackId);
    const a = assets.get(c.assetId);
    if (!t || !a || t.muted || t.music || c.volume <= 0 || c.mutedFor || c.annotation) continue;
    if (!a.hasAudio || a.kind === "image" || linked.has(a.id) || a.generated) continue;
    // The computer's sound, and the sound track of a screen or camera video, are not a voice.
    const role = a.recording?.role;
    if (role === "system" || role === "screen" || role === "camera" || a.cursor) continue;
    out.add(a.id);
  }
  return out;
}

/** Why a step does not apply to this lesson, known without reading any file; null when it does. */
export function skipReason(
  project: Pick<Project, "voiceMasters" | "script" | "assets" | "clips" | "tracks" | "markers">,
  step: PrepareStep,
): string | null {
  const used = new Set(project.clips.map((c) => c.assetId));
  switch (step) {
    case "recording":
      return project.clips.some((c) => c.timelapse) ||
        project.assets.some((a) => a.retries?.length && used.has(a.id)) ||
        project.markers?.some((m) => m.note)
        ? null
        : "A gravação não deixou nada para decidir.";
    case "section":
      return project.script?.text ? null : "A aula não tem roteiro colado.";
    case "cuts":
      // Only when every voice heard went through the voice flow (exported before the
      // presenter's video was made from it): a live microphone, and a voice filmed together with
      // the presenter ("Voz e câmera", cut together with the video), are still cut.
      if (!voiceAlreadyCleaned(project) || liveVoices(project).size) return null;
      return presenterInLesson(project)
        ? "A voz foi exportada e limpa antes de gerar o vídeo do apresentador, e o vídeo foi encaixado por ela. Cortar a voz de novo picotaria o vídeo do apresentador junto, então esta etapa fica de fora."
        : "A voz é limpa na seção Voz do painel Áudio, antes de gerar o vídeo do apresentador: cortar aqui deixaria a voz diferente da que vai virar o vídeo, então esta etapa fica de fora.";
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
