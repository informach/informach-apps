import { folderOf } from "@shared/aiPaths";
import { clipTargets, lockedNote } from "@shared/aiTargets";
import {
  AI_TOOLS,
  type AiToolName,
  isAiToolName,
  isMemoryTool,
  type MemoryToolName,
  PANEL_FORBIDDEN,
  writesDraft,
} from "@shared/aiTools";
import {
  ANNOTATION_PRESETS,
  type Annotation,
  defaultOutline,
  isDrawingKind,
} from "@shared/annotation";
import { speechSpans } from "@shared/audio";
import { captionWords } from "@shared/captions";
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
import { clicksTrack } from "@shared/clickEvents";
import { type MoveRequest, planAlign, planMoves, splitOneClip } from "@shared/clipMoves";
import {
  type Crop,
  DEFAULT_TRANSFORM,
  NO_CROP,
  placementTransform,
  SHADOW_PRESETS,
  type Shadow,
} from "@shared/compose";
import { type CourseTemplate, parseCourseTemplate } from "@shared/courseTemplate";
import { type CursorFx, DEFAULT_CURSOR_FX } from "@shared/cursor";
import { buildEditingTemplate } from "@shared/editingTemplate";
import {
  checkParts,
  type PartRange,
  partFiles,
  runExportParts,
  trackParts,
} from "@shared/exportParts";
import { type ExportPresetId, exportName, presetSpec, runExportVideo } from "@shared/exportPresets";
import { GAIN_MAX_DB, GAIN_MIN_DB } from "@shared/gain";
import { formatGlossary } from "@shared/glossary";
import type { HistoryEntry } from "@shared/history";
import { rangeProject } from "@shared/lessonParts";
import { CATEGORY_LABEL, type LibraryMedia } from "@shared/library";
import { chaptersOf, hasChapterMarkers } from "@shared/markers";
import { plural } from "@shared/plural";
import type { Finding } from "@shared/preflight";
import { PREPARE_LABEL, PREPARE_STEPS, type PrepareStep, resumeStep } from "@shared/prepare";
import { screenDirections } from "@shared/screenDirections";
import { sectionLabel } from "@shared/script";
import { findSoundEffect, plainWord, SOUND_EFFECTS, SOUND_GROUP_LABEL } from "@shared/soundEffects";
import {
  type PlaceOptions,
  placeOverSpeech,
  type SoundPlacement,
  withClicksTrack,
} from "@shared/soundPlacement";
import { pendingSpeech } from "@shared/speechSources";
import { isSubstitutionId, placeSubstitutions } from "@shared/substitutionPlace";
import { templateById } from "@shared/templates";
import {
  clipEnd,
  clipSpeed,
  newId,
  projectDuration,
  sourceEnd,
  trackLabels,
} from "@shared/timeline";
import {
  addTrackBeside,
  moveTrackBeside,
  removeEmptyTrack,
  renameTrack,
  setTrackFlags,
  withTrackIds,
} from "@shared/trackOps";
import { DEFAULT_TRANSITION, previousClip } from "@shared/transitions";
import type {
  AiToolCall,
  Asset,
  Clip,
  ExportSpec,
  Project,
  ToolImage,
  Transcript,
  VoiceRole,
} from "@shared/types";
import {
  characterSpans,
  gainStretches,
  type RoleContext,
  rangeGain,
  roleContext,
  roleLabel,
  teacherPicture,
  teacherSilence,
  twoVoices,
  VOICE_RAMP,
  voiceRoleOf,
  voiceRuleOn,
} from "@shared/voiceRule";
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
  structuralDraft,
  useProject,
  writesIntoDraft,
} from "@/state/project";
import { actions } from "./actions";
import { endAiCall, startAiCall, updateAiCall } from "./aiActivity";
import { addAnnotation, addCard, addImageOverlay, updateAnnotation } from "./annotations";
import { type CleanupOverrides, cleanupPlan } from "./cleanupPlan";
import { loadClickEvents } from "./clickSounds";
import { askChoice, askConfirm } from "./confirm";
import { applyTemplateParts, courseTemplate } from "./courseTemplate";
import { hasPlatformData, makeQuiz, quizItemTime, translateLesson } from "./delivery";
import { frameForAi } from "./frame";
import { importMedia, mediaPictures, preparePlayback, probeMedia } from "./importMedia";
import { keyIsCurrent } from "./keying";
import { kidsTable } from "./kids";
import { allPalettes, applyPalette, usePalettes } from "./palettes";
import { checkLesson, measureLoudness } from "./preflight";
import { runPrepare } from "./prepare";
import { blindNotes, proposeCleanup, showProposal } from "./proposals";
import { currentView, placeInserts, proposeOffScript, scriptDoc } from "./script";
import { loadSharedLibrary, useSharedLibrary } from "./sharedLibrary";
import { soundPath } from "./soundLibrary";
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
type Answer = string | { text: string; images?: ToolImage[] };

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

/**
 * The clips a per-clip tool edits (shared/aiTargets.ts): every id checked first, the groups
 * taken along as the editor does, the clips on locked tracks left out. Refused when an id does
 * not exist or nothing is left to edit.
 */
function editableClips(
  p: Project,
  ids: readonly string[],
  options: { groups?: boolean } = {},
): { ids: string[]; note: string } {
  const r = clipTargets(p, ids, options);
  if (r.missing.length)
    throw new ToolError(
      `Clipes não encontrados: ${r.missing.join(", ")}. Nada foi feito. Use os ids de get_overview.`,
    );
  if (!r.ids.length)
    throw new ToolError(
      `Nada foi feito: ${r.locked.length === 1 ? "o clipe está numa faixa travada" : "os clipes estão em faixas travadas"} (${r.locked.join(", ")}). Peça para a pessoa destravar a faixa se for para mudar.`,
    );
  return { ids: r.ids, note: lockedNote(r.locked) };
}

/**
 * Edits that change the lesson right away wait, as in the editor, while a draft that changes its
 * structure waits for review (state/project.ts structuralDraft): what is on screen is not where
 * the clips of the lesson are.
 */
function requireNoStructuralDraft(): void {
  if (!structuralDraft()) return;
  const title = useProject.getState().draft?.title ?? "rascunho";
  throw new ToolError(
    `Há um rascunho que muda a estrutura da aula esperando a revisão da pessoa ("${title}"). Nada foi feito: peça para ela aplicar ou descartar o rascunho antes.`,
  );
}

/** Edits timed from what the AI read: refused when the project changed since (as cut_ranges). */
function requireRevision(revision: number): void {
  const current = useProject.getState().revision;
  if (revision !== current)
    throw new ToolError(
      `O projeto mudou desde a leitura (revisão ${revision} → ${current}). Leia get_overview de novo e recalcule os tempos.`,
    );
}

/** A refused commit of a timing edit: the lesson changed under the call. */
function committedOrFail(ok: boolean): void {
  if (!ok) throw new ToolError("Nada foi feito: a aula aberta mudou.");
}

/**
 * One commit for a whole call: the changes the call makes through `commit` wait and go in
 * together at `flush`, so a call that fails half way changes nothing and leaves one undo step.
 */
function batched(commit: Commit): { commit: Commit; flush: () => boolean } {
  const changes: ((p: Project) => Project)[] = [];
  const queue: Commit = (fn) => {
    changes.push(fn);
    return true;
  };
  return {
    commit: writesIntoDraft(commit) ? onDraftView(queue) : queue,
    flush: () => !changes.length || commit((p) => changes.reduce((q, fn) => fn(q), p)),
  };
}

const samePath = (a: string, b: string): boolean =>
  a.replaceAll("/", "\\").toLowerCase() === b.replaceAll("/", "\\").toLowerCase();

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
      error: `NÃO ENCONTRADO: "${text}". Confira o texto exato com get_transcript.`,
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

/**
 * A media for add_clip / add_sound_effects / import_media, and whether it is a sound effect. A
 * `fresh` one is not in the lesson yet: it goes in with its clips, in the same undo step.
 */
interface ResolvedMedia {
  asset: Asset;
  effect: boolean;
  fresh?: { codec?: string };
}

/** The media of a file: the lesson's own, or a new one ready to go in (one per file and call). */
async function mediaOfFile(
  path: string,
  seen: Map<string, ResolvedMedia>,
  effect: boolean,
): Promise<ResolvedMedia> {
  const key = path.replaceAll("/", "\\").toLowerCase();
  const cached = seen.get(key);
  if (cached) return cached;
  const own = requireProject().assets.find((a) => samePath(a.path, path));
  let media: ResolvedMedia;
  if (own) media = { asset: own, effect };
  else {
    let probed: Awaited<ReturnType<typeof probeMedia>>;
    try {
      probed = await probeMedia(path);
    } catch (err) {
      throw new ToolError(
        `Não foi possível ler ${path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const asset = { ...probed.asset, ...(await mediaPictures(probed.asset)) };
    media = { asset, effect, fresh: probed.codec ? { codec: probed.codec } : {} };
  }
  seen.set(key, media);
  return media;
}

/** `q` with the fresh media of `list` that it does not have yet. */
function withMedia(q: Project, list: readonly ResolvedMedia[]): Project {
  const have = new Set(q.assets.map((a) => a.id));
  const add: Asset[] = [];
  for (const m of list)
    if (m.fresh && !have.has(m.asset.id)) {
      have.add(m.asset.id);
      add.push(m.asset);
    }
  return add.length ? { ...q, assets: [...q.assets, ...add] } : q;
}

/** Once the fresh media are in the lesson: their proxies and filmstrips. */
function mediaAdded(list: readonly ResolvedMedia[]): void {
  const done = new Set<string>();
  for (const m of list)
    if (m.fresh && !done.has(m.asset.id)) {
      done.add(m.asset.id);
      preparePlayback(m.asset, m.fresh.codec);
    }
}

const loweredNote =
  "Atenção: um efeito ficaria sobre a fala por mais de 0,3 s acima de 30% de volume, então foi baixado para 30%. Se a ideia é destacar esse momento, escolha um instante sem fala.";

/**
 * The media an AI names: "sfx:<id>" (a sound of EdiAula), "lib:<id>" (the library of every
 * lesson), a media of the project (id or name), or a sound effect by id or Portuguese tag. A
 * sound or a library media not in the lesson yet comes in with the clip (mediaOfFile).
 */
async function resolveMedia(
  name: string,
  seen: Map<string, ResolvedMedia>,
  effectsFirst = false,
): Promise<ResolvedMedia> {
  const p = requireProject();
  const sfx = async (query: string): Promise<ResolvedMedia | undefined> => {
    const found = findSoundEffect(query);
    if (!found) return undefined;
    let path: string | undefined;
    try {
      path = await soundPath(found.id);
    } catch (err) {
      throw new ToolError(
        `O efeito ${found.name} não pôde ser preparado: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!path) throw new ToolError(`O efeito ${found.name} não pôde ser preparado.`);
    return mediaOfFile(path, seen, true);
  };
  const fromLibrary = async (pick: (m: LibraryMedia) => boolean) => {
    if (!useSharedLibrary.getState().loaded) await loadSharedLibrary();
    const m = useSharedLibrary.getState().library.media.find(pick);
    if (!m) return undefined;
    if (m.missing) throw new ToolError(`O arquivo de ${m.name} não está mais neste computador.`);
    return mediaOfFile(m.path, seen, m.category === "efeito");
  };
  if (name.startsWith("sfx:")) {
    const r = await sfx(name.slice(4));
    if (r) return r;
    throw new ToolError(`Efeito sonoro não encontrado: "${name}". Veja os ids em list_library.`);
  }
  if (name.startsWith("lib:")) {
    const id = name.slice(4);
    const r = await fromLibrary((m) => m.id === id);
    if (r) return r;
    throw new ToolError(`Item da biblioteca não encontrado: "${name}". Veja list_library.`);
  }
  const own = p.assets.find((a) => a.id === name);
  if (own) return { asset: own, effect: false };
  const query = plainWord(name);
  const byName = async () => {
    const a = p.assets.find((x) => !x.generated && plainWord(x.name).includes(query));
    return a ? { asset: a, effect: false } : undefined;
  };
  const fromShared = () => fromLibrary((m) => plainWord(m.name).includes(query));
  const order = effectsFirst
    ? [() => sfx(name), fromShared, byName]
    : [byName, () => sfx(name), fromShared];
  for (const look of order) {
    const r = await look();
    if (r) return r;
  }
  throw new ToolError(`Mídia não encontrada: "${name}". Veja list_library.`);
}

/** Moments someone speaks, word by word (no ramp nor hold): what a sound effect may not cover. */
async function rawSpeech(p: Project): Promise<[number, number][]> {
  const transcripts = await loadProjectTranscripts(p);
  return speechSpans(p, captionWords(p, transcripts), new Set(transcripts.keys()), 0, 0);
}

/** When a sound effect plays: at a time, when some words are said, or as an annotation comes in. */
async function soundTime(
  p: Project,
  it: { at?: number; near_text?: string; on_annotation?: string },
): Promise<number> {
  const given = [it.at !== undefined, !!it.near_text, !!it.on_annotation].filter(Boolean).length;
  if (given !== 1) throw new ToolError("informe um só entre at, near_text e on_annotation.");
  if (it.on_annotation) {
    const c = p.clips.find((x) => x.id === it.on_annotation);
    if (!c?.annotation)
      throw new ToolError(`anotação não encontrada: ${it.on_annotation} (ids em get_overview).`);
    return c.start;
  }
  return timeFor(p, it.near_text, it.at);
}

/** The lesson after a placement worked out again on a newer view; unchanged when it fails. */
const placedOrSame = (r: SoundPlacement, q: Project): Project => (r.ok ? r.project : q);

/**
 * What the person selected: the track picked by its header, else the track of the first clip
 * selected; and the clips selected (only those still in the lesson).
 */
function selectionOf(p: Project): { trackId: string | null; clipIds: string[] } {
  const { selection, selectedTrack } = useProject.getState();
  const clipIds = selection.filter((id) => p.clips.some((c) => c.id === id));
  const picked =
    selectedTrack && p.tracks.some((x) => x.id === selectedTrack) ? selectedTrack : null;
  const first = clipIds.length ? (p.clips.find((c) => c.id === clipIds[0])?.trackId ?? null) : null;
  return { trackId: picked ?? first, clipIds };
}

/** "Seleção: faixa [id] nome; clipes [id], [id]" or "Seleção: nenhuma". */
function selectionLine(p: Project): string {
  const { trackId, clipIds } = selectionOf(p);
  if (!trackId && !clipIds.length) return "Seleção: nenhuma";
  const parts: string[] = [];
  if (trackId)
    parts.push(`faixa [${trackId}] ${p.tracks.find((x) => x.id === trackId)?.name ?? ""}`);
  if (clipIds.length) parts.push(`clipes ${clipIds.map((id) => `[${id}]`).join(", ")}`);
  return `Seleção: ${parts.join("; ")}`;
}

/**
 * The answer of a track tool: what was done, then the tracks top to bottom as the timeline
 * numbers them now (the new or changed one marked), and the revision.
 */
function trackAnswer(done: string, mark?: string): string {
  const p = requireProject();
  const labels = trackLabels(p.tracks);
  const list = p.tracks
    .map(
      (x, i) =>
        `${i + 1}. ${labels.get(x.id)} [${x.id}] ${x.name}${x.kind === "audio" ? " (áudio)" : ""}${x.locked ? " (travada)" : ""}${x.muted ? " (muda)" : ""}${x.hidden ? " (oculta)" : ""}${x.id === mark ? "  ← esta" : ""}`,
    )
    .join("\n");
  return `${done}\nFaixas de cima para baixo:\n${list}\n${revisionLine()}`;
}

/**
 * The voices of the lesson in a few lines (set_voice_rule, set_voice_role, get_overview): the
 * rule, the characters heard and where the teacher is silent for them, and two voices left.
 */
function voiceSummary(p: Project): string[] {
  const ctx = roleContext(p);
  const chars = characterSpans(p, ctx);
  const on = voiceRuleOn(p);
  const picture = teacherPicture(p);
  const pictureLabel =
    picture === "fade"
      ? "o avatar dela some com fade de 0,2 s"
      : picture === "freeze"
        ? "o avatar dela congela no quadro em que ela para"
        : "o avatar dela fica como está";
  const lines = [
    `Regra "personagem silencia a professora": ${on ? `ligada (${pictureLabel})` : "desligada"}.`,
  ];
  lines.push(
    chars.length
      ? `Personagens na timeline: ${chars.map((s) => `${s.name} [${s.clipId}] ${t(s.start)}–${t(s.end)}`).join("; ")}.`
      : "Nenhum clipe de personagem com som na timeline.",
  );
  const silence = teacherSilence(p, ctx);
  if (silence.length)
    lines.push(`Professora calada em: ${silence.map(([a, b]) => `${t(a)}–${t(b)}`).join("; ")}.`);
  const both = twoVoices(p);
  if (both.length)
    lines.push(
      `Duas vozes juntas: ${both.map((v) => `${v.character} e a professora [${v.teacherClip}] ${t(v.start)}–${t(v.end)}`).join("; ")}.`,
    );
  return lines;
}

/** The volume of a clip by parts and whose voice it is, for get_overview. */
function audioOfClip(c: Clip, ctx: RoleContext, silence: readonly [number, number][]): string {
  const asset = ctx.assets.get(c.assetId);
  if (!asset?.hasAudio || asset.kind === "image" || c.annotation) return "";
  const parts: string[] = [];
  if (c.volume <= 0) parts.push("mudo");
  else if (Math.abs(c.volume - 1) > 1e-3) parts.push(`volume ${Math.round(c.volume * 100)}%`);
  for (const s of gainStretches(c.gain, c.duration)) {
    const span = `${t(c.start + s.from)}–${t(c.start + s.to)}`;
    parts.push(
      s.db <= GAIN_MIN_DB
        ? `mudo ${span}`
        : `volume ${Math.round(c.volume * 10 ** (s.db / 20) * 100)}% ${span}`,
    );
  }
  const role = voiceRoleOf(c, ctx);
  if (role.kind !== "none") parts.push(`voz: ${roleLabel(role)}`);
  if (role.kind === "teacher") {
    const end = clipEnd(c);
    const quiet = silence
      .filter(([a, b]) => a < end && b > c.start)
      .map(([a, b]) => `${t(Math.max(a, c.start))}–${t(Math.min(b, end))}`);
    if (quiet.length) parts.push(`calada pelo personagem ${quiet.join(", ")}`);
  }
  return parts.length ? ` ${parts.join(", ")}` : "";
}

/**
 * Rows of the kids table placed over the teacher's lines (shared/substitutionPlace.ts): one commit
 * through `commit`. Refused, with nothing done, when none can be placed.
 */
function substitute(p: Project, ids: string[], commit: Commit): string {
  const planned = substitutionPlan(p, ids);
  committedOrFail(commit((q) => (q === p ? planned.project : placeSubstitutions(q, ids).project)));
  return planned.message;
}

/** The lesson with the rows of the kids table placed, and the answer; refused when none fits. */
function substitutionPlan(p: Project, ids: string[]): { project: Project; message: string } {
  const r = placeSubstitutions(p, ids);
  if (!r.placed.length)
    throw new ToolError(
      `Nada foi colocado: ${r.problems.map((x) => `${x.id}: ${x.why}`).join("; ")}.`,
    );
  const message = [
    `${plural(r.placed.length, "fala de personagem colocada", "falas de personagem colocadas")} sobre a fala da professora, sem procurar pausa e sem mover nada:`,
    ...r.placed.map(
      (x) =>
        `- ${x.id}: ${x.character} [${x.clipId}] ${t(x.start)}–${t(x.end)} na faixa ${x.trackName}${x.longer > 0.3 ? ` (dura ${x.longer.toFixed(1)} s a mais que a fala dela: as palavras dela até ${t(x.end)} também ficam caladas)` : ""}`,
    ),
    ...r.problems.map((x) => `Não colocada ${x.id}: ${x.why}.`),
    r.ruleOff
      ? 'Atenção: a regra "personagem silencia a professora" está desligada nesta aula, então as duas vozes vão se sobrepor. Ligue com set_voice_rule.'
      : "A professora fica calada e o avatar dela sai enquanto o personagem fala (set_voice_rule).",
  ].join("\n");
  return { project: r.project, message };
}

/**
 * export_video with several parts (shared/exportParts.ts): one folder picked by the person, the
 * files named "<aula> - Parte N", one question when some are already there, and each part in the
 * queue as a stretch of the lesson (as `range` exports one), with captions and thumbnail only.
 */
async function exportParts(
  p: Project,
  parts: readonly PartRange[],
  opts: {
    preset: ExportPresetId;
    spec: Omit<ExportSpec, "outPath">;
    vertical: boolean;
    wanted: ReadonlySet<string>;
    check: () => Promise<readonly Finding[]>;
    confirm: (problems: readonly string[]) => Promise<boolean>;
  },
  progress: (step: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const files = partFiles(parts, p.name, opts.preset, opts.vertical);
  let folder = "";
  const result = await runExportParts(
    {
      check: opts.check,
      confirm: opts.confirm,
      pickFolder: async () => {
        progress("Esperando você escolher a pasta das partes");
        const picked = await window.api.pickFolder(`Onde salvar as ${parts.length} partes`);
        // Cancelled while the dialog was open: nothing goes into the queue.
        signal.throwIfAborted();
        folder = picked ?? "";
        return picked;
      },
      exists: (paths) => window.api.exists(paths),
      queued: () =>
        new Set(
          useExportQueue
            .getState()
            .items.filter((i) => ["waiting", "preparing", "exporting"].includes(i.state))
            .map((i) => i.spec.outPath.toLowerCase()),
        ),
      ask: async (names) => {
        const answer = await askChoice(
          {
            title: "Alguns arquivos já estão na pasta",
            message: `${names.length === 1 ? "Um arquivo" : `${names.length} arquivos`} das ${parts.length} partes já ${names.length === 1 ? "está" : "estão"} em ${folder}. Substituir todos, ou dar aos novos um sufixo, como (2)?`,
            items: names,
            confirm: "Substituir todos",
            other: "Acrescentar sufixo",
            cancel: "Não exportar",
          },
          signal,
        );
        signal.throwIfAborted();
        return answer === "confirm" ? "replace" : answer === "other" ? "suffix" : null;
      },
      enqueue: (part, outPath) => {
        signal.throwIfAborted();
        const id = newId("export");
        exportQueue.add({
          id,
          project: rangeProject(p, part.from, part.to),
          spec: { ...opts.spec, outPath },
          captions: opts.wanted.has("captions"),
          extras: { translations: false, platform: false },
        });
        return id;
      },
    },
    parts,
    files,
  );
  if (!result.ok) throw new ToolError(result.text);
  const name = (path: string): string => path.slice(path.lastIndexOf("\\") + 1);
  return [
    `${plural(result.parts.length, "parte na fila", "partes na fila")}, na pasta escolhida pela pessoa (${result.folder})${result.confirmed ? ", exportando apesar dos problemas, como a pessoa confirmou" : ""}:`,
    ...result.parts.map(
      (x, i) => `- Parte ${i + 1} · ${t(x.from)}–${t(x.to)} · id ${x.id} · ${name(x.outPath)}`,
    ),
    ...(result.replaced.length
      ? [`Substituídos, como a pessoa pediu: ${result.replaced.map(name).join(", ")}.`]
      : []),
    ...(result.suffixed.length
      ? [`Com sufixo, porque o nome já existia: ${result.suffixed.map(name).join(", ")}.`]
      : []),
    "As partes saem sem legendas traduzidas nem pacote da plataforma. Acompanhe cada uma com get_export_status.",
  ].join("\n");
}

/** Whether a crop cuts anything. */
const hasCrop = (c: Crop | undefined): c is Crop =>
  !!c && (c.left > 0 || c.right > 0 || c.top > 0 || c.bottom > 0);

/** "esquerda 2%, direita 2%": the sides a crop cuts. */
function cropLabel(c: Crop): string {
  const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;
  const sides: [string, number][] = [
    ["esquerda", c.left],
    ["direita", c.right],
    ["topo", c.top],
    ["base", c.bottom],
  ];
  return (
    sides
      .filter(([, v]) => v > 0)
      .map(([name, v]) => `${name} ${pct(v)}`)
      .join(", ") || "nenhum"
  );
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

/** The memory tools run in the main process (main/aiMemory.ts), never here. */
const handlers: {
  [K in Exclude<AiToolName, MemoryToolName>]: (
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
      return n ? ` ${plural(n, "zoom", "zooms")}` : "";
    };
    const lines = [
      // What the person selected, first: "a faixa selecionada", "o clipe selecionado".
      selectionLine(p),
      `Projeto: ${p.name}${p.course ? ` · curso: ${p.course}` : ""}`,
      `Formato: ${p.settings.width}x${p.settings.height} ${p.settings.fps} fps · duração ${t(projectDuration(p))} · cursor em ${t(usePlayback.getState().time)}`,
      "Faixas:",
    ];
    if (track && !p.tracks.some((tr) => tr.id === track))
      throw new ToolError(`Faixa ${track} não existe. Use os ids de get_overview.`);
    const voiceCtx = roleContext(p);
    const silence = teacherSilence(p, voiceCtx);
    const describe = (c: Clip): string =>
      `[${c.id}] ${assets.get(c.assetId)?.name ?? "?"} ${t(c.start)}–${t(c.start + c.duration)}${c.groupId ? ` grupo ${c.groupId}` : ""}${c.insertId ? ` (inserção ${c.insertId})` : ""}${c.transform ? ` pos x=${c.transform.x.toFixed(2)} y=${c.transform.y.toFixed(2)} escala=${c.transform.scale.toFixed(2)}` : ""}${hasCrop(c.transform?.crop) ? ` recorte ${cropLabel(c.transform?.crop ?? NO_CROP)}` : ""}${c.fadeIn || c.fadeOut ? " dissolve" : ""}${zoomCount(c)}${clipSpeed(c) !== 1 ? ` velocidade ${clipSpeed(c)}x` : ""}${audioOfClip(c, voiceCtx, silence)}`;
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
    lines.push(...voiceSummary(p));
    lines.push("Mídias:");
    for (const a of p.assets)
      lines.push(
        `- ${a.name} (${a.kind}${a.duration ? `, ${t(a.duration)}` : ""})${a.transcriptStatus === "ready" ? " · transcrita" : a.transcriptStatus === "pending" ? " · transcrevendo" : ""}${a.missing ? " · ARQUIVO NÃO ENCONTRADO" : ""}${a.cursor ? " · gravação do EdiAula (cursor e cliques salvos)" : ""}${a.key ? ` · ${a.key.mode === "person" ? "fundo removido pela IA local, a pessoa recortada" : `avatar, fundo ${a.key.color} removido`}${keyIsCurrent(a) ? "" : " (processando)"}` : a.screen ? ` · fundo liso ${a.screen} (remoção desligada)` : ""}`,
      );
    // The chapters as the MP4, the platform package and the check before export have them.
    const chapters = chaptersOf(p);
    if (p.publish?.title || chapters.length)
      lines.push(
        `Publicação salva: título "${p.publish?.title ?? ""}", ${plural(chapters.length, "capítulo", "capítulos")}${chapters.length ? ` (${hasChapterMarkers(p) ? "dos marcadores-capítulo da timeline" : "salvos com save_publish_info"}): ${chapters.map((c) => `${t(c.time)} ${c.title}`).join("; ")}` : ""}.`,
      );
    if (p.publish?.thumbnail) lines.push(`Miniatura: o quadro de ${t(p.publish.thumbnail.time)}.`);
    if (p.clips.some((c) => c.groupId))
      lines.push(
        "Clipes com o mesmo grupo andam juntos: uma ferramenta por clipe muda o grupo todo, como na tela.",
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
    // Text only, the selection on its first line: a client given a structured copy reads that
    // alone, and the assistant once saw only {"selection": ...}, never the tracks.
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
    requireNoStructuralDraft();
    const { project: p, plan } = await freshCleanup(overrides);
    const notes = blindNotes(p, plan.blind).map((n) => `Atenção: ${n}`);
    if (!plan.active.length) return ["Nada para cortar com essas opções.", ...notes].join("\n");
    requireNoStructuralDraft();
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
    requireNoStructuralDraft();
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
    // A draft may have come while the transcript loaded.
    requireNoStructuralDraft();
    const d0 = before();
    cutOrFail(mergeRanges(ranges), commit);
    return `${report.join("\n")}\n${savedSince(d0)}`;
  },

  async cut_ranges({ ranges, revision }, { commit }) {
    requireProject();
    requireNoStructuralDraft();
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
    return `${plural(valid.length, "trecho cortado", "trechos cortados")}. ${savedSince(d0)}`;
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
    if (done)
      return `${plural(done, "edição sua desfeita", "edições suas desfeitas")}. Duração agora: ${t(before())}.`;
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
    const p = requireProject();
    // One list of chapters: the markers marked as chapters win (shared/markers.ts chaptersOf),
    // so chapters sent here would never reach the MP4 nor the package. Nothing is saved then.
    if (input.chapters && hasChapterMarkers(p))
      throw new ToolError(
        `Nada foi salvo: os capítulos desta aula vêm dos marcadores-capítulo da timeline (${chaptersOf(
          p,
        )
          .map((c) => `${t(c.time)} ${c.title}`)
          .join(
            "; ",
          )}), e são eles que vão para o MP4 e para o pacote. Mande de novo sem chapters, e peça para a pessoa ajustar os marcadores (tecla M, "É capítulo") se quiser outros capítulos.`,
      );
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

  async get_frame({ time, region, max_width, composited }, { signal, progress, call }) {
    const open = requireProject();
    // With a draft of this same assistant waiting, the frame shows the lesson as the draft has
    // it: the AI checks what it just proposed.
    const { draft } = useProject.getState();
    const mine = draft?.projectId === open.id && draft.author === draftAuthor(call);
    const p = (mine && shownProject()) || open;
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
      text: `${r.note}${mine ? " Com o rascunho que você propôs, ainda não aplicado." : ""}\n${JSON.stringify(r.facts)}`,
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
          `${i + 1}. ${q.question} (fala ${q.line}; certa: ${"ABCD"[q.correct]}${q.suspect ? "; SUSPEITA: a resposta não está nas palavras da fala" : ""}) ${q.options.map((o, k) => `${"ABCD"[k]}) ${o}`).join(" ")}`,
      ),
      "A pessoa revisa cada pergunta no cartão Publicação e plataforma; só as revisadas vão para o pacote.",
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
    return `${r.translated ? `${plural(r.translated, "legenda traduzida", "legendas traduzidas")} agora para "${lang}"` : `As legendas em "${lang}" já estavam em dia`}; ${r.count} no total guardadas na aula. Saem como .${lang}.srt e .${lang}.vtt ao lado do vídeo na exportação; se a aula mudar depois, chame de novo: só as que mudaram são traduzidas.`;
  },

  async export_video({ preset, formats, range, split, track_id }, { progress, signal }) {
    const p = requireProject();
    const info = useApp.getState().info;
    if (range && split) throw new ToolError("Use range ou split, não os dois. Nada foi exportado.");
    if (split && !track_id)
      throw new ToolError(
        'split: "clips" precisa de track_id, a faixa que divide as partes (ids de get_overview). Nada foi exportado.',
      );
    if (track_id && !split)
      throw new ToolError('track_id só vale com split: "clips". Nada foi exportado.');
    if (range && range.to <= range.from + 0.5)
      throw new ToolError(
        "O trecho para exportar precisa ter mais de meio segundo (to depois de from).",
      );
    // Several parts at once: one per clip or group of clips of the track.
    let parts: PartRange[] | null = null;
    if (split && track_id) {
      const r = trackParts(p, track_id);
      if (!r.ok) throw new ToolError(r.error);
      parts = r.parts;
    }
    if (parts) {
      const valid = checkParts(parts, projectDuration(p));
      if (!valid.ok) throw new ToolError(valid.error);
    }
    // A stretch is not the lesson: its translations and the platform package would describe
    // the whole lesson (chapters, quiz, captions of other times), so they do not go with it.
    const whole = (formats ?? []).filter((f) => f === "translations" || f === "platform");
    if ((range || parts) && whole.length)
      throw new ToolError(
        `${parts ? "As partes saem" : "Um trecho sai"} sem ${whole.map((f) => (f === "platform" ? "o pacote da plataforma" : "as legendas traduzidas")).join(" e ")}: eles descrevem a aula inteira. Peça sem esses formatos ou exporte a aula toda.`,
      );
    const project = range ? rangeProject(p, range.from, range.to) : p;
    const wanted = new Set(
      formats ??
        (range || parts
          ? ["captions", "thumbnail"]
          : [
              "captions",
              "thumbnail",
              "translations",
              ...(hasPlatformData(p) ? (["platform"] as const) : []),
            ]),
    );
    const spec = presetSpec(preset, project.settings, {
      encoder: info?.encoder ?? "x264",
      thumbnail: wanted.has("thumbnail"),
    });
    progress("Conferindo a aula antes de exportar");
    const vertical = !!spec.vertical;
    const check = async () =>
      (await checkLesson(p, useProject.getState().revision, { srt: wanted.has("captions") }))
        .findings;
    const confirm = (problems: readonly string[]) =>
      askConfirm(
        {
          title: "A IA quer exportar com problemas",
          message: `A verificação antes de exportar achou ${problems.length === 1 ? "um problema" : `${problems.length} problemas`}:`,
          items: [...problems],
          confirm: "Exportar assim mesmo",
          cancel: "Não exportar",
        },
        signal,
      );
    if (parts)
      return exportParts(
        p,
        parts,
        { preset, spec, vertical, wanted, check, confirm },
        progress,
        signal,
      );
    const result = await runExportVideo(
      {
        check,
        confirm,
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
    return `Exportação na fila: id ${result.id}, destino escolhido pela pessoa (${result.outPath})${result.confirmed ? ", exportando apesar dos problemas, como a pessoa confirmou" : ""}${range ? ". Um trecho sai sem legendas traduzidas nem pacote da plataforma" : ""}. Acompanhe com get_export_status.`;
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
    // Cancelling the call stops the transcriptions it started, never one the person started.
    const stop = (): void => {
      const running = useTranscribing.getState();
      for (const a of todo) {
        const job = running[a.id];
        if (job) void window.api.cancelJob(job);
      }
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

  async import_media({ paths, add_to_timeline, at, track_id }, { commit }) {
    requireProject();
    if (at !== undefined && add_to_timeline !== false) {
      // The files go in with their clips, in one step: undoing it takes both away.
      requireNoStructuralDraft();
      const seen = new Map<string, ResolvedMedia>();
      const media: ResolvedMedia[] = [];
      for (const path of paths) media.push(await mediaOfFile(path, seen, false));
      const speech = await rawSpeech(requireProject());
      const p = requireProject();
      const placeAll = (q: Project) => {
        let project = withMedia(q, media);
        let time = at;
        const placed: string[] = [];
        for (const { asset } of media) {
          const r = placeOverSpeech(
            project,
            asset,
            time,
            track_id ? { trackId: track_id } : {},
            speech,
          );
          if (!r.ok) return r;
          project = r.project;
          const clip = project.clips.find((c) => c.id === r.clipId);
          const track = project.tracks.find((x) => x.id === r.trackId)?.name ?? r.trackId;
          placed.push(
            `[${r.clipId}] ${asset.name} em ${t(time)} na faixa ${track}${r.note}${r.lowered ? " (volume baixado para 30%: ficaria sobre a fala)" : ""}`,
          );
          time += clip?.duration ?? 0;
        }
        return { ok: true as const, project, placed };
      };
      const plan = placeAll(p);
      if (!plan.ok) throw new ToolError(`Nada foi importado: ${plan.error}`);
      committedOrFail(
        commit((q) => {
          if (q === p) return plan.project;
          const again = placeAll(q);
          return again.ok ? again.project : q;
        }),
      );
      mediaAdded(media);
      return [
        `${plural(media.length, "arquivo importado", "arquivos importados")} e colocados sem empurrar nada:`,
        ...plan.placed,
      ].join("\n");
    }
    const assets = await importMedia(paths);
    if (add_to_timeline !== false) actions.appendAssets(assets, commit);
    return `${assets.length} de ${plural(paths.length, "arquivo importado", "arquivos importados")}${add_to_timeline !== false ? " e colocados no fim da timeline" : ""}. Duração: ${t(before())}.`;
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
      `Duração alvo: ${section.targetText ?? "não definida"} · edição atual ${t(projectDuration(p))}`,
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
    const p = requireProject();
    requireNoStructuralDraft();
    if (
      isSubstitutionId(
        p,
        insert_id,
        kidsTable(p).map((r) => r.id),
      )
    )
      return substitute(p, [insert_id], commit);
    const r = await placeInserts(insert_id, commit);
    if (!r.ok) throw new ToolError(r.message);
    return r.message;
  },

  async place_inserts({ insert_ids }, { commit, draft }) {
    const p = requireProject();
    if (insert_ids !== "all") {
      const rows = kidsTable(p).map((r) => r.id);
      const subs = insert_ids.filter((id) => isSubstitutionId(p, id, rows));
      const lines = insert_ids.filter((id) => !subs.includes(id));
      if (subs.length) {
        // Both kinds in one undo step: the rows over the teacher's lines, then the avatar lines.
        // The avatar lines are planned on the lesson with the rows in it: their plan gives the
        // clips and tracks of the whole lesson, so planned without the rows it would drop them.
        const one = batched(commit);
        const base = basisOf(commit) ?? p;
        const rows = substitutionPlan(base, subs);
        committedOrFail(
          one.commit((q) => (q === base ? rows.project : placeSubstitutions(q, subs).project)),
        );
        const first = rows.message;
        let rest = "";
        if (lines.length) {
          const lesson = draft ? shownProject : () => useProject.getState().project;
          const r = await placeInserts(lines, one.commit, () => {
            const now = lesson();
            return now === base ? rows.project : now && placeSubstitutions(now, subs).project;
          });
          if (!r.ok)
            throw new ToolError(`${first}
${r.message}`);
          rest = r.message;
        }
        committedOrFail(one.flush());
        return [first, rest].filter(Boolean).join("\n");
      }
    }
    const r = await placeInserts(insert_ids, commit, draft ? shownProject : undefined);
    if (!r.ok) throw new ToolError(r.message);
    return r.message;
  },

  async propose_off_script(_input, { call }) {
    requireProject();
    return proposeOffScript(proposalAuthor(call, "propose_off_script"));
  },

  // Tracks (shared/trackOps.ts), as the timeline changes them: no clip moves.
  async add_track({ position, track_id, kind, label, revision }, { commit }) {
    const p = requireProject();
    if (revision !== undefined) requireRevision(revision);
    const ref = track_id ?? selectionOf(p).trackId;
    if (!ref)
      throw new ToolError(
        "Nenhuma faixa selecionada: informe track_id, ou peça para a pessoa clicar no cabeçalho de uma faixa (ou num clipe dela). Nada foi feito.",
      );
    const r = addTrackBeside(p, ref, position, kind, label);
    if (!r.ok) throw new ToolError(r.error);
    const made = r.track;
    committedOrFail(
      commit((q) => {
        if (q === p) return r.project;
        const at = q.tracks.findIndex((x) => x.id === ref);
        if (at < 0) return q;
        const i = at + (position === "below" ? 1 : 0);
        return { ...q, tracks: [...q.tracks.slice(0, i), made, ...q.tracks.slice(i)] };
      }),
    );
    return trackAnswer(
      `Faixa nova [${made.id}] "${made.name}" (${made.kind === "video" ? "vídeo" : "áudio"}) criada logo ${position === "below" ? "abaixo" : "acima"} da faixa ${p.tracks.find((x) => x.id === ref)?.name ?? ref} [${ref}]${track_id ? "" : " (a selecionada)"}. Nenhum clipe mudou.`,
      made.id,
    );
  },

  async move_track({ track_id, position, reference_track_id, revision }, { commit }) {
    const p = requireProject();
    if (revision !== undefined) requireRevision(revision);
    requireNoStructuralDraft();
    const r = moveTrackBeside(p, track_id, position, reference_track_id);
    if (!r.ok) throw new ToolError(r.error);
    committedOrFail(
      commit((q) => {
        if (q === p) return r.project;
        const again = moveTrackBeside(q, track_id, position, reference_track_id);
        return again.ok ? again.project : q;
      }),
    );
    return trackAnswer(
      `Faixa ${r.track.name} [${track_id}] agora logo ${position === "below" ? "abaixo" : "acima"} da faixa ${p.tracks.find((x) => x.id === reference_track_id)?.name} [${reference_track_id}]. Nenhum clipe mudou.`,
      track_id,
    );
  },

  async rename_track({ track_id, label, revision }, { commit }) {
    const p = requireProject();
    if (revision !== undefined) requireRevision(revision);
    const r = renameTrack(p, track_id, label);
    if (!r.ok) throw new ToolError(r.error);
    committedOrFail(
      commit((q) => {
        const again = renameTrack(q, track_id, label);
        return again.ok ? again.project : q;
      }),
    );
    return trackAnswer(`Faixa [${track_id}] agora se chama "${r.track.name}".`, track_id);
  },

  async remove_track({ track_id, revision }, { commit }) {
    const p = requireProject();
    if (revision !== undefined) requireRevision(revision);
    requireNoStructuralDraft();
    const r = removeEmptyTrack(p, track_id);
    if (!r.ok) throw new ToolError(r.error);
    committedOrFail(
      commit((q) => {
        const again = removeEmptyTrack(q, track_id);
        return again.ok ? again.project : q;
      }),
    );
    if (useProject.getState().selectedTrack === track_id) useProject.getState().selectTrack(null);
    return trackAnswer(
      r.track.clicks
        ? `Faixa ${r.track.name} [${track_id}] removida e o clique automático desligado em todas as gravações.`
        : `Faixa vazia ${r.track.name} [${track_id}] removida.`,
    );
  },

  async set_track({ track_id, locked, muted, hidden, revision }, { commit }) {
    const p = requireProject();
    if (revision !== undefined) requireRevision(revision);
    if (locked === undefined && muted === undefined && hidden === undefined)
      throw new ToolError("Informe locked, muted ou hidden. Nada foi feito.");
    const flags = {
      ...(locked !== undefined ? { locked } : {}),
      ...(muted !== undefined ? { muted } : {}),
      ...(hidden !== undefined ? { hidden } : {}),
    };
    const r = setTrackFlags(p, track_id, flags);
    if (!r.ok) throw new ToolError(r.error);
    committedOrFail(
      commit((q) => {
        const again = setTrackFlags(q, track_id, flags);
        return again.ok ? again.project : q;
      }),
    );
    const said = [
      locked !== undefined && (locked ? "travada" : "destravada"),
      muted !== undefined && (muted ? "muda" : "com som"),
      hidden !== undefined && (hidden ? "oculta" : "visível"),
    ].filter(Boolean);
    return trackAnswer(`Faixa ${r.track.name} [${track_id}]: ${said.join(", ")}.`, track_id);
  },

  // Voices (shared/voiceRule.ts): never two at once.
  async set_volume({ clip_ids, volume, mute, from, to }, { commit }) {
    const p = requireProject();
    requireNoStructuralDraft();
    if ((from === undefined) !== (to === undefined))
      throw new ToolError("Informe from e to juntos (ou nenhum, para o clipe inteiro).");
    if (from !== undefined && to !== undefined && to - from < 0.05)
      throw new ToolError("O trecho é vazio: to precisa ser maior que from. Nada foi feito.");
    const target = editableClips(p, clip_ids);
    const assets = new Map(p.assets.map((a) => [a.id, a]));
    const level = mute ? 0 : volume;
    const notes: string[] = [];
    const changes = new Map<string, Partial<Clip>>();
    for (const id of target.ids) {
      const c = p.clips.find((x) => x.id === id);
      const a = c && assets.get(c.assetId);
      if (!c || !a?.hasAudio || a.kind === "image") continue;
      if (from === undefined || to === undefined) {
        changes.set(id, { volume: level });
        continue;
      }
      const a0 = Math.max(from, c.start);
      const b0 = Math.min(to, clipEnd(c));
      if (b0 - a0 < 0.01) {
        notes.push(`${id} não passa por ${t(from)}–${t(to)}`);
        continue;
      }
      if (c.volume <= 0 && level > 0) {
        notes.push(`${id} está com volume 0 no clipe inteiro: suba o volume do clipe antes`);
        continue;
      }
      const db = level <= 0 ? GAIN_MIN_DB : 20 * Math.log10(level / c.volume);
      if (db > GAIN_MAX_DB)
        notes.push(`${id}: no trecho, no máximo +${GAIN_MAX_DB} dB sobre o volume do clipe`);
      changes.set(id, { gain: rangeGain(c.gain, a0 - c.start, b0 - c.start, db, VOICE_RAMP) });
    }
    if (!changes.size)
      throw new ToolError(
        `Nada foi feito: ${notes.length ? notes.join("; ") : "nenhum dos clipes tem som"}.${target.note}`,
      );
    committedOrFail(
      commit((q) => ({
        ...q,
        clips: q.clips.map((c) => {
          const change = changes.get(c.id);
          return change ? { ...c, ...change } : c;
        }),
      })),
    );
    const what = level <= 0 ? "mudo" : `volume ${Math.round(level * 100)}%`;
    return [
      `${plural(changes.size, "clipe", "clipes")} ${from !== undefined && to !== undefined ? `com ${what} de ${t(from)} a ${t(to)} (rampa de 0,05 s nas bordas, sem dividir)` : `com ${what}`}: ${[...changes.keys()].join(", ")}.`,
      ...notes.map((n) => `Ficou de fora: ${n}.`),
    ]
      .join("\n")
      .concat(target.note);
  },

  async set_voice_rule({ enabled, picture }, { commit }) {
    requireProject();
    requireNoStructuralDraft();
    if (enabled === undefined && picture === undefined)
      return voiceSummary(requireProject()).join("\n");
    committedOrFail(
      commit((q) => ({
        ...q,
        voiceRule: {
          ...q.voiceRule,
          ...(enabled !== undefined ? { enabled } : {}),
          ...(picture ? { picture } : {}),
        },
      })),
    );
    return voiceSummary(requireProject()).join("\n");
  },

  async set_voice_role({ media, track_id, role, name }, { commit }) {
    const p = requireProject();
    requireNoStructuralDraft();
    if (!!media === !!track_id) throw new ToolError("Informe media ou track_id (um dos dois).");
    if (role === "personagem" && !name)
      throw new ToolError('Para "personagem", informe name (o nome do personagem).');
    const value: VoiceRole | undefined =
      role === "professora"
        ? { kind: "teacher" }
        : role === "personagem"
          ? { kind: "character", name: (name ?? "").trim() }
          : role === "nenhum"
            ? { kind: "none" }
            : undefined;
    let label: string;
    if (track_id) {
      const tr = p.tracks.find((x) => x.id === track_id);
      if (!tr)
        throw new ToolError(`Faixa não encontrada: ${track_id}. Use os ids de get_overview.`);
      if (tr.locked) throw new ToolError(`A faixa ${tr.name} está travada: nada foi feito.`);
      label = `faixa ${tr.name}`;
      committedOrFail(
        commit((q) => ({
          ...q,
          tracks: q.tracks.map((x) => {
            if (x.id !== track_id) return x;
            const { voiceRole: _old, ...rest } = x;
            return value ? { ...rest, voiceRole: value } : rest;
          }),
        })),
      );
    } else {
      const wanted = media ?? "";
      const a =
        p.assets.find((x) => x.id === wanted) ??
        p.assets.find((x) => x.name.toLowerCase().includes(wanted.toLowerCase()));
      if (!a) throw new ToolError(`Mídia "${wanted}" não encontrada. Veja get_overview.`);
      label = a.name;
      committedOrFail(
        commit((q) => ({
          ...q,
          assets: q.assets.map((x) => {
            if (x.id !== a.id) return x;
            const { voiceRole: _old, ...rest } = x;
            return value ? { ...rest, voiceRole: value } : rest;
          }),
        })),
      );
    }
    return [
      `${label}: ${value ? roleLabel(value) : "papel automático"}.`,
      ...voiceSummary(requireProject()),
    ].join("\n");
  },

  async set_crop({ clip_ids, left, right, top, bottom }, { commit }) {
    const p = requireProject();
    requireNoStructuralDraft();
    const target = editableClips(p, clip_ids);
    const assets = new Map(p.assets.map((a) => [a.id, a]));
    const visual = (c: Clip): boolean => {
      const a = assets.get(c.assetId);
      return !!a && a.kind !== "audio" && !c.soundOnly && !c.zoomLayer;
    };
    const ids = new Set(
      target.ids.filter((id) => {
        const c = p.clips.find((x) => x.id === id);
        return !!c && visual(c);
      }),
    );
    if (!ids.size)
      throw new ToolError(
        "Nada foi feito: só clipes de vídeo ou de imagem têm bordas para cortar (os pedidos são de som ou camadas de zoom).",
      );
    const crop: Crop = { left: left ?? 0, top: top ?? 0, right: right ?? 0, bottom: bottom ?? 0 };
    const none = !crop.left && !crop.top && !crop.right && !crop.bottom;
    committedOrFail(
      commit((q) => ({
        ...q,
        clips: q.clips.map((c) => {
          if (!ids.has(c.id)) return c;
          if (none) {
            if (!c.transform?.crop) return c;
            const { crop: _removed, ...rest } = c.transform;
            return { ...c, transform: rest };
          }
          // The center and the scale stay: only the strips cut off disappear.
          return { ...c, transform: { ...(c.transform ?? DEFAULT_TRANSFORM), crop } };
        }),
      })),
    );
    const sides = cropLabel(crop);
    const skipped = target.ids.length - ids.size;
    return [
      none
        ? `Recorte tirado de ${plural(ids.size, "clipe", "clipes")}: ${[...ids].join(", ")}.`
        : `Recorte (${sides}) em ${plural(ids.size, "clipe", "clipes")}: ${[...ids].join(", ")}. O centro e a escala não mudaram; confira com get_frame.`,
      skipped
        ? `${plural(skipped, "clipe de som do grupo ficou", "clipes de som do grupo ficaram")} de fora.`
        : "",
    ]
      .filter(Boolean)
      .join(" ")
      .concat(target.note);
  },

  async set_clip_layout(
    { clip_ids, placement, x, y, scale, opacity, fade_in, fade_out },
    { commit },
  ) {
    const p = requireProject();
    const target = editableClips(p, clip_ids);
    const ids = new Set(target.ids);
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
    return `${plural(ids.size, "clipe ajustado", "clipes ajustados")}.${target.note}`;
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
    // A key by the local AI gives way to the color key the tool sets.
    const { mode: _mode, ...previous } = a.key ?? DEFAULT_KEY;
    const keyedColor = a.key?.mode === "person" ? undefined : a.key?.color;
    const c = color
      ? `#${color.replace("#", "").toUpperCase()}`
      : (keyedColor ??
        a.screen ??
        (await window.api.detectScreen(a.path, a.duration, a.width, a.height)));
    if (!c)
      throw new ToolError(
        `Não achei um fundo azul ou verde liso em ${a.name}. Informe a cor (color).`,
      );
    const key = {
      ...DEFAULT_KEY,
      ...previous,
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
    const target = clip_ids ? editableClips(p, clip_ids) : null;
    const lockedTracks = new Set(p.tracks.filter((tr) => tr.locked).map((tr) => tr.id));
    const clips = p.clips.filter((c) =>
      target
        ? target.ids.includes(c.id)
        : !!assets.get(c.assetId)?.cursor && !lockedTracks.has(c.trackId),
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
      return `Zooms removidos de ${plural(clips.length, "clipe", "clipes")}.${target?.note ?? ""}`;
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
    return `${plural(total, "zoom automático", "zooms automáticos")} em ${plural(clips.length - skipped.length, "clipe", "clipes")}.${skipped.length ? ` Sem dados de clique: ${skipped.join(", ")}.` : ""}${target?.note ?? ""}`;
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
    const target = editableClips(p, clip_ids);
    const ids = new Set(target.ids);
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
    return `Animação ajustada em ${plural(ids.size, "clipe", "clipes")}.${target.note}`;
  },

  async set_transition({ clip_ids, kind, duration, colors }, { commit }) {
    const p = requireProject();
    const target = editableClips(p, clip_ids);
    const ok = target.ids.filter((id) => {
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
    const skipped = target.ids.length - ok.length;
    return `Transição ${kind === "none" ? "removida" : "aplicada"} em ${plural(ok.length, "corte", "cortes")}.${skipped ? ` ${plural(skipped, "clipe sem cena colada antes foi ignorado", "clipes sem cena colada antes foram ignorados")}.` : ""}${target.note}`;
  },

  async add_card({ where, title, kicker, subtitle }, { commit }) {
    requireProject();
    requireNoStructuralDraft();
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
    return `Paleta ${found.name} nesta aula${(recolor ?? true) ? ` (${plural(n, "anotação redesenhada", "anotações redesenhadas")})` : ""}${fonts ? `, com as fontes do tema (${[found.fonts?.heading, found.fonts?.body].filter(Boolean).join(" e ") || "padrão"})` : fonts === false ? ", com a fonte padrão" : ""}.`;
  },

  async set_style(
    { clip_ids, font, outline_color, outline_width, outline_dash, outline_style, shadow },
    { commit },
  ) {
    const p = requireProject();
    const target = editableClips(p, clip_ids);
    const batch = batched(commit);
    const done: string[] = [];
    for (const id of target.ids) {
      const clip = p.clips.find((c) => c.id === id);
      if (!clip) continue;
      // A drawing from the recording keeps the look it was drawn with (as in clipProps.ts): it
      // is left out, and the rest of the list goes on.
      if (clip.annotation && isDrawingKind(clip.annotation.kind)) continue;
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
          batch.commit,
        );
        done.push(id);
      } else if (shadow) {
        const s = shadowNamed(shadow);
        batch.commit((q) => ({
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
    if (!done.length)
      throw new ToolError(
        "Nada mudou: vídeos e imagens só aceitam shadow, e o desenho da gravação mantém o estilo com que foi feito.",
      );
    if (!batch.flush()) throw new ToolError("Nada mudou: a aula aberta mudou.");
    return `Estilo aplicado em ${plural(done.length, "clipe", "clipes")}.${target.note}`;
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
    if (add_music_path === undefined && !music_tracks?.length && denoise === undefined)
      throw new ToolError("Nada para fazer: passe add_music_path, music_tracks ou denoise.");
    // Every id is checked before anything changes, and the call is one undo step.
    const unknownTracks = (music_tracks ?? [])
      .map((m) => m.track_id)
      .filter((id) => !p.tracks.some((tr) => tr.id === id));
    if (unknownTracks.length)
      throw new ToolError(
        `Faixas não encontradas: ${unknownTracks.join(", ")}. Nada foi feito. Use os ids de get_overview.`,
      );
    const lockedTracks = (music_tracks ?? [])
      .map((m) => m.track_id)
      .filter((id) => p.tracks.find((tr) => tr.id === id)?.locked);
    if (lockedTracks.length)
      throw new ToolError(
        `Nada foi feito: ${lockedTracks.length === 1 ? "a faixa" : "as faixas"} ${lockedTracks.join(", ")} ${lockedTracks.length === 1 ? "está travada" : "estão travadas"}. Peça para a pessoa destravar se for para mudar.`,
      );
    const voiceTarget = denoise !== undefined && clip_ids ? editableClips(p, clip_ids) : null;
    const batch = batched(commit);
    const done: string[] = [];
    if (add_music_path) {
      // The same file already playing on a music track is not added a second time.
      const music = new Set(p.tracks.filter((tr) => tr.music).map((tr) => tr.id));
      const playing = p.assets.some(
        (a) =>
          samePath(a.path, add_music_path) &&
          p.clips.some((c) => c.assetId === a.id && music.has(c.trackId)),
      );
      if (playing) done.push("essa música já está na faixa de música; nada foi repetido");
      else {
        if (!(await addMusic(add_music_path, batch.commit)))
          throw new ToolError("Não consegui usar esse arquivo como música. Nada foi feito.");
        done.push("música adicionada na faixa “Música” (abaixa quando alguém fala)");
      }
    }
    for (const m of music_tracks ?? []) {
      setTrackMusic(m.track_id, m.music, batch.commit);
      done.push(`faixa ${m.track_id} ${m.music ? "marcada" : "desmarcada"} como música`);
    }
    if (denoise !== undefined) {
      const music = new Set(p.tracks.filter((tr) => tr.music).map((tr) => tr.id));
      const locked = new Set(p.tracks.filter((tr) => tr.locked).map((tr) => tr.id));
      const voice = p.clips.filter(
        (c) =>
          !music.has(c.trackId) &&
          !locked.has(c.trackId) &&
          p.assets.find((a) => a.id === c.assetId)?.hasAudio,
      );
      const ids = voiceTarget?.ids ?? voice.map((c) => c.id);
      setDenoise(ids, denoise, batch.commit);
      done.push(
        `redução de ruído ${denoise ? "ligada" : "desligada"} em ${plural(ids.length, "clipe", "clipes")}${voiceTarget?.note ?? ""}`,
      );
    }
    if (!batch.flush()) throw new ToolError("Nada foi feito: a aula aberta mudou.");
    return `${done.join("; ")}.`;
  },

  async set_speed({ clip_ids, speed, ripple }, { commit }) {
    const p = requireProject();
    requireNoStructuralDraft();
    const target = editableClips(p, clip_ids);
    const still = p.clips.filter((c) => target.ids.includes(c.id) && !hasSpeed(p, c));
    const n = applySpeed(target.ids, speed, ripple ?? false, commit);
    if (!n)
      throw new ToolError(
        "Esses clipes não têm velocidade (imagens, anotações e camadas de zoom) ou estão em faixas travadas.",
      );
    return `Velocidade ${speedLabel(speed)} em ${plural(n, "clipe", "clipes")}${still.length ? `; ${still.length} sem velocidade ficaram como estavam` : ""}.${target.note}`;
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
    const target = editableClips(p, [clip_id]);
    const ids = new Set(target.ids);
    // Each clip of the group gets the same moments of the timeline, counted from its own start.
    const framesOf = (clip: Clip) =>
      keyframes
        .map((k) => ({
          t: Math.max(0, Math.min(clip.duration, k.at - clip.start)),
          x: k.x,
          y: k.y,
          scale: k.scale,
        }))
        .sort((a, b) => a.t - b.t);
    commit((q) => ({
      ...q,
      clips: q.clips.map((c) => {
        if (!ids.has(c.id)) return c;
        const kfs = framesOf(c);
        return { ...c, keyframes: kfs.length ? kfs : undefined };
      }),
    }));
    const moved = ids.size > 1 ? ` em ${plural(ids.size, "clipe", "clipes")} do grupo` : "";
    return keyframes.length
      ? `${plural(keyframes.length, "posição marcada", "posições marcadas")}${moved}; o clipe desliza entre elas.${target.note}`
      : `Movimento removido${moved}.${target.note}`;
  },

  // Timing on one track (shared/clipMoves.ts). Everything is checked on the lesson as it is now
  // before the single commit: a refused call changes nothing and leaves no step in the history.
  async split_clip({ clip_id, at, revision }, { commit }) {
    const p = requireProject();
    requireNoStructuralDraft();
    requireRevision(revision);
    const r = splitOneClip(p, clip_id, at);
    if (!r.ok) throw new ToolError(r.error);
    committedOrFail(commit((q) => ({ ...q, clips: r.clips })));
    return `Clipe ${clip_id} dividido em ${t(at)}: [${r.first}] até ${t(at)} e [${r.second}] a partir de ${t(at)}. As outras faixas não mudaram.`;
  },

  async move_clips({ clip_ids, start, delta, moves, revision }, { commit }) {
    const p = requireProject();
    requireNoStructuralDraft();
    requireRevision(revision);
    let requests: MoveRequest[];
    if (moves) {
      if (clip_ids || start !== undefined || delta !== undefined)
        throw new ToolError("Use moves ou clip_ids com start/delta, não os dois. Nada foi feito.");
      requests = moves.map((m) => ({ id: m.clip_id, start: m.start, delta: m.delta }));
    } else {
      if (!clip_ids) throw new ToolError("Informe clip_ids (com start ou delta) ou moves.");
      if ((start === undefined) === (delta === undefined))
        throw new ToolError("Informe start ou delta (um dos dois). Nada foi feito.");
      if (start !== undefined && clip_ids.length !== 1)
        throw new ToolError(
          "start vale para um clipe só: para vários, use delta ou moves. Nada foi feito.",
        );
      requests = clip_ids.map((id) => ({ id, start, delta }));
    }
    const plan = planMoves(p, requests);
    if (!plan.ok) throw new ToolError(plan.error);
    if (!plan.moved.length) {
      if (plan.locked.length) throw new ToolError(`Nada foi movido.${lockedNote(plan.locked)}`);
      return "Nada mudou: os clipes já estavam nessas posições.";
    }
    committedOrFail(commit((q) => ({ ...q, clips: plan.clips })));
    const lines = plan.moved
      .sort((a, b) => a.to - b.to)
      .map((m) => `[${m.id}] ${t(m.from)} → ${t(m.to)}`);
    return [
      `${plural(plan.moved.length, "clipe movido", "clipes movidos")} no tempo, sem empurrar os outros:`,
      ...lines,
    ]
      .join("\n")
      .concat(lockedNote(plan.locked));
  },

  async align_track_to({ track_id, reference_track_id, revision }, { commit, draft }) {
    // In a draft the plan is worked out on the draft as shown; otherwise on the lesson.
    const p = basisOf(commit) ?? requireProject();
    requireNoStructuralDraft();
    requireRevision(revision);
    const plan = planAlign(p, track_id, reference_track_id);
    if (!plan.ok) throw new ToolError(plan.error);
    committedOrFail(commit((q) => ({ ...q, clips: plan.clips })));
    const pieces = plan.pieces.map((x) => `[${x.id}] ${t(x.from)} → ${t(x.to)}`);
    const splits = plan.splits.map(t).join(", ") || "nenhum ponto";
    return [
      `Faixa ${track_id} ${draft ? "alinhada no rascunho" : "alinhada"} à faixa ${reference_track_id}: dividida em ${splits}; ${plural(plan.pieces.length, "pedaço", "pedaços")} no início de cada clipe da referência:`,
      ...pieces,
      plan.warning ? `Atenção: ${plan.warning}` : "",
      "A referência e as outras faixas não mudaram.",
    ]
      .filter(Boolean)
      .join("\n");
  },

  // Library and sound (shared/soundPlacement.ts): nothing is ever covered nor pushed.
  async list_library({ kind, search }) {
    const p = requireProject();
    if (!useSharedLibrary.getState().loaded) await loadSharedLibrary();
    const query = search ? plainWord(search) : "";
    const matches = (...words: string[]): boolean =>
      !query || words.some((w) => plainWord(w).includes(query));
    const used = new Map<string, number>();
    for (const c of p.clips) used.set(c.assetId, (used.get(c.assetId) ?? 0) + 1);
    const lines: string[] = [];
    if (kind !== "sfx") {
      const own = p.assets.filter(
        (a) => !a.generated && (!kind || a.kind === kind) && matches(a.name, a.kind),
      );
      if (own.length) {
        lines.push("Mídias deste projeto:");
        for (const a of own)
          lines.push(
            `- [${a.id}] ${a.name} · ${a.kind}${a.kind === "image" ? "" : ` · ${a.duration.toFixed(1)} s`} · ${used.get(a.id) ? `na timeline (${plural(used.get(a.id) ?? 0, "clipe", "clipes")})` : "fora da timeline"}${a.missing ? " · ARQUIVO NÃO ENCONTRADO" : ""}`,
          );
      }
    }
    if (!kind || kind === "sfx" || kind === "audio") {
      const sounds = SOUND_EFFECTS.filter((s) => matches(s.id, s.name, s.hint, ...s.tags));
      if (sounds.length) {
        lines.push(
          "Efeitos sonoros do EdiAula (cerca de −18 LUFS, próprios, sem licença a pagar):",
        );
        for (const s of sounds)
          lines.push(
            `- [sfx:${s.id}] ${s.name} · ${SOUND_GROUP_LABEL[s.group]} · ${s.seconds.toFixed(2)} s · tags: ${s.tags.join(", ")} · ${s.hint}`,
          );
      }
    }
    const library = useSharedLibrary
      .getState()
      .library.media.filter(
        (m) =>
          (kind === "sfx"
            ? m.category === "efeito"
            : !kind || m.kind === kind || (kind === "audio" && m.category === "efeito")) &&
          matches(m.name, CATEGORY_LABEL[m.category]),
      );
    if (library.length) {
      lines.push("Biblioteca de todas as aulas (da pessoa):");
      for (const m of library)
        lines.push(
          `- [lib:${m.id}] ${m.name} · ${CATEGORY_LABEL[m.category]} · ${m.kind}${m.missing ? " · ARQUIVO NÃO ENCONTRADO" : ""}`,
        );
    }
    return lines.length ? lines.join("\n") : "Nada encontrado com esse filtro.";
  },

  async add_clip(input, { commit }) {
    requireProject();
    requireNoStructuralDraft();
    const media = await resolveMedia(input.media_id, new Map());
    const speech = media.asset.kind === "image" ? [] : await rawSpeech(requireProject());
    const p = basisOf(commit) ?? requireProject();
    const options: PlaceOptions = {
      ...(input.track_id ? { trackId: input.track_id } : {}),
      ...(input.in !== undefined ? { in: input.in } : {}),
      ...(input.out !== undefined ? { out: input.out } : {}),
      ...(input.volume !== undefined ? { volume: input.volume } : {}),
      ...(input.fade_in !== undefined ? { fadeIn: input.fade_in } : {}),
      ...(input.fade_out !== undefined ? { fadeOut: input.fade_out } : {}),
    };
    const place = (q: Project) =>
      placeOverSpeech(withMedia(q, [media]), media.asset, input.at, options, speech, media.effect);
    const r = place(p);
    if (!r.ok) throw new ToolError(r.error);
    committedOrFail(commit((q) => (q === p ? r.project : placedOrSame(place(q), q))));
    mediaAdded([media]);
    const track = r.project.tracks.find((x) => x.id === r.trackId);
    return `${media.asset.name} colocado em ${t(input.at)} na faixa ${track?.name ?? r.trackId} [${r.clipId}], sem cobrir nem empurrar nada.${r.note}${r.lowered ? ` ${loweredNote}` : ""}`;
  },

  async add_sound_effects({ items }, { commit, draft }) {
    requireProject();
    // Into a draft they go with the rest of it; on the lesson, not while a draft moves its clips.
    if (!draft) requireNoStructuralDraft();
    // Times and sounds are worked out first; the lesson changes once, at the end.
    const shown = basisOf(commit) ?? requireProject();
    const problems: string[] = [];
    const wanted: { media: ResolvedMedia; at: number; volume: number; label: string }[] = [];
    const seen = new Map<string, ResolvedMedia>();
    for (const it of items) {
      try {
        const at = await soundTime(shown, it);
        const media = await resolveMedia(it.sfx, seen, true);
        wanted.push({ media, at, volume: it.volume ?? 0.8, label: it.sfx });
      } catch (err) {
        problems.push(`${it.sfx}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!wanted.length) throw new ToolError(`Nenhum efeito foi colocado.\n${problems.join("\n")}`);
    const speech = await rawSpeech(requireProject());
    const p = basisOf(commit) ?? requireProject();
    const placeAll = (q: Project) => {
      let project = withMedia(
        q,
        wanted.map((w) => w.media),
      );
      const placed: { at: number; label: string; id: string; track: string; lowered: boolean }[] =
        [];
      const failed: string[] = [];
      for (const w of [...wanted].sort((a, b) => a.at - b.at)) {
        const r = placeOverSpeech(project, w.media.asset, w.at, { volume: w.volume }, speech, true);
        if (!r.ok) {
          failed.push(`${w.label} em ${t(w.at)}: ${r.error}`);
          continue;
        }
        project = r.project;
        const track = project.tracks.find((x) => x.id === r.trackId)?.name ?? r.trackId;
        placed.push({ at: w.at, label: w.label, id: r.clipId, track, lowered: r.lowered });
      }
      return { project, placed, failed };
    };
    const plan = placeAll(p);
    if (!plan.placed.length)
      throw new ToolError(
        `Nenhum efeito foi colocado.\n${[...problems, ...plan.failed].join("\n")}`,
      );
    committedOrFail(commit((q) => (q === p ? plan.project : placeAll(q).project)));
    mediaAdded(wanted.map((w) => w.media));
    const lowered = plan.placed.filter((x) => x.lowered);
    const tracks = [...new Set(plan.placed.map((x) => x.track))].join(", ");
    return [
      `${plural(plan.placed.length, "efeito sonoro", "efeitos sonoros")} ${draft ? "no rascunho" : "colocados"} na faixa ${tracks}, sem mexer nas outras faixas:`,
      ...plan.placed.map(
        (x) =>
          `- [${x.id}] ${x.label} em ${t(x.at)}${x.lowered ? " (volume baixado para 30%)" : ""}`,
      ),
      lowered.length ? loweredNote : "",
      ...problems,
      ...plan.failed,
    ]
      .filter(Boolean)
      .join("\n");
  },

  async set_click_sound({ media, enabled, sound, volume, include }, { commit }) {
    const p = requireProject();
    requireNoStructuralDraft();
    const recordings = p.assets.filter((a) => !!a.cursor);
    const targets = media
      ? recordings.filter(
          (a) => a.id === media || a.name.toLowerCase().includes(media.toLowerCase()),
        )
      : recordings;
    if (!targets.length)
      throw new ToolError(
        media
          ? `Nenhuma gravação de tela do EdiAula com "${media}". O clique automático só vale para elas (as gravadas com o cursor salvo).`
          : "Este projeto não tem gravações de tela do EdiAula: não há cliques salvos para tocar.",
      );
    const kind = sound ? findSoundEffect(sound) : undefined;
    if (sound && !kind)
      throw new ToolError(`Efeito sonoro não encontrado: "${sound}". Veja os ids em list_library.`);
    const changes: Partial<CursorFx> = {
      clickSound: enabled,
      ...(kind ? { clickSoundKind: kind.id } : {}),
      ...(volume !== undefined ? { clickVolume: volume } : {}),
      ...(include ? { clickInclude: [...new Set(include)] } : {}),
    };
    const ids = new Set(targets.map((a) => a.id));
    const clicks = clicksTrack(p);
    const unmute = enabled && !!clicks?.muted && !clicks.locked;
    committedOrFail(
      commit((q) => {
        const next: Project = {
          ...q,
          assets: q.assets.map((a) =>
            ids.has(a.id)
              ? { ...a, cursorFx: { ...DEFAULT_CURSOR_FX, ...a.cursorFx, ...changes } }
              : a,
          ),
          tracks: unmute ? q.tracks.map((x) => (x.clicks ? { ...x, muted: false } : x)) : q.tracks,
        };
        return enabled ? withClicksTrack(next) : next;
      }),
    );
    const now = requireProject();
    const events = await loadClickEvents(now);
    const names = targets.map((a) => a.name).join(", ");
    const lines = [
      `Clique automático ${enabled ? "ligado" : "desligado"} em ${names}.`,
      `A aula tem agora ${plural(events.length, "clique", "cliques")} soando na faixa ${clicksTrack(now)?.name ?? "Cliques"}${
        events.length
          ? `: ${events
              .slice(0, 15)
              .map((e) => t(e.at))
              .join(", ")}${events.length > 15 ? "…" : ""}`
          : ""
      }.`,
    ];
    if (unmute) lines.push("A faixa Cliques estava silenciada e foi ligada.");
    if (enabled && clicks?.muted && clicks.locked)
      lines.push(
        "A faixa Cliques está silenciada e travada: ela não foi mudada, então os cliques não soam até a pessoa destravar e ligar a faixa.",
      );
    return lines.join("\n");
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
  if (isMemoryTool(name)) return { ok: false, text: "A memória do chat não passa pelo editor." };
  const tool = AI_TOOLS[name];
  const checked = tool.input.safeParse(call.input ?? {});
  if (!checked.success)
    return { ok: false, text: `Parâmetros inválidos: ${checked.error.message}` };
  const state = useProject.getState();
  // A track named as the timeline shows it ("F1") or by its name works like its id.
  const parsed = {
    data: state.project ? withTrackIds(state.project.tracks, checked.data) : checked.data,
  };
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
  // The lesson the call is for, fixed now: the call's own, else the one open when it came in. A
  // lesson opened while the call awaits something is never written by it.
  const projectId = call.projectId ?? state.project?.id;
  const entry: AiEntry = {
    origin: "ai",
    key: `ai:${call.id}`,
    ...(projectId ? { projectId } : {}),
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
        draftAuthor(call),
        call.source === "assistant"
          ? "Mudanças propostas pelo Assistente"
          : "Mudanças propostas pela IA conectada",
        projectId,
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

/** Who a draft written by a call belongs to: the chat inside EdiAula, or the connected app. */
const draftAuthor = (call: AiToolCall): string =>
  call.source === "assistant" ? "assistente" : `cliente:${call.client ?? "externo"}`;

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
