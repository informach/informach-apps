import type { Annotation } from "./annotation.ts";
import type { CaptionStyle } from "./captions.ts";
import type { ChromaKey } from "./chroma.ts";
import type { Motion, Transform } from "./compose.ts";
import type { CursorFx } from "./cursor.ts";
import type { FontFamily } from "./fonts.ts";
import type { Keyframe } from "./keyframes.ts";
import type { Palette } from "./palettes.ts";
import type { CaptureSources, MarkerKind, RecordingResult, RecordOptions } from "./recording.ts";
import type { Transition } from "./transitions.ts";
import type { Zoom } from "./zoom.ts";
import type { ZoomLayer } from "./zoomLayer.ts";

export type AssetKind = "video" | "audio" | "image";
export type ProxyStatus = "none" | "pending" | "ready" | "error";

export interface Asset {
  id: string;
  name: string;
  path: string;
  kind: AssetKind;
  /** Seconds. Images use 0 (unlimited). */
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  size: number;
  thumb?: string;
  /** Path to a JSON file with 100 normalized peaks per second. */
  waveform?: string;
  proxy?: string;
  proxyStatus: ProxyStatus;
  missing?: boolean;
  /** Path to a Transcript JSON file. */
  transcript?: string;
  transcriptStatus?: "pending" | "ready" | "error";
  /** Variable frame rate source (common in screen recordings); previewed through a constant-rate copy. */
  vfr?: boolean;
  /** Made by EdiAula (the picture of an annotation); hidden from the media library. */
  generated?: "annotation" | "effect";
  /** Cursor data (CursorData JSON) of a screen recording made in EdiAula; the video has no pointer. */
  cursor?: string;
  /** The cursor data file is not where `cursor` says (the video may still be there). */
  cursorMissing?: boolean;
  /** How the recorded pointer is drawn; absent = defaults. */
  cursorFx?: CursorFx;
  /** Markers set while recording (Ctrl+M) and passages to redo (Ctrl+R), source seconds. */
  markers?: { t: number; kind: MarkerKind }[];
  /** Solid screen color detected at import (avatar recorded on blue or green), '#RRGGBB'. */
  screen?: string;
  /** Zooms on this media (automatic from clicks, or by hand), in its own seconds: every clip
   *  of it shows the ones over its stretch of the source (shared/zoom.ts). */
  zooms?: Zoom[];
  /** Background removal for every clip of this media. */
  key?: ChromaKey;
  /** Cached video with transparency for `key` (used by preview and export) and the key it was made with. */
  keyed?: string;
  keyedId?: string;
  keyStatus?: "pending" | "ready" | "error";
}

/**
 * A stretch of a source file that automatic and AI cuts must not touch (a demonstrated gesture,
 * a test step). Stored in source time so it follows the clip through later edits.
 */
export interface ProtectedRange {
  id: string;
  assetId: string;
  start: number;
  end: number;
  label: string;
}

/** A spoken word, in seconds of the source file. `text` keeps attached punctuation. */
export interface Word {
  start: number;
  end: number;
  text: string;
  /** Recognition confidence, 0..1. */
  p: number;
}

export interface Transcript {
  version: 1;
  model: string;
  language: string;
  duration: number;
  words: Word[];
  /** Silent stretches of the source audio, [start, end] in seconds. */
  silences: [number, number][];
}

export type WhisperVariant = "cuda" | "cpu";

export interface WhisperModelInfo {
  name: string;
  path: string;
  size: number;
}

export interface EngineStatus {
  bin: string | null;
  variant: WhisperVariant | null;
  model: WhisperModelInfo | null;
  models: WhisperModelInfo[];
  /** An NVIDIA GPU is available, so the CUDA build is recommended. */
  gpu: boolean;
}

export type TrackKind = "video" | "audio";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  /** Background music: lowered automatically while anyone speaks on the other tracks. */
  music?: boolean;
  /** Height on the timeline in pixels (dragged by the bottom edge of its header); absent = default. */
  height?: number;
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  /** Position on the timeline, seconds. */
  start: number;
  /** Source in-point, seconds. */
  in: number;
  duration: number;
  /** 1 = 100%. */
  volume: number;
  /** Playback speed (2 = twice as fast, 0.5 = half); absent = 1. The clip lasts duration on the
   *  timeline and covers duration × speed of the source. */
  speed?: number;
  /** Removes steady background noise (fan, hum, hiss) from the clip's sound at export. */
  denoise?: boolean;
  /** Position, size, crop and opacity in the frame; absent = fit to the frame. */
  transform?: Transform;
  /** Seconds of the entrance and exit animations (a dissolve unless enter/exit say otherwise). */
  fadeIn?: number;
  fadeOut?: number;
  enter?: Motion;
  exit?: Motion;
  /** Free movement: position and size at moments of the clip (overrides the transform's x, y, scale). */
  keyframes?: Keyframe[];
  /** Transition from the clip that ends where this one starts (same track). */
  transition?: Transition;
  /** Annotation this clip shows (its asset is the rendered picture). */
  annotation?: Annotation;
  /** Zoom layer: everything on the tracks below it is zoomed while it lasts (it shows nothing itself). */
  zoomLayer?: ZoomLayer;
  /** Script insert this clip plays (F1P1-D01), when it was placed from the script. */
  insertId?: string;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  course?: string;
  createdAt: number;
  updatedAt: number;
  exportedAt?: number;
  /** Texts for publishing the lesson, usually written by the AI assistant. */
  publish?: PublishInfo;
  protected?: ProtectedRange[];
  /** Captions drawn into the video at export, and how they look. */
  captions?: CaptionStyle & { burn: boolean };
  /** Color palette the lesson's annotations and templates use (id; default EdiAula). */
  palette?: string;
  /** Use the palette's fonts too (titles and text) instead of the default typeface. */
  paletteFonts?: boolean;
  /** Recording script pasted by the user and the section this video corresponds to. */
  script?: { text: string; section?: number };
  /** Active editing time, to measure how long each lesson really takes. */
  stats?: { editSeconds: number };
  settings: ProjectSettings;
  assets: Asset[];
  /** Display order, top to bottom: video tracks first (highest layer on top), then audio. */
  tracks: Track[];
  clips: Clip[];
}

export interface PublishInfo {
  title?: string;
  description?: string;
  summary?: string;
  chapters?: { time: number; title: string }[];
}

export interface RecentEntry {
  path: string;
  name: string;
  course?: string;
  updatedAt: number;
  exportedAt?: number;
  duration: number;
  thumb?: string;
  assetCount: number;
  editSeconds?: number;
}

export interface ProbeResult {
  kind: AssetKind;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  size: number;
  videoCodec?: string;
  vfr?: boolean;
}

/** A missing media looked for in a folder (main/relink.ts). */
export interface RelinkWanted {
  key: string;
  /** File name and size in bytes on disk. */
  name: string;
  size: number;
  /** What the found file must probe as. */
  kind: AssetKind;
  duration: number;
  width: number;
  height: number;
  oldPath: string;
  /** Files that lived next to it and follow it (the cursor data). */
  companions: string[];
}

export interface RelinkSearch {
  /** Asset id → where it is now, and old → new path of its companions. */
  found: Record<string, { path: string; size: number; companions: Record<string, string> }>;
  /** Files with the right name and size that were another media. */
  refused: number;
  /** The folder had more files than a search looks at. */
  truncated: boolean;
  canceled: boolean;
}

export type Encoder = "nvenc" | "x264";

export interface ExportSpec {
  outPath: string;
  width: number;
  height: number;
  fps: number;
  /** kbit/s */
  videoBitrate: number;
  normalizeLoudness: boolean;
  encoder: Encoder;
  /** Moments someone speaks (from the transcript), for lowering the music; default: the voice clips. */
  speech?: [number, number][];
  /** SRT captions written next to the video when present (a .vtt copy is written too). */
  captions?: string;
  /** Also save a JPEG thumbnail next to the video. */
  thumbnail?: boolean;
  /** Captions drawn into the picture: ASS subtitle text (see shared/captions.ts). */
  burnAss?: string;
  /** Set by the main process: where burnAss was written, and the system fonts folder. */
  assFile?: string;
  fontsDir?: string;
  /** Podcast: only the mixed sound, as MP3. */
  audioOnly?: boolean;
  /** Reels/Shorts: width × height is the vertical frame; the lesson goes over a blurred copy of itself ('blur') or is cropped to fill it ('crop'). */
  vertical?: "blur" | "crop";
  /** Pre-rendered pointer of screen recordings, by asset id (see shared/cursor.ts). */
  cursors?: Record<string, CursorSprite>;
}

export interface CursorSprite {
  /** Transparent video of the pointer sprite, one frame per source frame at `fps`. */
  sprite: string;
  size: number;
  fps: number;
  /** Top-left of the sprite in source video pixels, [x0, y0, x1, y1, …] per frame. A typed array
   *  crosses IPC as a single value, so recordings of any length fit the limit. */
  positions: Int32Array;
}

export interface JobProgress {
  id: string;
  ratio: number;
  message?: string;
}

export interface AppInfo {
  encoder: Encoder;
  version: string;
  projectsDir: string;
  /** Bundled fonts (resources/fonts) for annotations and burned captions. */
  fontsDir: string;
  fonts: FontFamily[];
}

export const ASSISTANT_MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (recomendado)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (mais barato)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (mais rápido)" },
] as const;

export type AssistantEngine = "claude-code" | "codex" | "api";

export const ENGINE_LABEL: Record<AssistantEngine, string> = {
  "claude-code": "Claude Code · sua assinatura",
  codex: "Codex · sua assinatura do ChatGPT",
  api: "API da Anthropic · chave",
};

export interface AiSettingsView {
  engine: AssistantEngine;
  claudeModel: string;
  hasApiKey: boolean;
  /** Last characters of the key, to recognise it. */
  apiKeyHint?: string;
  model: string;
  mcpEnabled: boolean;
  mcpPort: number;
  mcpUrl: string;
  mcpRunning: boolean;
  mcpError?: string;
}

export type AiClientId = "claude-code" | "codex";

export interface AiClientStatus {
  id: AiClientId;
  name: string;
  installed: boolean;
  version?: string;
  connected: boolean;
}

export type AssistantEvent =
  | { type: "text"; delta: string }
  | {
      type: "tool";
      id: string;
      name: string;
      title: string;
      status: "running" | "done" | "error";
      summary?: string;
    }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "quota"; level: "ok" | "warn" | "blocked"; text: string };

export interface AiToolCall {
  id: string;
  name: string;
  input: unknown;
  source: "mcp" | "assistant";
}

export interface EdiAulaApi {
  saveEditingTemplate(name: string, content: string): Promise<string | null>;
  readEditingTemplate(): Promise<{ path: string; content: string } | null>;
  appInfo(): Promise<AppInfo>;
  /** The user's own palettes (the built-in ones are not stored). */
  listPalettes(): Promise<Palette[]>;
  savePalettes(list: Palette[]): Promise<void>;
  pickMedia(): Promise<string[]>;
  pickProject(): Promise<string | null>;
  pickExportPath(defaultName: string): Promise<string | null>;
  /** Where to save a copy of the project (.ediaula); the chosen path becomes writable. */
  pickProjectCopyPath(defaultName: string): Promise<string | null>;
  /**
   * Missing media: the user points at the file; it becomes readable, with the companions
   * (cursor data) found next to it, and `token` lets one search look in that same folder.
   */
  relinkPick(request: {
    oldPath: string;
    companions: string[];
  }): Promise<{ path: string; token: string; companions: Record<string, string> } | null>;
  /** The cursor data of a recording, picked by the user. */
  relinkCursor(oldPath: string): Promise<string | null>;
  /**
   * Looks for missing media in a folder the user picks (or, with `token`, in the folder of the
   * last pick), by file name and size, keeping only files that probe as the same media.
   */
  relinkFolder(wanted: RelinkWanted[], token?: string): Promise<RelinkSearch>;
  probe(path: string): Promise<ProbeResult>;
  thumbnail(path: string, kind: AssetKind, duration: number): Promise<string>;
  waveform(path: string): Promise<string>;
  proxy(jobId: string, path: string, duration: number, cfrFps?: number): Promise<string>;
  /** Pointer sprite videos for the export, drawn in the renderer and encoded in the main process. */
  cursorSprite: {
    cached(path: string, id: string): Promise<string | null>;
    begin(jobId: string, path: string, id: string, size: number, fps: number): Promise<void>;
    frames(jobId: string, frames: Uint8Array, counts: number[]): Promise<void>;
    end(jobId: string): Promise<string>;
    cancel(jobId: string): Promise<void>;
  };
  recorder: {
    guidedPick(): Promise<import("./guidedRecording.ts").GuidedTarget>;
    guidedStart(
      plan: import("./guidedRecording.ts").GuidedPlan,
    ): Promise<{ origin: number; lead: number }>;
    guidedCancel(): Promise<void>;
    reset(): Promise<void>;
    guidedBrowser(url: string): Promise<void>;
    pickNarration(): Promise<string | null>;
    open(ctx: {
      teleprompter: { speaker: string; text: string; avatar: boolean }[];
      title?: string;
    }): Promise<void>;
    context(): Promise<{
      teleprompter: { speaker: string; text: string; avatar: boolean }[];
      title?: string;
    }>;
    sources(): Promise<CaptureSources & { current: number | null }>;
    moveTo(index: number): Promise<void>;
    prepare(
      opts: RecordOptions & { regionDip?: { x: number; y: number; width: number; height: number } },
    ): Promise<void>;
    start(): Promise<void>;
    /** Hands over the computer's sound recorded in the recorder window (before stop). */
    systemAudio(bytes: Uint8Array, startedAt: number): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    mark(kind: MarkerKind): Promise<void>;
    elapsed(): Promise<number>;
    /** false = clicks go through to the apps underneath. */
    interactive(on: boolean): Promise<void>;
    cancel(): Promise<void>;
    stop(): Promise<RecordingResult>;
    /** Automated checks only: saves a picture of the recorder window. */
    debugCapture(path: string): Promise<void>;
    onHotkey(cb: (name: string) => void): () => void;
    onDone(cb: (r: RecordingResult) => void): () => void;
  };
  /** Saves a picture made in the editor (annotation) in the cache; returns its path. */
  saveGenerated(bytes: Uint8Array, ext: string): Promise<string>;
  saveNarration(bytes: Uint8Array): Promise<string>;
  /** PNG of one frame (cached), used to hold the picture while an insert plays. */
  stillFrame(path: string, t: number, alpha?: boolean): Promise<string>;
  /** Solid screen color behind an avatar ('#RRGGBB'), or null. */
  detectScreen(
    path: string,
    duration: number,
    width: number,
    height: number,
  ): Promise<string | null>;
  /** One RGB frame, sized like the keyed video (or to fit maxSide). */
  grabFrame(
    path: string,
    t: number,
    width: number,
    height: number,
    maxSide?: number,
  ): Promise<{ width: number; height: number; data: Uint8Array }>;
  /** Renders (or reuses) the cached video with the background removed; resolves with its path. */
  renderKeyed(
    jobId: string,
    path: string,
    width: number,
    height: number,
    fps: number,
    duration: number,
    key: ChromaKey,
  ): Promise<string>;
  exists(paths: string[]): Promise<boolean[]>;
  createProject(
    name: string,
    course: string | undefined,
    settings: ProjectSettings,
  ): Promise<{ path: string; project: Project }>;
  /** The project as JSON text (JSON.stringify in the page, so only a string crosses to the
   *  preload and to the main process): a single IPC value however long the lesson is. */
  saveProject(path: string, projectJson: string): Promise<void>;
  openProject(path: string): Promise<Project>;
  recentProjects(): Promise<RecentEntry[]>;
  removeRecent(path: string): Promise<void>;
  /** The project as JSON text, like saveProject; the cursor positions stay typed arrays. */
  startExport(jobId: string, projectJson: string, spec: ExportSpec): Promise<void>;
  cancelJob(jobId: string): Promise<void>;
  showInFolder(path: string): Promise<void>;
  onProgress(cb: (p: JobProgress) => void): () => void;
  pathForFile(file: File): string;
  engineStatus(): Promise<EngineStatus>;
  installEngine(jobId: string, variant: WhisperVariant): Promise<EngineStatus>;
  installModel(jobId: string, name: string): Promise<EngineStatus>;
  selectModel(path: string): Promise<EngineStatus>;
  transcribe(
    jobId: string,
    path: string,
    duration: number,
    language: string,
    glossary: string[],
  ): Promise<string>;
  getGlossary(course: string): Promise<string[]>;
  setGlossary(course: string, terms: string[]): Promise<void>;
  openRestrictedClaude(): Promise<{ ok: boolean; message: string }>;
  aiSettings(): Promise<AiSettingsView>;
  saveAiSettings(changes: {
    apiKey?: string | null;
    model?: string;
    mcpEnabled?: boolean;
    engine?: AssistantEngine;
    claudeModel?: string;
  }): Promise<AiSettingsView>;
  testApiKey(): Promise<{ ok: boolean; message: string }>;
  aiClients(): Promise<AiClientStatus[]>;
  connectAiClient(id: AiClientId): Promise<{ ok: boolean; message: string }>;
  assistantSend(conversationId: string, text: string): Promise<void>;
  assistantStop(conversationId: string): Promise<void>;
  assistantReset(conversationId: string): Promise<void>;
  onAssistantEvent(cb: (conversationId: string, e: AssistantEvent) => void): () => void;
  /** Registers the renderer as the executor of AI tool calls (from MCP clients and the assistant). */
  handleAiTools(run: (call: AiToolCall) => Promise<{ ok: boolean; text: string }>): () => void;
}
