import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { copyFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { type CaptureSegment, cursorDataFromEvents } from "../shared/cursorCapture.ts";
import {
  type CaptureEncoder,
  captureFilter,
  captureVideoArgs,
  softwarePixelFormat,
} from "../shared/encoderChoice.ts";
import { duplicationOutput, type HookEvent } from "../shared/helperProtocol.ts";
import {
  type CaptureMonitor,
  type CaptureSources,
  type MarkerKind,
  RECORDER_HOTKEYS,
  type RecordingResult,
  type RecordOptions,
} from "../shared/recording.ts";
import { detectCaptureEncoder } from "./encoders.ts";
import { FFMPEG, probe, run, writeFilterScript } from "./ffmpeg.ts";
import { HookClient, listDisplays, qpc } from "./nativeHelper.ts";

/**
 * Screen recording: the monitor (or a region of it) through Desktop Duplication without the
 * mouse pointer, the microphone and optionally the webcam in the same ffmpeg process, plus the
 * native helper logging every mouse move and click on the same clock. Pausing closes a segment;
 * stopping joins the segments and writes the cursor data in video time.
 */

async function listDevices(): Promise<{ microphones: string[]; cameras: string[] }> {
  const text = await new Promise<string>((resolve) => {
    const c = spawn(
      FFMPEG,
      ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
      { windowsHide: true },
    );
    let err = "";
    c.stderr.on("data", (d: Buffer) => (err += d.toString()));
    c.on("close", () => resolve(err));
  });
  const microphones: string[] = [];
  const cameras: string[] = [];
  for (const m of text.matchAll(/"([^"]+)" \((audio|video)\)/g))
    (m[2] === "audio" ? microphones : cameras).push(m[1]);
  return { microphones, cameras };
}

export async function captureSources(): Promise<CaptureSources> {
  const [list, devices] = await Promise.all([listDisplays(), listDevices()]);
  const monitors = list.monitors.map((m, i) => ({
    index: m.index,
    x: m.x,
    y: m.y,
    width: m.w,
    height: m.h,
    primary: m.primary,
    // Matched by device name: Windows and DXGI may list the monitors in different orders.
    output: duplicationOutput(list, m),
    label: `${m.primary ? "Tela principal" : `Tela ${i + 1}`} · ${m.w}×${m.h}`,
  }));
  return { monitors, ...devices };
}

interface Segment extends CaptureSegment {
  screen: string;
  camera?: string;
}

interface Session {
  preserved?: boolean;
  starting?: Promise<void>;
  closing?: Promise<void>;
  failure?: unknown;
  narration?: { path: string; offset: number };
  opts: RecordOptions;
  monitor: CaptureMonitor;
  dir: string;
  hook: HookClient;
  /** Settled while preparing; recording starts only after that. */
  encoder?: CaptureEncoder;
  /** Helper events (heartbeats aside); the complete journal is cursor.jsonl in `dir`. */
  events: HookEvent[];
  /** Restarts and failures of the cursor helper, for the recording health panel. */
  hookIssues: string[];
  segments: Segment[];
  current: {
    proc: ChildProcessWithoutNullStreams;
    seg: Segment;
    firstFrame: Promise<void>;
    done: Promise<void>;
  } | null;
  markers: { qpc: number; kind: MarkerKind }[];
  system?: { path: string; offset: number };
}

let session: Session | null = null;

export const isRecording = (): boolean => !!session;

export async function setGuidedNarration(path: string, delay: number): Promise<number> {
  const s = session;
  if (!s) throw new Error("Gravação não iniciada.");
  const { extname } = await import("node:path");
  const dest = join(s.dir, `narracao${extname(path)}`);
  await copyFile(path, dest);
  if (session !== s) throw new Error("Gravação encerrada.");
  const offset = elapsed() + delay;
  s.narration = { path: dest, offset };
  return offset;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

export function recordingsDir(): string {
  const dir = join(app.getPath("documents"), "EdiAula", "Gravações");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Starts the cursor helper and settles the encoder ahead of time. */
export async function prepare(
  opts: RecordOptions,
  monitors: CaptureMonitor[],
  /** Windows of this process whose keys still show on screen (the guided lesson window). */
  keyWindows: string[] = [],
): Promise<void> {
  if (session) return;
  const monitor = monitors.find((m) => m.index === opts.monitor);
  if (!monitor || monitor.output < 0) throw new Error("Não consegui capturar esta tela.");
  const dir = mkdtempSync(join(recordingsDir(), `${stamp()}-`));
  // Keys typed while the recorder itself is in front are not part of the lesson.
  const hook = new HookClient({ keys: !!opts.keys, journal: dir, uiPid: process.pid });
  const events: HookEvent[] = [];
  const hookIssues: string[] = [];
  hook.on("event", (event) => {
    if (event.e !== "hb" && event.e !== "ack") events.push(event);
  });
  hook.on("restart", ({ reason }) => hookIssues.push(reason));
  hook.on("failure", (error) => hookIssues.push(error.message));
  const s: Session = {
    opts,
    monitor,
    dir,
    hook,
    events,
    hookIssues,
    segments: [],
    current: null,
    markers: [],
  };
  // Claimed before waiting, so a second prepare does not start another helper.
  session = s;
  try {
    [, s.encoder] = await Promise.all([hook.start(), detectCaptureEncoder()]);
  } catch (error) {
    await hook.kill();
    if (session === s) session = null;
    throw error;
  }
  hook.send({
    cmd: "keys",
    block: RECORDER_HOTKEYS.map((k) => ({ vk: k.vk, m: k.mods })),
    allow: keyWindows,
  });
}

async function startSegment(s: Session): Promise<void> {
  const { opts, monitor, encoder } = s;
  if (!encoder) throw new Error("Gravação não preparada.");
  const n = s.segments.length + (s.current ? 1 : 0);
  const r = opts.region;
  const frame = {
    fps: opts.fps,
    width: r?.width ?? monitor.width,
    height: r?.height ?? monitor.height,
  };
  const video = captureVideoArgs(encoder.codec, frame);
  const screen = captureFilter(encoder);
  const grab = [
    `output_idx=${monitor.output}`,
    `framerate=${opts.fps}`,
    "draw_mouse=0",
    ...(r ? [`offset_x=${r.x}`, `offset_y=${r.y}`, `video_size=${r.width}x${r.height}`] : []),
  ].join(":");
  const seg: Segment = {
    start: 0,
    duration: 0,
    screen: join(s.dir, `tela-${n}.mp4`),
    camera: opts.camera ? join(s.dir, `camera-${n}.mp4`) : undefined,
  };
  const args = [
    "-hide_banner",
    "-y",
    "-v",
    "error",
    "-stats_period",
    "0.05",
    "-progress",
    "pipe:2",
    "-f",
    "lavfi",
    "-i",
    `ddagrab=${grab}`,
  ];
  let input = 1;
  let micIn = -1;
  let camIn = -1;
  if (opts.microphone) {
    args.push("-f", "dshow", "-audio_buffer_size", "50", "-i", `audio=${opts.microphone}`);
    micIn = input++;
  }
  if (opts.camera) {
    args.push(
      "-f",
      "dshow",
      "-rtbufsize",
      "512M",
      "-video_size",
      "1280x720",
      "-framerate",
      "30",
      "-i",
      `video=${opts.camera}`,
    );
    camIn = input++;
  }
  args.push(
    "-map",
    "0:v",
    ...(screen.filter ? ["-vf", screen.filter] : []),
    ...video,
    ...screen.output,
  );
  if (micIn >= 0) args.push("-map", `${micIn}:a`, "-c:a", "aac", "-b:a", "192k", "-ar", "48000");
  // Fragments remain readable if recording is interrupted before normal finalization.
  args.push("-movflags", "+frag_keyframe+empty_moov", seg.screen);
  if (camIn >= 0)
    args.push(
      "-map",
      `${camIn}:v`,
      ...captureVideoArgs(encoder.codec, { fps: 30, width: 1280, height: 720 }),
      "-pix_fmt",
      softwarePixelFormat(encoder.codec),
      "-movflags",
      "+frag_keyframe+empty_moov",
      seg.camera!,
    );

  const proc = spawn(FFMPEG, args, { windowsHide: true });
  let err = "";
  let best = Infinity;
  let progressBlocks = 0;
  let resolveFirst: () => void = () => undefined;
  let rejectFirst: (error: Error) => void = () => undefined;
  const firstFrame = new Promise<void>((resolve, reject) => {
    resolveFirst = resolve;
    rejectFirst = reject;
  });
  proc.stderr.on("data", (d: Buffer) => {
    const text = d.toString();
    err = (err + text).slice(-4000);
    // The first frame happened out_time ago; delays only make this estimate later, so keep the earliest.
    for (const m of text.matchAll(/out_time_us=(\d+)/g)) {
      const us = Number(m[1]);
      if (us <= 0) continue;
      best = Math.min(best, qpc() - us / 1000);
      seg.start = best;
      if (++progressBlocks === 1) resolveFirst();
    }
  });
  const done = new Promise<void>((resolve, reject) => {
    const fail = (error: Error): void => {
      rejectFirst(error);
      reject(error);
    };
    proc.on("error", fail);
    proc.on("close", (code) => {
      if (code === 0 || code === 255) {
        resolveFirst();
        resolve();
      } else
        fail(
          new Error(
            err
              .split("\n")
              .filter((l) => l && !/^\w+=/.test(l))
              .slice(-4)
              .join("\n") || `ffmpeg saiu com código ${code}`,
          ),
        );
    });
  });
  // Observe background failure immediately; stopping/resuming reports it to the caller.
  void done.catch((error: unknown) => {
    s.failure = error;
  });
  s.current = { proc, seg, firstFrame, done };
  await Promise.race([firstFrame, done]);
}

async function closeSegment(s: Session): Promise<void> {
  await s.starting;
  if (s.closing) return s.closing;
  const cur = s.current;
  if (!cur) return;
  s.closing = (async () => {
    cur.proc.stdin.write("q");
    await cur.done;
    cur.seg.duration = (await probe(cur.seg.screen)).duration;
    s.segments.push(cur.seg);
    s.current = null;
  })();
  try {
    await s.closing;
  } finally {
    s.closing = undefined;
  }
}

export async function start(): Promise<void> {
  const s = session;
  if (!s || s.preserved) throw new Error("Gravação não preparada ou já preservada.");
  if (s.failure) throw s.failure;
  if (s.current || s.starting) throw new Error("Gravação já iniciada.");
  s.starting = startSegment(s);
  try {
    await s.starting;
  } finally {
    s.starting = undefined;
  }
}

export async function pause(): Promise<void> {
  if (session?.current) await closeSegment(session);
}

export async function resume(): Promise<void> {
  if (session && !session.current) await start();
}

/** Stop acquiring frames now; keep the session for audio delivery and finalization. */
export async function preserve(): Promise<void> {
  const s = session;
  if (!s) return;
  s.preserved = true;
  await closeSegment(s);
  await s.hook.stop();
}

export function mark(kind: MarkerKind): void {
  session?.markers.push({ qpc: qpc(), kind });
}

/** Seconds recorded so far. */
export function elapsed(): number {
  if (!session) return 0;
  const done = session.segments.reduce((s, g) => s + g.duration, 0);
  const cur = session.current?.seg.start
    ? Math.max(0, qpc() - session.current.seg.start) / 1000
    : 0;
  return done + cur;
}

export async function cancel(): Promise<void> {
  const s = session;
  if (s?.preserved) {
    await stop();
    return;
  }
  session = null;
  if (!s) return;
  // The helper must let go of the journal before the folder is removed.
  await s.hook.kill();
  if (s.current) {
    s.current.proc.kill("SIGKILL");
    await s.current.done.catch(() => undefined);
  }
  await rm(s.dir, { recursive: true, force: true }).catch(() => undefined);
}

async function concat(files: string[], out: string): Promise<void> {
  if (files.length === 1) {
    const { rename } = await import("node:fs/promises");
    await rename(files[0], out);
    return;
  }
  const list = await writeFilterScript(
    files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"),
  );
  await run(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    out,
  ]);
  for (const f of files) await rm(f, { force: true });
}

/**
 * The computer's sound, recorded by the recorder window (Chromium loopback) while the screen was
 * captured; `startedAt` is its Date.now() at the first sample, used to line it up with the video.
 */
export async function saveSystemAudio(bytes: Uint8Array, startedAt: number): Promise<void> {
  const s = session;
  const first = s?.segments[0] ?? s?.current?.seg;
  if (!s || !first?.start) return;
  // Wall-clock time of the first video frame, from the shared high-resolution clock.
  const videoEpoch = Date.now() - (qpc() - first.start);
  // MediaRecorder WebM has no duration in its header: remux the sound into a regular M4A.
  const raw = join(s.dir, "sistema.raw.webm");
  const path = join(s.dir, "sistema.m4a");
  await writeFile(raw, bytes);
  await run(FFMPEG, ["-y", "-v", "error", "-i", raw, "-c:a", "aac", "-b:a", "192k", path]);
  await rm(raw, { force: true });
  s.system = { path, offset: (startedAt - videoEpoch) / 1000 };
}

export async function stop(): Promise<RecordingResult> {
  const s = session;
  if (!s) throw new Error("Nenhuma gravação em andamento.");
  s.preserved = true;
  try {
    return await finalizeRecording(s);
  } catch (error) {
    await s.hook.stop();
    session = null;
    throw new Error(
      `Não foi possível finalizar a gravação. Os arquivos foram mantidos em ${s.dir}.`,
      { cause: error },
    );
  }
}

async function finalizeRecording(s: Session): Promise<RecordingResult> {
  await closeSegment(s);
  session = null;
  // Closing stdin lets the helper write its last events and the journal before it exits.
  await s.hook.stop();
  if (!s.segments.length) throw new Error("Nada foi gravado.");

  const screen = join(s.dir, "tela.mp4");
  await concat(
    s.segments.map((g) => g.screen),
    screen,
  );
  let camera: string | undefined;
  if (s.opts.camera) {
    camera = join(s.dir, "camera.mp4");
    await concat(
      s.segments.map((g) => g.camera!),
      camera,
    );
  }

  // Cursor events in video time and video pixels.
  const r = s.opts.region ?? { x: 0, y: 0, width: s.monitor.width, height: s.monitor.height };
  const data = cursorDataFromEvents(
    s.events,
    s.segments,
    { x: s.monitor.x + r.x, y: s.monitor.y + r.y, width: r.width, height: r.height },
    s.markers,
  );
  const cursor = join(s.dir, "cursor.json");
  await writeFile(cursor, JSON.stringify(data));
  return {
    dir: s.dir,
    ...(s.narration ? { narration: s.narration.path, narrationOffset: s.narration.offset } : {}),
    screen,
    camera,
    cursor,
    duration: s.segments.reduce((a, g) => a + g.duration, 0),
    markers: data.markers,
    ...(s.system ? { systemAudio: s.system.path, systemOffset: s.system.offset } : {}),
  };
}
