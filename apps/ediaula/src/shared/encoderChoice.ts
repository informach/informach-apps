import type { Encoder } from "./types.ts";

/**
 * Which H.264 encoder records the screen. Hardware encoders come first (NVIDIA, AMD, then Media
 * Foundation, which reaches Intel Quick Sync and other vendors' hardware), x264 last. Each one is
 * tried on the real screen, at the real size and frame rate, with frames already on the GPU and
 * then from system memory; one that cannot keep up is passed over. The colour matrix it writes is
 * measured, not assumed.
 */

export const CAPTURE_CODECS = ["h264_nvenc", "h264_amf", "h264_mf", "libx264"] as const;
export type CaptureCodec = (typeof CAPTURE_CODECS)[number];

/**
 * Where BGRA becomes YUV: the D3D11 video processor (scale_d3d11), the encoder itself from D3D11
 * frames, or swscale after copying the frame to system memory.
 */
export const CAPTURE_CONVERSIONS = ["scale_d3d11", "encoder", "cpu"] as const;
export type CaptureConversion = (typeof CAPTURE_CONVERSIONS)[number];

export const COLOR_MATRICES = ["bt709", "bt601", "unknown"] as const;
export type ColorMatrix = (typeof COLOR_MATRICES)[number];
export const COLOR_RANGES = ["tv", "pc", "unknown"] as const;
export type ColorRange = (typeof COLOR_RANGES)[number];

/** What is recorded: Desktop Duplication output, size and frame rate. */
export interface CaptureProfile {
  output: number;
  width: number;
  height: number;
  fps: number;
}

export const profileKey = (p: CaptureProfile): string =>
  `${p.output}:${p.width}x${p.height}@${p.fps}`;

/**
 * Why a probe failed. "absent": this FFmpeg build, GPU or driver lacks it, and it will not
 * change until one of them does. "busy": the hardware said no for now (NVENC sessions are limited
 * on GeForce cards). "failed": anything else.
 */
export const PROBE_FAILURES = ["absent", "busy", "failed"] as const;
export type ProbeFailure = (typeof PROBE_FAILURES)[number];

export interface EncoderProbe {
  codec: CaptureCodec;
  conversion: CaptureConversion;
  ok: boolean;
  /** Frames per second it kept on the real screen, after the first second. */
  fps: number;
  failure?: ProbeFailure;
  /** FFmpeg's last error line when it failed. */
  detail?: string;
}

export interface CaptureEncoder {
  codec: CaptureCodec;
  /** Frames stay on the GPU from Desktop Duplication to the encoder. */
  gpuInput: boolean;
  conversion: CaptureConversion;
  matrix: ColorMatrix;
  range: ColorRange;
  /** Frames per second the probe kept (or 0 for a path never probed). */
  fps: number;
}

/** Keeping up: at least 95% of the frame rate asked for. */
export const realtimeFps = (fps: number): number => fps * 0.95;

export const ENCODER_OF: Record<CaptureCodec, Encoder> = {
  h264_nvenc: "nvenc",
  h264_amf: "amf",
  h264_mf: "mf",
  libx264: "x264",
};

/** Name shown in the interface. */
export function encoderName(encoder: Encoder): string {
  return encoder === "nvenc"
    ? "NVENC"
    : encoder === "amf"
      ? "AMF"
      : encoder === "mf"
        ? "Media Foundation"
        : "x264";
}

export const isHardwareEncoder = (encoder: Encoder): boolean => encoder !== "x264";

/** "GPU (NVENC)" or "CPU (x264)", for the recorder. */
export function captureEncoderLabel(encoder: Pick<CaptureEncoder, "codec">): string {
  const name = ENCODER_OF[encoder.codec];
  return `${isHardwareEncoder(name) ? "GPU" : "CPU"} (${encoderName(name)})`;
}

/** Frames from system memory: x264 takes planar 4:2:0, the hardware encoders NV12. */
export const softwarePixelFormat = (codec: CaptureCodec): string =>
  codec === "libx264" ? "yuv420p" : "nv12";

/** The probes worth running: x264 has no GPU input. */
export function conversionsFor(codec: CaptureCodec): readonly CaptureConversion[] {
  return codec === "libx264" ? ["cpu"] : CAPTURE_CONVERSIONS;
}

/**
 * First encoder in order that works and keeps up, preferring GPU input. When none keeps up, the
 * fastest that works; x264 always works where FFmpeg does.
 */
export function chooseCaptureEncoder(
  probes: readonly EncoderProbe[],
  minFps: number,
): Omit<CaptureEncoder, "matrix" | "range"> {
  const pick = (p: EncoderProbe) => ({
    codec: p.codec,
    gpuInput: p.conversion !== "cpu",
    conversion: p.conversion,
    fps: p.fps,
  });
  for (const codec of CAPTURE_CODECS)
    for (const conversion of conversionsFor(codec)) {
      const probe = probes.find((p) => p.codec === codec && p.conversion === conversion);
      if (probe?.ok && probe.fps >= minFps) return pick(probe);
    }
  const working = probes.filter((p) => p.ok).sort((a, b) => b.fps - a.fps);
  if (!working.length) throw new Error("Nenhum codificador de vídeo funcionou neste computador.");
  return pick(working[0]);
}

/**
 * The paths to try, in order, when the chosen one fails to start a real recording: the same
 * encoder from system memory, then x264. The CPU paths convert with swscale under the colour tags
 * they are given, so BT.601 limited holds for them; an encoder that converts by itself was not
 * measured on that path.
 */
export function fallbackChain(
  encoder: Pick<CaptureEncoder, "codec" | "conversion">,
): CaptureEncoder[] {
  const chain: CaptureEncoder[] = [];
  const next = CAPTURE_CONVERSIONS.slice(CAPTURE_CONVERSIONS.indexOf(encoder.conversion) + 1);
  if (encoder.codec !== "libx264")
    for (const conversion of next)
      chain.push({
        codec: encoder.codec,
        conversion,
        gpuInput: conversion !== "cpu",
        matrix: conversion === "cpu" ? "bt601" : "unknown",
        range: conversion === "cpu" ? "tv" : "unknown",
        fps: 0,
      });
  if (encoder.codec !== "libx264")
    chain.push({
      codec: "libx264",
      conversion: "cpu",
      gpuInput: false,
      matrix: "bt601",
      range: "tv",
      fps: 0,
    });
  return chain;
}

/**
 * Frames per second from progress samples (clock in ms, frames encoded so far), leaving out the
 * first second after frames start: opening the encoder and filling its pipeline is not its pace.
 */
export function measuredFps(
  samples: readonly { at: number; frame: number }[],
  skipMs = 1000,
): number {
  const first = samples.find((s) => s.frame > 0);
  if (!first) return 0;
  const from = samples.find((s) => s.at >= first.at + skipMs);
  const last = samples.at(-1);
  if (!from || !last || last.at - from.at < 500) return 0;
  return Math.round(((last.frame - from.frame) * 1000 * 10) / (last.at - from.at)) / 10;
}

/** Tells "this build or GPU lacks it" from "it said no this time", by FFmpeg's own messages. */
export function classifyProbeFailure(stderr: string): ProbeFailure {
  if (
    /Unknown encoder|Encoder \S+ not found|No such filter: 'scale_d3d11'|Cannot load (nvcuda|nvEncodeAPI)|No capable devices found|Driver does not support the required nvenc API|DLL amfrt64\.dll failed to open|could not find any MFT|Could not create the texture/.test(
      stderr,
    )
  )
    return "absent";
  if (/out of memory|incompatible client key|resource busy/i.test(stderr)) return "busy";
  return "failed";
}

/**
 * Luma of pure red tells the matrix and the range: BT.709 gives Y≈63 and BT.601 Y≈81 in limited
 * range, 54 and 76 in full range.
 */
export function colorFromLuma(y: number): { matrix: ColorMatrix; range: ColorRange } {
  const near = (value: number) => Math.abs(y - value) <= 2;
  if (near(63)) return { matrix: "bt709", range: "tv" };
  if (near(54)) return { matrix: "bt709", range: "pc" };
  if (near(81)) return { matrix: "bt601", range: "tv" };
  if (near(76)) return { matrix: "bt601", range: "pc" };
  return { matrix: "unknown", range: "unknown" };
}

/**
 * Encoder options for the screen and camera of a recording. Bitrate-driven encoders get about
 * 0.2 bit per pixel and frame, enough for small text.
 */
export function captureVideoArgs(
  codec: CaptureCodec,
  frame: { fps: number; width: number; height: number },
): string[] {
  const gop = ["-g", String(frame.fps * 2)];
  const kbps = Math.round(
    Math.min(80000, Math.max(4000, (frame.width * frame.height * frame.fps * 0.2) / 1000)),
  );
  switch (codec) {
    case "h264_nvenc":
      return ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "18", ...gop];
    case "h264_amf":
      return [
        "-c:v",
        "h264_amf",
        "-usage",
        "transcoding",
        "-quality",
        "balanced",
        "-rc",
        "cqp",
        "-qp_i",
        "18",
        "-qp_p",
        "20",
        ...gop,
      ];
    case "h264_mf":
      // Hardware MFTs only (Windows' software H.264 MFT is slower than x264). Vendors differ in
      // the rate controls they accept; peak-constrained VBR works across them. 100 is High profile.
      return [
        "-c:v",
        "h264_mf",
        "-hw_encoding",
        "1",
        "-rate_control",
        "pc_vbr",
        "-b:v",
        `${kbps}k`,
        "-maxrate",
        `${Math.round(kbps * 1.5)}k`,
        "-profile:v",
        "100",
        ...gop,
      ];
    case "libx264":
      return ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", ...gop];
  }
}

/**
 * Filter between ddagrab and the encoder, and the output options after it. Desktop Duplication
 * frames are tagged as RGB, and encoders that convert them on the GPU keep that tag although they
 * wrote YUV; setparams puts the measured matrix and range back. Measured on NVENC and Media
 * Foundation: the tag does not change their conversion, so the measurement still holds.
 */
export function captureFilter(
  encoder: Pick<CaptureEncoder, "codec" | "conversion" | "matrix" | "range">,
): { filter: string | null; output: string[] } {
  const params = [
    ...(encoder.matrix === "unknown"
      ? []
      : [`colorspace=${encoder.matrix === "bt709" ? "bt709" : "smpte170m"}`]),
    ...(encoder.range === "unknown" ? [] : [`range=${encoder.range}`]),
  ];
  const tag = params.length ? `setparams=${params.join(":")}` : null;
  if (encoder.conversion === "scale_d3d11")
    return { filter: ["scale_d3d11=format=nv12", tag].filter(Boolean).join(","), output: [] };
  if (encoder.conversion === "encoder") return { filter: tag, output: [] };
  return {
    filter: "hwdownload,format=bgra",
    output: ["-pix_fmt", softwarePixelFormat(encoder.codec), ...colorTags(encoder)],
  };
}

/** Output options for the colour matrix and range, when swscale makes the conversion. */
export function colorTags(color: Pick<CaptureEncoder, "matrix" | "range">): string[] {
  return [
    ...(color.matrix === "unknown"
      ? []
      : ["-colorspace", color.matrix === "bt709" ? "bt709" : "smpte170m"]),
    ...(color.range === "unknown" ? [] : ["-color_range", color.range]),
  ];
}
