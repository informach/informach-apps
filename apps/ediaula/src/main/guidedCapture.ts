import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { BrowserWindow, type NativeImage } from "electron";
import { pageCaptureArgs } from "../shared/captureArgs.ts";
import {
  type CaptureCodec,
  type CaptureQuality,
  captureEncoderLabel,
} from "../shared/encoderChoice.ts";
import { FrameClock } from "../shared/frameClock.ts";
import { GUIDED_LOG_FILE, type GuidedLogLine } from "../shared/guidedCursor.ts";
import {
  type BrokenStep,
  type GuidedPlanV2,
  type GuidedTakePhase,
  type GuidedTakeStatus,
  narrationOffset,
  type PlanSchedule,
  planTiming,
  schedulePlan,
} from "../shared/guidedPlan.ts";
import {
  FailureStreak,
  type GuidedRunLog,
  GuidedStepError,
  instantClock,
  runGuided,
  STOPPED,
  videoClock,
} from "../shared/guidedRunner.ts";
import type { RecordingResult } from "../shared/recording.ts";
import { CdpDriver, WebDriver } from "./guidedCdp.ts";
import { guardLessonWindow, lessonSession } from "./guidedSession.ts";
import { qpc } from "./nativeHelper.ts";
import { finalizeTake } from "./recording/finalize.ts";
import { SessionJournal } from "./recording/journal.ts";

/**
 * A guided take in the lesson window, captured at a fixed size (D4). An offscreen window in the
 * lesson window's partition (already logged in) renders the page at the plan's viewport and
 * device scale 1; every `paint` replaces the latest picture, and a constant frame clock
 * (shared/frameClock.ts) writes it to FFmpeg as raw BGRA, repeating it while the page does not
 * change. The video's time is the frame count: when the plan waits (a target still loading, a
 * navigation, a condition) the writer holds and records it, so the narration stays exact.
 *
 * The take's folder is a normal take of the recordings folder: sessao.jsonl (one screen part,
 * no monitor), the fragmented MP4 and guided-log.jsonl, so a crash is recovered like any take
 * and finalizing (main/recording/finalize.ts) makes cursor.json and guided-run.json from the log.
 */

export { GUIDED_PARTITION } from "./guidedSession.ts";

export interface GuidedTakeEnd {
  status: "done" | "failed";
  /** Index in the plan of the step that failed, or the last one. */
  step: number;
  message?: string;
}

/** The encoder of a page capture: frames come from system memory, so it takes the CPU path. */
export interface PageEncoder {
  codec: CaptureCodec;
  quality?: CaptureQuality;
}

export interface GuidedTakeOptions {
  plan: GuidedPlanV2;
  /** First step recorded; the ones before it run first, untimed. */
  from: number;
  /** Folder of the take, already created in the recordings folder. */
  dir: string;
  ffmpeg: string;
  encoder: PageEncoder;
  onStatus: (status: GuidedTakeStatus) => void;
}

/** Most frames the encoder may have waiting before the writer holds for it. */
const MAX_PENDING_FRAMES = 4;
/** "Verificar plano" stops after this many failing steps in a row: the rest depends on them. */
export const VERIFY_STREAK = 3;
/** Wall seconds a page has to start showing before the take gives up. */
const LOAD_SECONDS = 30;
const PREVIEW_MS = 200;
const PREVIEW_WIDTH = 480;

/** guided-log.jsonl, a line at a time: on disk every two seconds and at steps, holds and the end. */
class LineLog {
  private fd: number | null;
  private dirty = false;
  private readonly timer: ReturnType<typeof setInterval>;
  error: Error | null = null;

  constructor(path: string) {
    this.fd = openSync(path, "a");
    this.timer = setInterval(() => this.sync(), 2000);
  }

  write(line: GuidedLogLine, durable = false): void {
    if (this.fd === null) return;
    try {
      writeSync(this.fd, `${JSON.stringify(line)}\n`);
      this.dirty = true;
      if (durable) this.sync();
    } catch (cause) {
      this.error ??= cause instanceof Error ? cause : new Error(String(cause));
    }
  }

  sync(): void {
    if (this.fd === null || !this.dirty) return;
    try {
      fsyncSync(this.fd);
      this.dirty = false;
    } catch (cause) {
      this.error ??= cause instanceof Error ? cause : new Error(String(cause));
    }
  }

  close(): void {
    clearInterval(this.timer);
    this.sync();
    if (this.fd !== null) closeSync(this.fd);
    this.fd = null;
  }
}

/** An offscreen window of the lesson at the plan's viewport, with the protocol attached. */
export async function openLessonCapture(
  plan: GuidedPlanV2,
  fps: number,
  onPaint?: (image: NativeImage) => void,
): Promise<{ window: BrowserWindow; cdp: CdpDriver; firstPaint: Promise<void> }> {
  const { width, height } = plan.viewport;
  const window = new BrowserWindow({
    show: false,
    frame: false,
    width,
    height,
    useContentSize: true,
    webPreferences: {
      offscreen: { deviceScaleFactor: 1 },
      session: lessonSession(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  window.setContentSize(width, height);
  const wc = window.webContents;
  wc.setAudioMuted(true);
  wc.setFrameRate(fps);
  guardLessonWindow(window);
  let painted: () => void = () => undefined;
  const firstPaint = new Promise<void>((resolve) => {
    painted = resolve;
  });
  wc.on("paint", (_event, _dirty, image) => {
    painted();
    onPaint?.(image);
  });
  const cdp = new CdpDriver(wc);
  try {
    // The protocol answers once the window has a page; a blank one is enough.
    await wc.loadURL("about:blank");
    await cdp.attach();
    await cdp.emulate(plan.viewport);
  } catch (error) {
    cdp.detach();
    window.destroy();
    throw error;
  }
  return { window, cdp, firstPaint };
}

/** Rejects when the run is stopped. */
const aborted = (signal: AbortSignal): Promise<never> =>
  new Promise((_resolve, reject) => {
    if (signal.aborted) reject(new Error(STOPPED));
    else signal.addEventListener("abort", () => reject(new Error(STOPPED)), { once: true });
  });

/** Rejects with `message` after `ms`; `cancel` lets it go. */
function deadline(ms: number, message: string): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  promise.catch(() => undefined);
  return { promise, cancel: () => clearTimeout(timer) };
}

/**
 * Loads the plan's page and waits for its first picture. A page that keeps something loading
 * forever (a picture, a stream) counts once its document is ready; a redirect is followed; a
 * stop or the deadline ends the wait at once.
 */
export async function loadLesson(
  window: BrowserWindow,
  url: string,
  firstPaint: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  const wc = window.webContents;
  // A load still under way (a picture that never came) would answer for this one.
  if (wc.isLoading()) {
    const settled = new Promise<void>((resolve) => {
      wc.once("did-stop-loading", () => resolve());
      setTimeout(resolve, 2000);
    });
    wc.stop();
    await settled;
  }
  const stop = aborted(signal);
  // Raced below; a stop after the page opened is nobody's error.
  stop.catch(() => undefined);
  let failure: Error | null = null;
  const failed = (
    _event: Electron.Event,
    code: number,
    description: string,
    _url: string,
    main: boolean,
  ) => {
    // -3 is a navigation replaced by another one (a redirect), not a failure.
    if (main && code !== -3)
      failure = new Error(
        `Não consegui abrir a página da aula (${description}). Confira o endereço e a conexão.`,
      );
  };
  wc.on("did-fail-load", failed);
  const ready = new Promise<void>((resolve) => {
    wc.once("dom-ready", () => resolve());
    wc.once("did-stop-loading", () => resolve());
  });
  // A failed load also comes as did-fail-load, which says why; a redirect rejects it (-3) and
  // the next document goes on loading.
  const loading = wc.loadURL(url).catch(() => undefined);
  const limit = deadline(
    LOAD_SECONDS * 1000,
    `A página da aula não abriu em ${LOAD_SECONDS} s. Confira o endereço e a conexão.`,
  );
  try {
    await Promise.race([Promise.race([ready, loading]), stop, limit.promise]);
    // A failure reported with the error page's own events.
    await new Promise((resolve) => setImmediate(resolve));
    if (failure) throw failure;
    await Promise.race([firstPaint, stop, limit.promise]);
  } finally {
    limit.cancel();
    wc.removeListener("did-fail-load", failed);
  }
}

/** Codecs already seen to take this size and rate from system memory. */
const working = new Map<string, Promise<boolean>>();

/** Three black frames through the real command line, the MP4 thrown away through stdout. */
function tryCodec(ffmpeg: string, codec: CaptureCodec, width: number, height: number, fps: number) {
  const key = `${codec}:${width}x${height}@${fps}`;
  let known = working.get(key);
  if (!known) {
    known = new Promise<boolean>((resolve) => {
      const args = pageCaptureArgs({ width, height, fps, codec, file: "pipe:1" });
      const child = spawn(ffmpeg, args, { windowsHide: true });
      const timer = setTimeout(() => child.kill(), 15000);
      child.stdout.resume();
      child.stderr.resume();
      child.stdin.on("error", () => undefined);
      child.on("error", () => resolve(false));
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
      const black = Buffer.alloc(width * height * 4);
      for (let i = 0; i < 3; i++) child.stdin.write(black);
      child.stdin.end();
    });
    working.set(key, known);
  }
  return known;
}

/** The detected encoder when it takes frames from memory at this size, else x264. */
export async function pageCodec(
  ffmpeg: string,
  preferred: CaptureCodec,
  width: number,
  height: number,
  fps: number,
): Promise<CaptureCodec> {
  for (const codec of preferred === "libx264" ? [preferred] : [preferred, "libx264" as const])
    if (await tryCodec(ffmpeg, codec, width, height, fps)) return codec;
  throw new Error("Nenhum codificador de vídeo funcionou para a captura da aula.");
}

export class GuidedTake {
  readonly dir: string;
  readonly plan: GuidedPlanV2;
  readonly from: number;
  readonly fps: 30 | 60;
  readonly schedule: PlanSchedule;
  /** Resolves when the run ends by itself: every step done, or one failed. */
  readonly ended: Promise<GuidedTakeEnd>;
  private readonly options: GuidedTakeOptions;
  private readonly controller = new AbortController();
  private window: BrowserWindow | null = null;
  private cdp: CdpDriver | null = null;
  private clock: FrameClock | null = null;
  private encoder: ChildProcessWithoutNullStreams | null = null;
  private encoderError = "";
  private log: LineLog | null = null;
  private journal: SessionJournal | null = null;
  private latest: NativeImage | null = null;
  private fresh = false;
  /** Waiting for the page's next picture (each frame of a drag waits for its own). */
  private paintWaiters: (() => void)[] = [];
  private bitmap: Buffer | null = null;
  private frameBytes: number;
  private writer: ReturnType<typeof setInterval> | undefined;
  private previewer: ReturnType<typeof setInterval> | undefined;
  private encoderHeld = false;
  /** No more frames: the run ended or failed, or the take is stopping. */
  private halted = false;
  private phase: GuidedTakePhase = "opening";
  private step: number;
  private message: string | undefined;
  private result: GuidedTakeEnd | null = null;
  private readonly started: Promise<void>;
  private stopping: Promise<RecordingResult> | null = null;
  private readonly warnings: string[] = [];

  constructor(options: GuidedTakeOptions) {
    this.options = options;
    this.dir = options.dir;
    this.plan = options.plan;
    this.from = options.from;
    this.fps = options.plan.fps ?? 30;
    this.schedule = schedulePlan(options.plan, options.from);
    this.step = options.from;
    this.frameBytes = options.plan.viewport.width * options.plan.viewport.height * 4;
    let end: (value: GuidedTakeEnd) => void = () => undefined;
    this.ended = new Promise((resolve) => {
      end = resolve;
    });
    this.started = this.run().then(
      (value) => {
        this.result = value;
        end(value);
      },
      (error: unknown) => {
        // No more frames after a failure, and nothing more done on the page.
        const stopped = this.controller.signal.aborted;
        this.halted = true;
        this.controller.abort();
        const message = stopped ? STOPPED : error instanceof Error ? error.message : String(error);
        const failed: GuidedTakeEnd = {
          status: "failed",
          step: error instanceof GuidedStepError ? error.step : this.step,
          message,
        };
        if (message !== STOPPED) {
          this.phase = "failed";
          this.message = message;
          this.step = failed.step;
          this.report();
        }
        this.result = failed;
        end(failed);
      },
    );
  }

  /** The encoder's process, for measuring it. */
  get encoderPid(): number | undefined {
    return this.encoder?.pid;
  }

  /** Frames written so far. */
  get frames(): number {
    return this.clock?.frames ?? 0;
  }

  /** The encoder in use, for the recorder ("CPU (x264)"). */
  label = "";

  private report(preview?: string): void {
    const clock = this.clock;
    const holding = clock?.holdingFor ?? undefined;
    this.options.onStatus({
      phase:
        this.phase === "recording" && holding
          ? holding === "pause"
            ? "paused"
            : "holding"
          : this.phase,
      step: this.step,
      steps: this.plan.steps.length,
      time: clock?.time() ?? 0,
      duration: this.schedule.duration,
      ...(holding ? { holding } : {}),
      ...(this.message ? { message: this.message } : {}),
      ...(preview ? { preview } : {}),
    });
  }

  private async run(): Promise<GuidedTakeEnd> {
    const { plan, dir } = this;
    const signal = this.controller.signal;
    this.report();
    const opened = await openLessonCapture(plan, this.fps, (image) => {
      this.latest = image;
      this.fresh = true;
      const waiting = this.paintWaiters;
      this.paintWaiters = [];
      for (const resolve of waiting) resolve();
    });
    this.window = opened.window;
    this.cdp = opened.cdp;
    if (signal.aborted) throw new Error(STOPPED);
    const codec = pageCodec(
      this.options.ffmpeg,
      this.options.encoder.codec,
      plan.viewport.width,
      plan.viewport.height,
      this.fps,
    );
    // An unhandled rejection while the page loads would be reported twice.
    codec.catch(() => undefined);
    await loadLesson(opened.window, plan.url ?? "", opened.firstPaint, signal);
    // The take goes on from where the preparation left the pointer.
    let start: { x: number; y: number } | undefined;
    if (this.from > 0) {
      this.phase = "preparing";
      this.report();
      const prep = new WebDriver(opened.cdp, { viewport: plan.viewport, signal });
      await prep.place();
      await runGuided(plan, prep, instantClock(signal), signal, { to: this.from });
      start = prep.pointer;
    }
    if (signal.aborted) throw new Error(STOPPED);
    const chosen = await codec;
    this.label = captureEncoderLabel({ codec: chosen });
    if (chosen !== this.options.encoder.codec)
      this.warnings.push(
        "O codificador escolhido para a tela não aceitou a captura da aula: ela foi gravada pelo x264.",
      );

    // The take's folder, as any take: journal, the screen part, the log, the narration.
    this.journal = new SessionJournal(dir);
    this.journal.write({
      k: "begin",
      v: 1,
      at: Date.now(),
      qpc: qpc(),
      fps: this.fps,
      monitor: null,
      region: null,
      encoder: this.label,
      sources: { screen: true, microphone: null, camera: null, system: false, keys: true },
    });
    this.log = new LineLog(join(dir, GUIDED_LOG_FILE));
    this.log.write(
      {
        k: "begin",
        v: 1,
        planId: plan.id,
        planName: plan.name,
        timing: planTiming(plan),
        fps: this.fps,
        viewport: plan.viewport,
        from: this.from,
        narrationOffset: narrationOffset(this.schedule),
        steps: this.schedule.steps.map((s) => ({
          index: s.index,
          id: s.step.id,
          speech: s.step.speech.slice(0, 4000),
          action: s.step.action,
          start: Math.round(s.moveAt * 1000) / 1000,
          act: Math.round(s.actAt * 1000) / 1000,
          end: Math.round(s.endAt * 1000) / 1000,
        })),
      },
      true,
    );
    if (plan.audio) {
      const file = `narracao${extname(plan.audio.path).toLowerCase() || ".wav"}`;
      await copyFile(plan.audio.path, join(dir, file));
      this.journal.write({ k: "narration", file, offset: narrationOffset(this.schedule) });
    }

    const encoder = spawn(
      this.options.ffmpeg,
      pageCaptureArgs({
        width: plan.viewport.width,
        height: plan.viewport.height,
        fps: this.fps,
        codec: chosen,
        quality: this.options.encoder.quality,
        file: join(dir, "tela-0.mp4"),
      }),
      { windowsHide: true },
    );
    this.encoder = encoder;
    encoder.stderr.setEncoding("utf8");
    encoder.stderr.on("data", (chunk: string) => {
      this.encoderError = (this.encoderError + chunk).slice(-4000);
    });
    encoder.stdin.on("error", () => undefined);
    let failEncoder: (error: Error) => void = () => undefined;
    const encoderDied = new Promise<never>((_resolve, reject) => {
      failEncoder = reject;
    });
    encoderDied.catch(() => undefined);
    encoder.once("close", (code) => {
      if (this.halted) return;
      const last = this.encoderError
        .split("\n")
        .filter((l) => l.trim() && !/^\w+=/.test(l.trim()))
        .at(-1);
      failEncoder(
        new Error(`O codificador de vídeo parou (${code})${last ? `: ${last.trim()}` : ""}.`),
      );
    });

    const clock = new FrameClock(this.fps, () => performance.now());
    this.clock = clock;
    // Each hold reaches the disk as it ends: a take recovered after a crash still has them.
    clock.onHold((hold) => this.log?.write({ k: "hold", ...hold }, true));
    const driver = new WebDriver(opened.cdp, {
      viewport: plan.viewport,
      signal,
      clock,
      log: (line) => this.log?.write(line),
      paintAfter: () => this.nextPaint(),
    });
    await driver.place(start);
    clock.start();
    this.journal.write({ k: "first", src: "screen", part: 0, qpc: qpc(), file: "tela-0.mp4" });
    this.phase = "recording";
    this.writer = setInterval(() => this.writeFrames(), 4);
    this.previewer = setInterval(() => this.preview(), PREVIEW_MS);
    const log: GuidedRunLog = {
      step: (index, status, message) => {
        if (status === "start") this.step = index;
        this.log?.write(
          { k: "step", t: clock.time(), index, status, ...(message ? { message } : {}) },
          true,
        );
      },
      act: (kind, from, until, step) => this.log?.write({ k: "act", t: from, until, kind, step }),
    };
    await Promise.race([
      runGuided(plan, driver, videoClock(clock, signal), signal, { from: this.from, log }),
      encoderDied,
    ]);
    this.halted = true;
    this.phase = "done";
    this.report();
    return { status: "done", step: this.plan.steps.length - 1 };
  }

  /**
   * The page's picture after an input it already answered: the next paint, and the one after it
   * when that comes within a frame and a half, at least 50 ms (a paint under way when the input
   * arrived still shows the page before it). A page that does not paint is waited for 150 ms.
   */
  private async nextPaint(): Promise<void> {
    await this.paint(150);
    await this.paint(Math.max(50, 1500 / this.fps));
  }

  private paint(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.paintWaiters.push(resolve);
      setTimeout(resolve, ms);
    });
  }

  /** The frames the clock says are due: the latest picture, repeated while the page is still. */
  private writeFrames(): void {
    const clock = this.clock;
    const encoder = this.encoder;
    if (!clock || !encoder || this.halted) return;
    const n = clock.tick();
    for (let i = 0; i < n; i++) {
      clock.frame();
      if (this.fresh && this.latest) {
        this.bitmap = this.frameOf(this.latest);
        this.fresh = false;
      }
      if (this.bitmap) encoder.stdin.write(this.bitmap);
      // The run acts first, and a frame held for the page's picture waits for it; the frames
      // still due go out on the next tick.
      if (clock.woke || clock.holding) break;
    }
    if (!this.encoderHeld && encoder.stdin.writableLength > MAX_PENDING_FRAMES * this.frameBytes) {
      this.encoderHeld = true;
      clock.hold("encoder");
      encoder.stdin.once("drain", () => {
        this.encoderHeld = false;
        clock.resume("encoder");
      });
    }
  }

  /** BGRA of the viewport's size (an offscreen window the system kept smaller is scaled). */
  private frameOf(image: NativeImage): Buffer {
    const { width, height } = this.plan.viewport;
    const size = image.getSize();
    const fitted =
      size.width === width && size.height === height ? image : image.resize({ width, height });
    return fitted.toBitmap();
  }

  private preview(): void {
    const image = this.latest;
    this.report(
      image
        ? `data:image/jpeg;base64,${image.resize({ width: PREVIEW_WIDTH }).toJPEG(70).toString("base64")}`
        : undefined,
    );
  }

  pause(): void {
    this.clock?.hold("pause");
    this.report();
  }

  resume(): void {
    this.clock?.resume("pause");
    this.report();
  }

  /**
   * Ends the take (a run still going is stopped there) and finalizes it like any take. Asked
   * again, the same answer comes back.
   */
  stop(): Promise<RecordingResult> {
    this.stopping ??= this.close(true).then(async (recorded) => {
      if (!recorded) throw new Error("Nada foi gravado.");
      this.phase = "saving";
      this.report();
      return finalizeTake({ dir: this.dir, warnings: this.warnings });
    });
    return this.stopping;
  }

  /** Ends everything without finalizing; the caller throws the folder away. */
  async cancel(): Promise<void> {
    await this.close(false);
  }

  /** Stops the run, the writer and the encoder; true when frames were written. */
  private async close(keep: boolean): Promise<boolean> {
    this.controller.abort();
    // The page goes first: a load or a command still waiting on it ends with it.
    this.cdp?.detach();
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    await this.started;
    this.halted = true;
    clearInterval(this.writer);
    clearInterval(this.previewer);
    const clock = this.clock;
    clock?.close();
    if (clock && this.log) {
      const status =
        this.result?.status === "done"
          ? "done"
          : this.result?.message && this.result.message !== STOPPED
            ? "failed"
            : "stopped";
      this.log.write({ k: "end", t: clock.time(), status }, true);
    }
    const encoder = this.encoder;
    if (encoder && encoder.exitCode === null) {
      const closed = new Promise<void>((resolve) => encoder.once("close", () => resolve()));
      if (keep) encoder.stdin.end();
      else encoder.kill();
      const timer = setTimeout(() => encoder.kill(), 20000);
      await closed;
      clearTimeout(timer);
    }
    this.journal?.write({ k: "stop", qpc: qpc() });
    this.journal?.close();
    this.log?.close();
    if (this.log?.error)
      this.warnings.push(
        `Parte do registro da demonstração não foi salva: ${this.log.error.message}`,
      );
    this.cdp?.detach();
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    return (clock?.frames ?? 0) > 0 && !!this.journal;
  }

  /** How the run ended, once it did. */
  get outcome(): GuidedTakeEnd | null {
    return this.result;
  }
}

/**
 * "Verificar plano": the whole plan in an offscreen lesson window, untimed and without capture.
 * Every step that fails is listed with a picture of the page at that moment and the run goes on
 * with the next step, so one check finds every step to repair; after VERIFY_STREAK failures in
 * a row the rest is not checked (it depends on what failed). Stopping closes the page at once.
 */
export async function verifyGuidedPlan(
  plan: GuidedPlanV2,
  signal: AbortSignal,
  onProgress: (step: number) => void,
): Promise<BrokenStep[]> {
  schedulePlan(plan);
  const { window, cdp, firstPaint } = await openLessonCapture(plan, 30);
  const close = (): void => {
    cdp.detach();
    if (!window.isDestroyed()) window.destroy();
  };
  signal.addEventListener("abort", close, { once: true });
  const broken: BrokenStep[] = [];
  try {
    await loadLesson(window, plan.url ?? "", firstPaint, signal);
    const driver = new WebDriver(cdp, { viewport: plan.viewport, signal });
    await driver.place();
    const clock = instantClock(signal);
    const streak = new FailureStreak(VERIFY_STREAK);
    await runGuided(
      plan,
      driver,
      {
        ...clock,
        step: (index) => {
          streak.start(index);
          onProgress(index);
        },
      },
      signal,
      {
        onFailure: async (index, error) => {
          // A step whose picture could not be taken is listed without it.
          const screenshot = await cdp.screenshot(plan.viewport).catch(() => undefined);
          broken.push({ index, message: error.message, ...(screenshot ? { screenshot } : {}) });
          if (streak.fail(index)) return true;
          if (index + 1 < plan.steps.length)
            broken.push({
              index: index + 1,
              message: `${VERIFY_STREAK} etapas seguidas falharam: as seguintes dependem delas e não foram verificadas.`,
            });
          return false;
        },
      },
    );
  } finally {
    signal.removeEventListener("abort", close);
    close();
  }
  return broken;
}
