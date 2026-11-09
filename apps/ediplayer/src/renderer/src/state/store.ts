import { NO_TRANSFORM, type PresetId, type Transform } from "@shared/edit";
import {
  isPartRemoved,
  type MarkMode,
  normalizeRanges,
  piecesFromPoints,
  type Range,
  setPartRemoved,
  startsOffKeyframes,
} from "@shared/ranges";
import { type Cue, parseSubtitles } from "@shared/subtitles";
import type {
  FrameSheet,
  MediaFacts,
  PlaybackSource,
  PlayerPrefs,
  QueueItem,
  RecentItem,
} from "@shared/types";
import { create } from "zustand";
import { fileName, seek, video } from "../lib/media";

export type ToolId =
  | "trim"
  | "split"
  | "join"
  | "rotate"
  | "crop"
  | "speed"
  | "audio"
  | "subtitle"
  | "convert"
  | "gif";
export type SaveKind = "export" | "split" | "join" | "audio";

interface Snapshot {
  marks: Range[];
  splitPoints: number[];
  transform: Transform;
}

export interface Item {
  path: string;
  name: string;
  mode?: PlaybackSource["mode"];
}

interface State {
  view: "home" | "player";
  list: Item[];
  index: number;
  source: PlaybackSource | null;
  facts: MediaFacts | null;
  loading: { label: string; ratio: number } | null;
  error: string | null;
  /** 0 as planned; 1 and 2 after the <video> failed (a copy, then a preview). */
  fallbackLevel: number;
  time: number;
  duration: number;
  playing: boolean;
  rate: number;
  ab: { a: number; b: number | null } | null;
  mini: boolean;
  onTop: boolean;
  prefs: PlayerPrefs;
  /** `track`: the file's own subtitle stream it came from, for the Legenda menu. */
  subtitle: { name: string; cues: Cue[]; path: string | null; track: number | null } | null;
  subtitleDelay: number;
  sheet: FrameSheet | null;
  wave: number[] | null;
  keyframes: number[] | null;
  editing: boolean;
  tool: ToolId;
  marks: Range[];
  selected: number | null;
  /** The part made by Dividir that was clicked on the ruler; Delete deletes it. */
  part: number | null;
  pendingIn: number | null;
  mode: MarkMode;
  precise: boolean;
  transform: Transform;
  splitPoints: number[];
  past: Snapshot[];
  future: Snapshot[];
  joinFiles: MediaFacts[];
  /** `marked`: the result is the marked stretches themselves (a GIF), whatever the mode. */
  save: { kind: SaveKind; preset: PresetId; marked: boolean } | null;
  queue: QueueItem[];
  queueOpen: boolean;
  recents: RecentItem[];
  toast: string | null;
  /** The edits of this file as they were when a save of them finished (editKey). */
  savedEdits: string | null;
  /** A question waiting in the window (AskDialog), answered by answerAsk. */
  ask: { message: string; confirm: string } | null;
}

const DEFAULT_PREFS: PlayerPrefs = {
  volume: 1,
  boost: false,
  muted: false,
  subtitleSize: 1,
  subtitleBottom: 8,
};

export const useStore = create<State>(() => ({
  view: "home",
  list: [],
  index: -1,
  source: null,
  facts: null,
  loading: null,
  error: null,
  fallbackLevel: 0,
  time: 0,
  duration: 0,
  playing: false,
  rate: 1,
  ab: null,
  mini: false,
  onTop: false,
  prefs: DEFAULT_PREFS,
  subtitle: null,
  subtitleDelay: 0,
  sheet: null,
  wave: null,
  keyframes: null,
  editing: false,
  tool: "trim",
  marks: [],
  selected: null,
  part: null,
  pendingIn: null,
  mode: "remove",
  precise: true,
  transform: NO_TRANSFORM,
  splitPoints: [],
  past: [],
  future: [],
  joinFiles: [],
  save: null,
  queue: [],
  queueOpen: true,
  recents: [],
  toast: null,
  savedEdits: null,
  ask: null,
}));

const set = useStore.setState;
const get = useStore.getState;
const api = () => window.api;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string): void {
  clearTimeout(toastTimer);
  set({ toast: text });
  toastTimer = setTimeout(() => set({ toast: null }), 3500);
}

const message = (error: unknown) =>
  error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")
    : String(error);
export const fail = (error: unknown): void => toast(message(error));

export async function refreshRecents(): Promise<void> {
  set({ recents: await api().recents() });
}

/** Watched means it reached its last stretch (the final 10 s, less for short clips). */
const watchedAt = (time: number, duration: number) =>
  time >= duration - Math.min(10, duration * 0.05);

/**
 * Saves where the current file stopped (every few seconds, when leaving it) and keeps the local
 * list in step, so going back to a file resumes where it really stopped.
 */
export async function rememberPosition(): Promise<void> {
  const { source, time, duration, loading } = get();
  // While another file is loading the clock still belongs to the previous one.
  if (!source || loading || !(duration > 0)) return;
  const item = {
    path: source.facts.path,
    name: source.facts.name,
    duration,
    position: time,
    watched: watchedAt(time, duration),
  };
  const key = item.path.toLowerCase();
  set({
    recents: [
      { ...item, updatedAt: Date.now() },
      ...get().recents.filter((r) => r.path.toLowerCase() !== key),
    ],
  });
  await api()
    .remember(item)
    .catch(() => undefined);
}

/** The edit work of the current file, as one string to compare (what a save took). */
function editKey(): string {
  const { marks, splitPoints, transform, joinFiles } = get();
  const { audioIndex: _a, ...changed } = transform;
  return JSON.stringify([marks, splitPoints, joinFiles.map((f) => f.path), changed]);
}

/** Edit work that switching files would throw away: none once a save of it has finished. */
export function hasEdits(): boolean {
  const { marks, splitPoints, transform, joinFiles, savedEdits } = get();
  const { audioIndex: _a, ...changed } = transform;
  const { audioIndex: _b, ...plain } = NO_TRANSFORM;
  const edited =
    marks.length > 0 ||
    splitPoints.length > 0 ||
    joinFiles.length > 0 ||
    JSON.stringify(changed) !== JSON.stringify(plain);
  return edited && editKey() !== savedEdits;
}

/** Saves sent to the queue: which file and which edits each one took (by queue item id). */
const queuedSaves = new Map<string, { path: string; key: string }>();

/** A save of the current edits went into the queue. */
export function noteSaveQueued(item: QueueItem): void {
  const path = get().source?.facts.path;
  if (path) queuedSaves.set(item.id, { path, key: editKey() });
}

/** The queue changed: a save that finished makes those edits of that file saved. */
export function noteQueue(queue: QueueItem[]): void {
  set({ queue });
  for (const item of queue) {
    const saved = queuedSaves.get(item.id);
    if (!saved || item.status === "waiting" || item.status === "working") continue;
    queuedSaves.delete(item.id);
    if (item.status === "done" && saved.path === get().source?.facts.path)
      set({ savedEdits: saved.key });
  }
}

let answer: ((ok: boolean) => void) | null = null;

/** Asks in the window (AskDialog, not the system's box); true when the person confirms. */
export function ask(message: string, confirm: string): Promise<boolean> {
  answer?.(false);
  return new Promise((resolve) => {
    answer = resolve;
    set({ ask: { message, confirm } });
  });
}

export function answerAsk(ok: boolean): void {
  const resolve = answer;
  answer = null;
  set({ ask: null });
  resolve?.(ok);
}

/** Asks before discarding edits not saved yet; true when it is fine to leave the current file. */
export async function confirmLeave(
  message = "As edições deste vídeo ainda não foram salvas. Descartar?",
): Promise<boolean> {
  return !hasEdits() || ask(message, "Descartar");
}

/**
 * Adds files to the list. From the person (dialog, drop, list) the first one plays; from
 * outside (Explorer, "Abrir com") while editing, they only join the list.
 */
export async function openPaths(
  paths: string[],
  from: "person" | "outside" = "person",
): Promise<void> {
  if (!paths.length) return;
  const known = new Set(get().list.map((i) => i.path.toLowerCase()));
  const fresh = paths
    .filter((p) => !known.has(p.toLowerCase()))
    .map((path) => ({ path, name: fileName(path) }));
  const list = [...get().list, ...fresh];
  set({ list });
  if (from === "outside" && get().editing && hasEdits()) {
    toast("Adicionado à lista. Termine a edição para abrir.");
    return;
  }
  const first = list.findIndex((i) => i.path.toLowerCase() === (paths.at(0) ?? "").toLowerCase());
  const target = first < 0 ? list.length - 1 : first;
  if (
    list.at(target)?.path !== get().source?.facts.path &&
    from === "person" &&
    !(await confirmLeave())
  )
    return;
  await playIndex(target);
}

function resetEdit(): Partial<State> {
  return {
    editing: false,
    tool: "trim",
    marks: [],
    selected: null,
    part: null,
    pendingIn: null,
    splitPoints: [],
    transform: NO_TRANSFORM,
    past: [],
    future: [],
    savedEdits: null,
    precise: true,
    mode: "remove",
    sheet: null,
    wave: null,
    keyframes: null,
    joinFiles: [],
    save: null,
    ab: null,
    subtitle: null,
    subtitleDelay: 0,
  };
}

/** Silences and unloads the <video>: removing src alone keeps the old media playing. */
function unloadVideo(): void {
  const v = video();
  if (!v) return;
  v.pause();
  v.removeAttribute("src");
  v.load();
}

/**
 * Opens list item `index`. The same file again (another audio track, a fallback) keeps the edits
 * and the position; another file starts clean and resumes where it last stopped.
 */
export async function playIndex(index: number, audioIndex = 0, level = 0): Promise<void> {
  const item = get().list.at(index);
  if (!item) return;
  const leaving = get().source;
  const same = leaving?.facts.path === item.path;
  if (leaving && !same) {
    await rememberPosition();
    // A preparation of the file being left would keep converting for nothing.
    if (get().loading)
      void api()
        .cancelPrepare(leaving.facts.path)
        .catch(() => undefined);
  }
  const keepAt = same ? get().time : 0;
  if (!same) unloadVideo();
  set({
    view: "player",
    index,
    error: null,
    loading: { label: "Abrindo", ratio: 0 },
    ...(same
      ? {}
      : { ...resetEdit(), fallbackLevel: 0, source: null, facts: null, time: 0, duration: 0 }),
  });
  try {
    const source = await api().open(item.path, audioIndex, level);
    if (get().list.at(get().index)?.path !== item.path) return;
    const recent = get().recents.find((r) => r.path.toLowerCase() === item.path.toLowerCase());
    pendingResume = same
      ? keepAt
      : recent && !recent.watched && recent.position > 5
        ? recent.position
        : 0;
    set({
      source,
      facts: source.facts,
      loading: null,
      duration: source.facts.duration,
      list: get().list.map((i) => (i.path === item.path ? { ...i, mode: source.mode } : i)),
      // The track playing is the track saved; not an edit step of its own.
      transform: { ...get().transform, audioIndex },
    });
  } catch (error) {
    set({ loading: null, error: message(error) });
  }
}

/** Where the next loaded video starts (the "Continuar assistindo" position). */
let pendingResume = 0;
export function takeResume(): number {
  const t = pendingResume;
  pendingResume = 0;
  return t;
}

/** The <video> could not decode what it got: try a copied file, then a converted preview. */
export async function playbackFailed(): Promise<void> {
  const { fallbackLevel, index, source } = get();
  if (!source || fallbackLevel >= 2) {
    set({ error: "Este arquivo não pôde ser reproduzido, nem convertido para uma prévia." });
    return;
  }
  set({ fallbackLevel: fallbackLevel + 1 });
  await playIndex(index, source.audioIndex, fallbackLevel + 1);
}

export async function removeFromList(path: string): Promise<void> {
  const { list, index } = get();
  const at = list.findIndex((i) => i.path === path);
  if (at < 0) return;
  if (at === index) {
    if (!(await confirmLeave("Tirar da lista e descartar as edições que ainda não foram salvas?")))
      return;
    // The list as it is now: it may have changed while the question waited.
    const next = get().list.filter((i) => i.path !== path);
    unloadVideo();
    set({
      list: next,
      index: -1,
      source: null,
      facts: null,
      ...resetEdit(),
      view: next.length ? "player" : "home",
    });
    if (next.length) void playIndex(Math.min(at, next.length - 1));
  } else set({ list: list.filter((i) => i.path !== path), index: at < index ? index - 1 : index });
}

export async function loadSubtitleFile(path: string): Promise<void> {
  const cues = parseSubtitles(await api().readSubtitle(path));
  if (!cues.length) throw new Error("A legenda não tem falas legíveis.");
  set({ subtitle: { name: fileName(path), cues, path, track: null } });
}

export async function loadSubtitleTrack(index: number): Promise<void> {
  const { source } = get();
  if (!source) return;
  const cues = parseSubtitles(await api().extractSubtitle(source.facts.path, index));
  set({ subtitle: { name: `Faixa ${index + 1}`, cues, path: null, track: index } });
}

export async function savePrefs(change: Partial<PlayerPrefs>): Promise<void> {
  const prefs = { ...get().prefs, ...change };
  set({ prefs });
  await api()
    .savePrefs(prefs)
    .catch(() => undefined);
}

/* ----- Edit mode ----- */

function snapshot(): Snapshot {
  const { marks, splitPoints, transform } = get();
  return { marks, splitPoints, transform };
}

/** Records the edit state before a change, for Desfazer. */
export function edit(
  change: Partial<Pick<State, "marks" | "splitPoints" | "transform" | "selected" | "part">>,
): void {
  // New cut points renumber the parts: the clicked one is no longer the same.
  const part = change.splitPoints ? { part: null } : {};
  set({ past: [...get().past.slice(-99), snapshot()], future: [], ...part, ...change });
}

/** A snapshot is restored without changing the audio track that is playing. */
function restore(snap: Snapshot): Partial<State> {
  return { ...snap, transform: { ...snap.transform, audioIndex: get().transform.audioIndex } };
}

export function undo(): void {
  const { past } = get();
  const last = past.at(-1);
  if (!last) return;
  set({
    past: past.slice(0, -1),
    future: [snapshot(), ...get().future],
    ...restore(last),
    selected: null,
    part: null,
  });
}

export function redo(): void {
  const { future } = get();
  const next = future.at(0);
  if (!next) return;
  set({
    future: future.slice(1),
    past: [...get().past, snapshot()],
    ...restore(next),
    selected: null,
    part: null,
  });
}

export async function enterEdit(): Promise<void> {
  const { source, mini } = get();
  if (!source) return;
  if (mini) {
    set({ mini: false });
    void api().setMiniPlayer(false);
  }
  // A loop the ruler does not show would keep jumping back while marking.
  set({ editing: true, ab: null });
  const path = source.facts.path;
  const [keys, wave, sheet] = await Promise.allSettled([
    api().keyframes(path),
    api().waveform(path),
    source.facts.hasVideo ? api().frameSheet(path) : Promise.reject(new Error("sem imagem")),
  ]);
  if (get().source?.facts.path !== path) return;
  set({
    keyframes: keys.status === "fulfilled" ? keys.value : [],
    wave: wave.status === "fulfilled" ? wave.value : [],
    sheet: sheet.status === "fulfilled" ? sheet.value : get().sheet,
  });
}

export function exitEdit(): void {
  set({ editing: false, pendingIn: null, save: null });
}

/**
 * Where the video really is. The stored time follows timeupdate, a few times a second, so while
 * playing (or right after a click on the ruler) it is behind: I, O, S and Delete read the video.
 */
function now(): number {
  const v = video();
  return v && Number.isFinite(v.currentTime) ? v.currentTime : get().time;
}

/** I always starts a new stretch; the handles on the ruler move an existing one. */
export function markIn(): void {
  set({ pendingIn: now(), selected: null, part: null });
}

/** O ends the stretch started with I, or moves the end of the selected one. */
export function markOut(): void {
  const { pendingIn, selected, marks, duration } = get();
  const time = now();
  if (pendingIn !== null && time > pendingIn + 0.05) {
    const next = normalizeRanges([...marks, { start: pendingIn, end: time }], duration);
    const at = next.findIndex((m) => m.start <= pendingIn + 1e-6 && m.end >= time - 1e-6);
    edit({ marks: next, selected: at < 0 ? null : at });
    set({ pendingIn: null });
    return;
  }
  const mark = selected === null ? undefined : marks.at(selected);
  if (!mark || time <= mark.start) return;
  const next = normalizeRanges(
    marks.map((m, i) => (i === selected ? { ...m, end: time } : m)),
    duration,
  );
  const at = next.findIndex((m) => m.start <= mark.start + 1e-6 && m.end >= time - 1e-6);
  edit({ marks: next, selected: at < 0 ? null : at });
}

/**
 * Delete takes out the selected stretch; otherwise the part clicked on the ruler (or, with none
 * clicked, the part under the cursor), in any tool.
 */
export function deleteSelected(): void {
  const { selected, marks, part, splitPoints, duration, mode } = get();
  const time = now();
  if (selected !== null && marks.at(selected)) {
    edit({ marks: marks.filter((_, i) => i !== selected), selected: null });
    return;
  }
  const parts = piecesFromPoints(splitPoints, duration);
  if (parts.length < 2) return;
  const at = part ?? parts.findIndex((p) => time >= p.start && time < p.end);
  const target = parts.at(at);
  if (!target) return;
  if (isPartRemoved(target, marks, mode, duration)) {
    toast("Esse pedaço já foi apagado. Ctrl+Z ou a seta na lista traz de volta.");
    return;
  }
  setPartGone(at, true);
}

/** A click on the ruler: a marked stretch when it lands on one, else the part made by Dividir. */
export function selectOnRuler(t: number): void {
  const { marks, splitPoints, duration } = get();
  const parts = piecesFromPoints(splitPoints, duration);
  // Once the video is divided, a click always picks the clip under it (marked stretches are
  // still picked in their list and moved by their handles).
  if (parts.length > 1) {
    const part = parts.findIndex((p) => t >= p.start && t < p.end);
    set({ selected: null, part: part < 0 ? null : part });
    return;
  }
  const mark = marks.findIndex((m) => m.start <= t && m.end >= t);
  set({ selected: mark < 0 ? null : mark, part: null });
}

/** Deletes (or brings back) a whole part made by Dividir; the result is what Salvar saves. */
export function setPartGone(index: number, gone: boolean): void {
  const { splitPoints, duration, marks, mode } = get();
  const part = piecesFromPoints(splitPoints, duration).at(index);
  if (!part) return;
  const next = setPartRemoved(part, gone, marks, mode, duration);
  if (!next) {
    toast("Pelo menos um pedaço precisa ficar.");
    return;
  }
  edit({ marks: next, selected: null, part: index });
}

export function splitHere(): void {
  const { splitPoints, duration } = get();
  const time = now();
  if (time < 0.5 || time > duration - 0.5) {
    toast("Muito perto do começo ou do fim para dividir.");
    return;
  }
  if (splitPoints.some((p) => Math.abs(p - time) < 0.25)) {
    toast("Já tem um corte aqui.");
    return;
  }
  // The parts and their delete buttons live in Dividir.
  edit({ splitPoints: [...splitPoints, time].sort((a, b) => a - b) });
  set({ tool: "split" });
}

export function setTransform(change: Partial<Transform>): void {
  edit({ transform: { ...get().transform, ...change } });
}

/** For sliders: one undo step when the drag starts, then live changes without steps. */
export function beginTransformChange(): void {
  edit({});
}
export function changeTransformLive(change: Partial<Transform>): void {
  set({ transform: { ...get().transform, ...change } });
}

export function selectMark(i: number): void {
  const mark = get().marks.at(i);
  set({ selected: i, part: null });
  if (mark) seek(mark.start);
}

export function openSave(kind: SaveKind, preset: PresetId = "original", marked = false): void {
  video()?.pause();
  set({ save: { kind, preset, marked } });
}

/**
 * Whether these stretches are saved re-encoded to start on the exact frame: only when the person
 * keeps "Corte no quadro exato" on and a stretch starts off a keyframe. Otherwise the copy is
 * already exact (or the person chose speed).
 */
export function exactNeedsEncode(ranges: readonly Range[]): boolean {
  const { precise, keyframes, facts } = get();
  return precise && startsOffKeyframes(ranges, keyframes, facts?.fps ?? 30);
}
