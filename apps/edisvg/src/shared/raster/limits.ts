export const RASTER_FORMATS = ["png-sequence", "gif", "mp4", "webm"] as const;
export type RasterFormat = (typeof RASTER_FORMATS)[number];

/** Ten minutes at 60 FPS, plus the final pose a clip that plays once ends on. Video streams
 * every frame through the encoder and keeps only the compressed samples, so its bounds are
 * wall time (pixels) and file size; PNG and GIF hold every frame and keep the shorter ceiling. */
const VIDEO_FRAMES = 10 * 60 * 60 + 1;
const IMAGE_BYTES = 256 * 1024 ** 2;
/** 1080p at 60 FPS for ten minutes in high quality is about 1.5 GB at the target bitrate. */
const VIDEO_BYTES = 2_000_000_000;

export const RASTER_LIMITS = {
  minSide: 16,
  maxSide: 3840,
  gifMaxSide: 1920,
  maxFps: 60,
  gifMaxFps: 50,
  maxFrames: { "png-sequence": 3600, gif: 3600, mp4: VIDEO_FRAMES, webm: VIDEO_FRAMES },
  /** Rendered pixels across all frames: bounds memory and wall time, not file size. */
  maxPixels: {
    "png-sequence": 1.5e9,
    gif: 6e8,
    mp4: VIDEO_FRAMES * 1920 * 1080,
    webm: VIDEO_FRAMES * 1920 * 1080,
  },
  maxBytes: { "png-sequence": IMAGE_BYTES, gif: IMAGE_BYTES, mp4: VIDEO_BYTES, webm: VIDEO_BYTES },
} as const;

/** The saved file's extension for each format; the desktop save checks bytes against it. */
export const RASTER_EXTENSIONS = {
  "png-sequence": "png.zip",
  gif: "gif",
  mp4: "mp4",
  webm: "webm",
} as const satisfies Record<RasterFormat, string>;

/** One IPC message has a size ceiling that a ten-minute video can pass, so the desktop save
 * receives raster and video exports in slices of at most this size. */
export const RASTER_SLICE_BYTES = 64 * 1024 ** 2;
