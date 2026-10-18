import type { Finding } from "./preflight.ts";
import type { Encoder, ExportQuality, ExportSpec, ProjectSettings } from "./types.ts";

/**
 * The export presets of the Exportar dialog and of the AI's export_video, and what an export
 * asked by the AI has to go through: the person's permission to change the lesson (the tool is a
 * write), a check before exporting without problems or the person's confirmation, and a
 * destination the person picks in a dialog, never one the AI names.
 */

export const EXPORT_PRESETS = [
  { id: "youtube", name: "YouTube", desc: "1080p · alta qualidade", height: 1080, bitrate: 12000 },
  {
    id: "hotmart",
    name: "Hotmart / área de membros",
    desc: "1080p · arquivo menor",
    height: 1080,
    bitrate: 8000,
  },
  {
    id: "draft",
    name: "Rascunho para revisão",
    desc: "720p · rápido e leve",
    height: 720,
    bitrate: 3500,
  },
  {
    id: "reels",
    name: "Reels / Shorts 9:16",
    desc: "1080 × 1920 · vertical",
    height: 1080,
    bitrate: 10000,
  },
  { id: "audio", name: "Só áudio (podcast)", desc: "MP3 · 192 kbps", height: 1080, bitrate: 0 },
] as const;
export type ExportPresetId = (typeof EXPORT_PRESETS)[number]["id"];
export const EXPORT_PRESET_IDS = EXPORT_PRESETS.map((p) => p.id) as [
  ExportPresetId,
  ...ExportPresetId[],
];

/** Constant quality for the resolution (CRF or CQ), never above the bitrate shown. */
export const EXPORT_QUALITY: [string, number, ExportQuality][] = [
  ["Rascunho", 3500, "draft"],
  ["Padrão", 8000, "standard"],
  ["Alta", 12000, "high"],
  ["Máxima", 20000, "max"],
];
export const qualityOf = (kbps: number): ExportQuality | undefined =>
  EXPORT_QUALITY.find(([, k]) => k === kbps)?.[2];

/** What else goes out beside the video. */
export const EXPORT_FORMATS = ["captions", "thumbnail", "translations", "platform"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const even = (v: number): number => Math.round(v / 2) * 2;

/**
 * The export of a preset for a lesson of `settings`: the frame (the short side is the preset's
 * height, never above the lesson's), bitrate and quality; Reels of a wide lesson are 1080 × 1920
 * with the lesson over a blurred copy of itself. Without the destination, which the person picks.
 */
export function presetSpec(
  preset: ExportPresetId,
  settings: Pick<ProjectSettings, "width" | "height" | "fps">,
  opts: { encoder: Encoder; normalize?: boolean; thumbnail?: boolean },
): Omit<ExportSpec, "outPath"> {
  const p = EXPORT_PRESETS.find((x) => x.id === preset) ?? EXPORT_PRESETS[0];
  const portrait = settings.height > settings.width;
  const short = Math.min(p.height, Math.min(settings.width, settings.height));
  const ratio = settings.width / settings.height;
  const [width, height] = portrait
    ? [even(short), even(short / ratio)]
    : [even(short * ratio), even(short)];
  const common = {
    fps: settings.fps,
    normalizeLoudness: opts.normalize ?? true,
    encoder: opts.encoder,
  };
  if (p.id === "audio") return { ...common, width, height, videoBitrate: 0, audioOnly: true };
  if (p.id === "reels" && !portrait)
    return {
      ...common,
      width: 1080,
      height: 1920,
      videoBitrate: p.bitrate,
      quality: qualityOf(p.bitrate),
      thumbnail: opts.thumbnail ?? true,
      vertical: "blur",
    };
  return {
    ...common,
    width,
    height,
    videoBitrate: p.bitrate,
    quality: qualityOf(p.bitrate),
    thumbnail: opts.thumbnail ?? true,
  };
}

/** The file name offered in the save dialog. */
export function exportName(lesson: string, preset: ExportPresetId, vertical: boolean): string {
  const safe = lesson.replace(/[<>:"/\\|?*]/g, "").trim() || "aula";
  return `${safe}${vertical ? " (vertical)" : ""}.${preset === "audio" ? "mp3" : "mp4"}`;
}

/** What export_video needs from the editor (the renderer gives the real ones, tests fakes). */
export interface ExportVideoSteps {
  /** The check before exporting of the lesson as it is. */
  check(): Promise<readonly Finding[]>;
  /** Asks the person whether to export despite the problems; true to go on. */
  confirm(problems: readonly string[]): Promise<boolean>;
  /** The save dialog: the person picks the destination; null when cancelled. */
  pickPath(defaultName: string): Promise<string | null>;
  /** Puts the export in the queue; returns its id. */
  enqueue(outPath: string): string;
}

export type ExportVideoResult =
  | { ok: true; id: string; outPath: string; confirmed: boolean }
  | { ok: false; reason: "refused" | "cancelled"; text: string };

/**
 * export_video once the call is allowed to change the lesson (callPermission "write", asked to
 * the person for an app that may only read and propose): with problems in the check, the person
 * confirms or the export does not happen; then the person picks where it goes; then it is queued.
 */
export async function runExportVideo(
  steps: ExportVideoSteps,
  defaultName: string,
): Promise<ExportVideoResult> {
  const problems = (await steps.check())
    .filter((f) => f.severity === "error")
    .map((f) => f.message);
  let confirmed = false;
  if (problems.length) {
    confirmed = await steps.confirm(problems);
    if (!confirmed)
      return {
        ok: false,
        reason: "refused",
        text: `A pessoa não quis exportar com ${problems.length === 1 ? "o problema" : `os ${problems.length} problemas`} da verificação: ${problems.join(" ")} Nada foi exportado; corrija com check_before_export.`,
      };
  }
  const outPath = await steps.pickPath(defaultName);
  if (!outPath)
    return {
      ok: false,
      reason: "cancelled",
      text: "A pessoa fechou a janela de escolher o destino. Nada foi exportado.",
    };
  return { ok: true, id: steps.enqueue(outPath), outPath, confirmed };
}
