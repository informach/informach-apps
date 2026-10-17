import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { z } from "zod";
import {
  CAPTURE_CODECS,
  CAPTURE_CONVERSIONS,
  type CaptureCodec,
  type CaptureConversion,
  type CaptureEncoder,
  COLOR_MATRICES,
  COLOR_RANGES,
  captureVideoArgs,
  chooseCaptureEncoder,
  colorFromLuma,
  conversionsFor,
  type EncoderProbe,
  MIN_CAPTURE_FPS,
  parseSpeed,
  softwarePixelFormat,
} from "../shared/encoderChoice.ts";
import { FFMPEG } from "./ffmpeg.ts";

/**
 * Finds the screen recording encoder by trying each candidate on this machine (being listed by
 * FFmpeg says nothing about the GPU and driver). The answer is cached in userData/encoders.json
 * for this FFmpeg build and these GPUs and drivers.
 */

const CACHE_VERSION = 1;
/**
 * A choice made after a better encoder failed is checked again a day later: that encoder may
 * only have been busy (NVENC limits concurrent sessions on GeForce cards).
 */
const FALLBACK_RECHECK_MS = 24 * 60 * 60 * 1000;
const FRAME_1080P60 = { fps: 60, width: 1920, height: 1080 };
/** Test frames carry the same colour tags as Desktop Duplication's. */
const LIKE_DESKTOP =
  "format=bgra,setparams=colorspace=gbr:range=pc:color_primaries=bt709:color_trc=iec61966-2-1";

function ffmpeg(args: string[]): Promise<{ code: number | null; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    const stdout: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 30000);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-16000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(stdout), stderr });
    });
  });
}

/** Input, filter and pixel format that bring a BGRA source to the encoder along one path. */
function pathArgs(codec: CaptureCodec, conversion: CaptureConversion) {
  const gpu = conversion !== "cpu";
  return {
    device: gpu ? ["-init_hw_device", "d3d11va=d", "-filter_hw_device", "d"] : [],
    filter:
      conversion === "scale_d3d11"
        ? "hwupload,scale_d3d11=format=nv12"
        : conversion === "encoder"
          ? "hwupload"
          : "null",
    pixelFormat: gpu ? [] : ["-pix_fmt", softwarePixelFormat(codec)],
  };
}

async function probeEncoder(
  codec: CaptureCodec,
  conversion: CaptureConversion,
): Promise<EncoderProbe> {
  const path = pathArgs(codec, conversion);
  const result = await ffmpeg([
    "-hide_banner",
    "-nostdin",
    "-v",
    "error",
    "-stats",
    ...path.device,
    "-f",
    "lavfi",
    "-i",
    `testsrc2=s=1920x1080:r=60:d=1,${LIKE_DESKTOP}`,
    "-vf",
    path.filter,
    ...path.pixelFormat,
    ...captureVideoArgs(codec, FRAME_1080P60),
    "-f",
    "null",
    "-",
  ]);
  const speed = parseSpeed(result.stderr);
  return {
    codec,
    conversion,
    ok: result.code === 0 && speed !== undefined,
    fps: Math.round((speed ?? 0) * 600) / 10,
  };
}

/** Encodes pure red along the chosen path and reads the luma back with the software decoder. */
async function measureColor(encoder: Pick<CaptureEncoder, "codec" | "conversion">) {
  const dir = join(app.getPath("temp"), "ediaula");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `encoder-color-${process.pid}-${Date.now()}.mp4`);
  const path = pathArgs(encoder.codec, encoder.conversion);
  try {
    const encoded = await ffmpeg([
      "-hide_banner",
      "-nostdin",
      "-v",
      "error",
      "-y",
      ...path.device,
      "-f",
      "lavfi",
      "-i",
      `color=c=red:s=1920x1080:r=60:d=0.2,${LIKE_DESKTOP}`,
      "-vf",
      path.filter,
      ...path.pixelFormat,
      ...captureVideoArgs(encoder.codec, FRAME_1080P60),
      file,
    ]);
    if (encoded.code !== 0) return colorFromLuma(Number.NaN);
    // The decoder's own 4:2:0 output: the first 256 bytes are the luma of the 16x16 centre.
    const decoded = await ffmpeg([
      "-hide_banner",
      "-nostdin",
      "-v",
      "error",
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "crop=16:16",
      "-f",
      "rawvideo",
      "-",
    ]);
    if (decoded.code !== 0 || decoded.stdout.length < 256) return colorFromLuma(Number.NaN);
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += decoded.stdout[i];
    return colorFromLuma(sum / 256);
  } finally {
    await rm(file, { force: true });
  }
}

const gpuInfoSchema = z.object({
  gpuDevice: z
    .array(
      z.object({
        vendorId: z.number(),
        deviceId: z.number(),
        driverVendor: z.string().optional(),
        driverVersion: z.string().optional(),
      }),
    )
    .optional(),
});

/** FFmpeg build plus every GPU and driver: a new driver may enable or break an encoder. */
async function cacheKey(): Promise<string> {
  const version = await ffmpeg(["-hide_banner", "-version"]);
  const gpus = gpuInfoSchema.parse(await app.getGPUInfo("basic")).gpuDevice ?? [];
  return createHash("sha256")
    .update(
      JSON.stringify({
        cache: CACHE_VERSION,
        ffmpeg: version.stdout.toString().split("\n")[0],
        gpus: gpus.map((g) => [g.vendorId, g.deviceId, g.driverVendor, g.driverVersion]),
      }),
    )
    .digest("hex");
}

const cacheSchema = z.object({
  key: z.string(),
  checkedAt: z.number(),
  fallback: z.boolean(),
  encoder: z.strictObject({
    codec: z.enum(CAPTURE_CODECS),
    gpuInput: z.boolean(),
    conversion: z.enum(CAPTURE_CONVERSIONS),
    matrix: z.enum(COLOR_MATRICES),
    range: z.enum(COLOR_RANGES),
    fps1080: z.number().nonnegative(),
  }),
});

async function readCache(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    // No cache yet, or a damaged one: detect again and rewrite it.
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && "code" in error && error.code === "ENOENT")
    )
      return undefined;
    throw error;
  }
}

async function detect(): Promise<CaptureEncoder> {
  const key = await cacheKey();
  const cacheFile = join(app.getPath("userData"), "encoders.json");
  const cached = cacheSchema.safeParse(await readCache(cacheFile));
  if (
    cached.success &&
    cached.data.key === key &&
    (!cached.data.fallback || Date.now() - cached.data.checkedAt < FALLBACK_RECHECK_MS)
  )
    return cached.data.encoder;
  const probes: EncoderProbe[] = [];
  for (const codec of CAPTURE_CODECS) {
    // GPU input first; system memory only when the GPU path does not work at all.
    for (const conversion of conversionsFor(codec)) {
      const probe = await probeEncoder(codec, conversion);
      probes.push(probe);
      if (probe.ok) break;
    }
    if (probes.some((p) => p.codec === codec && p.ok && p.fps >= MIN_CAPTURE_FPS)) break;
  }
  const chosen = chooseCaptureEncoder(probes);
  const encoder: CaptureEncoder = { ...chosen, ...(await measureColor(chosen)) };
  const rank = (codec: CaptureCodec) => CAPTURE_CODECS.indexOf(codec);
  const fallback = probes.some((p) => rank(p.codec) < rank(chosen.codec));
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(
    cacheFile,
    JSON.stringify({ key, checkedAt: Date.now(), fallback, encoder, probes }, null, 2),
  );
  return encoder;
}

let detection: Promise<CaptureEncoder> | undefined;

export function detectCaptureEncoder(): Promise<CaptureEncoder> {
  detection ??= detect().catch((error: unknown) => {
    detection = undefined;
    throw error;
  });
  return detection;
}
