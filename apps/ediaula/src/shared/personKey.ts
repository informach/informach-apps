import { type ChromaKey, DEFAULT_KEY, keySize } from "./chroma.ts";

/**
 * Background removal by local AI for a webcam ("Remover fundo com IA local"): a person
 * segmentation model (resources/segmentation, run by the renderer's worker) says, for each small
 * frame, how sure it is that each pixel is the person; that becomes the alpha of the camera at
 * full size. The result is the same cached VP9 video with alpha as the color key (Asset.keyed),
 * so the preview and the export use it the same way.
 *
 * The frames the model sees and the frames the encoder writes come from the same normalization
 * (start at zero, constant rate), so mask n always goes with frame n.
 */

/** The key of a media whose background the local AI removes. */
export const PERSON_KEY: ChromaKey = { ...DEFAULT_KEY, color: "#000000", mode: "person" };

export const isPersonKey = (key: ChromaKey | undefined): boolean => key?.mode === "person";

/** Longest side of the frames the model sees (its input is 256 × 256). */
export const MASK_SIDE = 256;

/** Confidence below LOW is background, above HIGH is the person; in between, a soft edge. */
const LOW = 0.3;
const HIGH = 0.7;

/** Size of the frames handed to the model: the video's shape within MASK_SIDE, even. */
export function maskSize(width: number, height: number): { width: number; height: number } {
  const w = width > 0 ? width : 16;
  const h = height > 0 ? height : 9;
  const s = MASK_SIDE / Math.max(w, h);
  const even = (v: number): number => Math.max(2, Math.round((v * s) / 2) * 2);
  return { width: even(w), height: even(h) };
}

/** The video's frame rate as the decoder and the encoder both use it. */
export const keyRate = (fps: number): string =>
  fps > 0 ? String(Math.round(fps * 1000) / 1000) : "30";

/** Frames of the keyed video for a media of `duration` seconds. */
export const keyFrames = (duration: number, fps: number): number =>
  Math.max(1, Math.round(duration * Number(keyRate(fps))));

/**
 * The model's confidence (0..1 per pixel) as alpha bytes: a smooth step from LOW to HIGH, so
 * hair and shoulders get a soft edge instead of a jagged cut. Writes into `out` at `offset`.
 */
export function confidenceToAlpha(
  confidence: ArrayLike<number>,
  out: Uint8Array,
  offset = 0,
): void {
  for (let i = 0; i < confidence.length; i++) {
    const v = confidence[i];
    const k = v <= LOW ? 0 : v >= HIGH ? 1 : (v - LOW) / (HIGH - LOW);
    out[offset + i] = Math.round(k * k * (3 - 2 * k) * 255);
  }
}

/** Normalizes a video to start at zero at a constant rate (both processes use it). */
const steady = (rate: string): string => `setpts=PTS-STARTPTS,fps=${rate}`;

/** FFmpeg reading the small RGBA frames the model sees, on stdout. */
export function maskFramesArgs(o: {
  path: string;
  width: number;
  height: number;
  fps: number;
}): string[] {
  const m = maskSize(o.width, o.height);
  return [
    "-v",
    "error",
    "-i",
    o.path,
    "-an",
    "-sn",
    "-vf",
    `${steady(keyRate(o.fps))},scale=${m.width}:${m.height}:flags=area,format=rgba`,
    "-f",
    "rawvideo",
    "-",
  ];
}

/**
 * FFmpeg writing the camera with its background removed: the video at full size (within
 * KEY_MAX_SIDE) and the masks from stdin (gray, one per frame) enlarged into its alpha, as VP9
 * with alpha. A keyframe every second keeps scrubbing in the preview responsive.
 */
export function personKeyArgs(o: {
  path: string;
  width: number;
  height: number;
  fps: number;
  out: string;
}): string[] {
  const rate = keyRate(o.fps);
  const full = keySize(o.width || 1280, o.height || 720);
  const m = maskSize(o.width, o.height);
  const size = `${full.width}:${full.height}`;
  return [
    "-v",
    "error",
    "-y",
    "-i",
    o.path,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "-s",
    `${m.width}x${m.height}`,
    "-framerate",
    rate,
    "-i",
    "-",
    "-filter_complex",
    `[0:v]${steady(rate)},scale=${size}:flags=lanczos,format=yuv420p[c];[1:v]scale=${size}:flags=bicubic,format=gray[m];[c][m]alphamerge,format=yuva420p[v]`,
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libvpx-vp9",
    "-pix_fmt",
    "yuva420p",
    "-deadline",
    "realtime",
    "-cpu-used",
    "5",
    "-row-mt",
    "1",
    "-crf",
    "18",
    "-b:v",
    "0",
    "-auto-alt-ref",
    "0",
    "-g",
    String(Math.max(1, Math.round(Number(rate)))),
    "-f",
    "webm",
    o.out,
  ];
}
