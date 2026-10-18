import { type CameraChoice, cameraInputArgs } from "./camera.ts";
import {
  type CaptureCodec,
  type CaptureEncoder,
  type CaptureQuality,
  captureFilter,
  captureVideoArgs,
  colorTags,
  softwarePixelFormat,
} from "./encoderChoice.ts";

/**
 * FFmpeg command lines of a recording, one process per source (main/recording/source.ts), so a
 * microphone pulled out or a camera that stops does not end the screen. Every process reports
 * its progress on stderr (frame, out_time_us, speed) and quits on "q" at stdin.
 */

export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sample rate and format of the level meter fed by the microphone process. */
export const METER_RATE = 8000;

/** dshow delivers sound in blocks of this many milliseconds. */
export const MIC_BUFFER_MS = 50;

const PROGRESS = ["-hide_banner", "-y", "-v", "error", "-nostats", "-stats_period", "0.1"];
/** Progress goes to stderr: stdout carries the level meter's samples. */
const REPORT = [...PROGRESS, "-progress", "pipe:2"];

/**
 * Fragmented MP4 in two-second fragments, each handed to the file as soon as it closes: a part
 * cut short by a crash or a full disk is readable up to its last fragment.
 */
export const FRAGMENTED_MP4 = [
  "-movflags",
  "+frag_keyframe+empty_moov+default_base_moof",
  "-frag_duration",
  "2000000",
  "-flush_packets",
  "1",
];

/** The fragmented output of a source, as a list of FFmpeg output options. */
const fragmented = (file: string): string[] => [...FRAGMENTED_MP4, "-f", "mp4", file];

export interface ScreenCapture {
  /** Desktop Duplication output (ddagrab's output_idx). */
  output: number;
  fps: number;
  /** Whole monitor, physical pixels. */
  size: { width: number; height: number };
  region?: CaptureRect;
  encoder: CaptureEncoder;
  quality?: CaptureQuality;
  file: string;
}

/**
 * The screen without the pointer (the helper records it apart), on the GPU path the encoder
 * detection chose or converted on the CPU to BT.709, tagged with the matrix really written.
 */
export function screenArgs(o: ScreenCapture): string[] {
  const r = o.region;
  const grab = [
    `output_idx=${o.output}`,
    `framerate=${o.fps}`,
    "draw_mouse=0",
    ...(r ? [`offset_x=${r.x}`, `offset_y=${r.y}`, `video_size=${r.width}x${r.height}`] : []),
  ].join(":");
  const frame = {
    fps: o.fps,
    width: r?.width ?? o.size.width,
    height: r?.height ?? o.size.height,
  };
  const path = captureFilter(o.encoder);
  return [
    ...REPORT,
    "-f",
    "lavfi",
    "-i",
    `ddagrab=${grab}`,
    "-map",
    "0:v",
    ...(path.filter ? ["-vf", path.filter] : []),
    ...captureVideoArgs(o.encoder.codec, frame, o.quality),
    ...path.output,
    ...fragmented(o.file),
  ];
}

/** dshow input of a microphone, stamped with the wall clock as each block arrives. */
const microphoneInput = (device: string): string[] => [
  "-f",
  "dshow",
  "-use_wallclock_as_timestamps",
  "1",
  "-audio_buffer_size",
  String(MIC_BUFFER_MS),
  "-i",
  `audio=${device}`,
];

/** The meter's samples: 8 kHz mono 16-bit on stdout. */
const METER_FORMAT = `aresample=${METER_RATE},aformat=sample_fmts=s16:channel_layouts=mono`;

/** Sample rate of the branch the teleprompter's voice following listens to (pipe:3). */
export const FOLLOW_PIPE_RATE = 16000;

/**
 * Matroska with 16-bit PCM in one-second clusters, each handed to the file as it closes: the
 * voice of a "Só voz" take is kept as recorded, and a part cut short by a crash is readable up
 * to its last cluster.
 */
export const VOICE_MATROSKA = [
  "-c:a",
  "pcm_s16le",
  "-ar",
  "48000",
  "-ac",
  "1",
  "-cluster_time_limit",
  "1000",
  "-flush_packets",
  "1",
  "-f",
  "matroska",
];

export interface MicrophoneCapture {
  device: string;
  file: string;
  /** "Só voz": PCM in Matroska (VOICE_MATROSKA) instead of AAC in fragmented MP4. */
  pcm?: boolean;
  /** Also a 16 kHz copy on pipe:3, for the teleprompter to follow the voice. */
  follow?: boolean;
}

/**
 * The microphone on its own: async resampling keeps it on the wall clock (no drift against the
 * video over a long take), the recording goes to an M4A part (or PCM for a voice take) and a
 * copy at 8 kHz feeds the level meter through stdout; with `follow`, a 16 kHz copy goes to
 * pipe:3 too.
 */
export function microphoneArgs(o: MicrophoneCapture): string[] {
  const monitor = o.follow
    ? `[mon]asplit[m1][m2];[m1]${METER_FORMAT}[meter];[m2]aresample=${FOLLOW_PIPE_RATE},aformat=sample_fmts=s16:channel_layouts=mono[follow]`
    : `[mon]${METER_FORMAT}[meter]`;
  return [
    ...REPORT,
    ...microphoneInput(o.device),
    "-filter_complex",
    `[0:a]aresample=async=1000:first_pts=0,asplit[rec][mon];${monitor}`,
    "-map",
    "[rec]",
    ...(o.pcm
      ? [...VOICE_MATROSKA, o.file]
      : ["-c:a", "aac", "-b:a", "256k", "-ar", "48000", ...fragmented(o.file)]),
    "-map",
    "[meter]",
    "-f",
    "s16le",
    "pipe:1",
    ...(o.follow ? ["-map", "[follow]", "-f", "s16le", "pipe:3"] : []),
  ];
}

/** Only the level meter, while the recorder is being set up. */
export function microphoneMeterArgs(device: string): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-v",
    "error",
    ...microphoneInput(device),
    "-af",
    METER_FORMAT,
    "-f",
    "s16le",
    "pipe:1",
  ];
}

export interface CameraCapture {
  device: string;
  mode?: CameraChoice;
  /** Frame rate written (the mode's when it is lower). */
  fps: number;
  encoder: Pick<CaptureEncoder, "codec">;
  quality?: CaptureQuality;
  file: string;
}

/** The webcam in its chosen mode, at a constant frame rate, with the screen's encoder. */
export function cameraArgs(o: CameraCapture): string[] {
  const fps = o.mode ? Math.min(o.fps, o.mode.fps) : o.fps;
  const size = o.mode
    ? { width: o.mode.width, height: o.mode.height }
    : { width: 1280, height: 720 };
  return [
    ...REPORT,
    "-f",
    "dshow",
    "-rtbufsize",
    "512M",
    ...(o.mode ? cameraInputArgs(o.mode) : []),
    "-i",
    `video=${o.device}`,
    "-map",
    "0:v",
    "-fps_mode",
    "cfr",
    "-r",
    String(fps),
    ...captureVideoArgs(o.encoder.codec, { fps, ...size }, o.quality),
    "-pix_fmt",
    softwarePixelFormat(o.encoder.codec),
    ...fragmented(o.file),
  ];
}

export interface PageCapture {
  width: number;
  height: number;
  fps: number;
  codec: CaptureCodec;
  quality?: CaptureQuality;
  file: string;
}

/**
 * The lesson page of a guided take (main/guidedCapture.ts): BGRA frames on stdin, one per tick
 * of the video's clock, so the frame count is the video's time. The frames are in system memory,
 * so they take the CPU path of the detected encoder: swscale writes BT.709 limited range and the
 * file is tagged so.
 */
export function pageCaptureArgs(o: PageCapture): string[] {
  return [
    ...REPORT,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "bgra",
    "-video_size",
    `${o.width}x${o.height}`,
    "-framerate",
    String(o.fps),
    "-i",
    "pipe:0",
    "-vf",
    `scale=out_color_matrix=bt709:out_range=tv,format=${softwarePixelFormat(o.codec)}`,
    ...captureVideoArgs(o.codec, { fps: o.fps, width: o.width, height: o.height }, o.quality),
    ...colorTags({ matrix: "bt709", range: "tv" }),
    ...fragmented(o.file),
  ];
}

/** Lists a dshow device's modes (parsed by shared/camera.ts parseDshowOptions). */
export const cameraOptionsArgs = (device: string): string[] => [
  "-hide_banner",
  "-nostdin",
  "-list_options",
  "true",
  "-f",
  "dshow",
  "-i",
  `video=${device}`,
];
