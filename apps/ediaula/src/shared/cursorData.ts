import { type CaptureSegment, toVideoTime } from "./cursorCapture.ts";
import type { HookEvent } from "./helperProtocol.ts";
import { CURSOR_SHAPES, type CursorShape, keyLabel, type MarkerKind } from "./recording.ts";
import { type JournalReplay, momentInTake, rangesInTake } from "./recordingJournal.ts";

/**
 * cursor.json: the pointer of a screen recording, in seconds of the video and pixels of the
 * recorded frame, so it follows the video through cuts, crops and zooms. Version 2 adds the
 * cursor images the helper saved, the paused stretches, where the pointer was over the
 * recorder's own controls, where the helper was not watching and when something was typed (only
 * the moments, never what). Version 1 files are read as version 2 (normalizeCursorData).
 */

/** A cursor shape: one of the standard ones drawn by the editor, or a saved image. */
export interface CursorShapeInfo {
  id: string;
  /** Standard shape it is (or resembles). */
  std?: CursorShape;
  /** PNG beside the cursor.json (cursors/<hash>.png). */
  image?: string;
  w: number;
  h: number;
  hotX: number;
  hotY: number;
  /** Some pixels invert the screen (drawn black in the PNG). */
  inverted?: boolean;
}

export interface CursorData {
  version: 2;
  width: number;
  height: number;
  /** The first ones are CURSOR_SHAPES in order; images of the take follow. */
  shapes: CursorShapeInfo[];
  /** [t, x, y, index into shapes] */
  moves: [number, number, number, number][];
  /** [t, x, y, button (0 left, 1 right, 2 middle), seconds held] */
  clicks: [number, number, number, number, number][];
  /** [t, x, y, wheel delta] */
  wheel: [number, number, number, number][];
  /** Ctrl+Shift+M markers and Ctrl+Shift+R retakes. */
  markers: { t: number; kind: MarkerKind }[];
  /** Shortcut and navigation keys pressed: [t, label] (e.g. "Ctrl+C", "→"). */
  keys: [number, string][];
  /**
   * When something was typed: moments only, at most one every half second, never which key or
   * how many (the helper's "ty" event). Absent in older files.
   */
  typing: number[];
  /**
   * Where the text cursor of the focused field was, when it moved: [t, x, y, width, height] in
   * pixels of the recorded frame (zero width and height when there was none). It lets the
   * automatic zoom follow what is typed. Absent in older files.
   */
  caret?: [number, number, number, number, number][];
  /** Recorded while paused: cut on import. */
  pauses: [number, number][];
  /** The pointer was over the recorder's controls (not in the video): it stays where it was. */
  hidden: [number, number][];
  /** The helper was not running: the pointer is unknown there. */
  gaps: [number, number][];
  /**
   * The drawing mode was on (the pointer was the pen on the recorder window): its clicks are not
   * in `clicks`, and its moves are no gesture on the lesson. Absent in older files.
   */
  drawing?: [number, number][];
}

/** Shape indexes fit a byte (cursor tracks keep them in a Uint8Array). */
export const MAX_CURSOR_SHAPES = 256;

const STANDARD = CURSOR_SHAPES.length;
const OTHER = CURSOR_SHAPES.indexOf("other");
const isShape = (name: unknown): name is CursorShape =>
  typeof name === "string" && (CURSOR_SHAPES as readonly string[]).includes(name);

const standardShapes = (): CursorShapeInfo[] =>
  CURSOR_SHAPES.map((name) => ({ id: name, std: name, w: 0, h: 0, hotX: 0, hotY: 0 }));

/** The standard shape the editor draws for a shape index (images come in a later version). */
export function shapeName(data: Pick<CursorData, "shapes">, index: number): CursorShape {
  if (index < STANDARD) return CURSOR_SHAPES[index] ?? "arrow";
  return data.shapes[index]?.std ?? "other";
}

const isArrayOf = (value: unknown, size: number): boolean =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      Array.isArray(item) &&
      item.length >= size &&
      item.slice(0, size).every((n) => typeof n === "number" && Number.isFinite(n)),
  );

const ranges = (value: unknown): [number, number][] =>
  isArrayOf(value, 2) ? (value as [number, number][]) : [];

/** Any cursor.json the app wrote, as version 2; throws when it is not one. */
export function normalizeCursorData(raw: unknown): CursorData {
  if (!raw || typeof raw !== "object") throw new Error("Dados do cursor inválidos.");
  const data = raw as Record<string, unknown>;
  const version = data.version;
  if (
    (version !== 1 && version !== 2) ||
    typeof data.width !== "number" ||
    typeof data.height !== "number" ||
    !isArrayOf(data.moves, 4) ||
    !isArrayOf(data.clicks, 5)
  )
    throw new Error("Esse arquivo não tem os dados de cursor de uma gravação do EdiAula.");
  const shapes: CursorShapeInfo[] = standardShapes();
  if (version === 2 && Array.isArray(data.shapes))
    data.shapes.slice(STANDARD, MAX_CURSOR_SHAPES).forEach((s: unknown, i) => {
      const shape = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const number = (key: string): number =>
        typeof shape[key] === "number" ? (shape[key] as number) : 0;
      shapes.push({
        id: typeof shape.id === "string" ? shape.id : `shape-${STANDARD + i}`,
        ...(isShape(shape.std) ? { std: shape.std } : {}),
        ...(typeof shape.image === "string" ? { image: shape.image } : {}),
        w: number("w"),
        h: number("h"),
        hotX: number("hotX"),
        hotY: number("hotY"),
        ...(shape.inverted === true ? { inverted: true } : {}),
      });
    });
  if (version === 2 && Array.isArray(data.shapes))
    // The standard entries keep the images the helper saved for them.
    data.shapes.slice(0, STANDARD).forEach((s: unknown, i) => {
      const shape = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      if (typeof shape.image === "string") shapes[i].image = shape.image;
      for (const key of ["w", "h", "hotX", "hotY"] as const)
        if (typeof shape[key] === "number") shapes[i][key] = shape[key] as number;
      if (shape.inverted === true) shapes[i].inverted = true;
    });
  const markers = Array.isArray(data.markers)
    ? (data.markers as unknown[]).flatMap((m) => {
        const marker = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
        return typeof marker.t === "number" &&
          (marker.kind === "marker" || marker.kind === "retake")
          ? [{ t: marker.t, kind: marker.kind as MarkerKind }]
          : [];
      })
    : [];
  return {
    version: 2,
    width: data.width,
    height: data.height,
    shapes,
    moves: data.moves as CursorData["moves"],
    clicks: data.clicks as CursorData["clicks"],
    wheel: isArrayOf(data.wheel, 4) ? (data.wheel as CursorData["wheel"]) : [],
    markers,
    keys: Array.isArray(data.keys)
      ? (data.keys as unknown[]).filter(
          (k): k is [number, string] =>
            Array.isArray(k) && typeof k[0] === "number" && typeof k[1] === "string",
        )
      : [],
    ...(isArrayOf(data.caret, 5)
      ? {
          caret: (data.caret as number[][]).map((c): [number, number, number, number, number] => [
            c[0],
            c[1],
            c[2],
            c[3],
            c[4],
          ]),
        }
      : {}),
    typing: Array.isArray(data.typing)
      ? (data.typing as unknown[]).filter(
          (t): t is number => typeof t === "number" && Number.isFinite(t),
        )
      : [],
    pauses: version === 2 ? ranges(data.pauses) : [],
    hidden: version === 2 ? ranges(data.hidden) : [],
    gaps: version === 2 ? ranges(data.gaps) : [],
    ...(version === 2 && isArrayOf(data.drawing, 2) ? { drawing: ranges(data.drawing) } : {}),
  };
}

const BUTTONS: Record<string, number> = { left: 0, right: 1, middle: 2 };
/** The helper sends a heartbeat every 500 ms: this long without a line, it was not watching. */
const SILENCE_MS = 2000;

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** QPC stretches the helper was not watching inside [from, to]. */
function helperGaps(
  events: readonly HookEvent[],
  journal: Pick<JournalReplay, "failures">,
  from: number,
  to: number,
): [number, number][] {
  const gaps: [number, number][] = [];
  const timed = events.filter((e): e is Extract<HookEvent, { t: number }> => "t" in e);
  if (timed.some((e) => e.e === "hb")) {
    // Heartbeats are in the journal: any silence means the helper was gone.
    let last = from;
    for (const e of timed) {
      if (e.t < from) continue;
      if (e.t > to) break;
      if (e.t - last > SILENCE_MS) gaps.push([last, e.t]);
      last = Math.max(last, e.t);
    }
    if (to - last > SILENCE_MS) gaps.push([last, to]);
  } else {
    // Only what reached memory: a helper that started again left a hole before its ready.
    let last: number | null = null;
    let started = false;
    for (const e of timed) {
      if (e.e === "ready") {
        if (started && last !== null && e.t > last) gaps.push([last, e.t]);
        started = true;
      }
      last = e.t;
    }
  }
  for (const f of journal.failures) if (f.src === "cursor") gaps.push([f.qpc, to]);
  return gaps;
}

/**
 * The helper's events (memory and cursor.jsonl merged, in time order) as the cursor.json of a
 * take: on the take's clock (`segments`), in pixels of the recorded region. Moves over the
 * recorder's own controls become hidden stretches with the pointer left where it was, and
 * clicks there are dropped.
 */
export function buildCursorData(
  events: readonly HookEvent[],
  journal: Pick<JournalReplay, "markers" | "pauses" | "failures">,
  segments: readonly CaptureSegment[],
  region: { x: number; y: number; width: number; height: number },
): CursorData {
  const total = segments.reduce((sum, g) => sum + g.duration, 0);
  const data: CursorData = {
    version: 2,
    width: region.width,
    height: region.height,
    shapes: standardShapes(),
    moves: [],
    clicks: [],
    wheel: [],
    markers: [],
    keys: [],
    typing: [],
    pauses: [],
    hidden: [],
    gaps: [],
  };
  // Images: the standard shapes keep their name, any other image gets an index after them.
  const index = new Map<string, number>(CURSOR_SHAPES.map((name, i) => [name, i]));
  for (const e of events) {
    if (e.e !== "img") continue;
    const info = {
      ...(e.file ? { image: e.file } : {}),
      w: e.w,
      h: e.h,
      hotX: e.hx,
      hotY: e.hy,
      ...(e.inv > 0 ? { inverted: true } : {}),
    };
    if (isShape(e.std) && e.id === e.std)
      Object.assign(data.shapes[CURSOR_SHAPES.indexOf(e.std)], info);
    else if (!index.has(e.id) && data.shapes.length < MAX_CURSOR_SHAPES) {
      index.set(e.id, data.shapes.length);
      data.shapes.push({ id: e.id, ...(isShape(e.std) ? { std: e.std } : {}), ...info });
    }
  }
  const shapeOf = (id: string): number => index.get(id) ?? OTHER;

  let shape = 0;
  let last: { x: number; y: number; shape: number } | undefined;
  let hiddenFrom: number | null = null;
  const downs = new Map<string, [number, number, number, number, number]>();
  for (const e of events) {
    if (e.e === "c") {
      shape = shapeOf(e.id);
      // A shape change while the pointer rests becomes a move to the same place.
      const t = toVideoTime(segments, e.t);
      if (last && t >= 0 && last.shape !== shape && hiddenFrom === null) {
        data.moves.push([round(t), last.x, last.y, shape]);
        last = { x: last.x, y: last.y, shape };
      }
      continue;
    }
    if (e.e === "ty") {
      const t = toVideoTime(segments, e.t);
      if (t >= 0) data.typing.push(round(t));
      continue;
    }
    if (e.e === "caret") {
      const t = toVideoTime(segments, e.t);
      if (t < 0) continue;
      const none = e.w <= 0 && e.h <= 0;
      const caret = data.caret ?? [];
      data.caret = caret;
      caret.push([round(t), none ? 0 : e.x - region.x, none ? 0 : e.y - region.y, e.w, e.h]);
      continue;
    }
    if (e.e !== "m" && e.e !== "d" && e.e !== "u" && e.e !== "w" && e.e !== "k") continue;
    const t = toVideoTime(segments, e.t);
    if (t < 0) continue;
    if (e.e === "k") {
      data.keys.push([round(t), keyLabel(e.vk, e.m)]);
      continue;
    }
    const x = e.x - region.x;
    const y = e.y - region.y;
    if (e.e === "m") {
      if (e.ui) {
        hiddenFrom ??= round(t);
        continue;
      }
      if (hiddenFrom !== null) {
        if (round(t) > hiddenFrom) data.hidden.push([hiddenFrom, round(t)]);
        hiddenFrom = null;
      }
      data.moves.push([round(t), x, y, shape]);
      last = { x, y, shape };
    } else if (e.e === "d") {
      const button = BUTTONS[e.b];
      if (button === undefined || e.ui) continue;
      const click: [number, number, number, number, number] = [round(t), x, y, button, 0];
      data.clicks.push(click);
      downs.set(e.b, click);
    } else if (e.e === "u") {
      const down = downs.get(e.b);
      if (down) down[4] = round(t - down[0]);
      downs.delete(e.b);
    } else if (!e.h && !e.ui) data.wheel.push([round(t), x, y, e.d]);
  }
  if (hiddenFrom !== null && round(total) > hiddenFrom)
    data.hidden.push([hiddenFrom, round(total)]);

  for (const m of journal.markers)
    data.markers.push({ t: momentInTake(segments, m.qpc), kind: m.kind });
  data.pauses = rangesInTake(journal.pauses, segments);
  if (segments.length) {
    const from = segments[0].start;
    const to = Math.max(...segments.map((g) => g.start + g.duration * 1000));
    data.gaps = rangesInTake(helperGaps(events, journal, from, to), segments);
  }
  return data;
}

/** The cursor data of one part of a take, in that part's own seconds (`at` is where it starts). */
export function cursorDataForPart(data: CursorData, at: number, duration: number): CursorData {
  const end = at + duration;
  const inside = (t: number): boolean => t >= at && t <= end;
  const shift = <T extends [number, ...unknown[]]>(rows: readonly T[]): T[] =>
    rows.filter((r) => inside(r[0])).map((r) => [round(r[0] - at), ...r.slice(1)] as T);
  const clip = (list: readonly [number, number][]): [number, number][] =>
    list.flatMap(([a, b]) => {
      const from = Math.max(a, at);
      const to = Math.min(b, end);
      return to > from ? [[round(from - at), round(to - at)] as [number, number]] : [];
    });
  return {
    ...data,
    moves: shift(data.moves),
    clicks: shift(data.clicks),
    wheel: shift(data.wheel),
    keys: shift(data.keys),
    typing: data.typing.filter(inside).map((t) => round(t - at)),
    ...(data.caret ? { caret: shift(data.caret) } : {}),
    markers: data.markers.filter((m) => inside(m.t)).map((m) => ({ ...m, t: round(m.t - at) })),
    pauses: clip(data.pauses),
    hidden: clip(data.hidden),
    gaps: clip(data.gaps),
    ...(data.drawing ? { drawing: clip(data.drawing) } : {}),
  };
}
