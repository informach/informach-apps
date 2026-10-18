import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { z } from "zod";
import {
  CAPTURE_CODECS,
  CAPTURE_CONVERSIONS,
  type CaptureCodec,
  type CaptureConversion,
  type CaptureEncoder,
  type CaptureProfile,
  COLOR_MATRICES,
  COLOR_RANGES,
  CPU_CONVERSION,
  captureVideoArgs,
  chooseCaptureEncoder,
  classifyProbeFailure,
  colorFromLuma,
  conversionsFor,
  type EncoderProbe,
  measuredFps,
  PROBE_FAILURES,
  profileKey,
  realtimeFps,
} from "../shared/encoderChoice.ts";
import { FFMPEG } from "./ffmpeg.ts";
import { qpc } from "./nativeHelper.ts";

/**
 * Finds the screen recording encoder by recording the real screen with each candidate (being
 * listed by FFmpeg says nothing about the GPU and driver). Results live in userData/encoders.json
 * per screen, size and frame rate, under a key made of this FFmpeg build, the GPUs and drivers
 * and the app version. Paths that do not exist here are never probed again under that key;
 * a choice made because a better encoder was busy is checked again a day later; a path that
 * failed in a real recording is left out until the key changes.
 */

const CACHE_VERSION = 3;
const FALLBACK_RECHECK_MS = 24 * 60 * 60 * 1000;
const PROBE_SECONDS = 3;
/** Test frames for the colour measurement carry the same tags as Desktop Duplication's. */
const LIKE_DESKTOP =
  "format=bgra,setparams=colorspace=gbr:range=pc:color_primaries=bt709:color_trc=iec61966-2-1";

const slot = (p: { codec: CaptureCodec; conversion: CaptureConversion }) =>
  `${p.codec}|${p.conversion}`;

interface Run {
  code: number | null;
  stdout: Buffer;
  stderr: string;
  /** Progress samples when the command reports them on stdout. */
  samples: { at: number; frame: number }[];
}

function ffmpeg(args: string[], progress = false): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    const stdout: Buffer[] = [];
    const samples: { at: number; frame: number }[] = [];
    let pending = "";
    let stderr = "";
    // A driver that hangs inside the encoder must not hang the recorder.
    const timer = setTimeout(() => child.kill(), 30000);
    child.stdout.on("data", (chunk: Buffer) => {
      if (!progress) {
        stdout.push(chunk);
        return;
      }
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const frame = /^frame=(\d+)/.exec(line.trim());
        if (frame) samples.push({ at: qpc(), frame: Number(frame[1]) });
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-16000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(stdout), stderr, samples });
    });
  });
}

/** Desktop Duplication frames to the encoder along one path, as the recorder sends them. */
function screenPath(conversion: CaptureConversion): string[] {
  if (conversion === "scale_d3d11") return ["-vf", "scale_d3d11=format=nv12"];
  if (conversion === "encoder") return [];
  return ["-vf", CPU_CONVERSION];
}

/**
 * Records the real screen for three seconds and measures the pace after the first one. The
 * source costs nothing to produce, so the measure is the encoder's.
 */
async function probeEncoder(
  profile: CaptureProfile,
  codec: CaptureCodec,
  conversion: CaptureConversion,
): Promise<EncoderProbe> {
  const result = await ffmpeg(
    [
      "-hide_banner",
      "-nostdin",
      "-v",
      "error",
      "-nostats",
      "-stats_period",
      "0.25",
      "-progress",
      "pipe:1",
      "-f",
      "lavfi",
      "-i",
      `ddagrab=output_idx=${profile.output}:framerate=${profile.fps}:draw_mouse=0`,
      "-t",
      String(PROBE_SECONDS),
      ...screenPath(conversion),
      ...captureVideoArgs(codec, profile),
      "-f",
      "null",
      "-",
    ],
    true,
  );
  const fps = measuredFps(result.samples);
  const ok = result.code === 0 && fps > 0;
  return {
    codec,
    conversion,
    ok,
    fps,
    ...(ok ? {} : { failure: classifyProbeFailure(result.stderr) }),
    ...(ok ? {} : { detail: result.stderr.trim().split("\n").at(-1) ?? "" }),
  };
}

/** Input and filter that bring a test frame to the encoder along one path. */
function uploadPath(conversion: CaptureConversion) {
  const gpu = conversion !== "cpu";
  return {
    device: gpu ? ["-init_hw_device", "d3d11va=d", "-filter_hw_device", "d"] : [],
    filter:
      conversion === "scale_d3d11"
        ? "hwupload,scale_d3d11=format=nv12"
        : conversion === "encoder"
          ? "hwupload"
          : // The recorder's CPU conversion without its download from the GPU.
            CPU_CONVERSION.slice("hwdownload,".length),
  };
}

/** Encodes pure red along the chosen path and reads the luma back with the software decoder. */
async function measureColor(
  encoder: Pick<CaptureEncoder, "codec" | "conversion">,
  profile: CaptureProfile,
) {
  const dir = join(app.getPath("temp"), "ediaula");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `encoder-color-${process.pid}-${Date.now()}.mp4`);
  const path = uploadPath(encoder.conversion);
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
      `color=c=red:s=640x360:r=${profile.fps}:d=0.2,${LIKE_DESKTOP}`,
      "-vf",
      path.filter,
      ...captureVideoArgs(encoder.codec, profile),
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

/**
 * The FFmpeg build (version and configure line), every GPU and driver, and this app: any of them
 * can enable or break an encoder.
 */
async function cacheKey(): Promise<string> {
  const build = await ffmpeg(["-hide_banner", "-buildconf"]);
  const version = await ffmpeg(["-hide_banner", "-version"]);
  const gpus = gpuInfoSchema.parse(await app.getGPUInfo("basic")).gpuDevice ?? [];
  return createHash("sha256")
    .update(
      JSON.stringify({
        cache: CACHE_VERSION,
        app: app.getVersion(),
        ffmpeg: version.stdout.toString().split("\n")[0],
        build: createHash("sha256").update(build.stdout).digest("hex"),
        gpus: gpus.map((g) => [g.vendorId, g.deviceId, g.driverVendor, g.driverVersion]),
      }),
    )
    .digest("hex");
}

const encoderSchema = z.strictObject({
  codec: z.enum(CAPTURE_CODECS),
  gpuInput: z.boolean(),
  conversion: z.enum(CAPTURE_CONVERSIONS),
  matrix: z.enum(COLOR_MATRICES),
  range: z.enum(COLOR_RANGES),
  fps: z.number().nonnegative(),
});
const cacheSchema = z.object({
  version: z.literal(CACHE_VERSION),
  key: z.string(),
  /** codec|conversion this build, GPU or driver does not have. */
  absent: z.array(z.string()),
  /** codec|conversion that passed the probe but failed to start a real recording. */
  failures: z.array(z.string()),
  profiles: z.record(
    z.string(),
    z.object({
      encoder: encoderSchema,
      checkedAt: z.number(),
      /** A better encoder was only busy or failed: check again later. */
      fallback: z.boolean(),
      probes: z.array(
        z.object({
          codec: z.enum(CAPTURE_CODECS),
          conversion: z.enum(CAPTURE_CONVERSIONS),
          ok: z.boolean(),
          fps: z.number(),
          failure: z.enum(PROBE_FAILURES).optional(),
          detail: z.string().optional(),
        }),
      ),
    }),
  ),
});
type Cache = z.infer<typeof cacheSchema>;

const cacheFile = () => join(app.getPath("userData"), "encoders.json");

async function readCache(key: string): Promise<Cache> {
  const empty: Cache = { version: CACHE_VERSION, key, absent: [], failures: [], profiles: {} };
  let text: string;
  try {
    text = await readFile(cacheFile(), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return empty;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return empty; // a damaged cache is detected again and rewritten
  }
  const cache = cacheSchema.safeParse(value);
  return cache.success && cache.data.key === key ? cache.data : empty;
}

async function writeCache(cache: Cache): Promise<void> {
  await mkdir(app.getPath("userData"), { recursive: true });
  const partial = `${cacheFile()}.partial`;
  await writeFile(partial, JSON.stringify(cache, null, 2));
  await rename(partial, cacheFile());
}

const rank = (codec: CaptureCodec) => CAPTURE_CODECS.indexOf(codec);

async function detect(profile: CaptureProfile): Promise<CaptureEncoder> {
  const key = await cacheKey();
  const cache = await readCache(key);
  const known = cache.profiles[profileKey(profile)];
  if (
    known &&
    !cache.failures.includes(slot(known.encoder)) &&
    (!known.fallback || Date.now() - known.checkedAt < FALLBACK_RECHECK_MS)
  )
    return known.encoder;
  const skip = new Set([...cache.absent, ...cache.failures]);
  const minFps = realtimeFps(profile.fps);
  const probes: EncoderProbe[] = [];
  for (const codec of CAPTURE_CODECS) {
    // GPU input first; system memory only when the GPU path does not work at all.
    for (const conversion of conversionsFor(codec)) {
      if (skip.has(slot({ codec, conversion }))) continue;
      const probe = await probeEncoder(profile, codec, conversion);
      probes.push(probe);
      if (probe.failure === "absent") cache.absent.push(slot(probe));
      if (probe.ok) break;
    }
    if (probes.some((p) => p.codec === codec && p.ok && p.fps >= minFps)) break;
  }
  let chosen: Omit<CaptureEncoder, "matrix" | "range">;
  try {
    chosen = chooseCaptureEncoder(probes, minFps);
  } catch (error) {
    // Usually the screen itself, not the encoders: say what FFmpeg said.
    const detail = probes.at(-1)?.detail;
    throw new Error(`Não consegui gravar esta tela${detail ? `: ${detail}` : "."}`, {
      cause: error,
    });
  }
  const encoder: CaptureEncoder = { ...chosen, ...(await measureColor(chosen, profile)) };
  cache.profiles[profileKey(profile)] = {
    encoder,
    checkedAt: Date.now(),
    fallback: probes.some((p) => rank(p.codec) < rank(chosen.codec) && p.failure !== "absent"),
    probes,
  };
  await writeCache(cache);
  return encoder;
}

const detections = new Map<string, Promise<CaptureEncoder>>();

/** The encoder for this screen, size and frame rate; probes once and then answers from the cache. */
export function detectCaptureEncoder(profile: CaptureProfile): Promise<CaptureEncoder> {
  const id = profileKey(profile);
  let detection = detections.get(id);
  if (!detection) {
    detection = detect(profile).catch((error: unknown) => {
      detections.delete(id);
      throw error;
    });
    detections.set(id, detection);
  }
  return detection;
}

/**
 * A path that passed the probe but could not start a real recording: left out of later choices
 * under the same key, and this profile is detected again next time.
 */
export async function reportCaptureFailure(
  profile: CaptureProfile,
  encoder: Pick<CaptureEncoder, "codec" | "conversion">,
): Promise<void> {
  const cache = await readCache(await cacheKey());
  if (!cache.failures.includes(slot(encoder))) cache.failures.push(slot(encoder));
  delete cache.profiles[profileKey(profile)];
  detections.delete(profileKey(profile));
  await writeCache(cache);
}
