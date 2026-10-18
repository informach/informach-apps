/**
 * Webcam modes. Webcams list what they can do through DirectShow (`-list_options true`); many
 * deliver 1080p only as MJPEG, and raw modes above 720p often drop to a few frames per second.
 */

export interface CameraMode {
  /** Compressed modes ("mjpeg", "h264"); absent for raw pixels. */
  codec?: string;
  /** Raw modes: "yuyv422", "nv12"… */
  pixelFormat?: string;
  width: number;
  height: number;
  minFps: number;
  maxFps: number;
}

/** The mode a camera is opened in. */
export interface CameraChoice {
  codec?: string;
  pixelFormat?: string;
  width: number;
  height: number;
  fps: number;
}

const OPTION =
  /(?:vcodec=(\S+)|pixel_format=(\S+))\s+min s=(\d+)x(\d+) fps=([\d.]+) max s=(\d+)x(\d+) fps=([\d.]+)/;

/** Modes from FFmpeg's dshow listing, without repeats (newer FFmpeg prints each twice). */
export function parseDshowOptions(text: string): CameraMode[] {
  const seen = new Set<string>();
  const modes: CameraMode[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = OPTION.exec(line);
    if (!m) continue;
    const mode: CameraMode = {
      ...(m[1] ? { codec: m[1] } : { pixelFormat: m[2] }),
      // A range of sizes is rare in webcams; the largest is the one worth having.
      width: Number(m[6]),
      height: Number(m[7]),
      minFps: Number(m[5]),
      maxFps: Number(m[8]),
    };
    const key = JSON.stringify(mode);
    if (seen.has(key)) continue;
    seen.add(key);
    modes.push(mode);
  }
  return modes;
}

/** Frame rates like 29.97 count as 30. */
const keepsUp = (mode: CameraMode, fps: number): boolean => mode.maxFps >= fps - 0.5;
const area = (mode: CameraMode): number => mode.width * mode.height;
const RAW = new Set(["nv12", "yuyv422"]);

const largest = (modes: CameraMode[]): CameraMode | undefined =>
  [...modes].sort((a, b) => area(b) - area(a) || b.maxFps - a.maxFps)[0];

/**
 * MJPEG up to 1080p at the frame rate asked for; else NV12 or YUYV up to 720p at that rate;
 * else the largest mode there is, at the best rate it has.
 */
export function chooseCameraMode(modes: CameraMode[], fps = 30): CameraChoice | null {
  const choice = (mode: CameraMode | undefined, rate: number): CameraChoice | null =>
    mode
      ? {
          ...(mode.codec ? { codec: mode.codec } : { pixelFormat: mode.pixelFormat }),
          width: mode.width,
          height: mode.height,
          fps: rate,
        }
      : null;
  const mjpeg = largest(
    modes.filter((m) => m.codec === "mjpeg" && m.height <= 1080 && keepsUp(m, fps)),
  );
  if (mjpeg) return choice(mjpeg, fps);
  const raw = largest(
    modes.filter(
      (m) => m.pixelFormat && RAW.has(m.pixelFormat) && m.height <= 720 && keepsUp(m, fps),
    ),
  );
  if (raw) return choice(raw, fps);
  const any = largest(modes);
  return any ? choice(any, Math.min(fps, any.maxFps)) : null;
}

/** dshow input options for a mode (they go before `-i video=…`). */
export function cameraInputArgs(mode: CameraChoice): string[] {
  return [
    ...(mode.codec ? ["-vcodec", mode.codec] : ["-pixel_format", mode.pixelFormat ?? "yuyv422"]),
    "-video_size",
    `${mode.width}x${mode.height}`,
    "-framerate",
    String(mode.fps),
  ];
}

/** "1920 × 1080 · MJPEG · 30 qps", for the recorder. */
export function cameraModeLabel(mode: CameraChoice): string {
  const format = mode.codec ? mode.codec.toUpperCase() : (mode.pixelFormat ?? "").toUpperCase();
  return `${mode.width} × ${mode.height} · ${format} · ${Math.round(mode.fps * 100) / 100} qps`;
}
