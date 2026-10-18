import { z } from "zod";
import { CAPTURE_QUALITIES } from "./encoderChoice.ts";
import { DEFAULT_HOTKEYS, HOTKEY_ACTIONS, type HotkeyAction } from "./hotkeys.ts";

/**
 * What the recorder remembers between takes (userData/recorder.json). Every field has a default,
 * and a field that no longer parses falls back to it alone: a bad value never costs the rest.
 */

const rect = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
});

/** The screen is found again by its place on the desktop (Windows may renumber them). */
const monitor = z.object({
  x: z.int(),
  y: z.int(),
  width: z.int().positive(),
  height: z.int().positive(),
});

const cameraMode = z.object({
  codec: z.string().max(32).optional(),
  pixelFormat: z.string().max(32).optional(),
  width: z.int().positive().max(8192),
  height: z.int().positive().max(8192),
  fps: z.number().positive().max(240),
});

const hotkeys = z.object(
  Object.fromEntries(
    HOTKEY_ACTIONS.map((action) => [action, z.string().max(64).catch(DEFAULT_HOTKEYS[action])]),
  ) as Record<HotkeyAction, z.ZodCatch<z.ZodString>>,
);

export const recorderSettingsSchema = z.object({
  monitor: monitor.nullable().catch(null),
  /** "custom" keeps the rectangle drawn last time, in window pixels of that screen. */
  region: z
    .object({ preset: z.enum(["full", "16:9", "custom"]), rect: rect.optional() })
    .catch({ preset: "full" }),
  microphone: z.string().max(512).nullable().catch(null),
  camera: z.string().max(512).nullable().catch(null),
  /** null: chosen automatically for the camera (shared/camera.ts chooseCameraMode). */
  cameraMode: cameraMode.nullable().catch(null),
  /** The presenter's camera of "Voz e câmera", kept apart from the camera of the screen modes. */
  presenterCamera: z.string().max(512).nullable().catch(null),
  presenterCameraMode: cameraMode.nullable().catch(null),
  /** Milliseconds the webcam's picture runs behind; moves the camera earlier on import. */
  cameraLatency: z.int().min(0).max(1000).catch(100),
  systemAudio: z.boolean().catch(false),
  keys: z.boolean().catch(false),
  fps: z.union([z.literal(30), z.literal(60)]).catch(30),
  quality: z.enum(CAPTURE_QUALITIES).catch("standard"),
  hotkeys: hotkeys.catch({ ...DEFAULT_HOTKEYS }),
  /** Page Down and Page Up of a presentation clicker move the teleprompter. */
  clicker: z.boolean().catch(false),
  teleprompter: z
    .object({
      on: z.boolean().catch(true),
      size: z.int().min(14).max(40).catch(22),
      wordsPerMinute: z.int().min(60).max(260).catch(137),
    })
    .catch({ on: true, size: 22, wordsPerMinute: 137 }),
  /** Seconds of countdown before the take starts. */
  countdown: z.int().min(0).max(10).catch(3),
  /** Proxies, background removal, transcription and the next export wait while recording. */
  pauseBackground: z.boolean().catch(true),
  /** The kind of take the recorder opens in ("Tela sobre a narração" comes from the editor). */
  recordMode: z.enum(["screen", "voice", "voicecam"]).catch("screen"),
  /** "Só voz": the teleprompter follows the voice when the transcription engine is installed. */
  follow: z.boolean().catch(true),
});

export type RecorderSettings = z.infer<typeof recorderSettingsSchema>;

/** Any stored value (or nothing at all) as complete settings. */
export function parseRecorderSettings(value: unknown): RecorderSettings {
  return recorderSettingsSchema.parse(value && typeof value === "object" ? value : {});
}

export const DEFAULT_RECORDER_SETTINGS: RecorderSettings = parseRecorderSettings({});
