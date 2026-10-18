import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { copyFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { app } from "electron";
import {
  type CameraChoice,
  type CameraMode,
  chooseCameraMode,
  parseDshowOptions,
} from "../shared/camera.ts";
import { cameraOptionsArgs, METER_RATE, microphoneMeterArgs } from "../shared/captureArgs.ts";
import {
  type CaptureEncoder,
  type CaptureProfile,
  captureEncoderLabel,
} from "../shared/encoderChoice.ts";
import { duplicationOutput } from "../shared/helperProtocol.ts";
import type {
  CaptureMonitor,
  CaptureSources,
  MarkerKind,
  OrphanTake,
  RecorderEvent,
  RecorderStatus,
  RecordingResult,
  RecordOptions,
} from "../shared/recording.ts";
import { type MicLevel, pcmLevels, type RecorderHealth } from "../shared/recordingHealth.ts";
import { detectCaptureEncoder, reportCaptureFailure } from "./encoders.ts";
import { FFMPEG } from "./ffmpeg.ts";
import { HookClient, listDisplays } from "./nativeHelper.ts";
import {
  isOrphan as orphanIn,
  recoverOrphan as recoverTake,
  scanOrphans,
} from "./recording/recovery.ts";
import { RecordingSession } from "./recording/session.ts";

/**
 * The recorder as the rest of the app sees it: one take at a time, prepared, started, paused,
 * stopped. The take itself lives in main/recording (session, sources, journal, health,
 * finalization and recovery); this module keeps the current one and passes its status, events
 * and health to whoever subscribed (the recorder window).
 */

export type RecorderMessage =
  | { type: "status"; status: RecorderStatus }
  | { type: "event"; event: RecorderEvent }
  | { type: "health"; health: RecorderHealth };

const listeners = new Set<(message: RecorderMessage) => void>();
let session: RecordingSession | null = null;
let preparing: Promise<void> | null = null;

const NO_SESSION: RecorderStatus = { phase: null, failed: [], reopening: false };

function broadcast(message: RecorderMessage): void {
  for (const listener of listeners) listener(message);
}

/** Status, events and health of every take from now on. */
export function subscribe(listener: (message: RecorderMessage) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const isRecording = (): boolean => !!session;
export const status = (): RecorderStatus => session?.status() ?? NO_SESSION;
/** Folder of the take being recorded, if any. */
export const activeDir = (): string | undefined => session?.dir;

async function listDevices(): Promise<{ microphones: string[]; cameras: string[] }> {
  const text = await ffmpegListing([
    "-hide_banner",
    "-list_devices",
    "true",
    "-f",
    "dshow",
    "-i",
    "dummy",
  ]);
  const microphones: string[] = [];
  const cameras: string[] = [];
  for (const m of text.matchAll(/"([^"]+)" \((audio|video)\)/g))
    (m[2] === "audio" ? microphones : cameras).push(m[1]);
  return { microphones, cameras };
}

/** FFmpeg's listings go to stderr and end with an error exit; only the text matters. */
function ffmpegListing(args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const c = spawn(FFMPEG, args, { windowsHide: true });
    let err = "";
    c.stderr.on("data", (d: Buffer) => (err += d.toString()));
    c.on("error", reject);
    c.on("close", () => resolve(err));
  });
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

/** Webcam modes and the one the recorder would pick (shared/camera.ts). */
export async function cameraModes(
  device: string,
  fps = 30,
): Promise<{ modes: CameraMode[]; choice: CameraChoice | null }> {
  const modes = parseDshowOptions(await ffmpegListing(cameraOptionsArgs(device)));
  return { modes, choice: chooseCameraMode(modes, fps) };
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

/**
 * What the encoder is chosen for: the whole monitor (a region is never larger) at the recording's
 * frame rate. The recorder window detects it in the background with the same profile.
 */
export const captureProfile = (monitor: CaptureMonitor, fps: number): CaptureProfile => ({
  output: monitor.output,
  width: monitor.width,
  height: monitor.height,
  fps,
});

/** The encoder this screen will be recorded with, detected once and then remembered. */
export async function encoderFor(monitor: CaptureMonitor, fps: number): Promise<string> {
  if (monitor.output < 0) throw new Error("Não consegui capturar esta tela.");
  return captureEncoderLabel(await detectCaptureEncoder(captureProfile(monitor, fps)));
}

// ---- level meter while the recorder is being set up ----------------------------------------

let meter: ReturnType<typeof spawn> | null = null;

/**
 * Measures `device` (the very dshow device the take will record) until another one is chosen,
 * the take is prepared or `null` comes in.
 */
export function monitorMic(device: string | null, onLevel: (level: MicLevel) => void): void {
  stopMicMonitor();
  if (!device || session) return;
  const child = spawn(FFMPEG, microphoneMeterArgs(device), { windowsHide: true });
  meter = child;
  const block = (METER_RATE * 2) / 10;
  let pending: Buffer[] = [];
  let size = 0;
  let err = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    pending.push(chunk);
    size += chunk.length;
    if (size < block) return;
    onLevel(pcmLevels(Buffer.concat(pending)));
    pending = [];
    size = 0;
  });
  child.stderr?.on("data", (d: Buffer) => {
    err = (err + d.toString()).slice(-2000);
  });
  child.on("error", (error) => onLevel({ peak: 0, rms: 0, error: error.message }));
  child.on("close", (code) => {
    if (meter !== child) return;
    meter = null;
    if (code !== 0)
      onLevel({ peak: 0, rms: 0, error: err.trim().split("\n").at(-1) || `código ${code}` });
  });
}

export function stopMicMonitor(): void {
  const child = meter;
  meter = null;
  child?.kill();
}

// ---- the take ------------------------------------------------------------------------------

export interface PrepareContext {
  /** Windows of this process whose keys still show on screen (the guided lesson window). */
  keyWindows?: string[];
  /** Keys the helper never shows (the recorder's own shortcuts), shared/hotkeys.ts. */
  keyFilter?: { vk: number; m: number }[];
}

/** Starts the cursor helper and settles the encoder ahead of time. */
export function prepare(
  opts: RecordOptions,
  monitors: CaptureMonitor[],
  context: PrepareContext = {},
): Promise<void> {
  if (session) return Promise.resolve();
  // Claimed before waiting, so a second prepare does not start another helper.
  preparing ??= prepareTake(opts, monitors, context).finally(() => {
    preparing = null;
  });
  return preparing;
}

async function prepareTake(
  opts: RecordOptions,
  monitors: CaptureMonitor[],
  context: PrepareContext,
): Promise<void> {
  stopMicMonitor();
  const monitor =
    opts.monitor === undefined ? null : (monitors.find((m) => m.index === opts.monitor) ?? null);
  if (opts.monitor !== undefined && (!monitor || monitor.output < 0))
    throw new Error("Não consegui capturar esta tela.");
  if (!monitor && !opts.microphone) throw new Error("Escolha a tela ou um microfone para gravar.");
  const dir = mkdtempSync(join(recordingsDir(), `${stamp()}-`));
  // Keys typed while the recorder itself is in front are not part of the lesson. Until the take
  // starts, the helper keeps nothing but the cursor shape.
  const hook = monitor
    ? new HookClient({ keys: !!opts.keys, journal: dir, uiPid: process.pid, paused: true })
    : null;
  let encoder: CaptureEncoder | null = null;
  try {
    const [, detected] = await Promise.all([
      hook?.start(),
      monitor ? detectCaptureEncoder(captureProfile(monitor, opts.fps)) : null,
    ]);
    encoder = detected;
  } catch (error) {
    await hook?.kill();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  const s = new RecordingSession({
    opts,
    monitor,
    dir,
    ffmpeg: FFMPEG,
    encoder,
    hook,
    reportEncoderFailure: (failed) =>
      monitor ? reportCaptureFailure(captureProfile(monitor, opts.fps), failed) : Promise.resolve(),
  });
  s.on("status", (st) => broadcast({ type: "status", status: st }));
  s.on("event", (event) => broadcast({ type: "event", event }));
  s.on("health", (health) => broadcast({ type: "health", health }));
  s.setKeyFilter(context.keyFilter ?? [], context.keyWindows ?? []);
  session = s;
  broadcast({ type: "status", status: s.status() });
}

export async function start(): Promise<void> {
  const s = session;
  if (!s || s.isPreserved) throw new Error("Gravação não preparada ou já preservada.");
  await s.start();
}

export async function pause(): Promise<void> {
  await session?.pause();
}

/** Goes on after a pause, reopening whatever stopped (a source that failed, a long pause). */
export async function resume(): Promise<void> {
  await session?.resume();
}

/** Stop acquiring now; keep the session for the computer's sound and the finalization. */
export async function preserve(): Promise<void> {
  await session?.preserve();
}

export function mark(kind: MarkerKind): void {
  session?.mark(kind);
}

/** Seconds recorded so far, without the pauses. */
export function elapsed(): number {
  return session?.elapsed() ?? 0;
}

export function systemChunk(bytes: Uint8Array, startedAt?: number, endedAt?: number): void {
  if (!session) throw new Error("Nenhuma gravação em andamento.");
  session.systemChunk(bytes, startedAt, endedAt);
}

export function uiRects(rects: { x: number; y: number; w: number; h: number }[]): void {
  session?.uiRects(rects);
}

export function teleprompterLine(index: number): void {
  session?.teleprompterLine(index);
}

export function setKeyFilter(block: { vk: number; m: number }[], allow: string[]): void {
  session?.setKeyFilter(block, allow);
}

export async function setGuidedNarration(path: string, delay: number): Promise<number> {
  const s = session;
  if (!s) throw new Error("Gravação não iniciada.");
  const file = `narracao${extname(path)}`;
  await copyFile(path, join(s.dir, file));
  if (session !== s) throw new Error("Gravação encerrada.");
  const offset = s.elapsed() + delay;
  s.setNarration(file, offset);
  return offset;
}

/** Ends the take without keeping it; a take preserved by the license is saved instead. */
export async function cancel(): Promise<void> {
  const s = session;
  if (!s) return;
  if (s.isPreserved) {
    await stop();
    return;
  }
  session = null;
  await s.cancel();
  broadcast({ type: "status", status: NO_SESSION });
}

/** Throws the current take away (to the Recycle Bin through `trash`) and stays in the recorder. */
export async function discard(trash: (dir: string) => Promise<void>): Promise<void> {
  const s = session;
  if (!s) return;
  session = null;
  await s.cancel(trash);
  broadcast({ type: "status", status: NO_SESSION });
}

export async function stop(): Promise<RecordingResult> {
  const s = session;
  if (!s) throw new Error("Nenhuma gravação em andamento.");
  try {
    return await s.stop();
  } finally {
    if (session === s) session = null;
    broadcast({ type: "status", status: NO_SESSION });
  }
}

// ---- takes the app did not finish -----------------------------------------------------------

export const orphans = (): Promise<OrphanTake[]> => scanOrphans(recordingsDir(), session?.dir);

export const isOrphan = (dir: string): Promise<boolean> =>
  orphanIn(recordingsDir(), dir, session?.dir);

export async function recoverOrphan(dir: string): Promise<RecordingResult> {
  if (!(await isOrphan(dir))) throw new Error("Essa pasta não é uma gravação interrompida.");
  return recoverTake(dir);
}
