import type { CameraChoice } from "./camera.ts";
import type { Drawing } from "./drawing.ts";
import type { CaptureQuality } from "./encoderChoice.ts";
import type { GuidedReplace, GuidedStore } from "./guidedPlan.ts";
import type { SystemAudioRoute } from "./systemAudio.ts";
import type { VoiceSegment } from "./voiceMaster.ts";

/** Screen recording made by EdiAula: sources, options, and what a finished take hands over. */

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

/** A window "Janela…" can record: physical pixels of the virtual desktop. */
export interface CaptureWindow {
  /** Window handle as decimal text (the helper's `follow` and `front` take it). */
  hwnd: string;
  title: string;
  /** Executable path, when Windows tells it. */
  exe: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
}

export interface CaptureSources {
  monitors: CaptureMonitor[];
  microphones: string[];
  cameras: string[];
}

export interface RecordOptions {
  /** Monitor to record; absent for a take without the screen (voice only). */
  monitor?: number;
  /** Part of the monitor to record, physical pixels relative to its top-left; absent = whole monitor. */
  region?: { x: number; y: number; width: number; height: number };
  microphone?: string;
  camera?: string;
  /** Webcam input mode (shared/camera.ts); absent = the device's default. */
  cameraMode?: CameraChoice;
  /** Milliseconds between a webcam frame being taken and FFmpeg receiving it. */
  cameraLatency?: number;
  /** Log shortcut and navigation keys to show them on screen (never plain typing). */
  keys?: boolean;
  fps: number;
  quality?: CaptureQuality;
  /** Record the computer's sound (shared/systemAudio.ts). */
  systemAudio?: boolean;
  /**
   * "native": the helper captures it without any sound of the app (sistema-0.wav);
   * "chromium" (default): the recorder window sends it in chunks (recorder:systemChunk).
   */
  systemAudioRoute?: SystemAudioRoute;
  /** "voice": only the microphone, kept as PCM; "voicecam": the same voice with the camera
   *  recording the presenter beside it; "over": the screen over the lesson's voice. */
  mode?: RecordMode;
  /** "Só voz": the teleprompter follows the voice (a 16 kHz copy goes to the recognizer). */
  follow?: boolean;
  /** "Tela sobre a narração": where on the timeline the voice starts playing and, to redo the
   *  screen in a stretch, where that stretch ends. */
  over?: OverPlan;
}

export const RECORD_MODES = ["screen", "voice", "voicecam", "over"] as const;
export type RecordMode = (typeof RECORD_MODES)[number];

/** "Só voz" and "Voz e câmera": the voice kept as PCM, read line by line, without the screen. */
export const isVoiceMode = (mode: RecordMode | undefined): boolean =>
  mode === "voice" || mode === "voicecam";

export interface OverPlan {
  /** Timeline seconds the voice is played from. */
  from: number;
  /** Redo the screen only up to here (seconds of the timeline). */
  to?: number;
  /** Replace what the screen track has in [from, to]. */
  replace?: boolean;
}

export type MarkerKind = "marker" | "retake";

/** What the editor hands the recorder when it opens it (main/recorderWindow.ts keeps it). */
export interface RecorderContext {
  /** Teleprompter paragraphs: the speech lines of the project's script section, in order. */
  teleprompter: { speaker: string; text: string; avatar: boolean; insertId?: string }[];
  title?: string;
  /** "Na tela" directions of the section, each before the teleprompter line `before`. */
  screenNotes?: { before: number; text: string }[];
  /** The mode to open in ("Tela sobre a narração" from the timeline). */
  mode?: RecordMode;
  /** "Tela sobre a narração": the lesson's voice, as the editor has it now. */
  over?: OverContext;
  /** The open lesson: its guided plans are saved there (and as a draft against a crash). */
  projectId?: string;
  guided?: GuidedStore;
  /** "Regravar e substituir": this media's guided take is recorded again with its plan. */
  guidedReplace?: GuidedReplace;
  /**
   * "Regravar falas": the recorder opens in "Só voz" with only these teleprompter lines (indexes
   * of `teleprompter`), the ones missing from the lesson or only partly in it, one take each.
   */
  retakeLines?: number[];
  /** The open lesson's frame: the "Resolução da aula" region preset. */
  lesson?: { width: number; height: number; fps: number };
  /** The lesson's palette colors (#RRGGBB), for drawing on the screen. */
  palette?: string[];
}

/**
 * What the frame over the recorded screen shows while the controls are on another monitor
 * (main/recorderWindow.ts): the region in pixels of that screen, its handles while it is set up,
 * the countdown and the drawing.
 */
export interface FrameState {
  region: { x: number; y: number; width: number; height: number };
  /** Physical pixels the take will record. */
  size: { w: number; h: number };
  editable: boolean;
  recording: boolean;
  lock: boolean;
  /** Seconds left of the countdown, or null. */
  countdown: number | null;
  /** Shown only when the screen is recorded (not in the voice modes). */
  visible: boolean;
  draw: { allowed: boolean; on: boolean; palette: string[]; toggleKey: string };
}

/** What is done on the frame, for the controls to apply. */
export type FrameEvent =
  | { type: "region"; rect: { x: number; y: number; width: number; height: number } }
  | { type: "size"; size: { width?: number; height?: number } }
  | { type: "lock"; on: boolean }
  | { type: "drawExit" };

/** What the recorder needs to play the lesson's voice and show it while the screen is recorded. */
export interface OverContext extends OverPlan {
  /** Where the voice ends on the timeline. */
  end: number;
  /** The voice track as segments to render (shared/voiceMaster.ts voiceSegments). */
  segments: VoiceSegment[];
  /** Words of the voice at their timeline seconds, for the karaoke. */
  words: { t: number; end: number; text: string }[];
  /** "Na tela" directions at the timeline second they apply from. */
  cues: { t: number; text: string }[];
  /**
   * The script's lines where the voice says them (the transcript aligned with the script), with
   * the part of the script each is in: the places the recorder can start a part from.
   */
  lines?: { t: number; text: string; part: string }[];
  /** Timeline stretches that already have a recorded screen: starting inside one records over it. */
  recorded?: [number, number][];
  /** The voice is still being transcribed: its words, lines and cues come when it is done. */
  transcribing?: boolean;
}

/**
 * What the editor shows when the recorder closes: the lesson's recording steps, or the sending
 * of the lesson to whoever edits it.
 */
export const RECORDER_NEXT = ["flow", "send"] as const;
export type RecorderNext = (typeof RECORDER_NEXT)[number];

/** The voice read as text, sent again to an open recorder when its transcript is ready. */
export type OverText = Pick<OverContext, "words" | "cues" | "lines" | "transcribing">;

/** Default frame rate of screen recordings. */
export const RECORDING_FPS = 30;

/** What a recording session is doing (main/recording/session.ts). */
export const RECORDER_PHASES = [
  "prepared",
  "recording",
  "paused",
  "failed",
  "stopping",
  "finalized",
] as const;
export type RecorderPhase = (typeof RECORDER_PHASES)[number];

/** Each source is its own process: one failing leaves the others recording. */
export const CAPTURE_SOURCES = ["screen", "mic", "camera", "system", "cursor"] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

/** State pushed from the main process to the recorder and to the editor window. */
export interface RecorderStatus {
  /** null: no session (the recorder is being set up or was closed). */
  phase: RecorderPhase | null;
  /** Sources whose process stopped: the take is paused until they reopen. */
  failed: CaptureSource[];
  /** The pause closed some sources (a long pause, a full disk); resuming opens new parts. */
  closed: boolean;
  /** Sources are opening again right now. */
  reopening: boolean;
  /** Editor window only: background work and the next export wait for the take. */
  holdBackground?: boolean;
}

/** Something the teacher has to know right away, with what can be done about it. */
export interface RecorderEvent {
  source: CaptureSource | "disk" | "machine";
  level: "error" | "warning" | "info";
  message: string;
  /** "resume" reopens what failed and goes on; "stop" saves what was recorded. */
  actions: ("resume" | "stop")[];
  /** The recorder window has to stop and save now (the disk is full). */
  request?: "stop";
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

/**
 * A piece of a file placed on the recording's own clock: `at` seconds of the take, from `in`
 * seconds of the file, for `duration` seconds.
 */
export interface RecordingPiece {
  path: string;
  at: number;
  in: number;
  duration: number;
}

/**
 * A finished take (gravacao.json). Every time is in seconds of the take's own clock, which is
 * the screen video's (or the microphone's in a take without the screen); pauses stay in the
 * files and become cuts when the take is imported.
 */
export interface RecordingResult {
  version: 2;
  dir: string;
  /** The screen video, joined; absent in a take without the screen or when kept in parts. */
  screen?: string;
  /** cursor.json of `screen`. */
  cursor?: string;
  /** Screen parts left as recorded (fragmented MP4) because the disk had no room to join them;
   *  each has its own cursor data in its own seconds. */
  screenParts?: (RecordingPiece & { cursor: string })[];
  /** The microphone, already lined up with the take: second 0 is the take's second 0. */
  microphone?: string;
  /** The microphone as recorded, placed on the take's clock, when the disk had no room to line
   *  it up. */
  microphoneParts?: RecordingPiece[];
  /** The computer's sound, lined up the same way (or in parts, likewise). */
  systemAudio?: string;
  systemParts?: RecordingPiece[];
  /** Webcam files as recorded, placed on the take's clock. */
  cameraParts?: RecordingPiece[];
  /** The guided recording's narration, and where it starts in seconds of the take without the
   *  pauses (the time the recorder counted). */
  narration?: string;
  narrationOffset?: number;
  /** The narration is the voice taken from a video: the presenter's voice. */
  narrationFromVideo?: boolean;
  /** guided-run.json of a guided take in the lesson window (shared/guidedCursor.ts). */
  guidedRun?: string;
  /** "Regravar e substituir": the screen media this take replaces (never written to disk). */
  replaceAsset?: string;
  duration: number;
  /** Stretches of the take recorded while paused (or after a failure): cut on import. */
  pauses: [number, number][];
  markers: { t: number; kind: MarkerKind }[];
  /** Notes left for whoever edits the lesson ("Recado"), in seconds of the take. */
  notes?: { t: number; text: string }[];
  /** Teleprompter line shown from each moment. */
  lines?: { t: number; index: number }[];
  /** Strokes drawn on the screen during the take, in seconds of the take (shared/drawing.ts). */
  drawing?: Drawing;
  /** What kind of take this was; absent for a screen recording. */
  mode?: Exclude<RecordMode, "screen">;
  /** "Tela sobre a narração": the plan, and at moments of the take (`t`, seconds without the
   *  pauses removed) which timeline second of the voice was heard (`at`). */
  over?: OverPlan & { anchors: { t: number; at: number }[] };
  /** The cursor helper restarted or stopped during the take: the pointer may be missing there. */
  cursorIssues?: string[];
  /** The chosen encoder could not start and another one recorded. */
  encoderIssues?: string[];
  /** Other things that went wrong and were worked around (a source that stopped, a full disk). */
  warnings?: string[];
}

/**
 * A take that never reached a project, found at startup: unfinished (the app or the computer
 * went down, or finalizing failed), or finished and never imported.
 */
export interface OrphanTake {
  dir: string;
  name: string;
  /** Date.now() when the take was prepared. */
  startedAt: number;
  /** Bytes of media in the folder. */
  size: number;
  /** About how many seconds were recorded. */
  seconds: number;
  sources: ("screen" | "mic" | "camera" | "system")[];
  /** Finished, only not imported: it opens as it is, with nothing to recover. */
  finalized: boolean;
}

/**
 * Ranges (source seconds) to cut for each Ctrl+Shift+R "redo the last passage": from the middle of the
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

/** A word of the voice, in seconds of the take (the microphone's own seconds). */
export interface TakeWord {
  start: number;
  end: number;
  text: string;
}

/** A word as compared: lower case, without accents or punctuation. */
const token = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Words said all the time (articles, prepositions, "é", "né"): two of them together match
 * anywhere, so a pair made only of them never says where the passage was first said.
 */
const COMMON = new Set(
  (
    "a o as os um uma uns umas de da do das dos e é em no na nos nas num numa que se " +
    "por pra para pro com sem ao aos à às eu tu ele ela nos vocês você isso isto esse essa " +
    "aqui ali lá aí então né tá ta já mais mas ou como quando onde também muito bem vai " +
    "vamos gente agora assim tem ter foi ser está esta"
  )
    .split(" ")
    .map(token),
);

/** How far back (seconds) the passage said again is looked for. */
const RETAKE_WINDOW = 20;

/** Where a sentence ends: its last word closes it, or a long silence follows it. */
const closes = (word: TakeWord, next: TakeWord | undefined): boolean =>
  /[.!?…]["»”)]*$/.test(word.text.trim()) || (!!next && next.start - word.end > 0.7);

/**
 * Ranges (seconds of the take) to cut for each Ctrl+Shift+R by the words of the voice: the
 * teacher repeats what went wrong, so before the press (up to 20 s back) it looks for the last
 * time the first three words said after it were said, or the first two when they are not both
 * common words; the cut goes from there to where the passage starts again. When they were not
 * said before, it goes from the start of the sentence the press interrupted. Each edge falls in the middle of the pause beside it (at most 0.15 s into it), so
 * no syllable is clipped. Without a transcript, retakeCuts finds the pauses by the volume.
 */
export function retakeCutsFromWords(
  markers: { t: number; kind: MarkerKind }[],
  words: readonly TakeWord[],
): [number, number][] {
  const list = words
    .filter((w) => token(w.text) && w.end >= w.start)
    .sort((a, b) => a.start - b.start);
  const cuts: [number, number][] = [];
  const before = (i: number): number => {
    const w = list[i];
    const prev = list[i - 1];
    return prev ? Math.max(prev.end, w.start - Math.min(0.15, (w.start - prev.end) / 2)) : w.start;
  };
  for (const m of markers) {
    if (m.kind !== "retake") continue;
    // The passage said again: the first words that start after the press.
    const again = list.findIndex((w) => w.start >= m.t);
    if (again < 0) continue;
    let from = -1;
    for (const size of [3, 2]) {
      const wanted = list.slice(again, again + size).map((w) => token(w.text));
      if (wanted.length < size) continue;
      if (size === 2 && wanted.every((t) => COMMON.has(t))) continue;
      for (let j = again - size; j >= 0; j--) {
        if (list[j].start < m.t - RETAKE_WINDOW) break;
        if (wanted.every((t, k) => token(list[j + k].text) === t)) {
          from = j;
          break;
        }
      }
      if (from >= 0) break;
    }
    if (from < 0) {
      // The start of the sentence the press interrupted.
      let j = again - 1;
      while (j > 0 && !closes(list[j - 1], list[j]) && list[j - 1].start >= m.t - RETAKE_WINDOW)
        j--;
      from = j;
    }
    if (from < 0 || from >= again) continue;
    const start = before(from);
    const end = before(again);
    if (end - start > 0.2 && end - start <= RETAKE_WINDOW) cuts.push([start, end]);
  }
  return cuts;
}
