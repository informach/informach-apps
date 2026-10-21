import { compileInteractiveArtboard } from "../../../shared/interactive";
import type { Project } from "../../../shared/project";
import { createGifEncoder } from "../../../shared/raster/gif";
import { muxMp4, type VideoSample } from "../../../shared/raster/mp4";
import {
  assertRasterExport,
  planRasterFrames,
  RASTER_LIMITS,
  type RasterFormat,
  type RasterFramePlan,
  type RasterOptions,
  type RasterOptionsInput,
  rasterOptionsSchema,
  timelineProject,
} from "../../../shared/raster/profile";
import { packPngSequence } from "../../../shared/raster/sequence";
import { muxWebm } from "../../../shared/raster/webm";
import { createRasterFrameSource, type RasterFrameSource } from "./frameSource";

export const RASTER_OUTPUT: Record<RasterFormat, { extension: string; type: string }> = {
  "png-sequence": { extension: "png.zip", type: "application/zip" },
  gif: { extension: "gif", type: "image/gif" },
  mp4: { extension: "mp4", type: "video/mp4" },
  webm: { extension: "webm", type: "video/webm" },
};
interface Task {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

/** H.264 High profile at the lowest level whose frame size and macroblock rate fit. */
export function avcCodecFor(width: number, height: number, fps: number) {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16),
    rate = macroblocks * fps;
  const levels: [number, number, number][] = [
    [0x1e, 1620, 40500],
    [0x1f, 3600, 108000],
    [0x20, 5120, 216000],
    [0x28, 8192, 245760],
    [0x2a, 8704, 522240],
    [0x32, 22080, 589824],
    [0x33, 36864, 983040],
    [0x34, 36864, 2073600],
  ];
  const level = levels.find(([, frame, perSecond]) => macroblocks <= frame && rate <= perSecond);
  if (!level) throw new Error("Tamanho e FPS excedem os níveis H.264 suportados.");
  return `avc1.6400${level[0].toString(16).padStart(2, "0")}`;
}
export function videoConfig(options: RasterOptions): VideoEncoderConfig {
  const bitsPerPixel = options.quality === "high" ? 0.16 : 0.08,
    bitrate = Math.round(
      Math.min(80e6, Math.max(4e5, options.width * options.height * options.fps * bitsPerPixel)),
    );
  return {
    codec:
      options.format === "mp4"
        ? avcCodecFor(options.width, options.height, options.fps)
        : options.width * options.height > 2_100_000
          ? "vp09.00.50.08"
          : "vp09.00.40.08",
    width: options.width,
    height: options.height,
    framerate: options.fps,
    bitrate,
    bitrateMode: "variable",
    latencyMode: "quality",
    // Software encoders keep presentation order equal to decode order (no B-frames), which
    // the single-table MP4/WebM writers rely on and verify.
    hardwareAcceleration: "prefer-software",
    ...(options.format === "mp4" ? { avc: { format: "avc" as const } } : {}),
  };
}
/** Whether this computer can encode the selected video profile. */
export async function videoSupport(input: RasterOptionsInput) {
  const options = rasterOptionsSchema.parse(input);
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined")
    return {
      supported: false,
      reason: "Este ambiente não oferece codificação de vídeo (WebCodecs).",
    };
  try {
    const config = videoConfig(options),
      result = await VideoEncoder.isConfigSupported(config);
    return result.supported
      ? { supported: true, reason: "" }
      : {
          supported: false,
          reason: `O codificador ${options.format === "mp4" ? "H.264" : "VP9"} não aceita ${options.width}×${options.height} a ${options.fps} FPS neste computador.`,
        };
  } catch (cause) {
    return {
      supported: false,
      reason: cause instanceof Error ? cause.message : "Codificador de vídeo indisponível.",
    };
  }
}

async function encodeVideo(
  source: RasterFrameSource,
  plan: RasterFramePlan,
  options: RasterOptions,
  task: Task,
) {
  const config = videoConfig(options),
    support = await videoSupport(options);
  if (!support.supported) throw new Error(support.reason);
  const samples: VideoSample[] = [];
  let description: Uint8Array | undefined,
    failure: unknown,
    bytes = 0,
    lastTimestamp = -1,
    wake: (() => void) | undefined;
  // Back-pressure waits end on dequeue, on an encoder error (the encoder closes and stops
  // dequeuing) or on cancellation, so a failed export never hangs.
  const fail = (error: unknown) => {
    failure ??= error;
    wake?.();
  };
  const onAbort = () =>
    fail(task.signal?.reason ?? new DOMException("Operação cancelada.", "AbortError"));
  task.signal?.addEventListener("abort", onAbort, { once: true });
  const encoder = new VideoEncoder({
    output(chunk, metadata) {
      try {
        if (chunk.timestamp < lastTimestamp)
          throw new Error("O codificador reordenou quadros; este perfil exige ordem de exibição.");
        lastTimestamp = chunk.timestamp;
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        bytes += data.length;
        if (bytes > RASTER_LIMITS.maxBytes) throw new Error("Vídeo excede o limite de tamanho.");
        const config = metadata?.decoderConfig?.description;
        if (config && !description)
          description = (
            ArrayBuffer.isView(config)
              ? new Uint8Array(config.buffer, config.byteOffset, config.byteLength)
              : new Uint8Array(config)
          ).slice();
        samples.push({ data, key: chunk.type === "key" });
      } catch (error) {
        fail(error);
      }
    },
    error: fail,
  });
  encoder.addEventListener("dequeue", () => wake?.());
  const keyInterval = Math.max(1, options.fps * 2);
  try {
    encoder.configure(config);
    for (const [index, time] of plan.times.entries()) {
      const context = await source.render(time);
      if (failure) throw failure;
      const frame = new VideoFrame(context.canvas, {
        timestamp: plan.timestamps[index] ?? 0,
        duration: plan.durations[index] ?? 0,
        alpha: "discard",
      });
      try {
        encoder.encode(frame, { keyFrame: index % keyInterval === 0 });
      } finally {
        frame.close();
      }
      while (encoder.encodeQueueSize > 4 && !failure)
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      wake = undefined;
      if (failure) throw failure;
      task.onProgress?.(index + 1, plan.times.length);
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    task.signal?.removeEventListener("abort", onAbort);
    if (encoder.state !== "closed") encoder.close();
  }
  if (samples.length !== plan.times.length)
    throw new Error("O codificador não devolveu todos os quadros.");
  if (options.format === "mp4") {
    if (!description) throw new Error("O codificador H.264 não informou sua configuração.");
    return muxMp4(
      {
        width: options.width,
        height: options.height,
        fps: options.fps,
        avcConfiguration: description,
        limit: RASTER_LIMITS.maxBytes,
      },
      samples,
    );
  }
  return muxWebm(
    {
      width: options.width,
      height: options.height,
      timestamps: plan.timestamps,
      durationMicroseconds: (plan.timestamps.at(-1) ?? 0) + (plan.durations.at(-1) ?? 0),
      limit: RASTER_LIMITS.maxBytes,
    },
    samples,
  );
}

/** Raster/video export of one per-object animation. Every frame comes from the shared visual
 * player; the report from `inspectRasterExport` is the only gate, re-checked here. */
export async function buildRasterExport(
  project: Project,
  input: RasterOptionsInput,
  task: Task = {},
): Promise<{ content: Uint8Array; extension: string; type: string }> {
  assertRasterExport(project, input);
  const options = rasterOptionsSchema.parse(input),
    clip = project.motion.animations.find((value) => value.id === options.animationId);
  if (!clip) throw new Error("Animação por objeto indisponível.");
  const plan = planRasterFrames(clip, options.fps),
    compiled = compileInteractiveArtboard(
      timelineProject(project, options.artboardId),
      options.artboardId,
      {
        animationId: clip.id,
      },
    ),
    source = await createRasterFrameSource(
      compiled.document,
      { width: options.width, height: options.height, background: options.background },
      task.signal,
    );
  try {
    let content: Uint8Array;
    if (options.format === "png-sequence") {
      const frames: Uint8Array[] = [];
      let total = 0;
      for (const [index, time] of plan.times.entries()) {
        const context = await source.render(time),
          blob = await context.canvas.convertToBlob({ type: "image/png" }),
          bytes = new Uint8Array(await blob.arrayBuffer());
        total += bytes.length;
        if (total > RASTER_LIMITS.maxBytes)
          throw new Error("Sequência PNG excede o limite de tamanho.");
        frames.push(bytes);
        task.onProgress?.(index + 1, plan.times.length);
      }
      content = packPngSequence(frames, plan, {
        name: clip.name,
        width: options.width,
        height: options.height,
        fps: options.fps,
        background: options.background,
        limit: RASTER_LIMITS.maxBytes,
      });
    } else if (options.format === "gif") {
      const encoder = createGifEncoder({
        width: options.width,
        height: options.height,
        loop: plan.loop,
        limit: RASTER_LIMITS.maxBytes,
      });
      for (const [index, time] of plan.times.entries()) {
        const context = await source.render(time);
        encoder.addFrame(
          context.getImageData(0, 0, options.width, options.height).data,
          plan.delays[index] ?? 0,
        );
        task.onProgress?.(index + 1, plan.times.length);
      }
      content = encoder.finish();
    } else content = await encodeVideo(source, plan, options, task);
    task.signal?.throwIfAborted();
    return { content, ...RASTER_OUTPUT[options.format] };
  } finally {
    await source.destroy();
  }
}
