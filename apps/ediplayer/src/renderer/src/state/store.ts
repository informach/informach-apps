import { NO_TRANSFORM, type PresetId, type Transform } from "@shared/edit";
import { type MarkMode, normalizeRanges, type Range } from "@shared/ranges";
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
  fallbackTried: number;
  time: number;
  duration: number;
  playing: boolean;
  rate: number;
  ab: { a: number; b: number | null } | null;
  zoom: number;
  viewRotate: number;
  mini: boolean;
  onTop: boolean;
  prefs: PlayerPrefs;
  subtitle: { name: string; cues: Cue[]; path: string | null } | null;
  subtitleDelay: number;
  sheet: FrameSheet | null;
  wave: number[] | null;
  keyframes: number[] | null;
  editing: boolean;
  tool: ToolId;
  marks: Range[];
  selected: number | null;
  pendingIn: number | null;
  mode: MarkMode;
  precise: boolean;
  transform: Transform;
  splitPoints: number[];
  past: Snapshot[];
  future: Snapshot[];
  joinFiles: MediaFacts[];
  save: { kind: SaveKind; preset: PresetId } | null;
  queue: QueueItem[];
  recents: RecentItem[];
  toast: string | null;
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
  fallbackTried: 0,
  time: 0,
  duration: 0,
  playing: false,
  rate: 1,
  ab: null,
  zoom: 1,
  viewRotate: 0,
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
  pendingIn: null,
  mode: "remove",
  precise: false,
  transform: NO_TRANSFORM,
  splitPoints: [],
  past: [],
  future: [],
  joinFiles: [],
  save: null,
  queue: [],
  recents: [],
  toast: null,
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

/** Saves where the current file stopped (called every few seconds and when leaving it). */
export async function rememberPosition(): Promise<void> {
  const { source, time, duration } = get();
  if (!source || !(duration > 0)) return;
  await api()
    .remember({
      path: source.facts.path,
      name: source.facts.name,
      duration,
      position: time,
      watched: time > duration - 10,
    })
    .catch(() => undefined);
}

export async function openPaths(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const known = new Set(get().list.map((i) => i.path.toLowerCase()));
  const fresh = paths
    .filter((p) => !known.has(p.toLowerCase()))
    .map((path) => ({ path, name: fileName(path) }));
  const list = [...get().list, ...fresh];
  const first = list.findIndex((i) => i.path.toLowerCase() === (paths.at(0) ?? "").toLowerCase());
  set({ list });
  await playIndex(first < 0 ? list.length - 1 : first);
}

function resetEdit(): Partial<State> {
  return {
    editing: false,
    marks: [],
    selected: null,
    pendingIn: null,
    splitPoints: [],
    transform: NO_TRANSFORM,
    past: [],
    future: [],
    precise: false,
    mode: "remove",
    sheet: null,
    wave: null,
    keyframes: null,
    ab: null,
    subtitle: null,
    subtitleDelay: 0,
    viewRotate: 0,
    zoom: 1,
  };
}

export async function playIndex(index: number, audioIndex = 0, fallback = false): Promise<void> {
  const item = get().list.at(index);
  if (!item) return;
  const leaving = get().source;
  if (leaving && leaving.facts.path !== item.path) await rememberPosition();
  set({
    view: "player",
    index,
    error: null,
    loading: { label: "Abrindo", ratio: 0 },
    ...(fallback || leaving?.facts.path === item.path
      ? {}
      : { ...resetEdit(), fallbackTried: 0, source: null, facts: null }),
  });
  try {
    const source = await api().open(item.path, audioIndex, fallback);
    if (get().list.at(get().index)?.path !== item.path) return;
    const recent = get().recents.find((r) => r.path.toLowerCase() === item.path.toLowerCase());
    set({
      source,
      facts: source.facts,
      loading: null,
      duration: source.facts.duration,
      list: get().list.map((i) => (i.path === item.path ? { ...i, mode: source.mode } : i)),
      transform: { ...get().transform, audioIndex },
    });
    pendingResume = recent && !recent.watched && recent.position > 5 ? recent.position : 0;
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
  const { fallbackTried, index, source } = get();
  if (!source || fallbackTried >= 2) {
    set({ error: "Este arquivo não pôde ser reproduzido, nem convertido para uma prévia." });
    return;
  }
  set({ fallbackTried: fallbackTried + 1 });
  await playIndex(index, source.audioIndex, true);
}

export function removeFromList(path: string): void {
  const { list, index } = get();
  const at = list.findIndex((i) => i.path === path);
  const next = list.filter((i) => i.path !== path);
  if (at === index) {
    set({
      list: next,
      index: -1,
      source: null,
      facts: null,
      view: next.length ? "player" : "home",
    });
    if (next.length) void playIndex(Math.min(at, next.length - 1));
  } else set({ list: next, index: at < index ? index - 1 : index });
}

export async function loadSubtitleFile(path: string): Promise<void> {
  const cues = parseSubtitles(await api().readSubtitle(path));
  if (!cues.length) throw new Error("A legenda não tem falas legíveis.");
  set({ subtitle: { name: fileName(path), cues, path } });
}

export async function loadSubtitleTrack(index: number): Promise<void> {
  const { source } = get();
  if (!source) return;
  const cues = parseSubtitles(await api().extractSubtitle(source.facts.path, index));
  set({ subtitle: { name: `Faixa ${index + 1}`, cues, path: null } });
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
  change: Partial<Pick<State, "marks" | "splitPoints" | "transform" | "selected">>,
): void {
  set({ past: [...get().past.slice(-99), snapshot()], future: [], ...change });
}

export function undo(): void {
  const { past } = get();
  const last = past.at(-1);
  if (!last) return;
  set({ past: past.slice(0, -1), future: [snapshot(), ...get().future], ...last, selected: null });
}

export function redo(): void {
  const { future } = get();
  const next = future.at(0);
  if (!next) return;
  set({ future: future.slice(1), past: [...get().past, snapshot()], ...next, selected: null });
}

export async function enterEdit(): Promise<void> {
  const { source } = get();
  if (!source) return;
  set({ editing: true });
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

export function markIn(): void {
  const { selected, marks, time } = get();
  const mark = selected === null ? undefined : marks.at(selected);
  if (mark && time < mark.end) {
    edit({ marks: marks.map((m, i) => (i === selected ? { ...m, start: time } : m)) });
    return;
  }
  set({ pendingIn: time, selected: null });
}

export function markOut(): void {
  const { pendingIn, selected, marks, time, duration } = get();
  if (pendingIn !== null && time > pendingIn + 0.05) {
    const next = normalizeRanges([...marks, { start: pendingIn, end: time }], duration);
    const at = next.findIndex((m) => m.start <= pendingIn + 1e-6 && m.end >= time - 1e-6);
    edit({ marks: next, selected: at < 0 ? null : at });
    set({ pendingIn: null });
    return;
  }
  const mark = selected === null ? undefined : marks.at(selected);
  if (mark && time > mark.start)
    edit({ marks: marks.map((m, i) => (i === selected ? { ...m, end: time } : m)) });
}

export function deleteSelected(): void {
  const { selected, marks } = get();
  if (selected === null) return;
  edit({ marks: marks.filter((_, i) => i !== selected), selected: null });
}

export function splitHere(): void {
  const { time, splitPoints, duration } = get();
  if (time < 0.5 || time > duration - 0.5) return;
  if (splitPoints.some((p) => Math.abs(p - time) < 0.25)) return;
  edit({ splitPoints: [...splitPoints, time].sort((a, b) => a - b) });
}

export function setTransform(change: Partial<Transform>): void {
  edit({ transform: { ...get().transform, ...change } });
}

export function selectMark(i: number): void {
  const mark = get().marks.at(i);
  set({ selected: i });
  if (mark) seek(mark.start);
}

export function openSave(kind: SaveKind, preset: PresetId = "original"): void {
  video()?.pause();
  set({ save: { kind, preset } });
}
