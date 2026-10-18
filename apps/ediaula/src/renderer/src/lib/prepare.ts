import { buildItems, type ProposalItem } from "@shared/anchors";
import { DEFAULT_CAPTION_STYLE } from "@shared/captions";
import { cutTargets, mergeRanges, protectedConflicts } from "@shared/cleanup";
import type { Finding, Loudness } from "@shared/preflight";
import {
  decide,
  PREPARE_LABEL,
  PREPARE_STEPS,
  type PrepareDecision,
  type PrepareState,
  type PrepareStep,
  reopen,
  resumeStep,
  skipReason,
  startPrepare,
} from "@shared/prepare";
import { OFF_SCRIPT_LIMIT, offScriptShare } from "@shared/scriptAlign";
import { pendingSpeech } from "@shared/speechSources";
import { newId } from "@shared/timeline";
import type { Project } from "@shared/types";
import { create } from "zustand";
import { setCaptions } from "@/editor/CaptionSettings";
import { useApp } from "@/state/app";
import { draftCommit, shownProject, useProject } from "@/state/project";
import { cleanupItems, cleanupPlan } from "./cleanupPlan";
import {
  addDirectionAnnotations,
  applyTemplateParts,
  courseTemplate,
  directionAnnotations,
} from "./courseTemplate";
import { checkLesson, measureLoudness } from "./preflight";
import { proposeItems } from "./proposals";
import { onRecordingImported } from "./recordingHooks";
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
 * step makes a proposal (the cuts) or a draft (everything else) of the author "preparar" and waits
 * for the person to apply or discard it in the review bar; then the next step runs by itself.
 * Steps that do not apply are skipped with the reason. Where the pipeline stands is kept in the
 * project (Project.prepare), so it resumes after closing the lesson.
 */

export const PREPARE_AUTHOR = "preparar";

/** What a step's run ended in. */
type Outcome =
  | { kind: "decided"; decision: PrepareDecision; note: string }
  /** A proposal or a draft is waiting for the person. */
  | { kind: "waiting"; what: "proposal" | "draft"; note: string }
  /** Something the person has to do first (install the engine, confirm the section). */
  | { kind: "blocked"; note: string };

interface PrepareUi {
  /** The step running right now. */
  running: PrepareStep | null;
  /** The step waiting for the review bar, and for what. */
  waiting: { step: PrepareStep; what: "proposal" | "draft" } | null;
  /** The last word of the waiting step (why it stopped, what it proposed). */
  message: string | null;
  /** The banner offering "Preparar aula" after a take came in. */
  offer: boolean;
  /** The last check before exporting the pipeline ran. */
  findings: Finding[] | null;
}

export const usePrepare = create<PrepareUi>(() => ({
  running: null,
  waiting: null,
  message: null,
  offer: false,
  findings: null,
}));

const stateOf = (p: Project | null): PrepareState | undefined => p?.prepare;

/** Saves where the pipeline stands (outside the undo history, like the proposals). */
function keep(state: PrepareState): void {
  useProject.getState().patch((p) => ({ ...p, prepare: state }));
}

const commit = (step: PrepareStep) =>
  draftCommit(
    PREPARE_AUTHOR,
    `Preparar aula: ${PREPARE_LABEL[step]}`,
    useProject.getState().project?.id,
  );

/** The draft or proposal of "Preparar aula" that is waiting, if any. */
function pendingReview(p: Project): "proposal" | "draft" | null {
  const { draft } = useProject.getState();
  if (draft && draft.projectId === p.id && draft.author === PREPARE_AUTHOR) return "draft";
  if (p.proposals?.some((x) => x.by === PREPARE_AUTHOR)) return "proposal";
  return null;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The cuts of the lesson in one proposal, by category: hesitations, repeats and pauses of the
 * automatic cleanup, and what was said outside the script when the section is settled. A cleanup
 * cut inside a block said outside the script is left to the block.
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
    const items = [...cleanup.filter((i) => !inside(i)), ...off]
      .filter((i) => !protectedConflicts(p, [[i.start, i.end]]).length)
      .sort((a, b) => a.start - b.start);
    if (!items.length)
      return {
        kind: "decided",
        decision: "done",
        note: ["Nada para cortar com as escolhas desta aula.", ...notes].join(" "),
      };
    const stored = proposeItems(p, "Cortes da aula", items, PREPARE_AUTHOR);
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

/** Whether `fn` left a draft of "Preparar aula" waiting. */
const drafted = (): boolean => {
  const { draft, project } = useProject.getState();
  return !!draft && draft.author === PREPARE_AUTHOR && draft.projectId === project?.id;
};

const draftOr = (note: string, none: string): Outcome =>
  drafted()
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

async function runner(step: PrepareStep, p: Project): Promise<Outcome> {
  const reason = skipReason(p, step);
  if (reason) return { kind: "decided", decision: "skipped", note: reason };
  const other = useProject.getState().draft;
  if (DRAFT_STEPS.has(step) && other && other.projectId === p.id && other.author !== PREPARE_AUTHOR)
    return {
      kind: "blocked",
      note: `Há um rascunho de outra ferramenta esperando revisão ("${other.title}"). Aplique ou descarte esse rascunho e continue.`,
    };
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
      if (pendingReview(p) === "proposal")
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
      const r = await placeInserts("all", commit(step), shownProject);
      if (!r.ok) return { kind: "decided", decision: "skipped", note: r.message };
      return draftOr(r.message, "As falas do apresentador já estavam no lugar.");
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
      const done = await applyTemplateParts(t, ["look"], commit(step));
      return draftOr(`Modelo do curso: ${done.join(", ")}.`, "A aula já segue o modelo do curso.");
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
        commit(step),
      );
      return draftOr(`Zoom automático: ${done.join(", ")}.`, "Nenhum clique para dar zoom.");
    }
    case "annotations": {
      const t = await courseTemplate(p.course);
      const { list, problem } = await directionAnnotations(shownProject() ?? p, t);
      if (problem) return { kind: "decided", decision: "skipped", note: problem };
      if (!list.length)
        return {
          kind: "decided",
          decision: "done",
          note: 'Nenhum "Na tela" do roteiro para anotar.',
        };
      const n = await addDirectionAnnotations(list, t, commit(step));
      return draftOr(
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
      setCaptions(style, commit(step));
      return draftOr(
        `Legenda gravada no vídeo${t?.captions ? ", no estilo do curso" : ""}.`,
        "A legenda já estava como o curso pede.",
      );
    }
    case "cards": {
      const t = await courseTemplate(p.course);
      const done = await applyTemplateParts(
        {
          version: 2,
          format: p.settings,
          ...t,
          cards: t?.cards ?? { opening: true, closing: true },
        },
        ["cards"],
        commit(step),
      );
      return draftOr(`Cartelas: ${done.join(" e ")}.`, "A aula já tem as cartelas.");
    }
    case "check": {
      let loudness: Loudness | null = null;
      try {
        loudness = await measureLoudness(p);
      } catch (err) {
        useApp.getState().toast(`O volume não pôde ser medido: ${cleanError(err)}`, "error");
      }
      const findings = await checkLesson(useProject.getState().project ?? p, {
        loudness,
        normalize: true,
      });
      usePrepare.setState({ findings });
      const errors = findings.filter((f) => f.severity === "error").length;
      const warnings = findings.filter((f) => f.severity === "warn").length;
      return {
        kind: "decided",
        decision: "done",
        note:
          errors || warnings
            ? `${errors ? `${plural(errors, "problema", "problemas")} e ` : ""}${plural(warnings, "aviso", "avisos")} para olhar antes de exportar.`
            : "Nada a corrigir antes de exportar.",
      };
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
      usePrepare.setState({
        waiting: { step, what: review },
        message: `Revise ${review === "draft" ? "o rascunho" : "a proposta"} na barra de revisão.`,
      });
      return `Etapa ${PREPARE_STEPS.indexOf(step) + 1} (${PREPARE_LABEL[step]}) esperando a revisão.`;
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

/** Opens the "Preparar aula" panel and runs (or resumes) the pipeline. */
export function openPrepare(): void {
  usePrepare.setState({ offer: false });
  useApp.getState().set({ sideTab: "prepare" });
  void runPrepare();
}

/** The person skips the waiting step: what it proposed is discarded. */
export function skipPrepareStep(): void {
  const p = useProject.getState().project;
  const step = resumeStep(stateOf(p));
  if (!p || !step) return;
  const review = pendingReview(p);
  if (review === "draft") useProject.getState().discardDraft();
  if (review === "proposal")
    useProject.getState().setProposals((list) => list.filter((x) => x.by !== PREPARE_AUTHOR));
  keep(decide(stateOf(p), step, "skipped", "Pulada."));
  usePrepare.setState({ waiting: null, message: null });
  void runPrepare();
}

/** Opens a decided step again (and every step after it). */
export function redoPrepareStep(step: PrepareStep): void {
  const p = useProject.getState().project;
  if (!p) return;
  keep(reopen(stateOf(p), step));
  usePrepare.setState({
    waiting: null,
    message: null,
    findings: step === "check" ? null : usePrepare.getState().findings,
  });
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

/**
 * Wires the pipeline: a draft or proposal of "Preparar aula" resolved in the review bar decides
 * its step (applied is done, discarded is skipped) and the next step runs; a take that comes in
 * offers "Preparar aula". Returns the unsubscribe.
 */
export function listenPrepare(): () => void {
  const stopReview = onReviewResolved((r) => {
    if (r.author !== PREPARE_AUTHOR) return;
    const { waiting } = usePrepare.getState();
    const p = useProject.getState().project;
    const step = resumeStep(stateOf(p));
    if (!p || !step || (waiting && waiting.step !== step)) return;
    keep(
      decide(
        stateOf(p),
        step,
        r.outcome === "applied" ? "done" : "skipped",
        r.outcome === "applied"
          ? (usePrepare.getState().message ?? undefined)
          : "Descartada na revisão.",
      ),
    );
    usePrepare.setState({ waiting: null, message: null });
    void runPrepare();
  });
  const stopImport = onRecordingImported(() => {
    const p = useProject.getState().project;
    if (p && !stateOf(p)) usePrepare.setState({ offer: true });
  });
  const stopProject = useProject.subscribe((s, prev) => {
    if (s.project?.id !== prev.project?.id)
      usePrepare.setState({
        running: null,
        waiting: null,
        message: null,
        offer: false,
        findings: null,
      });
  });
  return () => {
    stopReview();
    stopImport();
    stopProject();
  };
}
