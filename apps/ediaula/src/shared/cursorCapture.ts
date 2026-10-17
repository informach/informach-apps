import type { HookEvent } from "./helperProtocol.ts";
import { CURSOR_SHAPES, type CursorData, keyLabel, type MarkerKind } from "./recording.ts";

/**
 * Turns the native helper's events into the cursor.json (version 1) the editor reads: video
 * seconds across the recorded segments and pixels of the recorded region.
 */

export interface CaptureSegment {
  /** QueryPerformanceCounter milliseconds of the first frame. */
  start: number;
  /** Seconds of video. */
  duration: number;
}

/** Maps a QPC time to video seconds across segments; -1 when it fell in a pause. */
export function toVideoTime(segments: CaptureSegment[], t: number): number {
  let offset = 0;
  for (const g of segments) {
    if (t >= g.start && t <= g.start + g.duration * 1000) return offset + (t - g.start) / 1000;
    offset += g.duration;
  }
  return -1;
}

const BUTTONS: Record<string, number> = { left: 0, right: 1, middle: 2 };

export function cursorDataFromEvents(
  events: readonly HookEvent[],
  segments: CaptureSegment[],
  region: { x: number; y: number; width: number; height: number },
  markers: readonly { qpc: number; kind: MarkerKind }[],
): CursorData {
  const data: CursorData = {
    version: 1,
    width: region.width,
    height: region.height,
    moves: [],
    clicks: [],
    wheel: [],
    markers: [],
  };
  const round = (v: number): number => Math.round(v * 1000) / 1000;
  // Cursor images that turned out to be a standard shape keep that shape's name.
  const standard = new Map<string, string>();
  for (const e of events) if (e.e === "img" && e.std) standard.set(e.id, e.std);
  const shapeIndex = (id: string): number => {
    const index = CURSOR_SHAPES.indexOf((standard.get(id) ?? id) as (typeof CURSOR_SHAPES)[number]);
    return index >= 0 ? index : CURSOR_SHAPES.indexOf("other");
  };
  let shape = 0;
  // The helper already keeps at most one move per 8 ms, plus the exact position before a click.
  let last: { x: number; y: number; shape: number } | undefined;
  const downs = new Map<string, [number, number, number, number, number]>();
  for (const e of events) {
    if (e.e === "c") {
      shape = shapeIndex(e.id);
      // A shape change while the pointer rests becomes a move to the same place.
      const t = toVideoTime(segments, e.t);
      if (last && t >= 0 && last.shape !== shape) {
        data.moves.push([round(t), last.x, last.y, shape]);
        last = { x: last.x, y: last.y, shape };
      }
      continue;
    }
    if (e.e !== "m" && e.e !== "d" && e.e !== "u" && e.e !== "w" && e.e !== "k") continue;
    const t = toVideoTime(segments, e.t);
    if (t < 0) continue;
    if (e.e === "k") {
      data.keys ??= [];
      data.keys.push([round(t), keyLabel(e.vk, e.m)]);
      continue;
    }
    const x = e.x - region.x;
    const y = e.y - region.y;
    if (e.e === "m") {
      data.moves.push([round(t), x, y, shape]);
      last = { x, y, shape };
    } else if (e.e === "d") {
      const button = BUTTONS[e.b];
      if (button === undefined) continue;
      const click: [number, number, number, number, number] = [round(t), x, y, button, 0];
      data.clicks.push(click);
      downs.set(e.b, click);
    } else if (e.e === "u") {
      const down = downs.get(e.b);
      if (down) down[4] = round(t - down[0]);
      downs.delete(e.b);
    } else if (!e.h) data.wheel.push([round(t), x, y, e.d]);
  }
  for (const m of markers) {
    const t = toVideoTime(segments, m.qpc);
    data.markers.push({
      t: round(t < 0 ? segments.reduce((a, g) => (g.start < m.qpc ? a + g.duration : a), 0) : t),
      kind: m.kind,
    });
  }
  return data;
}
