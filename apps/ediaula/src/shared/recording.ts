/** Screen recording made by EdiAula: sources, options, and the cursor data saved beside the video. */

export interface CaptureMonitor {
  /** Order reported by Windows. */
  index: number;
  /** Physical pixels on the virtual desktop. */
  x: number;
  y: number;
  width: number;
  height: number;
  primary: boolean;
  /** Desktop Duplication output used to capture it; -1 when not found. */
  output: number;
  label: string;
  /** Position in window coordinates (DIP), to place the recorder over it. */
  dip?: { x: number; y: number; width: number; height: number };
}

export interface CaptureSources {
  monitors: CaptureMonitor[];
  microphones: string[];
  cameras: string[];
}

export interface RecordOptions {
  monitor: number;
  /** Part of the monitor to record, physical pixels relative to its top-left; absent = whole monitor. */
  region?: { x: number; y: number; width: number; height: number };
  microphone?: string;
  camera?: string;
  /** Log shortcut and navigation keys to show them on screen (never plain typing). */
  keys?: boolean;
  fps: number;
}

export type MarkerKind = "marker" | "retake";

/** State pushed from the main process to the recorder window. */
export interface RecorderState {
  phase: "setup" | "countdown" | "recording" | "paused" | "saving";
  /** Seconds recorded so far (excluding pauses). */
  elapsed: number;
  markers: number;
  error?: string;
}

export const CURSOR_SHAPES = [
  "arrow",
  "text",
  "wait",
  "cross",
  "hand",
  "move",
  "nwse",
  "nesw",
  "ew",
  "ns",
  "no",
  "busy",
  "other",
  "hidden",
] as const;
export type CursorShape = (typeof CURSOR_SHAPES)[number];

/**
 * Cursor movements and clicks of a recording, in seconds of the video and pixels of the video
 * frame (so they follow the video through cuts, crops and zooms).
 */
export interface CursorData {
  version: 1;
  width: number;
  height: number;
  /** [t, x, y, shape index into CURSOR_SHAPES] */
  moves: [number, number, number, number][];
  /** [t, x, y, button (0 left, 1 right, 2 middle), seconds held] */
  clicks: [number, number, number, number, number][];
  /** [t, x, y, wheel delta] */
  wheel: [number, number, number, number][];
  /** F9/Ctrl+M markers and Ctrl+R retakes, video seconds. */
  markers: { t: number; kind: MarkerKind }[];
  /** Shortcut and navigation keys pressed: [t, label] (e.g. "Ctrl+C", "→"). */
  keys?: [number, string][];
}

const KEY_NAMES: Record<number, string> = {
  8: "⌫",
  9: "Tab",
  13: "Enter",
  27: "Esc",
  32: "Espaço",
  33: "PgUp",
  34: "PgDn",
  35: "End",
  36: "Home",
  37: "←",
  38: "↑",
  39: "→",
  40: "↓",
  46: "Del",
  186: "Ç",
  187: "=",
  188: ",",
  189: "-",
  190: ".",
  191: ";",
};

/** "Ctrl+Shift+Z" from a virtual key and the modifiers flags "casw" (1/0 each). */
export function keyLabel(vk: number, mods: string): string {
  const [c, a, s, w] = mods.split("").map((m) => m === "1");
  const key =
    KEY_NAMES[vk] ??
    (vk >= 112 && vk <= 135
      ? `F${vk - 111}`
      : vk >= 48 && vk <= 90
        ? String.fromCharCode(vk)
        : vk >= 96 && vk <= 105
          ? String(vk - 96)
          : `Tecla ${vk}`);
  return [w && "Win", c && "Ctrl", a && "Alt", s && (c || a || w) && "Shift", key]
    .filter(Boolean)
    .join("+");
}

export interface KeyPill {
  start: number;
  end: number;
  label: string;
}

/** Seconds a key stays on screen; repeats of the same key while it shows are counted (→ ×3). */
export const KEY_SHOW = 1.2;

export function keyPills(keys: [number, string][]): KeyPill[] {
  const out: (KeyPill & { count: number; base: string })[] = [];
  for (const [t, label] of keys) {
    const last = out[out.length - 1];
    if (last && last.base === label && t - last.end + KEY_SHOW < KEY_SHOW + 0.6 && t < last.end) {
      last.count++;
      last.end = t + KEY_SHOW;
      last.label = `${label} ×${last.count}`;
      continue;
    }
    if (last && last.end > t) last.end = t;
    out.push({ start: t, end: t + KEY_SHOW, label, base: label, count: 1 });
  }
  return out.map(({ start, end, label }) => ({ start, end, label }));
}

export interface RecordingResult {
  narration?: string;
  narrationOffset?: number;
  dir: string;
  screen: string;
  camera?: string;
  /** Sound of the computer (loopback), and where it starts relative to the screen video (seconds). */
  systemAudio?: string;
  systemOffset?: number;
  cursor: string;
  duration: number;
  markers: { t: number; kind: MarkerKind }[];
}

/**
 * Ranges (source seconds) to cut for each Ctrl+R "redo the last passage": from the middle of the
 * pause before the flubbed passage to the middle of the pause after the key press, where the
 * teacher starts again. `peaks` is the audio envelope (0..1) at `pps` values per second.
 */
export function retakeCuts(
  markers: { t: number; kind: MarkerKind }[],
  peaks: number[],
  pps: number,
): [number, number][] {
  const quiet = 0.06;
  const minPause = 0.4;
  const pauses: [number, number][] = [];
  let from = -1;
  peaks.forEach((v, i) => {
    if (v < quiet) {
      if (from < 0) from = i;
    } else if (from >= 0) {
      if ((i - from) / pps >= minPause) pauses.push([from / pps, i / pps]);
      from = -1;
    }
  });
  if (from >= 0 && (peaks.length - from) / pps >= minPause)
    pauses.push([from / pps, peaks.length / pps]);
  const mid = (p: [number, number]): number => (p[0] + p[1]) / 2;
  const cuts: [number, number][] = [];
  for (const m of markers) {
    if (m.kind !== "retake") continue;
    // The flubbed passage started after the last pause that ended a bit before the key press...
    const before = [...pauses].reverse().find((p) => p[1] <= m.t - 0.3);
    // ...and the new take starts after the pause that follows the key press.
    const after = pauses.find((p) => p[1] > m.t);
    const start = before ? mid(before) : Math.max(0, m.t - 10);
    const end = after ? Math.max(mid(after), m.t) : m.t;
    if (end - start > 0.2 && end - start <= 40) cuts.push([start, end]);
  }
  return cuts;
}
