import type { Effort } from "./aiModels.ts";
import type { StoredProposal } from "./anchors.ts";
import type { Annotation } from "./annotation.ts";
import type { SavedChat } from "./assistantChat.ts";
import type { Ducking } from "./audio.ts";
import type { PieceMatch } from "./audioSync.ts";
import type { CameraChoice, CameraMode } from "./camera.ts";
import type { CaptionStyle, CueStyleEntry } from "./captions.ts";
import type { CaptionTranslation } from "./captionTranslate.ts";
import type { ChromaKey } from "./chroma.ts";
import type { Motion, Transform } from "./compose.ts";
import type { CourseTemplate } from "./courseTemplate.ts";
import type { CursorFx } from "./cursor.ts";
import type { BoardKind, Drawing, DrawingTool } from "./drawing.ts";
import type { FontFamily } from "./fonts.ts";
import type { FrameGeometry } from "./frameGrab.ts";
import type { GainPoint } from "./gain.ts";
import type { GlossaryTerm } from "./glossary.ts";
import type {
  BrokenStep,
  GuidedMark,
  GuidedMarkPurpose,
  GuidedPlanV2,
  GuidedRunRecord,
  GuidedStore,
  GuidedTakeStatus,
  GuidedViewport,
} from "./guidedPlan.ts";
import type { HotkeyReport } from "./hotkeys.ts";
import type { Keyframe } from "./keyframes.ts";
import type { Learning, LearningEvent } from "./learning.ts";
import type { Background, ClipColor, RegionFx } from "./look.ts";
import type { Marker } from "./markers.ts";
import type { Palette } from "./palettes.ts";
import type { PlatformInput, QuizItem } from "./platformPackage.ts";
import type { Loudness } from "./preflight.ts";
import type { PrepareState } from "./prepare.ts";
import type { RecorderSettings } from "./recorderSettings.ts";
import type {
  CaptureSources,
  CaptureWindow,
  MarkerKind,
  OrphanTake,
  RecorderContext,
  RecorderEvent,
  RecorderStatus,
  RecordingResult,
  RecordOptions,
} from "./recording.ts";
import type { MicLevel, RecorderHealth } from "./recordingHealth.ts";
import type { SystemAudioRoute } from "./systemAudio.ts";
import type { Transition } from "./transitions.ts";
import type { VoicePreset } from "./voiceChain.ts";
import type { VoiceSegment } from "./voiceMaster.ts";
import type { TextCue } from "./webvtt.ts";
import type { Zoom } from "./zoom.ts";
import type { ZoomLayer } from "./zoomLayer.ts";

export type AssetKind = "video" | "audio" | "image";

/** What a file of an EdiAula recording is: the cuts of the take apply to all of them alike. */
export const RECORDING_ROLES = [
  "screen",
  "mic",
  "camera",
  "system",
  "narration",
  // The video of what was drawn on the screen during the take (shared/drawing.ts).
  "drawing",
] as const;
export type RecordingRole = (typeof RECORDING_ROLES)[number];
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
  /**
   * Made by EdiAula and hidden from the media library: the picture of an annotation, the blank
   * picture of a zoom layer, or the held frame of Estender quadro (`still`). Each one is drawn
   * again when its file is gone (a project opened on another computer).
   */
  generated?: "annotation" | "effect" | "still";
  /** The held frame of Estender quadro: which media and which of its seconds it shows. */
  still?: { assetId: string; t: number };
  /**
   * The video of a take's drawing (generated "annotation"): its strokes and boards, in the
   * video's own seconds (shared/drawing.ts). Kept here once; its clips show stretches of it.
   */
  drawing?: Drawing;
  /** Sheet of small pictures along the video, for the clips on the timeline (main/ffmpeg.ts). */
  filmstrip?: Filmstrip;
  /** Cursor data (CursorData JSON) of a screen recording made in EdiAula; the video has no pointer. */
  cursor?: string;
  /** The cursor data file is not where `cursor` says (the video may still be there). */
  cursorMissing?: boolean;
  /** How the recorded pointer is drawn; absent = defaults. */
  cursorFx?: CursorFx;
  /** Markers set while recording (Ctrl+Shift+M) and passages to redo (Ctrl+Shift+R), source seconds. */
  markers?: { t: number; kind: MarkerKind }[];
  /**
   * The take this file belongs to (its folder) and which of its sources it is; `paused`, the
   * source seconds recorded during the take's pauses, which no clip may reach.
   */
  recording?: { id: string; role: RecordingRole; paused?: [number, number][] };
  /** guided-run.json of a guided take in the lesson window: its steps, actions and holds. */
  guidedRun?: string;
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
  /** Corrections to this media's transcript, by word, in its own seconds (shared/wordEdits.ts). */
  wordEdits?: WordEdit[];
  /** How the voice of this media is treated (shared/voiceChain.ts); absent = untreated. */
  voicePreset?: VoicePreset;
  /** The treated voice (cached WAV) the preview and the export play, and what made it. */
  treated?: { path: string; preset: VoicePreset; version: number };
  treatStatus?: "pending" | "ready" | "error";
  /** A "Só voz" recording: the stretch of each take, by teleprompter line, in source seconds. */
  voiceTakes?: VoiceTake[];
  /** Where the picture of a screen recording stands still (a motion file, main/ffmpeg.ts screenMotion). */
  motion?: string;
  motionStatus?: "pending" | "ready" | "error";
  /** From a presenter (an avatar or a person): the video placed by the voice, or a guided
   *  narration taken from such a video. */
  origin?: "presenter";
  /** The picture has its own transparency (WebM with alpha, ProRes 4444, PNG): it is decoded
   *  keeping it, and previewed from the original or a VP9 proxy with alpha. */
  alpha?: boolean;
}

/**
 * One picture every `step` seconds of a video, `width` × `height` each, laid in rows of
 * `columns` on one image (`count` in all): the timeline draws the ones under each clip.
 */
export interface Filmstrip {
  /** The first sheet (all of them when `sheets` is absent: a strip made before sheets). */
  path: string;
  /** JPEG sheets of ten minutes each, in order, `perSheet` pictures on each. */
  sheets?: string[];
  perSheet?: number;
  step: number;
  width: number;
  height: number;
  columns: number;
  count: number;
}

/**
 * One take of a script line in a voice recording: from the moment the teleprompter reached the
 * line (or the take before it ended) to the next change; `retake` when Ctrl+Shift+R marked it
 * to be thrown away.
 */
export interface VoiceTake {
  /** Index of the line among the section's speech items (shared/script.ts speechItems). */
  line: number;
  start: number;
  end: number;
  retake?: boolean;
}

/** A stretch of an exported voice piece and where it came from (shared/voiceMaster.ts). */
export interface VoiceMasterSegment {
  /** Seconds into the exported file. */
  at: number;
  duration: number;
  /** Where it was on the timeline at export time. */
  start: number;
  /** The voice media and its own seconds there. */
  assetId: string;
  in: number;
  speed?: number;
}

export interface VoiceMasterPiece {
  /** The WAV written for the presenter's video. */
  file: string;
  /** What it covers: the lesson, a section or an avatar insert (F1P1-D01). */
  label: string;
  /** Timeline range at export time. */
  start: number;
  end: number;
  sourceMap: VoiceMasterSegment[];
}

/** One line of the kids table, found in a character's video and in the lesson's voice. */
export interface KidsPiece {
  /** The table's id ("video-a1-abertura-K1"). */
  id: string;
  character: string;
  /** The character's video and the stretch of it (source seconds) that says the line. */
  assetId: string;
  in: number;
  out: number;
  /** Where the teacher says the same line: the voice media and its source seconds. */
  voice: { assetId: string; from: number; to: number };
}

export interface KidsEdition {
  /** The characters' videos brought in (each with every line of theirs, one after another). */
  videos: string[];
  pieces: KidsPiece[];
  /** The table's rows of the parts found in the voice, at the last search (the lesson's rows). */
  rows?: string[];
}

/** What the exported voice was: the MP4s that come back are placed by it. */
export interface VoiceMaster {
  id: string;
  /** shared/voiceMaster.ts voiceHash of the voice track when it was exported. */
  hash: string;
  createdAt: number;
  scope: "lesson" | "section" | "insert";
  pieces: VoiceMasterPiece[];
}

/**
 * A hand correction of word `i` of the transcript (its index as whisper wrote it): new text, new
 * times (source seconds), removed from the text, or `keep`: stays as whisper heard it (the
 * glossary leaves it alone, and a word the hallucination filter set aside comes back). `was` and
 * `at` are the recognized text and start it was made on: a transcript made again gets the
 * correction on the same word nearby, or not at all.
 */
export interface WordEdit {
  i: number;
  text?: string;
  start?: number;
  end?: number;
  del?: boolean;
  keep?: boolean;
  was?: string;
  at?: number;
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
  /** Index in the transcript as recognized, once corrections removed or joined words before it. */
  i?: number;
  /** What whisper heard, when the glossary changed the text. */
  heard?: string;
  /** Indexes (as recognized) of the words the glossary joined into this one. */
  joined?: number[];
  /** Set aside by the hallucination filter (shared/whisperParse.ts); hidden until restored. */
  dropped?: "silence" | "credit" | "signoff";
}

export interface Transcript {
  version: 1;
  model: string;
  language: string;
  duration: number;
  words: Word[];
  /** Silent stretches of the source audio, [start, end] in seconds. */
  silences: [number, number][];
  /** Speech stretches the VAD kept, [start, end] in source seconds (absent without VAD). */
  speech?: [number, number][];
  /** As read (shared/wordEdits.ts): hand corrections that found no word to apply to. */
  lostEdits?: number;
}

export type WhisperVariant = "cuda" | "cpu";

export interface WhisperModelInfo {
  name: string;
  path: string;
  size: number;
  /** Not one of the models EdiAula downloads and checks (C:\whisper-cpp, or another file). */
  unchecked?: boolean;
}

export interface EngineStatus {
  bin: string | null;
  variant: WhisperVariant | null;
  model: WhisperModelInfo | null;
  models: WhisperModelInfo[];
  /** An NVIDIA GPU is available, so the CUDA build is recommended. */
  gpu: boolean;
  /** The person chose to list models EdiAula cannot check (C:\whisper-cpp). */
  externalModels: boolean;
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
  /** A music track that stays at its level while someone speaks (default: it steps aside). */
  duck?: boolean;
  /** Magnetic (shared/magnetic.ts): its clips always sit back to back from 0:00. */
  magnetic?: boolean;
  /** "Destacar faixa": while it sounds, the other tracks step aside (the ducking of the music). */
  spotlight?: boolean;
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
  /** Recorded as a time-lapse over the narration ("Trecho acelerado"): its speed fits the voice. */
  timelapse?: boolean;
  /** Removes steady background noise (fan, hum, hiss) from the clip's sound at export. */
  denoise?: boolean;
  /** Position, size, crop and opacity in the frame; absent = fit to the frame. */
  transform?: Transform;
  /**
   * The place the clip had before "Lado a lado" put it beside the camera (null: fit to the
   * frame), to go back to when the camera leaves that framing.
   */
  besideFrom?: Transform | null;
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
  /** Silent while the presenter's video plays its own sound over it ("Usar o som do vídeo
   *  importado"): the clip is still the lesson's voice, with its volume. */
  mutedFor?: "presenter";
  /**
   * Only the sound of its media plays (Separar áudio: the sound taken out of a video): the
   * picture is drawn by the video clip it came from, never by this one.
   */
  soundOnly?: boolean;
  /** Group (shared/groups.ts): clips of one group are picked, moved, trimmed and copied together. */
  groupId?: string;
  /** Blur, pixelate or spotlight over a part of what the tracks below show (shared/look.ts). */
  regionFx?: RegionFx;
  /** Volume envelope in dB at moments of the clip (shared/gain.ts). */
  gain?: GainPoint[];
  /** Brightness, contrast, saturation and temperature (shared/look.ts). */
  color?: ClipColor;
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
  /** Word keys (asset:index) where a caption is forced to start. */
  captionBreaks?: string[];
  /** Looks of single captions, by the key of their first word. */
  cueStyles?: CueStyleEntry[];
  /** Color palette the lesson's annotations and templates use (id; default EdiAula). */
  palette?: string;
  /** Use the palette's fonts too (titles and text) instead of the default typeface. */
  paletteFonts?: boolean;
  /**
   * Recording script pasted by the user and the section this video corresponds to; `confirmed`
   * once the person said the section is the right one (shared/scriptAlign.ts, rankSections).
   */
  script?: { text: string; section?: number; confirmed?: boolean };
  /** The choices made in the cleanup panel: what to keep and how (the AI follows them too). */
  cleanup?: CleanupSettings;
  /** Active editing time, to measure how long each lesson really takes. */
  stats?: { editSeconds: number };
  /** AI proposals waiting for the person, anchored in the media (shared/anchors.ts). */
  proposals?: StoredProposal[];
  /** The voices exported for the presenter's video (Arquivo › Exportar a voz), oldest first and at
   *  most VOICE_MASTER_LIMIT: an MP4 that comes back is matched against all of them. */
  voiceMasters?: VoiceMaster[];
  /**
   * The kids edition (shared/kidsEdition.ts): the characters' videos and, for each line of the
   * script's kids table found in them, the stretch that replaces the teacher's line on export.
   */
  kids?: KidsEdition;
  /** How the voice is exported: no piece longer than `pieceMinutes` (1 to 60, default 5). */
  voiceExport?: { pieceMinutes?: number };
  /** How the music steps aside for the voice; absent values use the defaults (shared/audio.ts). */
  audio?: { ducking?: Partial<Ducking> };
  /** "Preparar aula": the step waiting and what was decided in each (shared/prepare.ts). */
  prepare?: PrepareState;
  /** Seams the person approved in "Revisar cortes" (shared/seams.ts ids, anchored in the media). */
  reviewedSeams?: string[];
  /** The course template offered when the lesson opened: what the person answered, so it is
   *  not offered again for the same course. */
  templateOffer?: { course: string; answer: "applied" | "declined" };
  /** Guided recording plans of this lesson and how their takes ended (shared/guidedPlan.ts). */
  guided?: GuidedStore;
  /**
   * A lesson started from its course's template (shared/courseTemplate.ts startingLesson): when
   * the first media reaches the timeline, the opening and closing cards go in and the music bed
   * (already in the library) is laid to the end of the lesson; then this is gone. While it is
   * here, "Preparar aula" leaves the cards to it.
   */
  pendingStart?: {
    opening?: boolean;
    closing?: boolean;
    closingText?: string;
    music?: { assetId: string; trackId: string; volume: number };
  };
  /** The captions translated by the AI, one per language (shared/captionTranslate.ts). */
  captionTranslations?: CaptionTranslation[];
  /** Markers and chapters on the timeline (shared/markers.ts). */
  markers?: Marker[];
  /** What shows where no clip covers the frame (default black). */
  background?: Background;
  settings: ProjectSettings;
  assets: Asset[];
  /** Display order, top to bottom: video tracks first (highest layer on top), then audio. */
  tracks: Track[];
  clips: Clip[];
}

/** The person's choices for the automatic cleanup of a lesson (src/renderer/src/lib/cleanupPlan.ts). */
export interface CleanupSettings {
  /** Suggestions the person chose to keep (Issue.id: anchored in the media, stable across cuts). */
  kept: string[];
  /** Silences at least this long are shortened (seconds). */
  minSilence?: number;
  /** Pause left in place of a removed silence (seconds). */
  keepPause?: number;
  /** A kind set to false is left out of the cleanup. */
  kinds?: { filler?: boolean; silence?: boolean; repeat?: boolean };
  /** Phrases repeated on purpose ("muito, muito"); absent: shared/cleanup.ts DEFAULT_INTENTIONAL. */
  intentional?: string[];
  /** Hesitations this lesson does not cut ("né" for a teacher who uses it on purpose), learned
   *  from the course (shared/learning.ts). */
  notFillers?: string[];
}

export interface PublishInfo {
  title?: string;
  description?: string;
  summary?: string;
  chapters?: { time: number; title: string }[];
  /** The video id of the script section (`F1P1-V01`), for the platform. */
  videoId?: string;
  /** Questions with four options made from the lesson's lines (shared/platformPackage.ts). */
  quiz?: QuizItem[];
  /** The frame of the thumbnail (timeline second) and the title the platform shows over it. */
  thumbnail?: { time: number; title?: string };
}

/** A backup of a lesson as the start screen and the editor list it (main/projects.ts). */
export interface BackupEntry {
  id: string;
  at: number;
  size: number;
  name?: string;
  duration?: number;
  clips?: number;
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
  /** The picture carries transparency (WebM alpha_mode, or a pixel format with alpha). */
  alpha?: boolean;
  /** FFprobe's color_space, color_range and pix_fmt of the picture, when it says. */
  colorSpace?: string;
  colorRange?: string;
  pixFmt?: string;
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

/** H.264 encoder for exports and proxies: NVIDIA, AMD, Media Foundation hardware, or the CPU. */
export const ENCODERS = ["nvenc", "amf", "mf", "x264"] as const;
export type Encoder = (typeof ENCODERS)[number];

/** Constant quality by resolution (CRF or CQ); the bitrate becomes its ceiling. */
export const EXPORT_QUALITIES = ["draft", "standard", "high", "max"] as const;
export type ExportQuality = (typeof EXPORT_QUALITIES)[number];

export interface ExportSpec {
  outPath: string;
  width: number;
  height: number;
  fps: number;
  /** kbit/s: the target, or the ceiling with `quality`. 0 only for audio. */
  videoBitrate: number;
  quality?: ExportQuality;
  normalizeLoudness: boolean;
  /** Loudness target (LUFS) and how it is reached; default −14, measured first then applied. */
  loudness?: { target: number; mode: "two-pass" | "one-pass" };
  encoder: Encoder;
  /** Moments someone speaks (from the transcript), for lowering the music; default: the voice clips. */
  speech?: [number, number][];
  /** Caption cues: the main process writes them as .srt and .vtt next to the video. */
  captionCues?: TextCue[];
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
  /** Captions translated by the AI, written as <aula>.<lang>.srt and .vtt beside the video. */
  translations?: { lang: string; cues: TextCue[] }[];
  /** Writes <aula>.plataforma.json beside the video (shared/platformPackage.ts). */
  platform?: PlatformInput;
  /** Timeline second of the thumbnail (default: 30% of the lesson). */
  thumbnailAt?: number;
  /** Only this stretch of the lesson (timeline seconds); the files start at its beginning. */
  range?: { from: number; to: number };
  /** Also the voice and the music as WAV files, picked one by one (dialog:stems). */
  stems?: { voice: string; music: string };
  /** Annotations drawn word by word or stroke by stroke, by clip id (shared/reveal.ts). */
  reveals?: Record<string, RevealSprite>;
}

/** The transparent video of an animated annotation, drawn in the renderer, one per clip. */
export interface RevealSprite {
  sprite: string;
  fps: number;
  width: number;
  height: number;
  /** Seconds into the clip when it is all there: from then on the export shows its picture. */
  until?: number;
}

export interface CursorSprite {
  /** Transparent video of the pointer sprite, one frame per source frame at `fps`. */
  sprite: string;
  size: number;
  fps: number;
  /** Top-left of the sprite in source video pixels, [x0, y0, x1, y1, …] per frame. A typed array
   *  crosses IPC as a single value, so recordings of any length fit the limit. */
  positions: Int32Array;
  /**
   * The magnifier (shared/cursor.ts): the square of `side` source pixels around the pointer,
   * enlarged into a circle of `radius`, during the source stretches `on`. Its ring is in the
   * sprite.
   */
  magnifier?: { radius: number; side: number; on: [number, number][] };
  /**
   * The spotlight: a picture of the darkened screen with the lit circle in its middle, drawn at
   * half of twice the recording's size, moved with the pointer during the source stretches `on`.
   */
  spotlight?: { picture: string; width: number; height: number; on: [number, number][] };
  /** The click sound on the recording's own clock (FLAC), mixed like the recording's sound. */
  clicks?: string;
}

/** Where an export is: getting media ready, rendering segments, mixing the sound, putting it together. */
export type ExportPhase = "preparing" | "segments" | "audio" | "assembling";

export interface JobProgress {
  id: string;
  ratio: number;
  message?: string;
  phase?: ExportPhase;
  /** Segments finished, of them reused from the cache, and in all. */
  segments?: { done: number; cached: number; total: number };
}

export interface AppInfo {
  encoder: Encoder;
  version: string;
  projectsDir: string;
  /** Bundled fonts (resources/fonts) for annotations and burned captions. */
  fontsDir: string;
  fonts: FontFamily[];
}

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
  /** Why the model is not the one picked, or a newer one exists (shared/aiModels.ts). */
  modelNotice?: string;
  /** Reasoning effort sent with every turn (API key and Claude Code). */
  effort: Effort;
  mcpEnabled: boolean;
  mcpPort: number;
  mcpUrl: string;
  mcpRunning: boolean;
  mcpError?: string;
  /** Whether the installed Codex stayed inside the editor's tools in the self-check. */
  codexRestricted?: { version: string; ok: boolean };
  /** The person chose to use this Codex version even without the guarantee. */
  codexConfirmed: boolean;
}

/** A token given to an AI app, as listed in the settings (never the token itself). */
export interface AiGrantView {
  id: string;
  client: string;
  scopes: ("read" | "propose" | "write")[];
  createdAt: number;
  expiresAt?: number;
  lastUsedAt?: number;
  temporary: boolean;
}

/** A write asked by an AI app that may only read and propose. */
export interface AiApprovalRequest {
  id: string;
  client: string;
  tool: string;
  title: string;
  summary: string;
  /** Every argument of the call, as sent (shown with scrolling). */
  details: string;
  /** Milliseconds since the epoch when the request is denied without an answer. */
  expiresAt: number;
}

export type AiApprovalChoice = "once" | "project" | "deny";

export type AiClientId = "claude-code" | "codex";

export interface AiClientStatus {
  id: AiClientId;
  name: string;
  installed: boolean;
  version?: string;
  connected: boolean;
}

/** A picture a tool hands the AI (get_frame): base64, at most MAX_IMAGE_SIDE on its long side. */
export interface ToolImage {
  mime: "image/png" | "image/jpeg";
  data: string;
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
  | { type: "quota"; level: "ok" | "warn" | "blocked"; text: string }
  /** How a tool of the editor is going (its step and, when known, how far). */
  | { type: "progress"; name: string; step: string; ratio?: number }
  /** What the turn used: US$ from the API prices, estimated by Claude Code, unknown for Codex. */
  | { type: "usage"; tokens: number; usd?: number; estimated?: boolean };

export interface AiToolCall {
  id: string;
  name: string;
  input: unknown;
  source: "mcp" | "assistant";
  /** The project the call is for: a call reaching another open project is refused. */
  projectId?: string;
  /** Grant of the AI app connected from outside (its undo only takes back its own edits). */
  client?: string;
}

export interface EdiAulaApi {
  /** One frame of a media file, cut and scaled for the AI (get_frame), as PNG bytes. */
  frameImage(
    jobId: string,
    path: string,
    seconds: number,
    geometry: FrameGeometry,
  ): Promise<Uint8Array<ArrayBuffer>>;
  /** One frame of the lesson composed as the export composes it, as PNG bytes. */
  composeFrame(
    jobId: string,
    projectJson: string,
    spec: ExportSpec,
    time: number,
    geometry: FrameGeometry,
  ): Promise<Uint8Array<ArrayBuffer>>;
  /** One answer of the AI engine set up, with no tools (translation, quiz); job:cancel stops it. */
  aiOneShot(jobId: string, prompt: string): Promise<string>;
  /** The assistant's conversation of a lesson, kept between sessions. */
  assistantLoadChat(conversationId: string): Promise<SavedChat | null>;
  assistantSaveChat(conversationId: string, chat: SavedChat): Promise<void>;
  /** What the person decided in the course's lessons (shared/learning.ts). */
  getLearning(course: string): Promise<Learning>;
  recordLearning(course: string, events: LearningEvent[]): Promise<void>;
  /** A folder for several exports; writing inside it is allowed from then on. */
  pickFolder(title: string): Promise<string | null>;
  saveEditingTemplate(name: string, content: string): Promise<string | null>;
  readEditingTemplate(): Promise<{ path: string; content: string } | null>;
  /** The course's template (userData/cursos/<curso>/modelo.json), or null. */
  getCourseTemplate(course: string): Promise<CourseTemplate | null>;
  /** Keeps the course's template for its next lessons; returns where it was saved. */
  saveCourseTemplate(course: string, template: CourseTemplate): Promise<string>;
  /**
   * The lesson's mixed sound measured as the export mixes it (LUFS and true peak), the project as
   * JSON text; `speech` is when someone speaks, for the music to step aside (as in the export).
   */
  measureLoudness(
    jobId: string,
    projectJson: string,
    speech?: [number, number][],
  ): Promise<Loudness | null>;
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
  /** Where a screen recording stands still: the path of its motion file (main/ffmpeg.ts). */
  motion(jobId: string, path: string, input: string, duration: number): Promise<string>;
  /** Moments a screen recording changes a lot (seconds of the video), for proposed zooms. */
  scenes(jobId: string, path: string, input: string, duration: number): Promise<number[]>;
  /** Working copy for the preview: H.264, or VP9 keeping the transparency of `alpha` media. */
  proxy(
    jobId: string,
    path: string,
    duration: number,
    cfrFps?: number,
    alpha?: boolean,
  ): Promise<string>;
  /** Pointer sprite videos for the export, drawn in the renderer and encoded in the main process. */
  /** The video of a drawing made on the screen during a take (main/drawingVideo.ts). */
  drawingVideo: {
    cached(id: string): Promise<{ path: string; size: number } | null>;
    /** Resolves once a slot of the background work is free. `fps` is a whole number. */
    begin(jobId: string, id: string, width: number, height: number, fps: number): Promise<void>;
    /** Which of these pictures (SHA-256 of what they show) are not made yet. */
    missing(jobId: string, keys: string[]): Promise<string[]>;
    /** One picture as a PNG of the video's size. */
    frame(jobId: string, key: string, png: Uint8Array): Promise<void>;
    /** The video: [picture, first frame] in order from frame 0, `total` frames in all. */
    end(
      jobId: string,
      frames: [string, number][],
      total: number,
    ): Promise<{ path: string; size: number }>;
    cancel(jobId: string): Promise<void>;
  };
  cursorSprite: {
    cached(path: string, id: string): Promise<string | null>;
    /** `height` for a sprite that is not square (an animated annotation). */
    begin(
      jobId: string,
      path: string,
      id: string,
      size: number,
      fps: number,
      height?: number,
    ): Promise<void>;
    frames(jobId: string, frames: Uint8Array, counts: number[]): Promise<void>;
    end(jobId: string): Promise<string>;
    cancel(jobId: string): Promise<void>;
    /**
     * The click sound of a recording on its own clock (shared/clickSound.ts), cached as FLAC
     * beside its sprite: a click at each of `times` (source seconds) at `volume`.
     */
    clicks(
      path: string,
      id: string,
      times: Float64Array,
      volume: number,
      duration: number,
    ): Promise<string>;
  };
  /**
   * "Remover fundo com IA local" (main/personKey.ts): the model, then the small frames of a
   * media handed out in batches, their masks taken back in order, and the finished video.
   */
  personKey: {
    model(): Promise<Uint8Array>;
    begin(
      jobId: string,
      media: { path: string; width: number; height: number; fps: number; duration: number },
    ): Promise<{ cached: string } | { width: number; height: number; total: number }>;
    frames(jobId: string): Promise<{ count: number; data: Uint8Array }>;
    masks(jobId: string, masks: Uint8Array): Promise<void>;
    end(jobId: string): Promise<string>;
    cancel(jobId: string): Promise<void>;
  };
  recorder: {
    /** Screen plans: the position under the pointer, with the lesson window's element if any. */
    guidedPick(): Promise<import("./guidedRecording.ts").GuidedTarget>;
    /** Runs a screen plan over the take being recorded. */
    guidedStart(plan: GuidedPlanV2): Promise<{ origin: number; lead: number }>;
    guidedCancel(): Promise<void>;
    reset(): Promise<void>;
    guidedBrowser(url: string): Promise<void>;
    pickNarration(): Promise<string | null>;
    open(ctx: RecorderContext): Promise<void>;
    context(): Promise<RecorderContext>;
    /** The main process's clock (QPC ms). */
    clock(): Promise<number>;
    /** "Tela sobre a narração": the voice heard at timeline second `at` at QPC `when`. */
    overAnchor(at: number, when: number): Promise<void>;
    /** "Trecho acelerado": the voice held at `at` (start), or going on from `at` (end). */
    lapse(edge: "start" | "end", at: number): Promise<void>;
    /**
     * "Tela sobre a narração": the lesson's voice as one file, starting at timeline `start`, from a
     * little before `from` (default: where the editor opened it from).
     */
    narration(from?: number): Promise<{ path: string; start: number }>;
    /** "Só voz": the line the voice just finished, and the QPC moment its last word ended. */
    onFollow(cb: (done: { line: number; at: number }) => void): () => void;
    onFollowState(cb: (s: { state: string; message: string }) => void): () => void;
    /** The plans as edited (sent a second after the last change): a draft, then the project. */
    guidedSave(store: GuidedStore, projectId: string | null): Promise<void>;
    /** A take of a recorder opened without a lesson went into this one: its plans come along. */
    guidedAdopt(projectId: string): Promise<GuidedStore | null>;
    /**
     * Marks an element in the lesson window: the teacher goes to it, presses the target key to
     * turn the inspector on and clicks it. null when it was called off.
     */
    guidedMark(purpose: GuidedMarkPurpose, viewport: GuidedViewport): Promise<GuidedMark | null>;
    /** A take of a lesson window plan from step `from`; progress comes by onGuidedStatus. */
    guidedWebStart(plan: GuidedPlanV2, from: number): Promise<void>;
    guidedWebPause(): Promise<void>;
    guidedWebResume(): Promise<void>;
    /** Ends the take and hands it to the editor; the run says where it stopped. */
    guidedWebStop(): Promise<{ result: RecordingResult; run: GuidedRunRecord }>;
    /** Throws the take away (Recycle Bin). */
    guidedWebDiscard(): Promise<void>;
    /** Runs the whole plan without recording and lists the steps that failed. */
    guidedVerify(plan: GuidedPlanV2): Promise<BrokenStep[]>;
    guidedVerifyCancel(): Promise<void>;
    onGuidedStatus(cb: (status: GuidedTakeStatus) => void): () => void;
    /** Editor window: the recorder saved the plans of a project. */
    onGuided(cb: (update: { projectId: string; store: GuidedStore }) => void): () => void;
    /** Recorder window: it was opened again for another lesson or media; read the context again. */
    onContextChanged(cb: () => void): () => void;
    /** Whether the recorder window is open now. */
    isOpen(): Promise<boolean>;
    /** Editor window: the voice's text again, for an open "Tela sobre a narração". */
    refreshOver(text: import("./recording.ts").OverText): Promise<void>;
    /** Recorder window: the voice's text changed (its transcript got ready). */
    onOverText(cb: (text: import("./recording.ts").OverText) => void): () => void;
    sources(): Promise<CaptureSources & { current: number | null }>;
    /**
     * The recorder on that monitor; with `split` (and another monitor) the controls go to another
     * one and a frame shows the region over this one. Says whether it is split.
     */
    moveTo(index: number, split?: boolean): Promise<{ split: boolean }>;
    /** Controls: what the frame over the recorded screen shows. */
    frameState(state: import("./recording.ts").FrameState): Promise<void>;
    /** Frame: what to show when it loads (null until the controls say). */
    frameInit(): Promise<import("./recording.ts").FrameState | null>;
    /** Frame: something done on it, for the controls. */
    frameEvent(event: import("./recording.ts").FrameEvent): Promise<void>;
    onFrameState(cb: (state: import("./recording.ts").FrameState) => void): () => void;
    onFrameEvent(cb: (event: import("./recording.ts").FrameEvent) => void): () => void;
    /**
     * Editor: a part of "Tela sobre a narração" went into the lesson (or did not), for the recorder
     * that waits for it before moving on to the next part.
     */
    partResult(dir: string, ok: boolean, message?: string): Promise<void>;
    /** Recorder window: the editor's answer about a part it handed over. */
    onPartResult(cb: (result: { dir: string; ok: boolean; message?: string }) => void): () => void;
    /** Tests the encoders on this monitor at this rate once (seconds) and names the one that
     *  will record. */
    encoder(monitor: number, fps: 30 | 60): Promise<string>;
    prepare(
      opts: Omit<RecordOptions, "region"> & {
        regionDip?: { x: number; y: number; width: number; height: number };
      },
    ): Promise<void>;
    /** `systemFallback`: the native capture of the computer's sound did not open. */
    start(): Promise<{ systemFallback: boolean }>;
    /**
     * How the computer's sound is recorded here: "native" leaves out every sound of the app
     * (Windows 10 2004 or newer); "chromium" sends it from this window with systemChunk.
     */
    systemAudioRoute(): Promise<SystemAudioRoute>;
    /** A chunk of the computer's sound; the first one says when it started, the last when it ended. */
    systemChunk(bytes: Uint8Array, startedAt?: number, endedAt?: number): Promise<void>;
    pause(): Promise<void>;
    /** The take ends here (F10); then the computer's sound is finished and stop() saves. */
    halt(): Promise<void>;
    /** Goes on after a pause, reopening what stopped. */
    resume(): Promise<void>;
    mark(kind: MarkerKind): Promise<void>;
    elapsed(): Promise<number>;
    /** false = clicks go through to the apps underneath. */
    interactive(on: boolean): Promise<void>;
    /** The recorder's own controls, window pixels: the pointer over them is not part of the video. */
    uiRects(rects: { x: number; y: number; width: number; height: number }[]): Promise<void>;
    /** `at`: the QPC moment the line before ended, when the voice following moved it. */
    teleprompterLine(index: number, at?: number): Promise<void>;
    /** Level meter of a microphone while setting up (null stops it); readings come by onLevel. */
    monitorMic(device: string | null): Promise<void>;
    /** The camera's modes and the automatic choice at `fps` (default: the saved rate). */
    cameraModes(
      device: string,
      fps?: 30 | 60,
    ): Promise<{ modes: CameraMode[]; choice: CameraChoice | null }>;
    /** Windows "Janela…" offers (physical pixels of the virtual desktop), without the app's own. */
    windows(): Promise<CaptureWindow[]>;
    /** The window the region was fitted to; the take follows it and, with `front`, keeps it in front. */
    followWindow(hwnd: string | null, front: boolean): Promise<void>;
    /**
     * A stroke drawn on the screen during the take: when it started (QPC ms), its color,
     * thickness (pixels of a 1080-pixel frame) and points [x, y, ms after `at`] back to back.
     */
    drawStroke(stroke: {
      at: number;
      color: string;
      width: number;
      points: Float32Array;
      tool?: DrawingTool;
    }): Promise<void>;
    /** "Apagar tudo" at QPC `at`. */
    drawClear(at: number): Promise<void>;
    /** A board put over the region (`on`) or taken away, at QPC `at`. */
    drawBoard(on: boolean, kind: BoardKind, at: number): Promise<void>;
    /** "Página nova" of the board at QPC `at`. */
    drawPage(at: number): Promise<void>;
    /** Ctrl+Z while drawing, at QPC `at`. */
    drawUndo(at: number): Promise<void>;
    /** The drawing mode turned on or off (clicks while it is on are the pen). */
    drawMode(on: boolean): Promise<void>;
    settings(): Promise<RecorderSettings>;
    saveSettings(settings: RecorderSettings): Promise<RecorderSettings>;
    hotkeys(): Promise<HotkeyReport[]>;
    status(): Promise<RecorderStatus>;
    /** Closes the recorder; `next` is what the editor shows then. */
    cancel(next?: import("./recording.ts").RecorderNext): Promise<void>;
    /** "Recado": a note for whoever edits the lesson, at `at` (recorder.clock() when opened). */
    note(at: number, text: string): Promise<void>;
    /** The controls take the keyboard (to type a note) or hand it back to the recorded program. */
    keyboard(on: boolean): Promise<void>;
    /** Editor window: the recorder closed and asked for this to be shown. */
    onClosed(cb: (next: import("./recording.ts").RecorderNext) => void): () => void;
    /** Throws the take away (Recycle Bin) and stays in the recorder. */
    discard(): Promise<void>;
    /**
     * Ends the take and hands it to the editor. With `keepOpen` the recorder stays on screen for
     * the next take ("Tela sobre a narração" recorded in parts); otherwise it closes.
     */
    stop(keepOpen?: boolean): Promise<RecordingResult>;
    /** Takes the app did not finish, and what to do with them. */
    orphans(): Promise<OrphanTake[]>;
    recoverOrphan(dir: string): Promise<RecordingResult>;
    discardOrphan(dir: string): Promise<void>;
    /** The take is in a project now: it is not offered again. */
    imported(dir: string): Promise<void>;
    /** Automated checks only: saves a picture of the recorder window. */
    debugCapture(path: string): Promise<void>;
    onHotkey(cb: (name: string) => void): () => void;
    onDone(cb: (r: RecordingResult) => void): () => void;
    /** Recorder window: the take's status, events, health and shortcuts. */
    onStatus(cb: (s: RecorderStatus) => void): () => void;
    onEvent(cb: (e: RecorderEvent) => void): () => void;
    onHealth(cb: (h: RecorderHealth) => void): () => void;
    onLevel(cb: (l: MicLevel) => void): () => void;
    onHotkeys(cb: (r: HotkeyReport[]) => void): () => void;
    /** Editor window: a take started or ended (the export queue waits during it). */
    onState(cb: (s: RecorderStatus) => void): () => void;
    /** Editor window: a take did not finish, or the recorder window went down. */
    onAlert(cb: (a: { message: string; dir?: string; orphans?: boolean }) => void): () => void;
  };
  /** Treats the voice of a media (shared/voiceChain.ts); cached by source and chain. */
  treatVoice(
    jobId: string,
    path: string,
    preset: Exclude<VoicePreset, "off">,
  ): Promise<{
    path: string;
    preset: VoicePreset;
    version: number;
    noise: string;
    normalization?: string;
    cached: boolean;
  }>;
  /** The voice segments of [start, end] as one WAV in the cache. */
  renderVoice(jobId: string, segments: VoiceSegment[], start: number, end: number): Promise<string>;
  /** Writes the voice pieces in "Voz exportada" beside the project; returns the voice master. */
  exportVoicePieces(
    jobId: string,
    projectPath: string,
    projectJson: string,
    scope: VoiceMaster["scope"],
    pieces: { label: string; start: number; end: number }[],
  ): Promise<VoiceMaster>;
  pickPresenterVideos(): Promise<string[]>;
  /** "Importar voz": audio files of a voice made elsewhere, readable once picked. */
  pickVoiceFiles(): Promise<string[]>;
  /** The exported voice files a presenter video may come from, best first, and its length. */
  locatePresenter(
    jobId: string,
    video: string,
    masters: string[],
  ): Promise<{ ranked: PieceMatch[]; duration: number }>;
  /** Saves a picture made in the editor (annotation) in the cache; returns its path. */
  saveGenerated(bytes: Uint8Array, ext: string): Promise<string>;
  saveNarration(bytes: Uint8Array): Promise<string>;
  /** PNG of one frame (cached), used to hold the picture while an insert plays. */
  stillFrame(path: string, t: number, alpha?: boolean): Promise<string>;
  /**
   * `seconds` of sound from `t`: mono 16-bit PCM at 24 kHz (main/ffmpeg.ts SNIPPET_RATE).
   * `ticket` numbers the grain asking: reads only older grains wait for are stopped, and give null.
   */
  audioSnippet(
    path: string,
    t: number,
    seconds: number,
    ticket?: number,
  ): Promise<Uint8Array | null>;
  /** The filmstrip of a video, decoding `input` (its proxy or itself); cached beside it. */
  filmstrip(jobId: string, path: string, input: string, duration: number): Promise<Filmstrip>;
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
  /** `fileName`: the file's name when the visible name has characters a file name cannot
   *  ("Gravação 18/10 07:06" is saved as "Gravação 18-10 07-06"). */
  createProject(
    name: string,
    course: string | undefined,
    settings: ProjectSettings,
    fileName?: string,
  ): Promise<{ path: string; project: Project }>;
  /** The project as JSON text (JSON.stringify in the page, so only a string crosses to the
   *  preload and to the main process): a single IPC value however long the lesson is. */
  saveProject(path: string, projectJson: string): Promise<void>;
  openProject(path: string): Promise<Project>;
  recentProjects(): Promise<RecentEntry[]>;
  removeRecent(path: string): Promise<void>;
  /** A copy of the lesson as a lesson of its own, next to it; returns its path. */
  duplicateProject(path: string): Promise<string>;
  /** New name for the lesson and its file; returns the file's path now. */
  renameProject(path: string, name: string): Promise<string>;
  /** The lesson's backups (Projetos/.backups), newest first. */
  projectBackups(path: string): Promise<BackupEntry[]>;
  /** Puts a backup back (the current state becomes a backup first); returns the lesson. */
  restoreBackup(path: string, id: string): Promise<Project>;
  /** The template of a course (how its new lessons start), or null. */
  /** The project as JSON text, like saveProject; the cursor positions stay typed arrays. */
  startExport(jobId: string, projectJson: string, spec: ExportSpec): Promise<void>;
  /** Where to save the current frame (.png); the chosen path becomes writable. */
  pickFramePath(defaultName: string): Promise<string | null>;
  /**
   * The frame at timeline second `t` as a PNG at spec.outPath, drawn by the export's plan as a
   * window of one frame (main/export/frame.ts renderFramePng, the path of export:frame).
   */
  exportFramePng(jobId: string, projectJson: string, t: number, spec: ExportSpec): Promise<string>;
  /**
   * Where the voice and the music go (Exportar › Voz e música separadas): a folder picked by
   * the person, and only the two WAV files named after the video become writable there (a file
   * already there is replaced only when the person says so). null when called off.
   */
  pickStems(videoName: string): Promise<{ voice: string; music: string } | null>;
  /**
   * Packs the lesson and its media into a ZIP picked by the person, or straight into the send
   * folder with `toSendFolder` (when there is one); null when called off.
   */
  packProject(
    jobId: string,
    projectJson: string,
    defaultName: string,
    options?: import("./projectPackage.ts").PackOptions & { toSendFolder?: boolean },
  ): Promise<{ path: string; files: number; bytes: number; droppedVoices: number } | null>;
  /** What a package of the lesson will hold, before it is made. */
  packEstimate(
    projectJson: string,
    options?: import("./projectPackage.ts").PackOptions,
  ): Promise<{
    files: number;
    bytes: number;
    leftOut: { files: number; bytes: number };
    missing: string[];
  }>;
  /** The folder lessons are sent from (null when none is set, or it is gone). */
  sendSettings(): Promise<{ folder: string | null }>;
  /** Picks the folder lessons are sent from and keeps it; null when called off. */
  pickSendFolder(): Promise<string | null>;
  /**
   * Opens a packed lesson picked by the person: checks every entry, asks before extracting,
   * and returns the lesson's file (null when called off, with nothing written).
   */
  openPackage(): Promise<string | null>;
  /** The library shared by every lesson, its media readable (shared/library.ts). */
  listLibrary(): Promise<import("./library.ts").Library>;
  saveLibrary(library: import("./library.ts").Library): Promise<void>;
  cancelJob(jobId: string): Promise<void>;
  /** Removes the reusable export segments; resolves with the bytes freed. */
  clearExportCache(): Promise<number>;
  /** The pending exports kept between sessions (the JSON text of each queue item, or null). */
  exportQueue: {
    load(): Promise<string[] | null>;
    save(items: string[]): Promise<void>;
  };
  showInFolder(path: string): Promise<void>;
  onProgress(cb: (p: JobProgress) => void): () => void;
  pathForFile(file: File): string;
  engineStatus(): Promise<EngineStatus>;
  installEngine(jobId: string, variant: WhisperVariant): Promise<EngineStatus>;
  installModel(jobId: string, name: string): Promise<EngineStatus>;
  selectModel(path: string): Promise<EngineStatus>;
  /** Lists (or stops listing) the models of C:\whisper-cpp, which are not checked. */
  setExternalModels(on: boolean): Promise<EngineStatus>;
  transcribe(
    jobId: string,
    path: string,
    duration: number,
    language: string,
    glossary: string[],
  ): Promise<string>;
  getGlossary(course: string): Promise<GlossaryTerm[]>;
  setGlossary(course: string, terms: GlossaryTerm[]): Promise<void>;
  openRestrictedClaude(): Promise<{ ok: boolean; message: string }>;
  aiSettings(): Promise<AiSettingsView>;
  saveAiSettings(changes: {
    apiKey?: string | null;
    model?: string;
    mcpEnabled?: boolean;
    engine?: AssistantEngine;
    claudeModel?: string;
    effort?: Effort;
    /** Use the installed Codex even if it did not pass the self-check. */
    codexConfirmed?: boolean;
  }): Promise<AiSettingsView>;
  /** Runs the Codex self-check again (asks Codex to read a file; it must not manage to). */
  codexSelfTest(): Promise<AiSettingsView>;
  aiGrants(): Promise<AiGrantView[]>;
  revokeAiGrant(id: string): Promise<void>;
  /** A new token that can read and propose, for configuring a client by hand. */
  createManualAiToken(): Promise<{ token: string; url: string }>;
  onAiApproval(cb: (request: AiApprovalRequest | { id: string; closed: true }) => void): () => void;
  answerAiApproval(id: string, choice: AiApprovalChoice, projectId: string | null): Promise<void>;
  /** What the main process needs to check paths an AI sends: the open project and its media folders. */
  setAiContext(context: { projectPath: string | null; mediaFolders: string[] }): Promise<void>;
  testApiKey(): Promise<{ ok: boolean; message: string }>;
  aiClients(): Promise<AiClientStatus[]>;
  /** Connects a client; `rotate` (Reconectar) replaces a token that still works. */
  connectAiClient(id: AiClientId, rotate?: boolean): Promise<{ ok: boolean; message: string }>;
  assistantSend(conversationId: string, text: string): Promise<void>;
  assistantStop(conversationId: string): Promise<void>;
  assistantReset(conversationId: string): Promise<void>;
  onAssistantEvent(cb: (conversationId: string, e: AssistantEvent) => void): () => void;
  /** Registers the renderer as the executor of AI tool calls (from MCP clients and the assistant). */
  handleAiTools(
    run: (call: AiToolCall) => Promise<{ ok: boolean; text: string; images?: ToolImage[] }>,
  ): () => void;
}
