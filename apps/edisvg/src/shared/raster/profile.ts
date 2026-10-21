import type { Animation } from "@informach/edi-motion";
import { z } from "zod";
import { requiresInteractiveExport } from "../interactiveCapabilities";
import type { Project } from "../project";

export const RASTER_FORMATS = ["png-sequence", "gif", "mp4", "webm"] as const;
export type RasterFormat = (typeof RASTER_FORMATS)[number];
export const RASTER_LIMITS = {
  minSide: 16,
  maxSide: 3840,
  gifMaxSide: 1920,
  maxFps: 60,
  gifMaxFps: 50,
  maxFrames: 3600,
  /** Rendered pixels across all frames: bounds memory and wall time, not file size. */
  maxPixels: { "png-sequence": 1.5e9, gif: 6e8, mp4: 4e9, webm: 4e9 },
  maxBytes: 256 * 1024 ** 2,
} as const;
const color = z.string().regex(/^#[0-9a-f]{6}$/i, "Use uma cor hexadecimal #rrggbb.");
export const rasterOptionsSchema = z.strictObject({
  format: z.enum(RASTER_FORMATS),
  artboardId: z.string().min(1).max(120),
  animationId: z.string().min(1).max(120),
  width: z.number().int().min(RASTER_LIMITS.minSide).max(RASTER_LIMITS.maxSide),
  height: z.number().int().min(RASTER_LIMITS.minSide).max(RASTER_LIMITS.maxSide),
  fps: z.number().int().min(1).max(RASTER_LIMITS.maxFps),
  background: z.union([z.literal("transparent"), color]),
  quality: z.enum(["standard", "high"]).default("standard"),
  confirmRaster: z.boolean().default(false),
  confirmAnimationOnly: z.boolean().default(false),
  confirmPalette: z.boolean().default(false),
});
export type RasterOptions = z.output<typeof rasterOptionsSchema>;
export type RasterOptionsInput = z.input<typeof rasterOptionsSchema>;

export interface RasterIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}
export interface RasterFramePlan {
  /** Seconds on the clip clock, sampled from the shared `frameAtSeconds` semantics. */
  times: number[];
  /** Microseconds; consecutive timestamps never drift from `k / fps`. */
  timestamps: number[];
  durations: number[];
  /** GIF centiseconds, rounded on the cumulative clock so the total stays exact. */
  delays: number[];
  durationSeconds: number;
  loop: boolean;
}
export interface RasterReport {
  supported: boolean;
  format: RasterFormat;
  frames: number;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  loop: boolean;
  requiresAnimationOnlyConsent: boolean;
  requiresPaletteConsent: boolean;
  issues: RasterIssue[];
}

/** Samples a clip at the output rate. A loop omits its end (it equals frame 0); once keeps
 * the final pose as the last frame; ping-pong covers the whole forward/backward period. */
export function planRasterFrames(
  clip: Pick<Animation, "fps" | "frames" | "mode">,
  fps: number,
): RasterFramePlan {
  if (!Number.isInteger(fps) || fps < 1 || fps > RASTER_LIMITS.maxFps)
    throw new Error("FPS de saída inválido.");
  const duration = clip.frames / clip.fps,
    period = clip.mode === "ping-pong" ? 2 * duration : duration,
    span = Math.round(period * fps),
    count = clip.mode === "once" ? span + 1 : Math.max(1, span);
  if (count > RASTER_LIMITS.maxFrames)
    throw new Error(
      `A exportação teria ${count} quadros; o limite é ${RASTER_LIMITS.maxFrames}. Reduza o FPS ou a duração.`,
    );
  const times: number[] = [],
    timestamps: number[] = [],
    durations: number[] = [],
    delays: number[] = [];
  for (let frame = 0; frame < count; frame++) {
    times.push(clip.mode === "once" ? Math.min(frame / fps, duration) : frame / fps);
    const start = Math.round((frame * 1e6) / fps),
      end = Math.round(((frame + 1) * 1e6) / fps);
    timestamps.push(start);
    durations.push(end - start);
    delays.push(Math.round((100 * (frame + 1)) / fps) - Math.round((100 * frame) / fps));
  }
  // The output rate need not divide the duration: once always ends on the final pose.
  if (clip.mode === "once") times[count - 1] = duration;
  return {
    times,
    timestamps,
    durations,
    delays,
    durationSeconds: count / fps,
    loop: clip.mode !== "once",
  };
}

/** Pixel size that keeps the artboard proportion for a requested width. */
export function rasterHeightFor(viewBox: readonly number[], width: number, even: boolean) {
  const [, , boxWidth = 0, boxHeight = 0] = viewBox;
  if (!(boxWidth > 0 && boxHeight > 0)) throw new Error("Prancheta sem dimensões válidas.");
  const height = Math.max(RASTER_LIMITS.minSide, Math.round((width * boxHeight) / boxWidth));
  return even ? height + (height % 2) : height;
}

/** The single gate for every raster format: UI, encoder and tests read the same report. */
export function inspectRasterExport(project: Project, input: RasterOptionsInput): RasterReport {
  const options = rasterOptionsSchema.parse(input),
    issues: RasterIssue[] = [],
    error = (code: string, message: string) => issues.push({ severity: "error", code, message }),
    board = project.artboards.find((value) => value.id === options.artboardId),
    clip = project.motion.animations.find((value) => value.id === options.animationId),
    video = options.format === "mp4" || options.format === "webm";
  if (!board) error("artboard", "Prancheta indisponível.");
  if (!clip) error("animation", "Selecione uma animação por objeto existente.");
  if (video && options.background === "transparent")
    error(
      "opaque-video",
      "Vídeo MP4/WebM não preserva transparência neste perfil; escolha uma cor de fundo ou exporte PNG/GIF.",
    );
  if (video && (options.width % 2 || options.height % 2))
    error("even-size", "Vídeo requer largura e altura pares (amostragem de cor 4:2:0).");
  if (
    options.format === "gif" &&
    Math.max(options.width, options.height) > RASTER_LIMITS.gifMaxSide
  )
    error("gif-size", `GIF aceita até ${RASTER_LIMITS.gifMaxSide} px por lado neste perfil.`);
  if (options.format === "gif" && options.fps > RASTER_LIMITS.gifMaxFps)
    error(
      "gif-fps",
      `GIF mede o tempo em centésimos e navegadores atrasam quadros curtos; use até ${RASTER_LIMITS.gifMaxFps} FPS.`,
    );
  let plan: RasterFramePlan | undefined;
  if (clip)
    try {
      plan = planRasterFrames(clip, options.fps);
    } catch (cause) {
      error("frames", cause instanceof Error ? cause.message : "Plano de quadros inválido.");
    }
  const frames = plan?.times.length ?? 0;
  if (frames * options.width * options.height > RASTER_LIMITS.maxPixels[options.format])
    error(
      "budget",
      "A exportação excede o orçamento de pixels deste formato. Reduza o tamanho, o FPS ou a duração.",
    );
  const requiresAnimationOnlyConsent = !!board && requiresInteractiveExport(project, board.id);
  if (!options.confirmRaster)
    error(
      "consent-raster",
      "Confirme a conversão em imagens: vetores, texto selecionável, semântica, áudio e interação não são preservados.",
    );
  if (requiresAnimationOnlyConsent && !options.confirmAnimationOnly)
    error(
      "consent-animation",
      "Confirme exportar somente a timeline: lógica, dados, eventos, áudio e layout responsivo ficam de fora.",
    );
  if (options.format === "gif" && !options.confirmPalette)
    error(
      "consent-palette",
      "Confirme a paleta do GIF: até 256 cores por quadro e transparência apenas total ou nenhuma.",
    );
  if (clip && plan && clip.fps !== options.fps)
    issues.push({
      severity: "warning",
      code: "resample",
      message: `A animação tem ${clip.fps} FPS e será amostrada a ${options.fps} FPS pelo mesmo avaliador.`,
    });
  if (plan?.loop && video)
    issues.push({
      severity: "warning",
      code: "video-loop",
      message:
        "O vídeo contém um ciclo; repetir depende do player que o reproduzir (atributo loop na web).",
    });
  return {
    supported: !issues.some((issue) => issue.severity === "error"),
    format: options.format,
    frames,
    width: options.width,
    height: options.height,
    fps: options.fps,
    durationSeconds: plan?.durationSeconds ?? 0,
    loop: plan?.loop ?? false,
    requiresAnimationOnlyConsent,
    requiresPaletteConsent: options.format === "gif",
    issues,
  };
}

/** Throws the first blocking issue; the encoders never run on an unsupported report. */
export function assertRasterExport(project: Project, input: RasterOptionsInput) {
  const report = inspectRasterExport(project, input),
    blocking = report.issues.find((issue) => issue.severity === "error");
  if (blocking) throw new Error(blocking.message);
  return report;
}

/** Timeline-only copy: machines would replace the selected clip, so they are removed from the
 * exported artboard. Inputs, bindings and data keep their initial values; components keep
 * their own sessions, exactly like the interactive player starts them. */
export function timelineProject(project: Project, artboardId: string): Project {
  const copy = structuredClone(project),
    board = copy.artboards.find((value) => value.id === artboardId);
  if (!board) throw new Error("Prancheta indisponível.");
  if (board.behavior?.machines.length) {
    board.behavior.machines = [];
    board.behavior.defaultMachineId = null;
  }
  return copy;
}
