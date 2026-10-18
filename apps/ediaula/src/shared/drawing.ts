import type { CursorData } from "./cursorData.ts";
import type { RecordingPieceLayout } from "./recordingImport.ts";
import type { Clip } from "./types.ts";

/**
 * Drawing on the screen during a take (Ctrl+Shift+D by default). The strokes are drawn on the
 * recorder window, which never appears in the capture, and are kept as data: the session journal
 * has each stroke with its time and points, the finished take hands them over in seconds of the
 * take, and the import makes annotation clips from them, aligned with the screen. The drawing is
 * kept once, on the media of its video (Asset.drawing); each clip shows a stretch of that video,
 * drawn frame by frame from the strokes (the stroke appears as it was made), so the preview and
 * the export show the same thing.
 *
 * In the drawing mode a board can go over the recorded region, white or black, to explain
 * something (the screen goes on being recorded underneath): each stretch with a board becomes a
 * "quadro" clip, solid in the board's color with the strokes over it, cut at each new page.
 */

/** The pen, a translucent highlighter, or an arrow from where the stroke starts to where it ends. */
export const DRAWING_TOOLS = ["pen", "marker", "arrow"] as const;
export type DrawingTool = (typeof DRAWING_TOOLS)[number];

export interface DrawingStroke {
  /** Seconds when the stroke started (of the take, or of the drawing's own video). */
  t: number;
  color: string;
  /** Thickness in pixels of a frame 1080 pixels tall. */
  width: number;
  /** [x, y, seconds after `t`]: x and y as fractions of the recorded frame. */
  points: [number, number, number][];
  /** Absent: the pen. */
  tool?: DrawingTool;
  /** Ctrl+Z took it back at this second (same clock as `t`): it shows until then. */
  until?: number;
}

/** The boards offered while drawing. */
export const BOARD_KINDS = ["white", "black"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

/** The color of each board, and the ink that reads on it (dark on white, chalk on black). */
export const BOARD_COLORS: Record<BoardKind, string> = { white: "#FFFFFF", black: "#1E2622" };
export const BOARD_INK: Record<BoardKind, string> = { white: "#1D1F24", black: "#F2EFE6" };

/** A board over the recorded region from `start` to `end` (same clock as the strokes). */
export interface DrawingBoard {
  start: number;
  end: number;
  /** '#RRGGBB'; the editor can change it. */
  color: string;
}

export interface Drawing {
  strokes: DrawingStroke[];
  /** Moments of "apagar tudo": every stroke started before one is gone from it on. */
  clears: number[];
  /** Stretches with a board over the screen. */
  boards?: DrawingBoard[];
  /** Moments of "página nova": the board stays, the strokes on it are gone. */
  pages?: number[];
  /**
   * The screen recording the drawing was made over, and its second at the drawing's second 0:
   * its pointer is drawn over the board, as the tip of the pen.
   */
  pointer?: { assetId: string; offset: number };
}

/** Most points kept per stroke (a long scribble is thinned evenly). */
export const MAX_STROKE_POINTS = 4000;
/** Most strokes in a take. */
export const MAX_STROKES = 5000;
/**
 * Most points of a take's drawing, all strokes together: the drawing lives in the project file
 * (Asset.drawing), which has to stay small enough to save. Past it every stroke is thinned alike.
 */
export const MAX_DRAWING_POINTS = 100_000;
/** Thicknesses offered while drawing, pixels of a 1080-pixel frame. */
export const DRAWING_WIDTHS = [4, 8, 14] as const;

/** A stroke's points thinned evenly to at most `max`, keeping the first and the last. */
export function thinPoints<T>(points: readonly T[], max = MAX_STROKE_POINTS): T[] {
  if (points.length <= max) return [...points];
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round((i * (points.length - 1)) / (max - 1))]);
  return out;
}

/** When the stroke's last point was drawn. */
export const strokeEnd = (s: DrawingStroke): number => s.t + (s.points.at(-1)?.[2] ?? 0);

/**
 * Moments that take the strokes away: "apagar tudo", the board's new pages, and a board going up
 * or away (a board starts clean, and its strokes go with it).
 */
const wipes = (d: Drawing): number[] => [
  ...d.clears,
  ...(d.pages ?? []),
  ...(d.boards ?? []).flatMap((b) => [b.start, b.end]),
];

/** The first wipe after `t`, if any. */
const clearAfter = (d: Drawing, t: number): number | undefined =>
  wipes(d)
    .filter((c) => c > t)
    .sort((a, b) => a - b)[0];

/** When a stroke stops showing: undone, wiped, or never (Infinity). */
export const strokeGone = (d: Drawing, s: DrawingStroke): number =>
  Math.min(s.until ?? Number.POSITIVE_INFINITY, clearAfter(d, s.t) ?? Number.POSITIVE_INFINITY);

/**
 * The strokes on screen at some moment of [from, to) (the drawing's own seconds), by index, in
 * the order they were made: begun before `to`, and not yet undone or wiped (by "apagar tudo", a
 * new page, a board going up or away) at `from`.
 */
export function strokesIn(d: Drawing, from: number, to: number): number[] {
  const out: number[] = [];
  d.strokes.forEach((s, i) => {
    if (s.t < to && Math.max(strokeGone(d, s), strokeEnd(s)) > from) out.push(i);
  });
  return out;
}

/**
 * Where a drawing is on screen, in its own seconds: from its first stroke or board to the moment
 * its last stroke goes (or `duration`, the end of the take) and its last board ends. Null when
 * nothing was drawn and no board was put up.
 */
export function drawingSpan(d: Drawing, duration: number): [number, number] | null {
  const boards = d.boards ?? [];
  if (!d.strokes.length && !boards.length) return null;
  const start = Math.min(...d.strokes.map((s) => s.t), ...boards.map((b) => b.start));
  let end = Math.max(...boards.map((b) => Math.min(duration, b.end)), start);
  for (const s of d.strokes)
    end = Math.max(end, Math.min(duration, Math.max(strokeGone(d, s), strokeEnd(s))));
  return end > start ? [start, end] : null;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
const fine = (v: number): number => Math.round(v * 1e4) / 1e4;

/**
 * The drawing with its times moved by `by` seconds (to the video's own seconds). Nothing goes
 * before 0: a moment that would is the start, and a wipe that would (an "apagar tudo" before
 * anything was drawn) is dropped, since it takes nothing away.
 */
export function shiftDrawing(d: Drawing, by: number): Drawing {
  const at = (v: number): number => Math.max(0, round(v + by));
  const kept = (list: readonly number[]): number[] => list.filter((c) => round(c + by) > 0).map(at);
  return {
    ...d,
    strokes: d.strokes.map((s) => {
      const t = at(s.t);
      return { ...s, t, ...(s.until !== undefined ? { until: Math.max(t, at(s.until)) } : {}) };
    }),
    clears: kept(d.clears),
    ...(d.boards
      ? {
          boards: d.boards.map((b) => {
            const start = at(b.start);
            return { ...b, start, end: Math.max(start, at(b.end)) };
          }),
        }
      : {}),
    ...(d.pages ? { pages: kept(d.pages) } : {}),
    ...(d.pointer ? { pointer: { ...d.pointer, offset: round(d.pointer.offset - by) } } : {}),
  };
}

/** A drawing read from a project, made sound: nothing before 0, nothing undone before it began. */
export const sanitizeDrawing = (d: Drawing): Drawing => shiftDrawing(d, 0);

/**
 * A take's drawing held to the limits of the project file: at most MAX_STROKES strokes (the
 * first ones), at most MAX_DRAWING_POINTS points in all (every stroke thinned alike, never below
 * its two ends), positions to ten-thousandths of the frame and times to milliseconds. `cut` says
 * what was left out, for a warning.
 */
export function limitDrawing(d: Drawing): {
  drawing: Drawing;
  cut: { strokes: number; thinned: boolean };
} {
  const strokes = [...d.strokes].sort((a, b) => a.t - b.t).slice(0, MAX_STROKES);
  const total = strokes.reduce((n, s) => n + s.points.length, 0);
  const share = total > MAX_DRAWING_POINTS ? MAX_DRAWING_POINTS / total : 1;
  const limited = strokes.map((s) => ({
    ...s,
    t: round(s.t),
    ...(s.until !== undefined ? { until: round(s.until) } : {}),
    points: thinPoints(
      s.points,
      Math.min(MAX_STROKE_POINTS, Math.max(2, Math.floor(s.points.length * share))),
    ).map(([x, y, t]): [number, number, number] => [fine(x), fine(y), round(t)]),
  }));
  const boards = d.boards?.slice(0, MAX_STROKES);
  const pages = d.pages?.slice(0, MAX_STROKES).map(round);
  return {
    drawing: {
      ...d,
      strokes: limited,
      clears: d.clears.slice(0, MAX_STROKES).map(round),
      ...(boards ? { boards } : {}),
      ...(pages ? { pages } : {}),
    },
    cut: { strokes: d.strokes.length - strokes.length, thinned: share < 1 },
  };
}

/** One stroke as it shows at a moment: its points so far, the last one part of the way. */
export interface VisibleStroke {
  color: string;
  width: number;
  points: [number, number][];
  tool?: DrawingTool;
}

/** The board up at second `t`, if any. */
export function boardAt(d: Drawing, t: number): DrawingBoard | null {
  return (d.boards ?? []).find((b) => t >= b.start && t < b.end) ?? null;
}

/** The strokes on screen at `t`, each with what of it shows. */
function visibleAt(d: Drawing, t: number): { stroke: DrawingStroke; shown: VisibleStroke }[] {
  const out: { stroke: DrawingStroke; shown: VisibleStroke }[] = [];
  const gone = wipes(d);
  for (const s of d.strokes) {
    if (s.t > t) continue;
    if (s.until !== undefined && s.until <= t) continue;
    if (gone.some((c) => c > s.t && c <= t)) continue;
    const local = t - s.t;
    const points: [number, number][] = [];
    for (let i = 0; i < s.points.length; i++) {
      const p = s.points[i];
      if (p[2] <= local) {
        points.push([p[0], p[1]]);
        continue;
      }
      // The segment being drawn right now, as far as the pen got.
      const q = s.points[i - 1];
      if (q && p[2] > q[2]) {
        const k = (local - q[2]) / (p[2] - q[2]);
        points.push([q[0] + (p[0] - q[0]) * k, q[1] + (p[1] - q[1]) * k]);
      }
      break;
    }
    if (points.length)
      out.push({
        stroke: s,
        shown: { color: s.color, width: s.width, points, ...(s.tool ? { tool: s.tool } : {}) },
      });
  }
  return out;
}

/** What is on screen at second `t`: every stroke begun and not taken away, drawn up to `t`. */
export function drawingAt(d: Drawing, t: number): VisibleStroke[] {
  return visibleAt(d, t).map((v) => v.shown);
}

/**
 * The picture of the drawing at second `t`, as text: equal keys are equal pictures, at any time
 * and in any drawing (each stroke is named by its start, look and first point, then by how much
 * of it shows). Frames are drawn once per key and kept by it, so a stroke taken out in the
 * editor redraws only the frames it was in.
 */
export function drawingFrameKey(d: Drawing, t: number): string {
  const board = boardAt(d, t);
  return `${board ? board.color : "-"}#${visibleAt(d, t)
    .map(({ stroke: s, shown }) => {
      const first = s.points[0];
      const last = shown.points.at(-1);
      const look = `${s.t}/${s.color}/${s.width}/${s.tool ?? "pen"}/${first[0]},${first[1]}`;
      return `${look}:${shown.points.length}:${last ? `${last[0].toFixed(4)},${last[1].toFixed(4)}` : ""}`;
    })
    .join("|")}`;
}

/**
 * The frames of a drawing's video (its own seconds, `frames` of them at `fps`) where the
 * picture may change: every frame while a stroke is being drawn or while `live` says so (the
 * pointer over a board), and the first frame at or after each moment something appears or goes.
 * The frames in between repeat the one before them.
 */
export function drawingChangeFrames(
  d: Drawing,
  fps: number,
  frames: number,
  live: readonly [number, number][] = [],
): number[] {
  const out = new Set<number>([0]);
  const first = (t: number): number => Math.max(0, Math.ceil(t * fps - 1e-6));
  const add = (i: number): void => {
    if (i < frames) out.add(i);
  };
  const span = (a: number, b: number): void => {
    const to = Math.min(frames - 1, first(b));
    for (let i = first(a); i <= to; i++) out.add(i);
  };
  for (const s of d.strokes) {
    span(s.t, strokeEnd(s));
    if (s.until !== undefined) add(first(s.until));
  }
  for (const t of wipes(d)) add(first(t));
  for (const [a, b] of live) span(a, b);
  return [...out].sort((a, b) => a - b);
}

/**
 * FFmpeg's concat list of a drawing's video (main/drawingVideo.ts): each picture from its first
 * frame until the next one, `total` frames in all at `fps` (a whole number, so every time lands
 * on a frame). The last picture is listed twice, its last frame on its own: FFmpeg ignores the
 * duration of the last entry, and the video must last to its end.
 */
export function drawingConcat(
  pictures: readonly { path: string; at: number }[],
  total: number,
  fps: number,
): string {
  const quoted = (p: string): string => `'${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
  const lines = ["ffconcat version 1.0"];
  const entry = (path: string, frames: number): void => {
    lines.push(`file ${quoted(path)}`, `option framerate ${fps}`);
    lines.push(`duration ${(frames / fps).toFixed(6)}`);
  };
  pictures.forEach((p, i) => {
    const next = i + 1 < pictures.length ? pictures[i + 1].at : total;
    const frames = Math.max(1, next - p.at);
    if (i + 1 < pictures.length || frames === 1) entry(p.path, frames);
    else {
      entry(p.path, frames - 1);
      entry(p.path, 1);
    }
  });
  return `${lines.join("\n")}\n`;
}

/**
 * The stretches of a drawing's span (its own seconds) as clips will show them: "board" while a
 * board is up, cut at each new page, and "drawing" around them.
 */
export function drawingParts(
  d: Drawing,
  span: [number, number],
): { from: number; to: number; kind: "drawing" | "board" }[] {
  const cuts = new Set<number>([span[0], span[1]]);
  for (const b of d.boards ?? []) for (const t of [b.start, b.end]) cuts.add(t);
  for (const p of d.pages ?? []) if (boardAt(d, p)) cuts.add(p);
  const edges = [...cuts].filter((t) => t >= span[0] && t <= span[1]).sort((a, b) => a - b);
  const parts: { from: number; to: number; kind: "drawing" | "board" }[] = [];
  for (let i = 1; i < edges.length; i++) {
    const from = edges[i - 1];
    const to = edges[i];
    if (to - from < 1e-3) continue;
    parts.push({ from, to, kind: boardAt(d, (from + to) / 2) ? "board" : "drawing" });
  }
  // Stretches without a board and without a stroke on screen show nothing: no clip for them.
  return parts.filter((p) => p.kind === "board" || strokesIn(d, p.from, p.to).length > 0);
}

/** The drawing without stroke `index` (the editor takes one out). */
export const withoutStroke = (d: Drawing, index: number): Drawing => ({
  ...d,
  strokes: d.strokes.filter((_, i) => i !== index),
});

/** The drawing with the board up at second `t` in `color`. */
export const withBoardColor = (d: Drawing, t: number, color: string): Drawing => ({
  ...d,
  boards: (d.boards ?? []).map((b) => (t >= b.start && t < b.end ? { ...b, color } : b)),
});

/**
 * The drawing clips of a take: one per kept stretch of the take that the drawing covers, on
 * `trackId`, laid like the screen of that stretch. The drawing's video starts at take second
 * `span[0]`; each clip shows its part of it, and `screen` is the screen clip it lies over.
 */
export function drawingClips(
  pieces: readonly Pick<RecordingPieceLayout, "from" | "to" | "start" | "screen">[],
  span: [number, number],
  assetId: string,
  trackId: string,
  newId: () => string,
): { clip: Clip; screen?: string }[] {
  const clips: { clip: Clip; screen?: string }[] = [];
  for (const piece of pieces) {
    const a = Math.max(piece.from, span[0]);
    const b = Math.min(piece.to, span[1]);
    if (b - a < 1 / 30) continue;
    const screen = piece.screen[0];
    clips.push({
      clip: {
        id: newId(),
        assetId,
        trackId,
        start: piece.start + (a - piece.from),
        in: a - span[0],
        duration: b - a,
        volume: 0,
        ...(screen?.transform ? { transform: { ...screen.transform } } : {}),
      },
      ...(screen ? { screen: screen.id } : {}),
    });
  }
  return clips;
}

/**
 * The pointer data without the clicks made while drawing (seconds of the take): pressing the pen
 * down is not a click on the lesson, so it makes no ripple and no automatic zoom.
 */
export function dropDrawingClicks(
  data: CursorData,
  ranges: readonly [number, number][],
): CursorData {
  if (!ranges.length) return data;
  const inside = (t: number): boolean => ranges.some(([a, b]) => t >= a - 0.05 && t <= b + 0.05);
  return {
    ...data,
    clicks: data.clicks.filter((c) => !inside(c[0])),
    drawing: ranges.map(([a, b]): [number, number] => [a, b]),
  };
}

/** Size of the drawing's video: the recording's proportion, at most 1920 on the long side, even. */
export function drawingVideoSize(width: number, height: number): { width: number; height: number } {
  const w = width > 0 ? width : 1920;
  const h = height > 0 ? height : 1080;
  const s = Math.min(1, 1920 / Math.max(w, h));
  const even = (v: number): number => Math.max(2, Math.round((v * s) / 2) * 2);
  return { width: even(w), height: even(h) };
}

/**
 * The clips of a take's drawing, one per part of it (shared/drawing.ts drawingParts) and per kept
 * stretch of the take it falls in, on `trackId`, laid like the screen of that stretch. The
 * drawing's video starts at take second `span[0]`; each clip shows its part of it, and `screen`
 * is the screen clip it lies over (they go together, as one group).
 */
export function drawingPartClips(
  pieces: readonly Pick<RecordingPieceLayout, "from" | "to" | "start" | "screen">[],
  span: [number, number],
  parts: readonly { from: number; to: number; kind: "drawing" | "board" }[],
  assetId: string,
  trackId: string,
  newId: () => string,
): { clip: Clip; kind: "drawing" | "board"; screen?: string }[] {
  const out: { clip: Clip; kind: "drawing" | "board"; screen?: string }[] = [];
  for (const part of parts)
    for (const { clip, screen } of drawingClips(
      pieces,
      [span[0] + part.from, span[0] + part.to],
      assetId,
      trackId,
      newId,
    ))
      out.push({
        clip: { ...clip, in: clip.in + part.from },
        kind: part.kind,
        ...(screen ? { screen } : {}),
      });
  return out;
}

/**
 * The drawing clips placed with the take: each joins the group of the screen clip it lies over
 * (a new group when that clip has none), so moving, trimming at the same edge or packing a
 * magnetic track carries them along with the screen.
 */
export function groupWithScreens(
  clips: readonly Clip[],
  placed: readonly { clip: Clip; screen?: string }[],
  newGroup: () => string,
): { clips: Clip[]; placed: Clip[] } {
  const groups = new Map<string, string>();
  const next = clips.map((c) => {
    if (!placed.some((p) => p.screen === c.id)) return c;
    const groupId = c.groupId ?? newGroup();
    groups.set(c.id, groupId);
    return c.groupId ? c : { ...c, groupId };
  });
  return {
    clips: next,
    placed: placed.map(({ clip, screen }) => {
      const groupId = screen ? groups.get(screen) : undefined;
      return groupId ? { ...clip, groupId } : clip;
    }),
  };
}
