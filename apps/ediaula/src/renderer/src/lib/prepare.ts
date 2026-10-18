import { buildItems, type ProposalItem } from "@shared/anchors";
import { DEFAULT_CAPTION_STYLE } from "@shared/captions";
import { cutTargets, mergeRanges, protectedConflicts } from "@shared/cleanup";
import { startPending } from "@shared/courseTemplate";
import {
  authorStep,
  decide,
  isPrepareAuthor,
  markDone,
  PREPARE_LABEL,
  PREPARE_STEPS,
  type PrepareDecision,
  type PrepareState,
  type PrepareStep,
  prepareAuthor,
  prepareFinished,
  reopen,
  resolveReview,
  resumeStep,
  skipReason,
  startPrepare,
  voiceLinkedMedia,
} from "@shared/prepare";
import { OFF_SCRIPT_LIMIT, offScriptShare } from "@shared/scriptAlign";
import { pendingSpeech } from "@shared/speechSources";
import { clipEnd, newId } from "@shared/timeline";
import type { Project } from "@shared/types";
import { create } from "zustand";
import { setCaptions } from "@/editor/CaptionSettings";
import { useApp } from "@/state/app";
import { basisOf, type Commit, draftCommit, shownProject, useProject } from "@/state/project";
import { cleanupItems, cleanupPlan } from "./cleanupPlan";
import {
  addDirectionAnnotations,
  applyTemplateParts,
  courseTemplate,
  directionAnnotations,
  TEMPLATE_AUTHOR,
  TEMPLATE_STEPS,
} from "./courseTemplate";
import { checkLesson, type LessonCheck, type MeasuredLoudness, measureLoudness } from "./preflight";
import { proposeItems } from "./proposals";
import { onPresenterPlaced, onRecordingImported } from "./recordingHooks";
import { onReviewResolved } from "./review";
import { currentView, pendingInserts, placeInserts } from "./script";
import {
  cleanError,
  loadCleanupInputs,
  loadProjectTranscripts,
  transcribeAssets,
  useCleanup,
  useTranscribing,
} from "./transcripts";

/**
 * "Preparar aula" in the editor: runs the steps of shared/prepare.ts one after the other. Each
 * step makes a proposal (the cuts) or a draft (everything else) and waits for the person to apply
 * or discard it in the review bar; then the next step runs by itself. Each draft and proposal is
 * by "preparar:<step>", so resolving it only ever decides the step that made it. Steps that do
 * not apply are skipped with the reason. Where the pipeline stands is kept in the project
 * (Project.prepare), so it resumes after closing the lesson.
 */

/** What a step's run ended in. */
type Outcome =
  | { kind: "decided"; decision: PrepareDecision; note: string }
  /** A proposal or a draft is waiting for the person. */
  | { kind: "waiting"; what: "proposal" | "draft"; note: string }
  /** Something the person has to do first (install the engine, confirm the section), or a
   *  change in the lesson meanwhile: trying again can work. */
  | { kind: "blocked"; note: string };

/**
 * The banner after something came into the lesson: "prepare" offers "Preparar aula" (a screen
 * recording, the presenter's video); "voice" says what comes after a voice recorded alone.
 */
export type PrepareOfferKind = "prepare" | "voice";

interface PrepareUi {
  /** The step running right now. */
  running: PrepareStep | null;
  /** The step waiting for the review bar, and for what. */
  waiting: { step: PrepareStep; what: "proposal" | "draft" } | null;
  /** The last word of the waiting step (why it stopped, what it proposed). */
  message: string | null;
  offer: PrepareOfferKind | null;
  /** The last check before exporting the pipeline ran, tied to its revision of the lesson. */
  check: LessonCheck | null;
  /** The volume measured in that check (it counts only on the revision it was measured on). */
  loudness: MeasuredLoudness | null;
}

export const usePrepare = create<PrepareUi>(() => ({
  running: null,
  waiting: null,
  message: null,
  offer: null,
  check: null,
  loudness: null,
}));

const stateOf = (p: Project | null): PrepareState | undefined => p?.prepare;

/** Saves where the pipeline stands (outside the undo history, like the proposals). */
function keep(state: PrepareState): void {
  useProject.getState().patch((p) => ({ ...p, prepare: state }));
}

const commit = (step: PrepareStep): Commit =>
  draftCommit(
    prepareAuthor(step),
    `Preparar aula: ${PREPARE_LABEL[step]}`,
    useProject.getState().project?.id,
  );

/** The draft or proposal of "Preparar aula" that is waiting, if any, and which step made it. */
function pendingReview(
  p: Project,
): { what: "proposal" | "draft"; step: PrepareStep | null } | null {
  const { draft } = useProject.getState();
  if (draft && draft.projectId === p.id && isPrepareAuthor(draft.author))
    return { what: "draft", step: authorStep(draft.author) };
  const proposal = p.proposals?.find((x) => isPrepareAuthor(x.by));
  return proposal ? { what: "proposal", step: authorStep(proposal.by) } : null;
}

/** Discards what "Preparar aula" left waiting: of one step (and older ones of no step), or all. */
function discardPending(only?: PrepareStep): void {
  const { draft, project, discardDraft, setProposals } = useProject.getState();
  if (!project) return;
  const mine = (by: string | undefined): boolean =>
    isPrepareAuthor(by) && (!only || authorStep(by) === only || authorStep(by) === null);
  if (draft && draft.projectId === project.id && mine(draft.author)) discardDraft();
  if (project.proposals?.some((x) => mine(x.by)))
    setProposals((list) => list.filter((x) => !mine(x.by)));
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The cuts of the lesson in one proposal, by category: hesitations, repeats and pauses of the
 * automatic cleanup, and what was said outside the script when the section is settled. A cleanup
 * cut inside a block said outside the script is left to the block. No cut falls where the
 * presenter's video placed by the voice plays: that voice was cleaned before the video was made,
 * and cutting there would cut the video too.
 */
async function proposeCuts(): Promise<Outcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = useProject.getState().project;
    if (!p) return { kind: "blocked", note: "Nenhum projeto aberto." };
    const transcripts = await loadProjectTranscripts(p);
    if (!transcripts.size)
      return {
        kind: "decided",
        decision: "skipped",
        note: "Sem transcrição não dá para achar vícios, repetições e o que ficou fora do roteiro.",
      };
    const inputs = await loadCleanupInputs(p, transcripts);
    const view = await currentView(p);
    if (useProject.getState().project !== p) continue;
    const plan = cleanupPlan(p, inputs);
    const cleanup = cleanupItems(p, plan, () => newId("pi"));
    const notes: string[] = [];
    const off: ProposalItem[] = [];
    if (view?.words.length) {
      const share = offScriptShare(view.alignment);
      if (!view.confirmed)
        notes.push("O que foi dito fora do roteiro ficou de fora: a seção não foi confirmada.");
      else if (share > OFF_SCRIPT_LIMIT)
        notes.push(
          `${Math.round(share * 100)}% do que foi dito está fora do roteiro desta seção: confira a seção antes de cortar por ele.`,
        );
      else {
        const targets = cutTargets(p);
        for (const r of view.alignment.offScript) {
          const short = r.text.length > 70 ? `${r.text.slice(0, 70)}…` : r.text;
          off.push(
            ...buildItems(
              p,
              [r.start, r.end],
              targets,
              {
                reason:
                  r.retakeOf !== undefined
                    ? `outra tomada da linha ${r.retakeOf + 1}: "${short}"`
                    : `fora do roteiro: "${short}"`,
                category: r.retakeOf !== undefined ? "retake" : "off-script",
              },
              () => newId("pi"),
            ),
          );
        }
      }
    }
    const blocks = mergeRanges(off.map((i): [number, number] => [i.start, i.end]));
    const inside = (i: ProposalItem): boolean =>
      blocks.some(([a, b]) => i.start >= a - 0.05 && i.end <= b + 0.05);
    const linked = voiceLinkedMedia(p);
    const presenterSpans = p.clips
      .filter((c) => linked.has(c.assetId) && !c.annotation)
      .map((c): [number, number] => [c.start, clipEnd(c)]);
    const overPresenter = (i: ProposalItem): boolean =>
      presenterSpans.some(([a, b]) => i.start < b - 0.01 && i.end > a + 0.01);
    const candidates = [...cleanup.filter((i) => !inside(i)), ...off].filter(
      (i) => !protectedConflicts(p, [[i.start, i.end]]).length,
    );
    const kept = candidates.filter((i) => !overPresenter(i));
    if (kept.length < candidates.length)
      notes.push(
        `${plural(candidates.length - kept.length, "corte ficou", "cortes ficaram")} de fora por cair no vídeo do apresentador, encaixado pela voz já limpa.`,
      );
    const items = kept.sort((a, b) => a.start - b.start);
    if (!items.length)
      return {
        kind: "decided",
        decision: "done",
        note: ["Nada para cortar com as escolhas desta aula.", ...notes].join(" "),
      };
    const stored = proposeItems(p, "Cortes da aula", items, prepareAuthor("cuts"));
    if ("refused" in stored) return { kind: "blocked", note: stored.refused };
    const count = (c: string): number => items.filter((i) => i.category === c).length;
    const parts = [
      count("filler") ? plural(count("filler"), "vício", "vícios") : "",
      count("repeat") ? plural(count("repeat"), "repetição", "repetições") : "",
      count("silence") ? plural(count("silence"), "pausa longa", "pausas longas") : "",
      count("off-script")
        ? plural(count("off-script"), "trecho fora do roteiro", "trechos fora do roteiro")
        : "",
      count("retake") ? plural(count("retake"), "tomada repetida", "tomadas repetidas") : "",
    ].filter(Boolean);
    return {
      kind: "waiting",
      what: "proposal",
      note: [
        `Proposta de cortes: ${parts.join(", ")}. Revise por categoria na barra de revisão.`,
        ...notes,
      ].join(" "),
    };
  }
  return {
    kind: "blocked",
    note: "A aula mudou enquanto os cortes eram preparados. Tente de novo.",
  };
}

/** Whether a draft of `step` is waiting. */
const drafted = (step: PrepareStep): boolean => {
  const { draft, project } = useProject.getState();
  return !!draft && draft.author === prepareAuthor(step) && draft.projectId === project?.id;
};

const draftOr = (step: PrepareStep, note: string, none: string): Outcome =>
  drafted(step)
    ? { kind: "waiting", what: "draft", note }
    : { kind: "decided", decision: "done", note: none };

/** Steps that write a draft (one draft waits at a time). */
const DRAFT_STEPS = new Set<PrepareStep>([
  "inserts",
  "template",
  "zoom",
  "annotations",
  "captions",
  "cards",
]);

/** The note of a finished check: how many problems and warnings it left. */
function checkNote(check: LessonCheck): string {
  const errors = check.findings.filter((f) => f.severity === "error").length;
  const warnings = check.findings.filter((f) => f.severity === "warn").length;
  if (!errors && !warnings) return "Nada a corrigir antes de exportar.";
  if (!warnings) return `${plural(errors, "problema", "problemas")} para olhar antes de exportar.`;
  return `${errors ? `${plural(errors, "problema", "problemas")} e ` : ""}${plural(warnings, "aviso", "avisos")} para olhar antes de exportar.`;
}

async function runner(step: PrepareStep, p: Project): Promise<Outcome> {
  const reason = skipReason(p, step);
  if (reason) return { kind: "decided", decision: "skipped", note: reason };
  const other = useProject.getState().draft;
  if (DRAFT_STEPS.has(step) && other && other.projectId === p.id && !isPrepareAuthor(other.author))
    return {
      kind: "blocked",
      note: `Há um rascunho de outra ferramenta esperando revisão ("${other.title}"). Aplique ou descarte esse rascunho e continue.`,
    };
  const into = commit(step);
  switch (step) {
    case "transcribe": {
      const busy = new Set(Object.keys(useTranscribing.getState()));
      const todo = pendingSpeech(p, busy);
      if (!todo.length)
        return busy.size
          ? { kind: "blocked", note: "A transcrição já está em andamento; espere terminar." }
          : {
              kind: "decided",
              decision: "done",
              note: "Tudo o que se ouve na aula já está transcrito.",
            };
      const status = await window.api.engineStatus();
      if (!status.bin || !status.model)
        return {
          kind: "blocked",
          note: "Instale o motor de transcrição na aba Transcrição (uma vez só) e continue. Também dá para pular esta etapa: as que dependem da fala ficam de fora.",
        };
      await transcribeAssets(todo, useCleanup.getState().language);
      const now = useProject.getState().project;
      const failed = todo.filter(
        (a) => now?.assets.find((x) => x.id === a.id)?.transcriptStatus !== "ready",
      );
      return failed.length
        ? {
            kind: "blocked",
            note: `A transcrição falhou em ${failed.map((a) => a.name).join(", ")}. Tente de novo ou pule.`,
          }
        : {
            kind: "decided",
            decision: "done",
            note: `${plural(todo.length, "fonte transcrita", "fontes transcritas")}, cada uma uma vez só.`,
          };
    }
    case "section": {
      const view = await currentView(p);
      if (!view)
        return { kind: "decided", decision: "skipped", note: "A aula não tem roteiro colado." };
      if (p.script?.confirmed || (view.words.length && view.confirmed))
        return {
          kind: "decided",
          decision: "done",
          note: `Seção ${view.section.number} · ${view.section.videoTitle || view.section.title}.`,
        };
      return {
        kind: "blocked",
        note: view.words.length
          ? `A gravação parece ser a seção ${view.section.number} (${Math.round((view.rank?.coverage ?? 0) * 100)}% das falas dela). Confirme ou escolha outra.`
          : "Sem transcrição não dá para reconhecer a seção pela fala: escolha a seção desta gravação.",
      };
    }
    case "cuts":
      if (pendingReview(p)?.what === "proposal")
        return {
          kind: "waiting",
          what: "proposal",
          note: "A proposta de cortes está na barra de revisão.",
        };
      return proposeCuts();
    case "inserts": {
      const view = await currentView(p);
      if (!view)
        return { kind: "decided", decision: "skipped", note: "A aula não tem roteiro colado." };
      if (!pendingInserts(p, view.section).length)
        return {
          kind: "decided",
          decision: "done",
          note: "Nenhuma fala do apresentador para encaixar.",
        };
      if (!view.words.length)
        return {
          kind: "decided",
          decision: "skipped",
          note: "Sem transcrição não dá para saber onde cada fala do apresentador entra.",
        };
      const r = await placeInserts("all", into, shownProject);
      // The lesson changed while the inserts were planned: nothing was placed, try again.
      if (!r.ok && r.transient) return { kind: "blocked", note: r.message };
      if (!r.ok) return { kind: "decided", decision: "skipped", note: r.message };
      return draftOr(step, r.message, "As falas do apresentador já estavam no lugar.");
    }
    case "template": {
      const t = await courseTemplate(p.course);
      if (!t)
        return {
          kind: "decided",
          decision: "skipped",
          note: p.course
            ? `O curso ${p.course} ainda não tem modelo salvo. Numa aula pronta, use Arquivo › Salvar como modelo do curso.`
            : "A aula não tem curso, e o modelo é guardado por curso.",
        };
      const done = await applyTemplateParts(t, ["look"], into);
      return draftOr(
        step,
        `Modelo do curso: ${done.join(", ")}.`,
        "A aula já segue o modelo do curso.",
      );
    }
    case "zoom": {
      const t = await courseTemplate(p.course);
      if (t?.zoom?.auto === false)
        return {
          kind: "decided",
          decision: "skipped",
          note: "O modelo do curso não usa zoom automático.",
        };
      const done = await applyTemplateParts(
        t ?? { version: 2, format: p.settings },
        ["zoom"],
        into,
      );
      return draftOr(step, `Zoom automático: ${done.join(", ")}.`, "Nenhum clique para dar zoom.");
    }
    case "annotations": {
      const t = await courseTemplate(p.course);
      const { list, problem } = await directionAnnotations(basisOf(into) ?? p, t);
      if (problem) return { kind: "decided", decision: "skipped", note: problem };
      if (!list.length)
        return {
          kind: "decided",
          decision: "done",
          note: 'Nenhum "Na tela" do roteiro para anotar além dos que já estão na aula.',
        };
      const n = await addDirectionAnnotations(list, t, into);
      return draftOr(
        step,
        `${plural(n, 'anotação do "Na tela"', 'anotações do "Na tela"')}, no começo da fala seguinte.`,
        'Nenhum "Na tela" do roteiro para anotar.',
      );
    }
    case "captions": {
      if (!p.assets.some((a) => a.transcriptStatus === "ready"))
        return { kind: "decided", decision: "skipped", note: "Sem transcrição não há legenda." };
      const t = await courseTemplate(p.course);
      if (t?.captions && !t.captions.burn)
        return {
          kind: "decided",
          decision: "skipped",
          note: "O modelo do curso não grava a legenda no vídeo; o arquivo .srt sai junto na exportação.",
        };
      const style = t?.captions ?? { ...DEFAULT_CAPTION_STYLE, ...p.captions, burn: true };
      setCaptions(style, into);
      return draftOr(
        step,
        `Legenda gravada no vídeo${t?.captions ? ", no estilo do curso" : ""}.`,
        "A legenda já estava como o curso pede.",
      );
    }
    case "cards": {
      // A lesson started from the course template gets its cards with its first media.
      if (startPending(p))
        return {
          kind: "decided",
          decision: "skipped",
          note: "As cartelas do modelo do curso entram quando a primeira mídia chegar à timeline.",
        };
      const t = await courseTemplate(p.course);
      const done = await applyTemplateParts(
        {
          version: 2,
          format: p.settings,
          ...t,
          cards: t?.cards ?? { opening: true, closing: true },
        },
        ["cards"],
        into,
      );
      return draftOr(step, `Cartelas: ${done.join(" e ")}.`, "A aula já tem as cartelas.");
    }
    case "check": {
      // The volume is measured once here, as the export mixes it; the list is made again on
      // every change after (recheckPrepare) without measuring again.
      let loudness: MeasuredLoudness | null = null;
      try {
        loudness = await measureLoudness();
      } catch (err) {
        useApp.getState().toast(`O volume não pôde ser medido: ${cleanError(err)}`, "error");
      }
      const { project, revision } = useProject.getState();
      if (!project || project.id !== p.id)
        return { kind: "blocked", note: "A aula aberta mudou; a verificação parou." };
      const check = await checkLesson(project, revision, { loudness, normalize: true });
      usePrepare.setState({ check, loudness });
      return { kind: "decided", decision: "done", note: checkNote(check) };
    }
  }
}

/**
 * Runs the waiting step and goes on by itself while steps are decided at once; stops when a
 * step waits for the review bar or for the person.
 */
export async function runPrepare(): Promise<string> {
  for (let guard = 0; guard < PREPARE_STEPS.length + 1; guard++) {
    const p = useProject.getState().project;
    if (!p) return "Nenhum projeto aberto.";
    const state = stateOf(p) ?? startPrepare();
    if (!p.prepare) keep(state);
    const step = resumeStep(state);
    if (!step) {
      usePrepare.setState({ running: null, waiting: null, message: "A aula está preparada." });
      return "Todas as etapas foram feitas. A aula está preparada.";
    }
    if (usePrepare.getState().running) return "Uma etapa já está rodando.";
    const review = pendingReview(p);
    if (review) {
      // What is waiting may be of another step (an older lesson): it is resolved first, and
      // resolving it decides only the step that made it.
      const of = review.step ?? step;
      usePrepare.setState({
        waiting: { step: of, what: review.what },
        message: `Revise ${review.what === "draft" ? "o rascunho" : "a proposta"} na barra de revisão.`,
      });
      return `Etapa ${PREPARE_STEPS.indexOf(of) + 1} (${PREPARE_LABEL[of]}) esperando a revisão.`;
    }
    usePrepare.setState({ running: step, waiting: null, message: null });
    let outcome: Outcome;
    try {
      outcome = await runner(step, p);
    } catch (err) {
      outcome = { kind: "blocked", note: `A etapa falhou: ${cleanError(err)}` };
    } finally {
      usePrepare.setState({ running: null });
    }
    const now = useProject.getState().project;
    if (!now || now.id !== p.id) return "A aula aberta mudou; a preparação parou.";
    if (outcome.kind === "decided") {
      keep(decide(stateOf(now) ?? state, step, outcome.decision, outcome.note));
      continue;
    }
    usePrepare.setState({
      waiting: outcome.kind === "waiting" ? { step, what: outcome.what } : null,
      message: outcome.note,
    });
    return `Etapa ${PREPARE_STEPS.indexOf(step) + 1} (${PREPARE_LABEL[step]}): ${outcome.note}`;
  }
  return "A preparação parou.";
}

/**
 * The check of the last step made again on the lesson as it is now, after a change; the volume
 * measured before counts no more (lib/preflight.ts) and is measured again with "Refazer".
 */
export async function recheckPrepare(): Promise<void> {
  const { check, loudness } = usePrepare.getState();
  const { project, revision } = useProject.getState();
  if (!check || !project || project.id !== check.projectId || revision === check.revision) return;
  try {
    const next = await checkLesson(project, revision, { loudness, normalize: true });
    const now = useProject.getState();
    if (now.project?.id === next.projectId && now.revision === next.revision)
      usePrepare.setState({ check: next });
  } catch (err) {
    useApp.getState().toast(`A verificação não pôde ser refeita: ${cleanError(err)}`, "error");
  }
}

/** Opens the "Preparar aula" panel and runs (or resumes) the pipeline. */
export function openPrepare(): void {
  usePrepare.setState({ offer: null });
  useApp.getState().set({ sideTab: "prepare" });
  void runPrepare();
}

/** The person skips the waiting step: what it proposed is discarded. */
export function skipPrepareStep(): void {
  const p = useProject.getState().project;
  const step = resumeStep(stateOf(p));
  if (!p || !step) return;
  discardPending(step);
  keep(decide(stateOf(p), step, "skipped", "Pulada."));
  usePrepare.setState({ waiting: null, message: null });
  void runPrepare();
}

/**
 * Opens a decided step again (and every step after it). What "Preparar aula" left waiting is
 * discarded: it was made for the steps as they were.
 */
export function redoPrepareStep(step: PrepareStep): void {
  const p = useProject.getState().project;
  if (!p) return;
  discardPending();
  keep(reopen(stateOf(p), step));
  usePrepare.setState({ waiting: null, message: null, check: null });
  void runPrepare();
}

/** The person confirmed (or chose) the section of the recording in the "Preparar aula" panel. */
export function confirmPrepareSection(index: number): void {
  const p = useProject.getState().project;
  if (!p?.script) return;
  useProject.getState().commit((q) => ({
    ...q,
    script: q.script ? { ...q.script, section: index, confirmed: true } : q.script,
  }));
  void runPrepare();
}

/** Offers "Preparar aula" unless the lesson already went through every step. */
function offerPrepare(): void {
  const p = useProject.getState().project;
  if (p && !prepareFinished(stateOf(p))) usePrepare.setState({ offer: "prepare" });
}

/**
 * Wires the pipeline: a draft or proposal of "Preparar aula" resolved in the review bar decides
 * the step that made it (applied is done, discarded is skipped) and the next step runs; the
 * course template's draft applied marks the steps it covered. A screen recording or the
 * presenter's video coming in offers "Preparar aula"; a voice recorded alone says to make the
 * presenter's video from it first. Returns the unsubscribe.
 */
export function listenPrepare(): () => void {
  const stopReview = onReviewResolved((r) => {
    const p = useProject.getState().project;
    if (!p) return;
    if (r.author === TEMPLATE_AUTHOR) {
      if (r.outcome === "applied")
        keep(markDone(stateOf(p), TEMPLATE_STEPS, "Feita pelo modelo do curso."));
      return;
    }
    if (!isPrepareAuthor(r.author)) return;
    const before = stateOf(p);
    const next = resolveReview(
      before,
      r.author,
      r.outcome,
      usePrepare.getState().message ?? undefined,
    );
    if (next && next !== before) keep(next);
    usePrepare.setState({ waiting: null, message: null });
    void runPrepare();
  });
  const stopImport = onRecordingImported((take) => {
    // A voice alone becomes the presenter's video first: "Preparar aula" comes after it.
    // "Voz e câmera" brought the presenter's video along with the voice; without its camera
    // (it failed from the start) it is a voice alone.
    const filmed = take.result.mode === "voicecam" && take.assets.camera.length > 0;
    if (take.result.mode === "voice" || (take.result.mode === "voicecam" && !filmed))
      usePrepare.setState({ offer: "voice" });
    else if (filmed || take.assets.screen.length) offerPrepare();
  });
  const stopPresenter = onPresenterPlaced(offerPrepare);
  const stopProject = useProject.subscribe((s, prev) => {
    if (s.project?.id !== prev.project?.id)
      usePrepare.setState({
        running: null,
        waiting: null,
        message: null,
        offer: null,
        check: null,
        loudness: null,
      });
  });
  return () => {
    stopReview();
    stopImport();
    stopPresenter();
    stopProject();
  };
}
