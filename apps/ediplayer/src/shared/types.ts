import type { EditJob } from "./edit.ts";

/** One audio stream of a file, as the player lists it. */
export interface AudioTrack {
  /** Position among the file's audio streams (FFmpeg `0:a:<index>`). */
  index: number;
  codec: string;
  language?: string;
  title?: string;
  channels: number;
  sampleRate: number;
}

/** One subtitle stream inside the file; only text ones can be shown or burned. */
export interface SubtitleTrack {
  index: number;
  codec: string;
  language?: string;
  title?: string;
  text: boolean;
}

/** What EdiPlayer knows about a file after probing it. */
export interface MediaFacts {
  path: string;
  name: string;
  /** Container names reported by FFmpeg (`mov,mp4,m4a,3gp,3g2,mj2`, `matroska,webm`, `avi`…). */
  container: string;
  duration: number;
  size: number;
  bitRate: number;
  hasVideo: boolean;
  videoCodec?: string;
  videoProfile?: string;
  width: number;
  height: number;
  fps: number;
  pixFmt?: string;
  timeBase?: string;
  /** Display rotation stored in the file (phones), degrees clockwise. */
  rotation: number;
  audio: AudioTrack[];
  subtitles: SubtitleTrack[];
}

/** What the renderer's Chromium says it can decode, sent once at startup. */
export interface PlaybackCaps {
  hevc: boolean;
  av1: boolean;
  /** H.264 inside Matroska. */
  mkvH264: boolean;
}

export type PlaybackMode = "native" | "remux" | "preview";

/** A file ready to play: the URL the <video> loads and how it got there. */
export interface PlaybackSource {
  url: string;
  mode: PlaybackMode;
  facts: MediaFacts;
  /** The audio stream this source carries (remuxed sources carry one). */
  audioIndex: number;
}

/** A frame sheet for the progress bar preview and the cut ruler. */
export interface FrameSheet {
  url: string;
  columns: number;
  rows: number;
  count: number;
  /** Seconds between two tiles. */
  step: number;
  tileWidth: number;
  tileHeight: number;
}

export interface RecentItem {
  path: string;
  name: string;
  duration: number;
  position: number;
  watched: boolean;
  updatedAt: number;
  /** Token URL of the thumbnail, filled when listing. */
  thumbUrl?: string;
}

export interface PlayerPrefs {
  volume: number;
  boost: boolean;
  muted: boolean;
  subtitleSize: number;
  subtitleBottom: number;
}

export type QueueStatus = "waiting" | "working" | "done" | "error" | "cancelled";

export interface QueueItem {
  id: string;
  label: string;
  outputs: string[];
  status: QueueStatus;
  ratio: number;
  message?: string;
  openFolder: boolean;
  startedAt?: number;
}

/** Long work the main process reports to the window (previews, sheets). */
export interface ProgressEvent {
  id: string;
  ratio: number;
  label: string;
}

export interface EdiPlayerApi {
  appInfo(): Promise<{ version: string }>;
  reportCaps(caps: PlaybackCaps): Promise<void>;
  pickFiles(): Promise<string[]>;
  pickFolder(): Promise<string[]>;
  pickSubtitle(): Promise<string | null>;
  pickAudio(): Promise<string | null>;
  pickJoinFiles(): Promise<string[]>;
  pathForFile(file: File): string;
  probe(path: string): Promise<MediaFacts>;
  open(path: string, audioIndex: number, fallback: boolean): Promise<PlaybackSource>;
  cancelPrepare(path: string): Promise<void>;
  frameSheet(path: string): Promise<FrameSheet>;
  waveform(path: string): Promise<number[]>;
  keyframes(path: string): Promise<number[]>;
  readSubtitle(path: string): Promise<string>;
  extractSubtitle(path: string, index: number): Promise<string>;
  captureFrame(path: string, at: number, target: "file" | "clipboard"): Promise<string | null>;
  recents(): Promise<RecentItem[]>;
  remember(item: Omit<RecentItem, "thumbUrl" | "updatedAt">): Promise<void>;
  forgetRecents(): Promise<void>;
  prefs(): Promise<PlayerPrefs>;
  savePrefs(prefs: PlayerPrefs): Promise<void>;
  /** The save dialog, opened in the folder of `near` (the source) when given. */
  pickOutput(defaultName: string, extension: string, near?: string): Promise<string | null>;
  pickOutputFolder(): Promise<string | null>;
  enqueue(job: EditJob, label: string, openFolder: boolean): Promise<QueueItem>;
  cancelJob(id: string): Promise<void>;
  queue(): Promise<QueueItem[]>;
  clearFinished(): Promise<void>;
  showInFolder(path: string): Promise<void>;
  setAlwaysOnTop(on: boolean): Promise<void>;
  setMiniPlayer(on: boolean): Promise<void>;
  openInEdiAula(path: string): Promise<"opened" | "missing">;
  onQueue(cb: (items: QueueItem[]) => void): () => void;
  onProgress(cb: (event: ProgressEvent) => void): () => void;
  onOpenFiles(cb: (paths: string[]) => void): () => void;
}
