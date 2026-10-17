import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { copyFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import {
  type CaptureMonitor,
  type CaptureSources,
  CURSOR_SHAPES,
  type CursorData,
  keyLabel,
  type MarkerKind,
  type RecordingResult,
  type RecordOptions,
} from "../shared/recording.ts";
import { detectEncoder, FFMPEG, probe, run, writeFilterScript } from "./ffmpeg.ts";

/**
 * Screen recording: the monitor (or a region of it) through Desktop Duplication without the
 * mouse pointer, the microphone and optionally the webcam in the same ffmpeg process, plus a
 * helper that logs every mouse move and click on the same clock. Pausing closes a segment;
 * stopping joins the segments and writes the cursor data in video time.
 */

const qpc = (): number => Number(process.hrtime.bigint()) / 1e6;
const hookScript = (): string => join(app.getAppPath(), "resources", "cursor-hook.ps1");

function spawnHook(list = false, keys = false): ChildProcessWithoutNullStreams {
  return spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      hookScript(),
      ...(list ? ["-List"] : []),
      ...(keys ? ["-Keys"] : []),
    ],
    { windowsHide: true },
  );
}

async function listMonitors(): Promise<Omit<CaptureMonitor, "output" | "label">[]> {
  const child = spawnHook(true);
  let out = "";
  child.stdout.on("data", (d: Buffer) => (out += d.toString()));
  await new Promise((r) => child.on("close", r));
  return out
    .split("\n")
    .filter((l) => l.startsWith("MON "))
    .map((l, index) => {
      const [x, y, width, height, primary] = l.trim().split(" ").slice(1).map(Number);
      return { index, x, y, width, height, primary: primary === 1 };
    });
}

/** Size of each Desktop Duplication output, to know which one shows which monitor. */
let outputs: { width: number; height: number }[] | null = null;
async function duplicationOutputs(count: number): Promise<{ width: number; height: number }[]> {
  if (outputs) return outputs;
  const found: { width: number; height: number }[] = [];
  for (let i = 0; i < count + 1; i++) {
    const text = await new Promise<string>((resolve) => {
      const c = spawn(
        FFMPEG,
        [
          "-hide_banner",
          "-f",
          "lavfi",
          "-i",
          `ddagrab=output_idx=${i}:framerate=5`,
          "-frames:v",
          "1",
          "-f",
          "null",
          "-",
        ],
        { windowsHide: true },
      );
      let err = "";
      c.stderr.on("data", (d: Buffer) => (err += d.toString()));
      c.on("close", () => resolve(err));
    });
    const m = /Stream #0:0.*?, (\d+)x(\d+)/.exec(text);
    if (!m) break;
    found.push({ width: Number(m[1]), height: Number(m[2]) });
  }
  outputs = found;
  return found;
}

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
  const [mons, devices] = await Promise.all([listMonitors(), listDevices()]);
  const outs = await duplicationOutputs(mons.length);
  const used = new Set<number>();
  const monitors = mons.map((m, i) => {
    // Outputs and monitors usually come in the same order; match by size to be sure.
    let output = outs.findIndex(
      (o, j) => !used.has(j) && j === i && o.width === m.width && o.height === m.height,
    );
    if (output < 0)
      output = outs.findIndex(
        (o, j) => !used.has(j) && o.width === m.width && o.height === m.height,
      );
    if (output >= 0) used.add(output);
    return {
      ...m,
      output,
      label: `${m.primary ? "Tela principal" : `Tela ${i + 1}`} · ${m.width}×${m.height}`,
    };
  });
  return { monitors, ...devices };
}

interface Segment {
  /** QPC ms of the first frame. */
  start: number;
  duration: number;
  screen: string;
  camera?: string;
}

interface Session {
  narration?: { path: string; offset: number };
  opts: RecordOptions;
  monitor: CaptureMonitor;
  dir: string;
  hook: ChildProcessWithoutNullStreams;
  events: string[];
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

/** Starts the mouse helper ahead of time (it takes a second to load). */
export async function prepare(opts: RecordOptions, monitors: CaptureMonitor[]): Promise<void> {
  if (session) return;
  const monitor = monitors.find((m) => m.index === opts.monitor);
  if (!monitor || monitor.output < 0) throw new Error("Não consegui capturar esta tela.");
  const dir = join(recordingsDir(), stamp());
  mkdirSync(dir, { recursive: true });
  const hook = spawnHook(false, !!opts.keys);
  const events: string[] = [];
  let buf = "";
  const ready = new Promise<void>((resolve, reject) => {
    hook.stdout.on("data", (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop()!;
      for (const l of lines) {
        if (l.startsWith("READY")) resolve();
        else if (/^[MDUWK] /.test(l)) events.push(l.trim());
      }
    });
    hook.on("error", reject);
    setTimeout(() => resolve(), 8000);
  });
  session = { opts, monitor, dir, hook, events, segments: [], current: null, markers: [] };
  await ready;
}

async function startSegment(s: Session): Promise<void> {
  const { opts, monitor } = s;
  const n = s.segments.length + (s.current ? 1 : 0);
  const enc = await detectEncoder();
  const video =
    enc === "nvenc"
      ? [
          "-c:v",
          "h264_nvenc",
          "-preset",
          "p4",
          "-rc",
          "vbr",
          "-cq",
          "18",
          "-g",
          String(opts.fps * 2),
        ]
      : ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-g", String(opts.fps * 2)];
  const r = opts.region;
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
  args.push("-map", "0:v", "-vf", "hwdownload,format=bgra", ...video, "-pix_fmt", "yuv420p");
  if (micIn >= 0) args.push("-map", `${micIn}:a`, "-c:a", "aac", "-b:a", "192k", "-ar", "48000");
  args.push(seg.screen);
  if (camIn >= 0) args.push("-map", `${camIn}:v`, ...video, "-pix_fmt", "yuv420p", seg.camera!);

  const proc = spawn(FFMPEG, args, { windowsHide: true });
  let err = "";
  let best = Infinity;
  let progressBlocks = 0;
  let resolveFirst: () => void = () => undefined;
  const firstFrame = new Promise<void>((r) => (resolveFirst = r));
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
    proc.on("close", (code) => {
      resolveFirst();
      if (code === 0 || code === 255) resolve();
      else
        reject(
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
  s.current = { proc, seg, firstFrame, done };
  await Promise.race([firstFrame, done]);
}

async function closeSegment(s: Session): Promise<void> {
  const cur = s.current;
  if (!cur) return;
  s.current = null;
  cur.proc.stdin.write("q");
  await cur.done;
  cur.seg.duration = (await probe(cur.seg.screen)).duration;
  s.segments.push(cur.seg);
}

export async function start(): Promise<void> {
  if (!session) throw new Error("Gravação não preparada.");
  await startSegment(session);
}

export async function pause(): Promise<void> {
  if (session?.current) await closeSegment(session);
}

export async function resume(): Promise<void> {
  if (session && !session.current) await startSegment(session);
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
  session = null;
  if (!s) return;
  s.hook.kill();
  if (s.current) {
    s.current.proc.kill("SIGKILL");
    await s.current.done.catch(() => undefined);
  }
  await rm(s.dir, { recursive: true, force: true }).catch(() => undefined);
}

/** Maps a QPC time to video seconds across segments; -1 when it fell in a pause. */
function toVideoTime(segments: Segment[], t: number): number {
  let offset = 0;
  for (const g of segments) {
    if (t >= g.start && t <= g.start + g.duration * 1000) return offset + (t - g.start) / 1000;
    offset += g.duration;
  }
  return -1;
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
  await closeSegment(s);
  session = null;
  s.hook.kill();
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
  const ox = s.monitor.x + r.x;
  const oy = s.monitor.y + r.y;
  const data: CursorData = {
    version: 1,
    width: r.width,
    height: r.height,
    moves: [],
    clicks: [],
    wheel: [],
    markers: [],
  };
  const downs = new Map<string, [number, number, number, number, number]>();
  const round = (v: number): number => Math.round(v * 1000) / 1000;
  for (const line of s.events) {
    const [kind, ms, xs, ys, extra] = line.split(" ");
    const t = toVideoTime(s.segments, Number(ms));
    if (t < 0) continue;
    const x = Number(xs) - ox;
    const y = Number(ys) - oy;
    if (kind === "M")
      data.moves.push([
        round(t),
        x,
        y,
        Math.max(0, CURSOR_SHAPES.indexOf(extra as (typeof CURSOR_SHAPES)[number])),
      ]);
    else if (kind === "D") {
      const click: [number, number, number, number, number] = [
        round(t),
        x,
        y,
        extra === "right" ? 1 : extra === "middle" ? 2 : 0,
        0,
      ];
      data.clicks.push(click);
      downs.set(extra, click);
    } else if (kind === "U") {
      const d = downs.get(extra);
      if (d) d[4] = round(t - d[0]);
      downs.delete(extra);
    } else if (kind === "W") data.wheel.push([round(t), x, y, Number(extra)]);
    else if (kind === "K") {
      data.keys ??= [];
      data.keys.push([round(t), keyLabel(Number(xs), ys)]);
    }
  }
  for (const m of s.markers) {
    const t = toVideoTime(s.segments, m.qpc);
    data.markers.push({
      t: round(t < 0 ? s.segments.reduce((a, g) => (g.start < m.qpc ? a + g.duration : a), 0) : t),
      kind: m.kind,
    });
  }
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
