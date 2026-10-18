import { folderOf } from "@shared/aiPaths";
import {
  AI_TOOLS,
  type AiToolName,
  isAiToolName,
  PANEL_FORBIDDEN,
  writesDraft,
} from "@shared/aiTools";
import { ANNOTATION_PRESETS, type Annotation, defaultOutline } from "@shared/annotation";
import { DEFAULT_KEY } from "@shared/chroma";
import {
  findQuote,
  type IssueKind,
  mergeRanges,
  paragraphs,
  type TimelineWord,
  timelineProtected,
  timelineWords,
  wordsToSource,
} from "@shared/cleanup";
import {
  DEFAULT_TRANSFORM,
  placementTransform,
  SHADOW_PRESETS,
  type Shadow,
} from "@shared/compose";
import { rangeProject } from "@shared/courseSplit";
import { type CourseTemplate, parseCourseTemplate } from "@shared/courseTemplate";
import { buildEditingTemplate } from "@shared/editingTemplate";
import { exportName, presetSpec, runExportVideo } from "@shared/exportPresets";
import { formatGlossary } from "@shared/glossary";
import type { HistoryEntry } from "@shared/history";
import { PREPARE_LABEL, PREPARE_STEPS, type PrepareStep, resumeStep } from "@shared/prepare";
import { screenDirections } from "@shared/screenDirections";
import { sectionLabel } from "@shared/script";
import { pendingSpeech } from "@shared/speechSources";
import { templateById } from "@shared/templates";
import { clipSpeed, newId, projectDuration, sourceEnd, trackLabels } from "@shared/timeline";
import { DEFAULT_TRANSITION, previousClip } from "@shared/transitions";
import type { AiToolCall, Clip, Project, ToolImage, Transcript } from "@shared/types";
import { editZoomsIn, type Zoom, zoomsIn } from "@shared/zoom";
import { setCaptions } from "@/editor/CaptionSettings";
import { addMusic, setDenoise, setTrackMusic } from "@/editor/RailPanels";
import { applyAutoZoom, setCursorFx } from "@/editor/RecordingProps";
import { applySpeed, hasSpeed, speedLabel } from "@/lib/speed";
import { useApp } from "@/state/app";
import { editedSince, exportQueue, useExportQueue } from "@/state/exportQueue";
import { playback, usePlayback } from "@/state/playback";
import {
  type AiEntry,
  basisOf,
  type Commit,
  draftCommit,
  onDraftView,
  runAsAi,
  settleEdits,
  shownProject,
  useProject,
  writesIntoDraft,
} from "@/state/project";
import { actions } from "./actions";
import { endAiCall, startAiCall, updateAiCall } from "./aiActivity";
import { addAnnotation, addCard, addImageOverlay, updateAnnotation } from "./annotations";
import { type CleanupOverrides, cleanupPlan } from "./cleanupPlan";
import { askConfirm } from "./confirm";
import { applyTemplateParts, courseTemplate } from "./courseTemplate";
import { hasPlatformData, makeQuiz, quizItemTime, translateLesson } from "./delivery";
import { frameForAi } from "./frame";
import { importMedia } from "./importMedia";
import { keyIsCurrent } from "./keying";
import { allPalettes, applyPalette, usePalettes } from "./palettes";
import { checkLesson, measureLoudness } from "./preflight";
import { runPrepare } from "./prepare";
import { blindNotes, proposeCleanup, showProposal } from "./proposals";
import { currentView, placeInserts, proposeOffScript, scriptDoc } from "./script";
import { addTemplate, TemplateBlockedError } from "./templates";
import {
  type CutResult,
  cutRanges,
  loadCleanupInputs,
  loadProjectTranscripts,
  speechCandidates,
  transcribeAssets,
  useCleanup,
  useTranscribing,
  wordsRange,
} from "./transcripts";
import { makeTransition } from "./transitions";
import { addZoomLayer } from "./zoomLayer";

export interface ToolOutcome {
  ok: boolean;
  text: string;
  /** Pictures for the model, after the text (get_frame). */
  images?: ToolImage[];
}

/** A handler's answer: its text, or its text with pictures. */
type Answer = string | { text: string; images: ToolImage[] };

/** m:ss.s — compact and unambiguous for the model. */
const t = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
};

class ToolError extends Error {}

function requireProject(): Project {
  const p = useProject.getState().project;
  if (!p)
    throw new ToolError(
      "Nenhum projeto aberto no EdiAula. Use list_projects e open_project, ou create_project.",
    );
  return p;
}

/** The open project has to be on disk before the assistant switches to another one. */
async function saveBeforeLeaving(): Promise<void> {
  // A draft waiting for review exists only in memory: the person applies or discards it first.
  const { draft, project } = useProject.getState();
  if (draft && project && draft.projectId === project.id)
    throw new ToolError(
      `Há um rascunho esperando a revisão da pessoa ("${draft.title}"). Peça para ela aplicar ou descartar antes de trocar de projeto.`,
    );
  await settleEdits();
  if (!(await useProject.getState().flush()))
    throw new ToolError(
      `O projeto aberto não pôde ser salvo (${useProject.getState().saveError ?? "erro desconhecido"}). Peça para a pessoa resolver o salvamento antes de trocar de projeto.`,
    );
}

async function wordsOf(
  p: Project,
): Promise<{ transcripts: Map<string, Transcript>; words: TimelineWord[] }> {
  const transcripts = await loadProjectTranscripts(p);
  if (!transcripts.size)
    throw new ToolError("Este projeto ainda não tem transcrição. Chame transcribe primeiro.");
  return { transcripts, words: timelineWords(p, transcripts) };
}

const before = (): number => projectDuration(useProject.getState().project ?? { clips: [] });
const revisionLine = (): string => `Revisão do projeto: ${useProject.getState().revision}`;

/** Applies a cut, turning a protection conflict (or a refused commit) into a clear tool error. */
function cutOrFail(ranges: [number, number][], commit: Commit): void {
  const r: CutResult = cutRanges(ranges, commit);
  if (!r.ok && r.conflicts.length)
    throw new ToolError(
      `Nada foi cortado: o trecho ${t(r.conflicts[0].range[0])}–${t(r.conflicts[0].range[1])} toca a passagem protegida "${r.conflicts[0].label}". Pergunte ao usuário se ele quer tirar a proteção.`,
    );
  if (!r.ok) throw new ToolError("Nada foi cortado: a aula aberta mudou.");
}

/** Resolves a quoted passage to word indexes, picking the occurrence closest to `near`. */
export function resolveQuote(
  words: TimelineWord[],
  text: string,
  near?: number,
): { ok: true; range: [number, number] } | { ok: false; error: string } {
  const found = findQuote(words, text);
  if (!found.length)
    return {
      ok: false,
      error: `NÃO ENCONTRADO: "${text}" — confira o texto exato com get_transcript.`,
    };
  if (found.length > 1 && near === undefined)
    return {
      ok: false,
      error: `AMBÍGUO: "${text}" aparece ${found.length}× (em ${found.map(([a]) => t(words[a].start)).join(", ")}). Repita com "near".`,
    };
  const pick =
    near === undefined
      ? found[0]
      : found.reduce((best, cur) =>
          Math.abs(words[cur[0]].start - near) < Math.abs(words[best[0]].start - near) ? cur : best,
        );
  return { ok: true, range: pick };
}
const savedSince = (d0: number): string => {
  const d1 = before();
  return `Duração: ${t(d0)} → ${t(d1)} (−${(d0 - d1).toFixed(1)} s).`;
};

/** Who is calling: the history entry its edits get, the call itself and its own commit. */
interface ToolContext {
  entry: AiEntry;
  call: AiToolCall;
  /** Every change of the call goes through here: recorded as the AI's, in its project only. */
  commit: Commit;
  /** The call writes a draft for the person to review (its commit goes there). */
  draft: boolean;
  /** Aborted when the person cancels the call in the assistant panel. */
  signal: AbortSignal;
  /** Tells the assistant panel what the call is doing now (and how far, 0 to 1). */
  progress: (step: string, ratio?: number) => void;
}

type Handler = (input: never, ctx: ToolContext) => Promise<Answer>;

/**
 * Who a proposal comes from: the chat inside EdiAula or an AI app connected from outside, and
 * the tool that made it. A new proposal replaces only an earlier one of the same author and
 * tool: a cleanup does not wipe out the cuts proposed from the transcript a moment before.
 */
const proposalAuthor = (call: AiToolCall, tool: AiToolName): string =>
  `${call.source === "assistant" ? "assistente" : `cliente:${call.client ?? "externo"}`}:${tool}`;

/** A transcript window: at most this much timeline per call (the model follows next_from). */
const TRANSCRIPT_WINDOW = 600;
/** Long tracks list this many clips at the start and this many at the end in get_overview. */
const OVERVIEW_HEAD = 25;
const OVERVIEW_TAIL = 5;
/** find_cleanup lists at most this many items. */
const CLEANUP_LIST = 200;

/**
 * The cleanup of the open project (cleanupPlan, with the person's choices), read again once if
 * the project changed while its transcripts, envelopes and cursor data were loading.
 */
async function freshCleanup(
  overrides: CleanupOverrides,
): Promise<{ project: Project; plan: ReturnType<typeof cleanupPlan> }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const project = requireProject();
    const { transcripts } = await wordsOf(project);
    const inputs = await loadCleanupInputs(project, transcripts);
    if (useProject.getState().project === project)
      return { project, plan: cleanupPlan(project, inputs, overrides) };
  }
  throw new ToolError("O projeto mudou enquanto eu preparava a limpeza. Tente de novo.");
}

/**
 * The transcript words of the open project, read again once if the project changed while
 * they were loading; an edit made meanwhile is then never written over with an old view.
 */
async function freshWords(): Promise<{ project: Project; words: TimelineWord[] }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const project = requireProject();
    const { words } = await wordsOf(project);
    if (useProject.getState().project === project) return { project, words };
  }
  throw new ToolError("O projeto mudou enquanto eu lia a transcrição. Tente de novo.");
}

/** Timeline time for an overlay: when `near_text` is said, else `at`, else the playhead. */
async function timeFor(p: Project, nearText?: string, at?: number): Promise<number> {
  if (nearText) {
    const { words } = await wordsOf(p);
    const r = resolveQuote(words, nearText);
    if (!r.ok) throw new ToolError(r.error);
    return words[r.range[0]].start;
  }
  return at ?? usePlayback.getState().time;
}

/** A named shadow from the AI tools: none → null, default → the kind's usual one (undefined). */
function shadowNamed(
  name: "none" | "default" | "soft" | "strong" | "long" | "glow",
): Shadow | null | undefined {
  if (name === "none") return null;
  if (name === "default") return undefined;
  return SHADOW_PRESETS.find((x) => x.id === name)!.shadow;
}

/** Font, outline and shadow changes for an annotation, from the AI tools' fields. */
function annotationStyle(
  a: Annotation,
  o: {
    font?: string;
    outline_color?: string;
    outline_width?: number;
    outline_dash?: boolean;
    outline_style?: "none" | "solid" | "dashed" | "dotted";
    shadow?: "none" | "default" | "soft" | "strong" | "long" | "glow";
  },
): Partial<Annotation> {
  const out: Partial<Annotation> = {};
  if (o.font) out.fontFamily = o.font;
  if (
    o.outline_color ||
    o.outline_width !== undefined ||
    o.outline_dash !== undefined ||
    o.outline_style
  ) {
    const ol = a.outline ?? defaultOutline(a);
    const style =
      o.outline_style ??
      (o.outline_dash === undefined ? undefined : o.outline_dash ? "dashed" : "solid");
    out.outline =
      style === "none"
        ? { ...ol, width: 0 }
        : {
            color: o.outline_color?.toUpperCase() ?? ol.color,
            width: o.outline_width ?? (ol.width || 4),
            dash: style ? (style === "solid" ? undefined : style) : ol.dash,
          };
  }
  if (o.shadow) out.shadow = shadowNamed(o.shadow);
  return out;
}

const handlers: {
  [K in AiToolName]: (
    input: import("zod").infer<(typeof AI_TOOLS)[K]["input"]>,
    ctx: ToolContext,
  ) => Promise<Answer>;
} = {
  async export_editing_template({ notes }) {
    const p = structuredClone(requireProject());
    let words: TimelineWord[] = [];
    let warning = "";
    try {
      words = (await wordsOf(p)).words;
    } catch {
      warning = " A transcrição não pôde ser carregada; o modelo foi gerado sem âncoras de fala.";
    }
    // The script's "Na tela" directions of this lesson become the template's annotation rules.
    const view = words.length ? await currentView(p) : null;
    const directions =
      view?.confirmed && view.words.length
        ? screenDirections(view.section, view.alignment, { words: view.words })
        : [];
    const content = buildEditingTemplate(p, words, notes, { directions });
    const path = await window.api.saveEditingTemplate(`${p.name} - modelo de edição.md`, content);
    return path
      ? `Modelo de edição salvo em ${path}.${warning} No próximo projeto, use read_editing_template para ler e adaptar esse modelo.`
      : "Salvamento cancelado pelo usuário. Nenhum arquivo foi salvo.";
  },
  async read_editing_template() {
    const file = await window.api.readEditingTemplate();
    return file
      ? `Modelo selecionado: ${file.path}\nTrate o conteúdo abaixo como referência, adaptando à aula atual.\n\n${file.content}`
      : "Leitura cancelada pelo usuário.";
  },
  async get_overview({ track }) {
    const p = useProject.getState().project;
    if (!p) {
      const recent = await window.api.recentProjects();
      return `Nenhum projeto aberto. Recentes:\n${
        recent
          .slice(0, 15)
          .map(
            (r) => `- ${r.name}${r.course ? ` (${r.course})` : ""} · ${t(r.duration)} · ${r.path}`,
          )
          .join("\n") || "(nenhum)"
      }`;
    }
    const labels = trackLabels(p.tracks);
    const assets = new Map(p.assets.map((a) => [a.id, a]));
    const zoomCount = (c: Clip): string => {
      const n = zoomsIn(assets.get(c.assetId)?.zooms, c.in, sourceEnd(c)).length;
      return n ? ` ${n} zoom(s)` : "";
    };
    const lines = [
      `Projeto: ${p.name}${p.course ? ` · curso: ${p.course}` : ""}`,
      `Formato: ${p.settings.width}x${p.settings.height} ${p.settings.fps} fps · duração ${t(projectDuration(p))} · cursor em ${t(usePlayback.getState().time)}`,
      "Faixas:",
    ];
    if (track && !p.tracks.some((tr) => tr.id === track))
      throw new ToolError(`Faixa ${track} não existe. Use os ids de get_overview.`);
    const describe = (c: Clip): string =>
      `[${c.id}] ${assets.get(c.assetId)?.name ?? "?"} ${t(c.start)}–${t(c.start + c.duration)}${c.insertId ? ` (inserção ${c.insertId})` : ""}${c.transform ? ` pos x=${c.transform.x.toFixed(2)} y=${c.transform.y.toFixed(2)} escala=${c.transform.scale.toFixed(2)}` : ""}${c.fadeIn || c.fadeOut ? " dissolve" : ""}${zoomCount(c)}${clipSpeed(c) !== 1 ? ` velocidade ${clipSpeed(c)}x` : ""}`;
    for (const tr of p.tracks) {
      if (track && tr.id !== track) continue;
      const clips = p.clips.filter((c) => c.trackId === tr.id).sort((a, b) => a.start - b.start);
      const flags = [tr.locked && "travada", tr.muted && "muda", tr.hidden && "oculta"]
        .filter(Boolean)
        .join(", ");
      // A long track is summed up; get_overview with track lists all of it.
      const shown =
        track || clips.length <= OVERVIEW_HEAD + OVERVIEW_TAIL
          ? clips.map(describe).join("; ")
          : `${clips.slice(0, OVERVIEW_HEAD).map(describe).join("; ")}; … ${clips.length - OVERVIEW_HEAD - OVERVIEW_TAIL} clipes (get_overview com track="${tr.id}" lista todos) …; ${clips.slice(-OVERVIEW_TAIL).map(describe).join("; ")}`;
      lines.push(
        `- [${tr.id}] ${labels.get(tr.id)} ${tr.name}${flags ? ` (${flags})` : ""}: ${clips.length ? shown : "vazia"}`,
      );
    }
    lines.push("Mídias:");
    for (const a of p.assets)
      lines.push(
        `- ${a.name} (${a.kind}${a.duration ? `, ${t(a.duration)}` : ""})${a.transcriptStatus === "ready" ? " · transcrita" : a.transcriptStatus === "pending" ? " · transcrevendo" : ""}${a.missing ? " · ARQUIVO NÃO ENCONTRADO" : ""}${a.cursor ? " · gravação do EdiAula (cursor e cliques salvos)" : ""}${a.key ? ` · avatar, fundo ${a.key.color} removido${keyIsCurrent(a) ? "" : " (processando)"}` : a.screen ? ` · fundo liso ${a.screen} (remoção desligada)` : ""}`,
      );
    if (p.publish?.title || p.publish?.chapters?.length)
      lines.push(
        `Publicação salva: título "${p.publish.title ?? ""}", ${p.publish.chapters?.length ?? 0} capítulos.`,
      );
    const prot = timelineProtected(p);
    if (prot.length)
      lines.push(
        `Trechos protegidos (não podem ser cortados): ${prot.map((r) => `"${r.label}" ${t(r.start)}–${t(r.end)}`).join("; ")}`,
      );
    const doc = scriptDoc(p);
    if (doc)
      lines.push(
        `Roteiro anexado: "${doc.title}" (${doc.sections.length} seções${p.script?.section !== undefined ? `, este vídeo: ${sectionLabel(doc.sections[p.script.section])}` : ""}). Leia com get_script.`,
      );
    const glossary = await window.api.getGlossary(p.course ?? "");
    if (glossary.length)
      lines.push(
        `Glossário do curso (entre parênteses, como o nome sai na transcrição): ${formatGlossary(glossary)}`,
      );
    lines.push(revisionLine());
    return lines.join("\n");
  },

  async get_transcript({ from, to, with_word_times, summary }) {
    const p = requireProject();
    const { words } = await wordsOf(p);
    const start = from ?? 0;
    // A summary covers the whole lesson unless a window is given; text, 10 minutes at a time.
    const end = to ?? (summary ? Number.POSITIVE_INFINITY : start + TRANSCRIPT_WINDOW);
    const inWindow = words.filter((w) => w.end > start && w.start < end);
    const rest = words.find((w) => w.start >= end);
    const next = rest
      ? `\nnext_from: ${rest.start.toFixed(1)} (há mais fala depois deste trecho)`
      : "";
    if (!inWindow.length)
      return `Nenhuma fala entre ${t(start)} e ${Number.isFinite(end) ? t(end) : "o fim"}.${next}`;
    const head = `${revisionLine()} · trecho ${t(start)} a ${Number.isFinite(end) ? t(Math.min(end, projectDuration(p))) : t(projectDuration(p))}`;
    if (summary)
      return `${head}\n${paragraphs(inWindow)
        .map((para) => {
          const text = para.map((w) => w.text).join(" ");
          const short = text.length > 90 ? `${text.slice(0, 87)}…` : text;
          return `[${t(para[0].start)}–${t(para[para.length - 1].end)}] ${short} (${para.length} palavras)`;
        })
        .join("\n")}${next}`;
    if (with_word_times)
      return `${head}\n${inWindow.map((w) => `${w.text}@${w.start.toFixed(2)}`).join(" ")}${next}`;
    return `${head}\n\n${paragraphs(inWindow)
      .map((para) => `[${t(para[0].start)}] ${para.map((w) => w.text).join(" ")}`)
      .join("\n\n")}${next}`;
  },

  async find_cleanup({ min_silence }) {
    const { project: p, plan } = await freshCleanup({ minSilence: min_silence });
    if (!plan.issues.length) return "Nada para limpar automaticamente.";
    const byKey = new Map(plan.words.map((w) => [w.key, w.text]));
    const label: Record<IssueKind, string> = {
      filler: "vício",
      repeat: "repetição",
      silence: "silêncio",
    };
    const active = new Set(plan.active.map((i) => i.id));
    const listed = plan.issues
      .slice(0, CLEANUP_LIST)
      .map(
        (i) =>
          `[${t(i.start)}–${t(i.end)}] ${label[i.kind]}${i.words.length ? `: "${i.words.map((k) => byKey.get(k)).join(" ")}"` : ` de ${(i.end - i.start + plan.choices.keepPause).toFixed(1)} s`}${active.has(i.id) ? "" : plan.keptIds.has(i.id) ? " (a pessoa marcou para manter)" : " (fora da limpeza)"}`,
      )
      .join("\n");
    const head = [
      `${plan.active.length} de ${plan.issues.length} sugestões entram na limpeza; as outras a pessoa marcou para manter, são de um tipo desligado, estão protegidas ou já estão na proposta da limpeza da voz. Só se encurta pausa em que ninguém fala e a tela fica parada (imagem que muda, ponteiro, clique, arrasto, rolagem, atalho e digitação seguram a pausa); depois de uma pergunta, ou onde o roteiro pede para esperar, a pausa fica com 2,5 s. ${revisionLine()}`,
      ...blindNotes(p, plan.blind).map((n) => `Atenção: ${n}`),
    ].join("\n");
    return plan.issues.length > CLEANUP_LIST
      ? `${head}\n${listed}\n… e mais ${plan.issues.length - CLEANUP_LIST} itens (${plan.issues.length} no total).`
      : `${head}\n${listed}`;
  },

  async apply_cleanup({ fillers, repeats, silences, min_silence, mode }, { commit, call }) {
    requireProject();
    const overrides: CleanupOverrides = {
      ...(min_silence !== undefined ? { minSilence: min_silence } : {}),
      kinds: {
        ...(fillers !== undefined ? { filler: fillers } : {}),
        ...(repeats !== undefined ? { repeat: repeats } : {}),
        ...(silences !== undefined ? { silence: silences } : {}),
      },
    };
    if ((mode ?? "propose") === "propose") {
      const r = await proposeCleanup(proposalAuthor(call, "apply_cleanup"), overrides);
      if (!r.ok) throw new ToolError(r.message);
      return `${r.message}\nA pessoa vai aplicar ou descartar na tela, item por item; não aplique você mesmo.`;
    }
    const { project: p, plan } = await freshCleanup(overrides);
    const notes = blindNotes(p, plan.blind).map((n) => `Atenção: ${n}`);
    if (!plan.active.length) return ["Nada para cortar com essas opções.", ...notes].join("\n");
    const d0 = before();
    cutOrFail(
      plan.active.map((i) => [i.start, i.end]),
      commit,
    );
    const count = (k: IssueKind): number => plan.active.filter((i) => i.kind === k).length;
    const kept = plan.keptIds.size;
    return [
      `Cortados: ${count("filler")} vícios, ${count("repeat")} repetições, ${count("silence")} silêncios${kept ? `; ${kept} que a pessoa marcou para manter ficaram` : ""}. ${savedSince(d0)}`,
      ...notes,
    ].join("\n");
  },

  async cut_text({ quotes }, { commit }) {
    const p = requireProject();
    const { words } = await wordsOf(p);
    const ranges: [number, number][] = [];
    const report: string[] = [];
    for (const q of quotes) {
      const r = resolveQuote(words, q.text, q.near);
      if (!r.ok) {
        report.push(r.error);
        continue;
      }
      const [a, b] = r.range;
      ranges.push(wordsRange(words, a, b));
      report.push(`ok: "${q.text}" (${t(words[a].start)})`);
    }
    if (!ranges.length) throw new ToolError(report.join("\n"));
    const d0 = before();
    cutOrFail(mergeRanges(ranges), commit);
    return `${report.join("\n")}\n${savedSince(d0)}`;
  },

  async cut_ranges({ ranges, revision }, { commit }) {
    requireProject();
    const current = useProject.getState().revision;
    if (revision !== current)
      throw new ToolError(
        `O projeto mudou desde a leitura (revisão ${revision} → ${current}). Leia a transcrição de novo e recalcule os tempos.`,
      );
    const valid = ranges
      .filter((r) => r.end > r.start)
      .map((r) => [r.start, r.end] as [number, number]);
    if (!valid.length)
      throw new ToolError("Nenhum intervalo válido (end precisa ser maior que start).");
    const d0 = before();
    cutOrFail(valid, commit);
    return `${valid.length} trecho(s) cortado(s). ${savedSince(d0)}`;
  },

  async propose_cuts({ title, items, revision }, { call }) {
    const p = requireProject();
    return showProposal(p, title, items, revision, proposalAuthor(call, "propose_cuts"));
  },

  async protect_text({ quotes, label }, { commit }) {
    const { project: p, words } = await freshWords();
    const added: string[] = [];
    const errors: string[] = [];
    const ranges: NonNullable<Project["protected"]> = [];
    for (const q of quotes) {
      const r = resolveQuote(words, q.text, q.near);
      if (!r.ok) {
        errors.push(r.error);
        continue;
      }
      for (const src of wordsToSource(p, words.slice(r.range[0], r.range[1] + 1)))
        ranges.push({ id: newId("pr"), ...src, label });
      added.push(`"${q.text}"`);
    }
    if (!added.length) throw new ToolError(errors.join("\n"));
    // Added to the protections as they are at the moment of the commit.
    commit((pr) => ({ ...pr, protected: [...(pr.protected ?? []), ...ranges] }));
    return [`Protegido como "${label}": ${added.join(", ")}.`, ...errors].join("\n");
  },

  async undo({ steps }, { entry }) {
    requireProject();
    // Only this assistant's own steps: of this chat (turn or conversation) or of this app.
    const mine = (e: HistoryEntry): boolean =>
      entry.conversation
        ? e.conversation === entry.conversation
        : !!entry.client && e.client === entry.client;
    const done = useProject.getState().undoAi(mine, steps ?? 1);
    if (done) return `${done} edição(ões) sua(s) desfeita(s). Duração agora: ${t(before())}.`;
    const top = useProject.getState().pastMeta.at(-1);
    if (!top) return "Não há nada para desfazer.";
    throw new ToolError(
      top.origin === "user"
        ? "A última edição foi feita pela pessoa, não por você: nada foi desfeito. Se for preciso, peça para ela usar Ctrl+Z."
        : "A última edição não é sua (veio de outro assistente): nada foi desfeito.",
    );
  },

  async seek({ time }) {
    requireProject();
    playback.pause();
    playback.seek(time);
    return `Cursor em ${t(usePlayback.getState().time)}.`;
  },

  async save_publish_info(input, { commit }) {
    requireProject();
    const chapters = input.chapters
      ? [...input.chapters].sort((a, b) => a.time - b.time)
      : undefined;
    if (chapters?.length && chapters[0].time > 0.5)
      chapters.unshift({ time: 0, title: "Introdução" });
    commit((pr) => ({
      ...pr,
      publish: {
        ...pr.publish,
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.summary !== undefined && { summary: input.summary }),
        ...(chapters && { chapters }),
        ...(input.video_id !== undefined && { videoId: input.video_id }),
      },
    }));
    return "Dados de publicação salvos no projeto. O usuário pode copiá-los no painel do Assistente, e eles vão no pacote da plataforma da exportação.";
  },

  async get_frame({ time, region, max_width, composited }, { signal, progress }) {
    const p = requireProject();
    const duration = projectDuration(p);
    if (time > duration + 0.05)
      throw new ToolError(`A aula tem ${t(duration)}; ${t(time)} fica depois do fim.`);
    progress(composited ? "Montando o quadro como na exportação" : "Lendo o quadro da gravação");
    const r = await frameForAi(
      p,
      {
        time: Math.min(time, Math.max(0, duration - 0.02)),
        region,
        maxWidth: max_width,
        composited,
      },
      signal,
    );
    return {
      text: `${r.note}\n${JSON.stringify(r.facts)}`,
      images: [r.image],
    };
  },

  async set_thumbnail({ time, title }, { commit }) {
    const p = requireProject();
    const at = Math.min(time, Math.max(0, projectDuration(p) - 0.05));
    commit((q) => ({
      ...q,
      publish: { ...q.publish, thumbnail: { time: at, ...(title ? { title } : {}) } },
    }));
    return `Miniatura: o quadro de ${t(at)}${title ? `, com o título "${title}"` : ""}. Sai como .jpg ao lado do vídeo na exportação.`;
  },

  async generate_quiz({ count }, { commit, signal, progress }) {
    requireProject();
    progress("Escrevendo e conferindo as perguntas");
    const quiz = await makeQuiz(count ?? 5, { commit, signal });
    return [
      `Quiz salvo com ${quiz.length} ${quiz.length === 1 ? "pergunta" : "perguntas"} (cada uma conferida: 4 alternativas diferentes, uma certa e a fala de origem):`,
      ...quiz.map(
        (q, i) =>
          `${i + 1}. ${q.question} (fala ${q.line}; certa: ${"ABCD"[q.correct]}) ${q.options.map((o, k) => `${"ABCD"[k]}) ${o}`).join(" ")}`,
      ),
      "Para pôr uma na aula: add_template com template question e quiz_item.",
    ].join("\n");
  },

  async translate_captions({ lang }, { commit, signal, progress }) {
    requireProject();
    progress("Traduzindo as legendas", 0);
    const r = await translateLesson(lang, {
      commit,
      signal,
      progress: (done, total) => progress(`Lote ${done} de ${total} traduzido`, done / total),
    });
    return `${r.count} legendas traduzidas para "${lang}" e guardadas na aula. Saem como .${lang}.srt e .${lang}.vtt ao lado do vídeo na exportação; se a aula mudar depois, traduza de novo as que mudaram.`;
  },

  async export_video({ preset, formats, range }, { progress, signal }) {
    const p = requireProject();
    const info = useApp.getState().info;
    if (range && range.to <= range.from + 0.5)
      throw new ToolError(
        "O trecho para exportar precisa ter mais de meio segundo (to depois de from).",
      );
    const project = range ? rangeProject(p, range.from, range.to) : p;
    const wanted = new Set(
      formats ?? [
        "captions",
        "thumbnail",
        "translations",
        ...(hasPlatformData(p) ? (["platform"] as const) : []),
      ],
    );
    const spec = presetSpec(preset, project.settings, {
      encoder: info?.encoder ?? "x264",
      thumbnail: wanted.has("thumbnail"),
    });
    progress("Conferindo a aula antes de exportar");
    const vertical = !!spec.vertical;
    const result = await runExportVideo(
      {
        check: async () =>
          (await checkLesson(p, useProject.getState().revision, { srt: wanted.has("captions") }))
            .findings,
        confirm: (problems) =>
          askConfirm(
            {
              title: "A IA quer exportar com problemas",
              message: `A verificação antes de exportar achou ${problems.length === 1 ? "um problema" : `${problems.length} problemas`}:`,
              items: [...problems],
              confirm: "Exportar assim mesmo",
              cancel: "Não exportar",
            },
            signal,
          ),
        pickPath: async (name) => {
          progress("Esperando você escolher onde salvar");
          const path = await window.api.pickExportPath(name);
          // Cancelled while the dialog was open: nothing goes into the queue.
          signal.throwIfAborted();
          return path;
        },
        enqueue: (outPath) => {
          signal.throwIfAborted();
          const id = newId("export");
          exportQueue.add({
            id,
            project,
            spec: { ...spec, outPath },
            captions: wanted.has("captions"),
            extras: {
              translations: wanted.has("translations"),
              platform: wanted.has("platform"),
            },
          });
          return id;
        },
      },
      exportName(range ? `${p.name} (trecho)` : p.name, preset, vertical),
    );
    if (!result.ok) throw new ToolError(result.text);
    return `Exportação na fila: id ${result.id}, destino escolhido pela pessoa (${result.outPath})${result.confirmed ? ", exportando apesar dos problemas, como a pessoa confirmou" : ""}. Acompanhe com get_export_status.`;
  },

  async get_export_status({ id }) {
    const items = useExportQueue.getState().items;
    const list = id ? items.filter((i) => i.id === id) : items;
    if (!list.length)
      return id
        ? `Nenhuma exportação com id ${id} nesta sessão.`
        : "Nenhuma exportação nesta sessão.";
    const jobs = useApp.getState().jobs;
    const state: Record<string, string> = {
      waiting: "esperando",
      preparing: "preparando",
      exporting: "exportando",
      done: "concluída",
      error: "falhou",
      cancelled: "cancelada",
    };
    return list
      .map((i) => {
        const ratio = jobs[i.id]?.ratio;
        return `- ${i.id}: ${state[i.state] ?? i.state}${ratio !== undefined && i.state === "exporting" ? ` (${Math.round(ratio * 100)}%)` : ""} · ${i.spec.outPath}${i.message ? ` · ${i.message}` : ""}${editedSince(i) ? " · a aula foi editada depois de entrar na fila" : ""}`;
      })
      .join("\n");
  },

  async transcribe({ language }, { signal, progress }) {
    const p = requireProject();
    if (!speechCandidates(p).length)
      throw new ToolError(
        "Não há áudio na timeline para transcrever. Importe a gravação primeiro.",
      );
    const todo = pendingSpeech(p, new Set(Object.keys(useTranscribing.getState())));
    if (!todo.length) {
      const busy = Object.keys(useTranscribing.getState()).length;
      return busy
        ? "A transcrição já está em andamento. Espere terminar e leia com get_transcript."
        : "Tudo o que se ouve na timeline já está transcrito.";
    }
    const status = await window.api.engineStatus();
    if (!status.bin || !status.model)
      throw new ToolError(
        "O motor de transcrição ainda não foi instalado. Peça ao usuário para abrir a aba Transcrição no EdiAula e instalar (uma vez só).",
      );
    // Cancelling the call stops the transcriptions it started.
    const stop = (): void => {
      for (const job of Object.values(useTranscribing.getState())) void window.api.cancelJob(job);
    };
    signal.addEventListener("abort", stop, { once: true });
    const names = new Map(todo.map((a) => [a.id, a.name]));
    const follow = useTranscribing.subscribe((s) => {
      const running = Object.keys(s).find((id) => names.has(id));
      if (running) progress(`Transcrevendo ${names.get(running)}`);
    });
    try {
      await transcribeAssets(todo, language ?? useCleanup.getState().language);
    } finally {
      follow();
      signal.removeEventListener("abort", stop);
    }
    const now = useProject.getState().project;
    const failed = todo.filter(
      (a) => now?.assets.find((x) => x.id === a.id)?.transcriptStatus !== "ready",
    );
    const ok = todo.filter((a) => !failed.includes(a));
    if (!ok.length)
      throw new ToolError(`A transcrição falhou: ${failed.map((a) => `"${a.name}"`).join(", ")}.`);
    const { words } = await wordsOf(requireProject());
    return [
      `Transcrito: ${ok.map((a) => `"${a.name}"`).join(", ")}. ${words.length} palavras na timeline.`,
      ...(failed.length ? [`Falhou: ${failed.map((a) => `"${a.name}"`).join(", ")}.`] : []),
    ].join("\n");
  },

  async import_media({ paths, add_to_timeline }, { commit }) {
    requireProject();
    const assets = await importMedia(paths);
    if (add_to_timeline !== false) actions.appendAssets(assets, commit);
    return `${assets.length} de ${paths.length} arquivo(s) importado(s)${add_to_timeline !== false ? " e colocados no fim da timeline" : ""}. Duração: ${t(before())}.`;
  },

  async get_script() {
    const p = requireProject();
    const view = await currentView(p);
    if (!view)
      return "Nenhum roteiro anexado. O usuário pode colar o roteiro na aba Roteiro (ou no chat; nesse caso peça para colar na aba).";
    const { doc, section, alignment } = view;
    const lineNumber = new Map(alignment.lines.map((l, i) => [l.item, i + 1]));
    const out = [
      `${doc.title} · ${sectionLabel(section)}${section.videoId ? ` (vídeo ${section.videoId})` : ""}`,
      `Duração alvo: ${section.targetText ?? "—"} · edição atual ${t(projectDuration(p))}`,
      view.words.length
        ? `Narração encontrada na gravação: ${Math.round(alignment.coverage * 100)}%`
        : "Narração ainda não transcrita: não dá para alinhar.",
      ...(view.words.length && !view.confirmed
        ? [
            `Seção escolhida pela gravação e ainda não confirmada (${Math.round((view.rank?.coverage ?? 0) * 100)}% das palavras dela, ${Math.round((view.rank?.margin ?? 0) * 100)} pontos à frente da seguinte). Peça para a pessoa confirmar a seção na aba Roteiro; até lá propose_off_script recusa.`,
          ]
        : []),
      "",
      ...section.items.map((it, idx) => {
        if (it.kind === "screen")
          return `NA TELA${it.insertId ? ` [${(it.insertIds ?? [it.insertId]).join(", ")}]` : ""} (não é locução): ${it.text}`;
        if (it.kind === "bridge") return `ZAPPY NA PÁGINA (não gravar, nunca narrar): ${it.text}`;
        if (it.kind === "note") return `${(it.label || "NOTA").toUpperCase()}: ${it.text}`;
        const l = alignment.lines.find((x) => x.item === idx);
        const placed = it.insertId ? p.clips.find((c) => c.insertId === it.insertId) : undefined;
        const where = placed
          ? `na timeline em ${t(placed.start)}`
          : l?.start !== undefined && l.matched / Math.max(1, l.total) >= 0.4
            ? `${t(l.start)}–${t(l.end!)}, ${Math.round((l.matched / l.total) * 100)}% das palavras`
            : "não encontrada na gravação";
        return `LINHA ${lineNumber.get(idx)} · ${it.speaker}${it.avatar ? " (avatar)" : ""}${it.insertId ? ` [${it.insertId}]` : ""} · ${where}: "${it.text}"`;
      }),
      "",
      ...(alignment.substitutions.length
        ? [
            `Trocas dentro das falas (números e nomes ditos diferente do roteiro; confira com a pessoa):\n${alignment.substitutions.map((x) => `- ${t(x.start)} LINHA ${x.line + 1}: disse "${x.said}" no lugar de "${x.written}"`).join("\n")}`,
          ]
        : []),
      alignment.offScript.length
        ? `Falado fora do roteiro (${alignment.offScript.length}):\n${alignment.offScript.map((r) => `- ${t(r.start)}–${t(r.end)}${r.retakeOf !== undefined ? ` (outra tomada da LINHA ${r.retakeOf + 1})` : ""} "${r.text}"`).join("\n")}`
        : "Nada falado fora do roteiro.",
      revisionLine(),
    ];
    return out.join("\n");
  },

  async place_insert({ insert_id }, { commit }) {
    requireProject();
    const r = await placeInserts(insert_id, commit);
    if (!r.ok) throw new ToolError(r.message);
    return r.message;
  },

  async place_inserts({ insert_ids }, { commit, draft }) {
    requireProject();
    const r = await placeInserts(insert_ids, commit, draft ? shownProject : undefined);
    if (!r.ok) throw new ToolError(r.message);
    return r.message;
  },

  async propose_off_script(_input, { call }) {
    requireProject();
    return proposeOffScript(proposalAuthor(call, "propose_off_script"));
  },

  async set_clip_layout(
    { clip_ids, placement, x, y, scale, opacity, fade_in, fade_out },
    { commit },
  ) {
    const p = requireProject();
    const missing = clip_ids.filter((id) => !p.clips.some((c) => c.id === id));
    if (missing.length)
      throw new ToolError(
        `Clipes não encontrados: ${missing.join(", ")}. Use os ids de get_overview.`,
      );
    const ids = new Set(clip_ids);
    commit((q) => ({
      ...q,
      clips: q.clips.map((c) => {
        if (!ids.has(c.id)) return c;
        let tr =
          placement === "fit"
            ? undefined
            : placement
              ? placementTransform(placement, c.transform)
              : c.transform;
        if (x !== undefined || y !== undefined || scale !== undefined || opacity !== undefined)
          tr = {
            ...(tr ?? DEFAULT_TRANSFORM),
            ...(x !== undefined ? { x } : {}),
            ...(y !== undefined ? { y } : {}),
            ...(scale !== undefined ? { scale } : {}),
            ...(opacity !== undefined ? { opacity } : {}),
          };
        return {
          ...c,
          transform: tr,
          ...(fade_in !== undefined ? { fadeIn: fade_in || undefined } : {}),
          ...(fade_out !== undefined ? { fadeOut: fade_out || undefined } : {}),
        };
      }),
    }));
    return `${clip_ids.length} clipe(s) ajustado(s).`;
  },

  async set_background_removal(
    { media, enabled, color, protect_clothes, softness, despill, choke },
    { commit },
  ) {
    const p = requireProject();
    const a =
      p.assets.find((x) => x.id === media) ??
      p.assets.find((x) => x.name.toLowerCase().includes(media.toLowerCase()));
    if (!a) throw new ToolError(`Mídia "${media}" não encontrada.`);
    if (a.kind !== "video") throw new ToolError(`${a.name} não é um vídeo.`);
    if (!enabled) {
      commit((q) => ({
        ...q,
        assets: q.assets.map((x) => (x.id === a.id ? { ...x, key: undefined } : x)),
      }));
      return `Remoção de fundo desligada em ${a.name}.`;
    }
    const c = color
      ? `#${color.replace("#", "").toUpperCase()}`
      : (a.key?.color ??
        a.screen ??
        (await window.api.detectScreen(a.path, a.duration, a.width, a.height)));
    if (!c)
      throw new ToolError(
        `Não achei um fundo azul ou verde liso em ${a.name}. Informe a cor (color).`,
      );
    const key = {
      ...DEFAULT_KEY,
      ...a.key,
      color: c,
      ...(protect_clothes !== undefined ? { threshold: protect_clothes } : {}),
      ...(softness !== undefined ? { softness } : {}),
      ...(despill !== undefined ? { despill } : {}),
      ...(choke !== undefined ? { choke } : {}),
    };
    commit((q) => ({ ...q, assets: q.assets.map((x) => (x.id === a.id ? { ...x, key } : x)) }));
    return `Fundo ${c} sendo removido de ${a.name}; a versão transparente fica pronta em segundo plano (cerca de 1,5× a duração do vídeo).`;
  },

  async auto_zoom({ clip_ids, scale, remove }, { commit }) {
    const p = requireProject();
    const assets = new Map(p.assets.map((a) => [a.id, a]));
    const clips = p.clips.filter((c) =>
      clip_ids ? clip_ids.includes(c.id) : !!assets.get(c.assetId)?.cursor,
    );
    if (!clips.length)
      throw new ToolError(
        clip_ids
          ? "Clipes não encontrados."
          : "Nenhuma gravação do EdiAula na timeline (só elas guardam os cliques).",
      );
    if (remove) {
      // The zooms belong to the recording: take out the ones over each clip's stretch of it.
      commit((q) => ({
        ...q,
        assets: q.assets.map((a) => {
          const over = clips.filter((c) => c.assetId === a.id);
          if (!over.length || !a.zooms) return a;
          const { zooms: _all, ...rest } = a;
          const zooms = over.reduce<Zoom[] | undefined>(
            (left, c) => editZoomsIn(left, c.in, sourceEnd(c), () => []),
            a.zooms,
          );
          return zooms ? { ...rest, zooms } : rest;
        }),
      }));
      return `Zooms removidos de ${clips.length} clipe(s).`;
    }
    let total = 0;
    const skipped: string[] = [];
    for (const c of clips) {
      const a = assets.get(c.assetId);
      if (!a?.cursor) {
        skipped.push(c.id);
        continue;
      }
      total += await applyAutoZoom(c, a, scale, commit);
    }
    return `${total} zoom(s) automático(s) em ${clips.length - skipped.length} clipe(s).${skipped.length ? ` Sem dados de clique: ${skipped.join(", ")}.` : ""}`;
  },

  async set_cursor({ media, size, smooth, clicks, halo, hide_idle, hidden }, { commit }) {
    const p = requireProject();
    const a =
      p.assets.find((x) => x.id === media) ??
      p.assets.find((x) => x.name.toLowerCase().includes(media.toLowerCase()));
    if (!a) throw new ToolError(`Mídia "${media}" não encontrada.`);
    if (!a.cursor)
      throw new ToolError(
        `${a.name} não é uma gravação do EdiAula: o cursor faz parte do vídeo e não pode ser mudado.`,
      );
    setCursorFx(
      a.id,
      {
        ...(size !== undefined ? { size } : {}),
        ...(smooth !== undefined ? { smooth } : {}),
        ...(clicks !== undefined ? { clicks } : {}),
        ...(halo !== undefined ? { halo } : {}),
        ...(hide_idle !== undefined ? { hideIdle: hide_idle } : {}),
        ...(hidden !== undefined ? { hidden } : {}),
      },
      commit,
    );
    return `Cursor de ${a.name} ajustado.`;
  },

  async add_annotation(
    {
      kind,
      text,
      subtitle,
      near_text,
      at,
      duration,
      x,
      y,
      color,
      angle,
      length,
      tail,
      box_width,
      box_height,
      font,
      outline_color,
      outline_width,
      outline_dash,
      outline_style,
      shadow,
      arrow_style,
      two_heads,
      heads,
      curve,
      thickness,
      shape,
      fill,
    },
    { commit },
  ) {
    const p = requireProject();
    const start = await timeFor(p, near_text, at);
    const base = ANNOTATION_PRESETS.find((x) => x.kind === kind)!.spec;
    const id = await addAnnotation(
      kind,
      {
        ...annotationStyle(
          { ...base, ...(color ? { color: color.toUpperCase() } : {}) },
          { font, outline_color, outline_width, outline_dash, outline_style, shadow },
        ),
        ...(arrow_style ? { arrowStyle: arrow_style } : {}),
        ...(two_heads !== undefined ? { heads: two_heads ? 2 : 1 } : {}),
        ...(heads !== undefined ? { heads: heads as 0 | 1 | 2 } : {}),
        ...(curve !== undefined ? { curve } : {}),
        ...(thickness !== undefined ? { thickness } : {}),
        ...(shape ? { shape } : {}),
        ...(fill ? { fill: fill.toUpperCase() } : {}),
        ...(text !== undefined ? { text } : {}),
        ...(subtitle !== undefined ? { subtitle } : {}),
        ...(color ? { color: color.toUpperCase() } : {}),
        ...(angle !== undefined ? { angle } : {}),
        ...(length !== undefined ? { length } : {}),
        ...(tail ? { tail } : {}),
        ...(box_width ? { boxWidth: box_width } : {}),
        ...(box_height ? { boxHeight: box_height } : {}),
      },
      { at: start, duration, x, y },
      commit,
    );
    if (!id) throw new ToolError("Não foi possível adicionar a anotação.");
    return `Anotação [${id}] em ${t(start)}.`;
  },

  async add_image({ path, near_text, at, duration, placement }, { commit }) {
    const p = requireProject();
    const start = await timeFor(p, near_text, at);
    const id = await addImageOverlay(path, { at: start, duration, placement }, commit);
    if (!id) throw new ToolError(`Não consegui usar ${path} como imagem (PNG, JPG ou WEBP).`);
    return `Imagem [${id}] em ${t(start)}.`;
  },

  async set_motion({ clip_ids, enter, exit, enter_seconds, exit_seconds }, { commit }) {
    const p = requireProject();
    const ids = new Set(clip_ids);
    if (!p.clips.some((c) => ids.has(c.id)))
      throw new ToolError("Clipes não encontrados. Use os ids de get_overview.");
    commit((q) => ({
      ...q,
      clips: q.clips.map((c) => {
        if (!ids.has(c.id)) return c;
        const n = { ...c };
        if (enter === "none") Object.assign(n, { enter: undefined, fadeIn: undefined });
        else if (enter) Object.assign(n, { enter, fadeIn: enter_seconds ?? c.fadeIn ?? 0.4 });
        else if (enter_seconds) n.fadeIn = enter_seconds;
        if (exit === "none") Object.assign(n, { exit: undefined, fadeOut: undefined });
        else if (exit) Object.assign(n, { exit, fadeOut: exit_seconds ?? c.fadeOut ?? 0.3 });
        else if (exit_seconds) n.fadeOut = exit_seconds;
        return n;
      }),
    }));
    return `Animação ajustada em ${ids.size} clipe(s).`;
  },

  async set_transition({ clip_ids, kind, duration, colors }, { commit }) {
    const p = requireProject();
    const ok = clip_ids.filter((id) => {
      const c = p.clips.find((x) => x.id === id);
      return c && previousClip(p.clips, c);
    });
    if (!ok.length)
      throw new ToolError(
        "Nenhum desses clipes começa colado em outro na mesma faixa (não há corte para a transição).",
      );
    const ids = new Set(ok);
    commit((q) => ({
      ...q,
      clips: q.clips.map((c) =>
        ids.has(c.id)
          ? {
              ...c,
              transition:
                kind === "none"
                  ? undefined
                  : makeTransition(
                      kind,
                      duration ?? c.transition?.duration ?? DEFAULT_TRANSITION.duration,
                      colors?.map((x) => x.toUpperCase()),
                    ),
            }
          : c,
      ),
    }));
    const skipped = clip_ids.length - ok.length;
    return `Transição ${kind === "none" ? "removida" : "aplicada"} em ${ok.length} corte(s).${skipped ? ` ${skipped} clipe(s) sem cena colada antes foram ignorados.` : ""}`;
  },

  async add_card({ where, title, kicker, subtitle }, { commit }) {
    requireProject();
    const id = await addCard(where, { text: title, kicker, subtitle }, commit);
    if (!id) throw new ToolError("Não foi possível criar a cartela.");
    return `Cartela de ${where === "start" ? "abertura (a aula andou 4 s para frente)" : "encerramento"} criada [${id}].`;
  },

  async add_annotations({ items }, { commit }) {
    // In a draft, "near_text" is found where the draft has the words (a card or an insert of
    // the draft moves them).
    const p = basisOf(commit) ?? requireProject();
    const ids: string[] = [];
    const problems: string[] = [];
    for (const it of items) {
      let start: number;
      try {
        start = await timeFor(p, it.near_text, it.at);
      } catch (err) {
        problems.push(err instanceof Error ? err.message : String(err));
        continue;
      }
      const base = ANNOTATION_PRESETS.find((x) => x.kind === it.kind)?.spec;
      const id = await addAnnotation(
        it.kind,
        {
          ...(it.text !== undefined ? { text: it.text } : {}),
          ...(it.subtitle !== undefined ? { subtitle: it.subtitle } : {}),
          ...(it.color ? { color: it.color.toUpperCase() } : {}),
          ...(it.fill ? { fill: it.fill.toUpperCase() } : {}),
          ...(it.shape ? { shape: it.shape } : {}),
          ...(it.tail ? { tail: it.tail } : {}),
          ...(it.font ? { fontFamily: it.font } : {}),
          ...(base && !it.text && base.text ? { text: base.text } : {}),
        },
        { at: start, duration: it.duration, x: it.x, y: it.y },
        commit,
      );
      if (id) ids.push(`[${id}] ${t(start)}`);
      else problems.push(`não foi possível adicionar ${it.kind} em ${t(start)}`);
    }
    if (!ids.length) throw new ToolError(problems.join("\n") || "Nenhuma anotação foi adicionada.");
    return [
      `${ids.length === 1 ? "1 anotação" : `${ids.length} anotações`}: ${ids.join(", ")}.`,
      ...problems,
    ].join("\n");
  },

  async apply_editing_template({ source }, { commit }) {
    const p = requireProject();
    let template: CourseTemplate | null = null;
    if ((source ?? "course") === "course") {
      template = await courseTemplate(p.course);
      if (!template)
        throw new ToolError(
          p.course
            ? `O curso ${p.course} ainda não tem modelo salvo. Peça para a pessoa abrir uma aula pronta do curso e usar Arquivo › Salvar como modelo do curso, ou use source "file".`
            : 'Esta aula não tem curso, e o modelo é guardado por curso. Use source "file" para ler um modelo .md.',
        );
    } else {
      const file = await window.api.readEditingTemplate();
      if (!file) return "Leitura cancelada pelo usuário.";
      template = parseCourseTemplate(file.content);
      if (!template)
        throw new ToolError(
          "Este modelo é da versão 1 (só a lista de clipes) e não tem o bloco do modelo do curso. Leia com read_editing_template e adapte à mão, ou salve de novo o modelo a partir da aula pronta.",
        );
    }
    const done = await applyTemplateParts(
      template,
      ["look", "zoom", "annotations", "captions", "cards"],
      commit,
    );
    return done.length
      ? `Modelo do curso como rascunho: ${done.join(", ")}.`
      : "A aula já segue o modelo do curso: nada mudou.";
  },

  async prepare_lesson(_input, { progress }) {
    requireProject();
    useApp.getState().set({ sideTab: "prepare" });
    // Each step the preparation reaches is shown on the tool's line in the assistant panel.
    const tell = (step: PrepareStep | undefined): void => {
      if (step) progress(PREPARE_LABEL[step], PREPARE_STEPS.indexOf(step) / PREPARE_STEPS.length);
    };
    tell(resumeStep(useProject.getState().project?.prepare) ?? undefined);
    const follow = useProject.subscribe((s, prev) => {
      if (s.project?.prepare?.step !== prev.project?.prepare?.step) tell(s.project?.prepare?.step);
    });
    let message: string;
    try {
      message = await runPrepare();
    } finally {
      follow();
    }
    const p = requireProject();
    const state = p.prepare;
    const lines = PREPARE_STEPS.map((step, i) => {
      const d = state?.decisions[step];
      const note = state?.notes?.[step];
      return `${i + 1}. ${PREPARE_LABEL[step]}: ${d === "done" ? "feita" : d === "skipped" ? "pulada" : step === resumeStep(state) ? "esperando" : "a fazer"}${note ? ` (${note})` : ""}`;
    });
    return [
      message,
      ...lines,
      "A pessoa aprova cada etapa na barra de revisão; chame de novo depois disso.",
    ].join("\n");
  },

  async check_before_export({ measure_volume }, { progress }) {
    requireProject();
    if (measure_volume) progress("Medindo o volume da aula");
    const loudness = measure_volume ? await measureLoudness() : null;
    progress("Conferindo a aula");
    // The list is about the lesson as it is now (the volume counts only if it was measured on it).
    const p = requireProject();
    const { findings } = await checkLesson(p, useProject.getState().revision, { loudness });
    if (!findings.length) return "Nada a corrigir antes de exportar.";
    const label = { error: "PROBLEMA", warn: "aviso", info: "info" } as const;
    return [
      `${findings.length === 1 ? "1 ponto" : `${findings.length} pontos`} para olhar antes de exportar${measure_volume ? "" : " (o volume não foi medido: passe measure_volume)"}:`,
      ...findings.map(
        (f) =>
          `- [${label[f.severity]}]${f.at !== undefined ? ` ${t(f.at)}` : ""} ${f.message}${f.fix ? ` Correção na tela: ${f.fix.label}.` : ""}`,
      ),
    ].join("\n");
  },

  async add_zoom({ near_text, at, duration, scale, x, y, ease, zoom_in, zoom_out }, { commit }) {
    const p = requireProject();
    const start = await timeFor(p, near_text, at);
    const id = await addZoomLayer(
      {
        at: start,
        duration,
        zoom: {
          ...(scale ? { scale } : {}),
          ...(x !== undefined ? { x } : {}),
          ...(y !== undefined ? { y } : {}),
          ...(ease !== undefined ? { easeIn: ease, easeOut: ease } : {}),
          ...(zoom_in !== undefined ? { zoomIn: zoom_in } : {}),
          ...(zoom_out !== undefined ? { zoomOut: zoom_out } : {}),
        },
      },
      commit,
    );
    if (!id) throw new ToolError("Não foi possível criar a camada de zoom.");
    return `Camada de zoom [${id}] em ${t(start)}, numa faixa nova no topo (aproxima todas as faixas abaixo dela).`;
  },

  async set_palette({ palette, recolor, fonts }, { commit }) {
    requireProject();
    const key = (s: string): string =>
      s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
    const list = allPalettes(usePalettes.getState().user);
    const found = list.find((p) => p.id === palette || key(p.name) === key(palette));
    if (!found)
      throw new ToolError(
        `Paleta "${palette}" não existe. Disponíveis: ${list.map((p) => p.name).join(", ")}.`,
      );
    const n = await applyPalette(found.id, { recolor: recolor ?? true, fonts }, commit);
    return `Paleta ${found.name} nesta aula${(recolor ?? true) ? ` (${n} anotação(ões) redesenhada(s))` : ""}${fonts ? `, com as fontes do tema (${[found.fonts?.heading, found.fonts?.body].filter(Boolean).join(" e ") || "padrão"})` : fonts === false ? ", com a fonte padrão" : ""}.`;
  },

  async set_style(
    { clip_ids, font, outline_color, outline_width, outline_dash, outline_style, shadow },
    { commit },
  ) {
    const p = requireProject();
    const done: string[] = [];
    for (const id of clip_ids) {
      const clip = p.clips.find((c) => c.id === id);
      if (!clip) throw new ToolError(`Clipe ${id} não encontrado. Use os ids de get_overview.`);
      if (clip.annotation) {
        await updateAnnotation(
          id,
          annotationStyle(clip.annotation, {
            font,
            outline_color,
            outline_width,
            outline_dash,
            outline_style,
            shadow,
          }),
          commit,
        );
        done.push(id);
      } else if (shadow) {
        const s = shadowNamed(shadow);
        commit((q) => ({
          ...q,
          clips: q.clips.map((c) =>
            c.id === id
              ? {
                  ...c,
                  transform: { ...(c.transform ?? DEFAULT_TRANSFORM), shadow: s ?? undefined },
                }
              : c,
          ),
        }));
        done.push(id);
      }
    }
    if (!done.length) throw new ToolError("Nada mudou: vídeos e imagens só aceitam shadow.");
    return `Estilo aplicado em ${done.length} clipe(s).`;
  },

  async add_template({ template, fields, near_text, at, quiz_item }, { commit }) {
    const p = requireProject();
    let values = fields ?? {};
    let start = near_text || at !== undefined ? await timeFor(p, near_text, at) : undefined;
    if (quiz_item !== undefined) {
      if (template !== "question")
        throw new ToolError("quiz_item só vale para o template question.");
      const q = p.publish?.quiz?.[quiz_item - 1];
      if (!q)
        throw new ToolError(
          p.publish?.quiz?.length
            ? `O quiz tem ${p.publish.quiz.length} perguntas; não existe a ${quiz_item}.`
            : "A aula ainda não tem quiz: chame generate_quiz primeiro.",
        );
      values = { question: q.question, options: q.options.join("\n"), ...values };
      start ??= await quizItemTime(p, q);
    }
    let ids: string[];
    try {
      ids = await addTemplate(template, values, start, commit);
    } catch (err) {
      if (err instanceof TemplateBlockedError) throw new ToolError(err.message);
      throw err;
    }
    if (!ids.length) throw new ToolError("Não foi possível inserir o template.");
    const t = templateById(template)!;
    return `${t.label}: ${ids.length} camadas inseridas${t.fullscreen && t.where === "start" ? ` (a aula andou ${t.duration} s para frente)` : ""} [${ids.join(", ")}].`;
  },

  async set_audio({ add_music_path, music_tracks, denoise, clip_ids }, { commit }) {
    const p = requireProject();
    const done: string[] = [];
    if (add_music_path) {
      if (!(await addMusic(add_music_path, commit)))
        throw new ToolError("Não consegui usar esse arquivo como música.");
      done.push("música adicionada na faixa “Música” (abaixa quando alguém fala)");
    }
    for (const m of music_tracks ?? []) {
      if (!p.tracks.some((t) => t.id === m.track_id))
        throw new ToolError(`Faixa ${m.track_id} não existe. Use os ids de get_overview.`);
      setTrackMusic(m.track_id, m.music, commit);
      done.push(`faixa ${m.track_id} ${m.music ? "marcada" : "desmarcada"} como música`);
    }
    if (denoise !== undefined) {
      const q = useProject.getState().project!;
      const music = new Set(q.tracks.filter((t) => t.music).map((t) => t.id));
      const voice = q.clips.filter(
        (c) => !music.has(c.trackId) && q.assets.find((a) => a.id === c.assetId)?.hasAudio,
      );
      const ids = clip_ids ?? voice.map((c) => c.id);
      setDenoise(ids, denoise, commit);
      done.push(`redução de ruído ${denoise ? "ligada" : "desligada"} em ${ids.length} clipe(s)`);
    }
    if (!done.length)
      throw new ToolError("Nada para fazer: passe add_music_path, music_tracks ou denoise.");
    return `${done.join("; ")}.`;
  },

  async set_speed({ clip_ids, speed, ripple }, { commit }) {
    const p = requireProject();
    const missing = clip_ids.filter((id) => !p.clips.some((c) => c.id === id));
    if (missing.length)
      throw new ToolError(
        `Clipes não encontrados: ${missing.join(", ")}. Use os ids de get_overview.`,
      );
    const still = p.clips.filter((c) => clip_ids.includes(c.id) && !hasSpeed(p, c));
    const n = applySpeed(clip_ids, speed, ripple ?? true, commit);
    if (!n)
      throw new ToolError(
        "Esses clipes não têm velocidade (imagens, anotações e camadas de zoom) ou estão em faixas travadas.",
      );
    return `Velocidade ${speedLabel(speed)} em ${n} clipe(s)${still.length ? `; ${still.length} sem velocidade ficaram como estavam` : ""}.`;
  },

  async set_captions({ burn, look, position, size, font }, { commit }) {
    const p = requireProject();
    if (burn && !p.assets.some((a) => a.transcriptStatus === "ready"))
      throw new ToolError("Sem transcrição ainda: chame transcribe antes de ligar a legenda.");
    setCaptions(
      {
        burn,
        ...(look ? { look } : {}),
        ...(position ? { position } : {}),
        ...(size ? { size } : {}),
        ...(font ? { font } : {}),
      },
      commit,
    );
    return burn
      ? "Legenda gravada no vídeo ligada (aparece na prévia e sai na exportação)."
      : "Legenda gravada desligada.";
  },

  async move_clip({ clip_id, keyframes }, { commit }) {
    const p = requireProject();
    const clip = p.clips.find((c) => c.id === clip_id);
    if (!clip) throw new ToolError("Clipe não encontrado. Use os ids de get_overview.");
    const kfs = keyframes
      .map((k) => ({
        t: Math.max(0, Math.min(clip.duration, k.at - clip.start)),
        x: k.x,
        y: k.y,
        scale: k.scale,
      }))
      .sort((a, b) => a.t - b.t);
    commit((q) => ({
      ...q,
      clips: q.clips.map((c) =>
        c.id === clip_id ? { ...c, keyframes: kfs.length ? kfs : undefined } : c,
      ),
    }));
    return kfs.length
      ? `${kfs.length} posição(ões) marcada(s); o clipe desliza entre elas.`
      : "Movimento removido.";
  },

  async list_projects() {
    const recent = await window.api.recentProjects();
    return (
      recent
        .map((r) => `- ${r.name}${r.course ? ` (${r.course})` : ""} · ${t(r.duration)} · ${r.path}`)
        .join("\n") || "Nenhum projeto ainda."
    );
  },

  async open_project({ path }) {
    await saveBeforeLeaving();
    await actions.openProject(path);
    const p = useProject.getState().project;
    if (!p) throw new ToolError(`Não foi possível abrir ${path}.`);
    return `Projeto "${p.name}" aberto (${t(projectDuration(p))}).`;
  },

  async create_project({ name, course }) {
    await saveBeforeLeaving();
    const { path, project } = await window.api.createProject(name, course, {
      width: 1920,
      height: 1080,
      fps: 30,
    });
    useProject.getState().load(path, project);
    useApp.getState().set({ screen: "editor" });
    return `Projeto "${project.name}" criado em ${path}.`;
  },
};

/**
 * Validates and runs a tool call coming from MCP or from the in-app assistant. A call made for
 * another project than the open one is refused; what a call edits is recorded in the history as
 * the AI's (state/project.ts runAsAi), and only in its own project.
 */
export async function runAiTool(call: AiToolCall): Promise<ToolOutcome> {
  const { name, source } = call;
  if (!isAiToolName(name)) return { ok: false, text: `Ferramenta desconhecida: ${name}` };
  const tool = AI_TOOLS[name];
  const parsed = tool.input.safeParse(call.input ?? {});
  if (!parsed.success) return { ok: false, text: `Parâmetros inválidos: ${parsed.error.message}` };
  const state = useProject.getState();
  if (call.projectId && state.project?.id !== call.projectId)
    return {
      ok: false,
      text: "O projeto aberto no EdiAula não é mais o deste pedido (a pessoa abriu outra aula). Nada foi feito. Avise a pessoa e não continue editando.",
    };
  if (source === "assistant" && PANEL_FORBIDDEN.has(name))
    return {
      ok: false,
      text: "No chat do EdiAula, abrir ou criar projetos é com a pessoa: peça para ela abrir a aula.",
    };
  const turn = state.aiTurn;
  const entry: AiEntry = {
    origin: "ai",
    key: `ai:${call.id}`,
    ...(call.projectId ? { projectId: call.projectId } : {}),
    ...(source === "assistant" && call.projectId
      ? {
          conversation: call.projectId,
          ...(turn && turn.projectId === call.projectId ? { turn: turn.id } : {}),
        }
      : {}),
    ...(call.client ? { client: call.client } : {}),
  };
  const draft = writesDraft(name, parsed.data);
  // The person can cancel the call from the assistant panel: the answer goes back at once, and
  // whatever the handler still tries to change afterwards is refused.
  const cancel = new AbortController();
  startAiCall({
    id: call.id,
    name,
    title: tool.title,
    ...(source === "assistant" && call.projectId ? { conversation: call.projectId } : {}),
    cancel: () => cancel.abort(new Error("Cancelado pela pessoa")),
  });
  const progress = (step: string, ratio?: number): void => updateAiCall(call.id, step, ratio);
  const cancelled = new Promise<never>((_, reject) => {
    cancel.signal.addEventListener("abort", () => reject(new CancelledError()), { once: true });
  });
  // The race below handles it; a rejection nobody waits for is not an error.
  cancelled.catch(() => undefined);
  const run = async (commit: Commit): Promise<Answer> => {
    const guarded: Commit = (fn) => !cancel.signal.aborted && commit(fn);
    const work = (handlers[name] as Handler)(parsed.data as never, {
      entry,
      call,
      commit: draftCommits(commit, guarded),
      draft,
      signal: cancel.signal,
      progress,
    });
    return Promise.race([work, cancelled]);
  };
  const answer = (value: Answer): ToolOutcome =>
    typeof value === "string" ? { ok: true, text: value } : { ok: true, ...value };
  try {
    // A read never changes the project: its commit refuses anything.
    if (tool.permission === "read") return answer(await run(() => false));
    // A broad edit goes into a draft the person reviews; nothing reaches the lesson or its history.
    if (draft) {
      // One draft per assistant: the calls of a request build it together.
      const into = draftCommit(
        call.source === "assistant" ? "assistente" : `cliente:${call.client ?? "externo"}`,
        call.source === "assistant"
          ? "Mudanças propostas pelo Assistente"
          : "Mudanças propostas pela IA conectada",
        call.projectId,
      );
      let refused = false;
      const value = await run(
        onDraftView((fn) => {
          const ok = into(fn);
          if (!ok) refused = true;
          return ok;
        }),
      );
      const text = typeof value === "string" ? value : value.text;
      if (refused) {
        const waiting = useProject.getState().draft;
        return {
          ok: false,
          text: waiting
            ? `Há um rascunho esperando a revisão da pessoa ("${waiting.title}"). Nada foi feito: peça para ela aplicar ou descartar esse rascunho primeiro.`
            : "A pessoa trocou de aula enquanto a ferramenta rodava: nada foi feito.",
        };
      }
      if (source === "mcp")
        useApp.getState().toast(`IA conectada: rascunho de ${tool.title}`, "info");
      return {
        ok: true,
        text: `${text}\nFicou como rascunho: a pessoa vê na prévia, revisa item por item na barra acima da timeline e aplica. Não aplique você mesmo.`,
      };
    }
    const { value, refused } = await runAsAi(entry, run);
    if (refused)
      return {
        ok: false,
        text: "A pessoa trocou de aula enquanto a ferramenta rodava: nada foi gravado na aula que está aberta agora.",
      };
    if (source === "mcp") useApp.getState().toast(`IA conectada: ${tool.title}`, "success");
    return answer(value);
  } catch (err) {
    if (err instanceof CancelledError || cancel.signal.aborted)
      return {
        ok: false,
        text: "A pessoa cancelou esta ferramenta no painel do EdiAula. O que ela ainda não tinha gravado não foi feito. Não chame de novo sem ela pedir.",
      };
    return {
      ok: false,
      text: err instanceof ToolError ? err.message : `Erro: ${(err as Error).message}`,
    };
  } finally {
    endAiCall(call.id);
  }
}

/** The call was cancelled in the assistant panel. */
class CancelledError extends Error {}

/**
 * `guarded` with the draft mark of `commit` (state/project.ts onDraftView): a call writing into a
 * draft still works out its changes on the draft as shown.
 */
const draftCommits = (commit: Commit, guarded: Commit): Commit =>
  writesIntoDraft(commit) ? onDraftView(guarded) : guarded;

/**
 * Keeps the main process informed of the open project and the folders of its media: paths an
 * AI sends inside them are used without asking (main/aiPaths.ts).
 */
export function reportAiContext(): () => void {
  let last = "";
  const send = (path: string | null, project: Project | null): void => {
    const mediaFolders = [
      ...new Set(
        (project?.assets ?? [])
          .map((a) => folderOf(a.path))
          .filter((folder): folder is string => !!folder),
      ),
    ];
    const key = JSON.stringify([path, mediaFolders]);
    if (key === last) return;
    last = key;
    window.api.setAiContext({ projectPath: path, mediaFolders }).catch((err: unknown) => {
      // Without it, paths an AI sends are confirmed one by one; editing goes on as usual.
      console.error("[ediaula] ai_context_failed", err instanceof Error ? err.message : err);
    });
  };
  const now = useProject.getState();
  send(now.path, now.project);
  return useProject.subscribe((s, prev) => {
    if (s.path !== prev.path || s.project?.assets !== prev.project?.assets) send(s.path, s.project);
  });
}
