import type { CameraChoice } from "./camera.ts";
import type { CaptureQuality } from "./encoderChoice.ts";
import type { GuidedReplace, GuidedStore } from "./guidedPlan.ts";
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
  /** The recorder window sends the computer's sound in chunks (recorder:systemChunk). */
  systemAudio?: boolean;
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
}

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
}

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
  /** Teleprompter line shown from each moment. */
  lines?: { t: number; index: number }[];
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
