import type { Encoder, ExportQuality } from "../types.ts";

/**
 * H.264 settings of the export for each encoder. Every segment of a lesson is encoded with
 * exactly the same options (a keyframe every two seconds, the same rate control and profile), so
 * the segments join without re-encoding.
 */

/**
 * Pixel format handed to the encoder: Media Foundation hardware encoders take only NV12, though
 * FFmpeg also offers them YUV 4:2:0 planar.
 */
export const encoderPixelFormat = (encoder: Encoder): string[] => [
  "-pix_fmt",
  encoder === "mf" ? "nv12" : "yuv420p",
];

/** H.264 at a target bitrate with a 1.5× peak, High profile, for each encoder. */
export function exportVideoArgs(encoder: Encoder, kbps: number): string[] {
  return [...exportCodecArgs(encoder, kbps), ...encoderPixelFormat(encoder)];
}

function exportCodecArgs(encoder: Encoder, kbps: number): string[] {
  const rate = ["-b:v", `${kbps}k`, "-maxrate", `${Math.round(kbps * 1.5)}k`];
  switch (encoder) {
    case "nvenc":
      return [
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p5",
        "-rc",
        "vbr",
        ...rate,
        "-bufsize",
        `${kbps * 2}k`,
        "-profile:v",
        "high",
      ];
    case "amf":
      return [
        "-c:v",
        "h264_amf",
        "-usage",
        "transcoding",
        "-quality",
        "quality",
        "-rc",
        "vbr_peak",
        ...rate,
        "-bufsize",
        `${kbps * 2}k`,
        "-profile:v",
        "high",
      ];
    case "mf":
      // Media Foundation takes the profile as a number (100 is High) and no buffer size.
      return [
        "-c:v",
        "h264_mf",
        "-hw_encoding",
        "1",
        "-rate_control",
        "pc_vbr",
        "-scenario",
        "archive",
        ...rate,
        "-profile:v",
        "100",
      ];
    case "x264":
      return [
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        ...rate,
        "-bufsize",
        `${kbps * 2}k`,
        "-profile:v",
        "high",
      ];
  }
}

/**
 * Constant quality (x264 CRF, NVENC CQ, AMF QVBR level) for a quality at 1080p; smaller
 * pictures get a little more, 4K a little less, since detail per pixel changes with the size.
 */
const QUALITY_LEVEL: Record<ExportQuality, number> = {
  draft: 28,
  standard: 23,
  high: 20,
  max: 17,
};

export function qualityLevel(quality: ExportQuality, width: number, height: number): number {
  const short = Math.min(width, height);
  const shift = short >= 2000 ? 2 : short >= 1400 ? 1 : short <= 720 ? -1 : 0;
  return QUALITY_LEVEL[quality] + shift;
}

/**
 * Options of every segment: constant quality when `quality` is set (with the bitrate as its
 * ceiling), the bitrate target otherwise; a closed GOP of two seconds; x264 with a share of the
 * CPU threads when several segments run at once.
 */
export function segmentVideoArgs(o: {
  encoder: Encoder;
  kbps: number;
  quality?: ExportQuality;
  width: number;
  height: number;
  /** Frames in two seconds. */
  gop: number;
  threads?: number;
}): string[] {
  const gop = ["-g", String(o.gop), "-keyint_min", String(o.gop)];
  const ceiling = ["-maxrate", `${o.kbps}k`, "-bufsize", `${o.kbps * 2}k`];
  if (!o.quality)
    return [
      ...exportVideoArgs(o.encoder, o.kbps),
      ...gop,
      ...(o.encoder === "x264"
        ? ["-sc_threshold", "0", ...(o.threads ? ["-threads", String(o.threads)] : [])]
        : []),
    ];
  const q = String(qualityLevel(o.quality, o.width, o.height));
  const pix = encoderPixelFormat(o.encoder);
  switch (o.encoder) {
    case "nvenc":
      return [
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p5",
        "-rc",
        "vbr",
        "-cq",
        q,
        "-b:v",
        "0",
        ...ceiling,
        "-spatial-aq",
        "1",
        "-temporal-aq",
        "1",
        "-rc-lookahead",
        "20",
        "-profile:v",
        "high",
        ...gop,
        ...pix,
      ];
    case "amf":
      return [
        "-c:v",
        "h264_amf",
        "-usage",
        "transcoding",
        "-quality",
        "quality",
        "-rc",
        "qvbr",
        "-qvbr_quality_level",
        q,
        ...ceiling,
        "-profile:v",
        "high",
        ...gop,
        ...pix,
      ];
    case "mf":
      // Media Foundation has no constant quality mode that every vendor accepts: the ceiling
      // becomes the target, as without `quality`.
      return [...exportVideoArgs("mf", o.kbps), ...gop];
    case "x264":
      return [
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        q,
        ...ceiling,
        "-profile:v",
        "high",
        "-sc_threshold",
        "0",
        ...(o.threads ? ["-threads", String(o.threads)] : []),
        ...gop,
        ...pix,
      ];
  }
}

/** 720p working copies: short GOP for scrubbing, quality over size. */
export function proxyVideoArgs(encoder: Encoder): string[] {
  return [...proxyCodecArgs(encoder), ...encoderPixelFormat(encoder)];
}

function proxyCodecArgs(encoder: Encoder): string[] {
  const gop = ["-g", "15"];
  switch (encoder) {
    case "nvenc":
      return ["-c:v", "h264_nvenc", "-preset", "p2", "-cq", "28", ...gop];
    case "amf":
      return [
        "-c:v",
        "h264_amf",
        "-usage",
        "transcoding",
        "-quality",
        "speed",
        "-rc",
        "cqp",
        "-qp_i",
        "26",
        "-qp_p",
        "28",
        ...gop,
      ];
    case "mf":
      return [
        "-c:v",
        "h264_mf",
        "-hw_encoding",
        "1",
        "-rate_control",
        "u_vbr",
        "-b:v",
        "4000k",
        ...gop,
      ];
    case "x264":
      return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26", ...gop];
  }
}

/** The order the export falls back through: hardware encoders, then the CPU. */
export const ENCODER_CHAIN: readonly Encoder[] = ["nvenc", "amf", "mf", "x264"];

/** The encoders to try after `encoder` fails, leaving out the ones that failed this session. */
export function fallbackEncoders(encoder: Encoder, failed: ReadonlySet<Encoder>): Encoder[] {
  return ENCODER_CHAIN.slice(ENCODER_CHAIN.indexOf(encoder) + 1).filter(
    (e) => e === "x264" || !failed.has(e),
  );
}

/**
 * Whether FFmpeg failed in the encoder itself (sessions taken, driver, device), which another
 * encoder can get past. A filter or input error fails with any encoder, so it is not one, even
 * though FFmpeg then also says it could not open the encoder (it never got a frame).
 */
export function isEncoderFailure(message: string): boolean {
  if (
    /Error (while filtering|initializing filters?|reinitializing filters|initializing complex filters)|Failed to inject frame|Invalid data found|Error opening input|No such file/i.test(
      message,
    )
  )
    return false;
  return /OpenEncodeSessionEx|No capable devices|Error while opening encoder|CUDA_ERROR|cuInit|cuCtxCreate|nvEncEncodePicture|NvEncEncodePicture|AMF failed|AMFContext|amfrt64|\bMFT\b|Failed to (create|initialize) the encoder|InitializeEncoder|EncodeFrame failed/i.test(
    message,
  );
}
