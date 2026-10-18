import { EventEmitter } from "node:events";
import { appendFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  cameraArgs,
  FOLLOW_PIPE_RATE,
  MIC_BUFFER_MS,
  microphoneArgs,
  screenArgs,
} from "../../shared/captureArgs.ts";
import {
  type CaptureEncoder,
  captureEncoderLabel,
  fallbackChain,
} from "../../shared/encoderChoice.ts";
import type { HookEvent } from "../../shared/helperProtocol.ts";
import {
  type CaptureMonitor,
  type CaptureSource,
  isVoiceMode,
  type MarkerKind,
  type RecorderEvent,
  type RecorderPhase,
  type RecorderStatus,
  type RecordingResult,
  type RecordOptions,
} from "../../shared/recording.ts";
import type { RecorderHealth } from "../../shared/recordingHealth.ts";
import type { MediaSource } from "../../shared/recordingJournal.ts";
import type { HookClient } from "../nativeHelper.ts";
import { qpc } from "../nativeHelper.ts";
import { finalizeTake } from "./finalize.ts";
import { HealthMonitor } from "./health.ts";
import { type JournalWriter, SessionJournal } from "./journal.ts";
import { CaptureProcess } from "./source.ts";

/**
 * One take: prepared → recording ⇄ paused → stopping → finalized, or failed while a source that
 * matters (screen, microphone) is down. Each source is its own FFmpeg process. Pausing never
 * touches them: it is a line in the journal and a word to the cursor helper, so resuming is
 * instant and nothing is lost; the paused stretches are cut when the take is imported. A pause
 * longer than five minutes closes the screen and camera parts (to spare the disk), a disk about
 * to fill closes every source, and resuming opens new parts for whatever should be recording and
 * has no process running: never a second one beside a live one.
 */

export interface SessionMessages {
  status: [RecorderStatus];
  event: [RecorderEvent];
  health: [RecorderHealth];
  /** The microphone's 16 kHz copy ("Só voz" with following), and when it arrived (QPC ms). */
  follow: [Buffer, number];
  /** The teleprompter moved to this line at this moment (QPC ms). */
  line: [number, number];
}

export interface SessionSetup {
  opts: RecordOptions;
  /** null in a take without the screen. */
  monitor: CaptureMonitor | null;
  dir: string;
  ffmpeg: string;
  /** Settled while preparing; null without the screen. */
  encoder: CaptureEncoder | null;
  hook: HookClient | null;
  /** A path that passed the probe could not start: the encoder cache learns it. */
  reportEncoderFailure?: (encoder: CaptureEncoder) => Promise<void>;
  /** The name FFmpeg opens a DirectShow device by (its alternative name when it has one). */
  deviceName?: (kind: "audio" | "video", name: string) => string;
  /** Tests only: where the journal's lines go. */
  journalWriter?: JournalWriter;
}

/** A pause longer than this closes the screen and camera parts. */
export const LONG_PAUSE_MS = 5 * 60 * 1000;
/** Most bytes of the computer's sound in one call. */
export const MAX_SYSTEM_CHUNK = 8 * 1024 * 1024;
/** The computer's sound counts as missing after this long without a chunk. */
const SYSTEM_SILENT_MS = 3000;

const FILE: Record<MediaSource, [string, string]> = {
  screen: ["tela", "mp4"],
  mic: ["microfone", "m4a"],
  camera: ["camera", "mp4"],
  system: ["sistema", "webm"],
};
/** "Só voz" keeps the microphone as PCM in Matroska (shared/captureArgs.ts VOICE_MATROSKA). */
const VOICE_FILE: [string, string] = ["voz", "mkv"];

const NAMES: Record<CaptureSource, string> = {
  screen: "A tela",
  mic: "O microfone",
  camera: "A câmera",
  system: "O áudio do PC",
  cursor: "O cursor",
};

export class RecordingSession extends EventEmitter<SessionMessages> {
  phase: RecorderPhase = "prepared";
  readonly dir: string;
  readonly opts: RecordOptions;
  readonly journal: SessionJournal;
  /** Helper events that reached memory; the complete journal is cursor.jsonl. */
  readonly events: HookEvent[] = [];
  readonly cursorIssues: string[] = [];
  readonly encoderIssues: string[] = [];
  readonly warnings: string[] = [];
  private encoder: CaptureEncoder | null;
  private readonly monitor: CaptureMonitor | null;
  private readonly hook: HookClient | null;
  private readonly ffmpeg: string;
  private readonly reportEncoderFailure?: (encoder: CaptureEncoder) => Promise<void>;
  private readonly deviceName: (kind: "audio" | "video", name: string) => string;
  private readonly procs: Partial<Record<MediaSource, CaptureProcess>> = {};
  private readonly parts: Record<MediaSource, number> = { screen: 0, mic: 0, camera: 0, system: 0 };
  /** Sources whose process died: the take is paused until they open again. */
  private readonly failed = new Set<CaptureSource>();
  /** Sources closed on purpose during a pause (a long one, or a full disk). */
  private readonly closed = new Set<MediaSource>();
  /** Files of processes that did not end cleanly: checked before they are joined. */
  private readonly suspect = new Set<string>();
  private origin: number | null = null;
  private pausedTotal = 0;
  private pausedAt: number | null = null;
  private stoppedAt: number | null = null;
  private longPause: ReturnType<typeof setTimeout> | undefined;
  private reopening = false;
  private preserved = false;
  private stopping: Promise<RecordingResult> | null = null;
  private health: HealthMonitor | null = null;
  private cursorState: RecorderHealth["cursor"];
  private cameraState: RecorderHealth["camera"];
  private system: { started: boolean; lastAt: number } = { started: false, lastAt: 0 };
  private lastRects = "";
  /** When the teleprompter last moved (QPC ms): a line never starts before the one before it. */
  private lastLineAt = 0;
  private lastWarnings = "";
  private queue: Promise<unknown> = Promise.resolve();

  constructor(setup: SessionSetup) {
    super();
    this.opts = setup.opts;
    this.dir = setup.dir;
    this.monitor = setup.monitor;
    this.encoder = setup.encoder;
    this.hook = setup.hook;
    this.ffmpeg = setup.ffmpeg;
    this.reportEncoderFailure = setup.reportEncoderFailure;
    this.deviceName = setup.deviceName ?? ((_kind, name) => name);
    this.journal = new SessionJournal(
      setup.dir,
      (error) => this.journalFailed(error),
      setup.journalWriter,
    );
    this.cursorState = setup.hook ? "ok" : "none";
    this.cameraState = setup.opts.camera ? "ok" : "none";
    const m = setup.monitor;
    const r = setup.opts.region;
    this.journal.write({
      k: "begin",
      v: 1,
      at: Date.now(),
      qpc: qpc(),
      fps: setup.opts.fps,
      monitor: m ? { x: m.x, y: m.y, width: m.width, height: m.height } : null,
      region: r ?? null,
      encoder: setup.encoder ? captureEncoderLabel(setup.encoder) : null,
      sources: {
        screen: !!m,
        microphone: setup.opts.microphone ?? null,
        camera: setup.opts.camera ?? null,
        system: !!setup.opts.systemAudio,
        keys: !!setup.opts.keys,
      },
      ...(setup.opts.mode && setup.opts.mode !== "screen" ? { mode: setup.opts.mode } : {}),
      ...(setup.opts.mode === "over" && setup.opts.over ? { over: setup.opts.over } : {}),
    });
    this.watchHook();
  }

  /** What the recorder window and the editor see. */
  status(): RecorderStatus {
    return {
      phase: this.phase,
      failed: [...this.failed],
      closed: this.closed.size > 0,
      reopening: this.reopening,
    };
  }

  get isPreserved(): boolean {
    return this.preserved;
  }

  /** Seconds recorded, without the pauses: the clock the teacher sees and the guided mode uses. */
  elapsed(): number {
    if (this.origin === null) return 0;
    const now = this.stoppedAt ?? qpc();
    const paused = this.pausedTotal + (this.pausedAt !== null ? now - this.pausedAt : 0);
    return Math.max(0, (now - this.origin - paused) / 1000);
  }

  /** Operations run one after another, so a pause never races a stop. */
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  start(): Promise<void> {
    return this.serial(async () => {
      if (this.preserved) throw new Error("Gravação não preparada ou já preservada.");
      if (this.phase !== "prepared") throw new Error("Gravação já iniciada.");
      this.hook?.send({ cmd: "resume" });
      const [screen, mic, camera] = await Promise.allSettled([
        this.monitor ? this.openScreen(true) : Promise.resolve(null),
        this.opts.microphone ? this.openMic() : Promise.resolve(null),
        this.opts.camera ? this.openCamera() : Promise.resolve(null),
      ]);
      const failure = [screen, mic].find((r) => r.status === "rejected");
      if (failure?.status === "rejected") {
        this.hook?.send({ cmd: "pause" });
        await this.closeAll(true);
        throw failure.reason;
      }
      if (camera.status === "rejected") this.cameraFailed(errorText(camera.reason), true);
      const reference = this.procs.screen ?? this.procs.mic;
      if (!reference || reference.first === null) {
        await this.closeAll(true);
        throw new Error("Escolha a tela ou um microfone para gravar.");
      }
      this.origin = reference.first;
      this.phase = "recording";
      this.startHealth();
      this.emitStatus();
    });
  }

  pause(): Promise<void> {
    return this.serial(async () => this.pauseNow());
  }

  /**
   * Goes on after a pause. Whatever should be recording and has no process running (it failed,
   * or the pause closed it) opens a new part; if one of them cannot open, the ones that did are
   * closed again and the take stays paused, so trying again never leaves two of a source.
   */
  resume(): Promise<void> {
    return this.serial(async () => {
      if (this.preserved) throw new Error("Gravação preservada: não dá para retomar.");
      if (this.phase !== "paused" && this.phase !== "failed") return;
      const down = (src: MediaSource): boolean => !this.procs[src]?.running;
      const open: ("screen" | "mic")[] = [];
      if (this.monitor && down("screen")) open.push("screen");
      if (this.opts.microphone && down("mic")) open.push("mic");
      const camera =
        !!this.opts.camera &&
        this.cameraState === "ok" &&
        down("camera") &&
        this.closed.has("camera");
      const long = this.closed.has("screen");
      if (open.length || camera) {
        this.reopening = true;
        this.emitStatus();
        const results = await Promise.allSettled(
          open.map((src) => (src === "screen" ? this.openScreen(false) : this.openMic())),
        );
        const opened = results.flatMap((r) =>
          r.status === "fulfilled" && r.value ? [r.value] : [],
        );
        for (const proc of opened) {
          this.failed.delete(proc.source);
          this.closed.delete(proc.source);
        }
        const failure = results.find((r) => r.status === "rejected");
        if (failure?.status === "rejected") {
          // Still paused: what opened is closed again and opens with the next try.
          await this.closeSources(opened.map((p) => p.source));
          this.reopening = false;
          this.emitStatus();
          throw new Error(`Não consegui retomar: ${errorText(failure.reason)}`, {
            cause: failure.reason,
          });
        }
        if (camera)
          await this.openCamera().then(
            () => this.closed.delete("camera"),
            (error: unknown) => this.cameraFailed(errorText(error), true),
          );
        this.reopening = false;
      }
      this.closed.clear();
      const at = qpc();
      this.journal.write({ k: "resume", qpc: at });
      this.hook?.send({ cmd: "resume" });
      this.endPause(at);
      this.phase = "recording";
      this.emitStatus();
      if (long)
        this.emitEvent({
          source: "screen",
          level: "info",
          message: "A tela levou um instante para voltar: a pausa tinha fechado os arquivos.",
          actions: [],
        });
    });
  }

  mark(kind: MarkerKind): void {
    if (this.phase === "recording") this.journal.write({ k: "marker", qpc: qpc(), kind });
  }

  /** Stops acquiring now; the session stays for the computer's sound and the finalization. */
  preserve(): Promise<void> {
    return this.serial(() => this.halt());
  }

  /** Stops and finalizes; asking again gives the same answer. */
  stop(): Promise<RecordingResult> {
    this.stopping ??= this.serial(async () => {
      await this.halt();
      this.journal.close();
      try {
        const result = await finalizeTake({
          dir: this.dir,
          events: this.events,
          cursorIssues: this.cursorIssues,
          encoderIssues: this.encoderIssues,
          warnings: this.warnings,
          suspect: this.suspect,
        });
        this.phase = "finalized";
        this.emitStatus();
        return result;
      } catch (error) {
        throw new Error(
          `Não foi possível finalizar a gravação. Os arquivos foram mantidos em ${this.dir}.`,
          { cause: error },
        );
      }
    });
    return this.stopping;
  }

  /** Throws the take away (the folder is removed, or handed to `remove`). */
  cancel(
    remove: (dir: string) => Promise<void> = (dir) => rm(dir, { recursive: true, force: true }),
  ): Promise<void> {
    return this.serial(async () => {
      // A finished take belongs to the editor now.
      if (this.phase === "finalized") return;
      this.health?.stop();
      clearTimeout(this.longPause);
      this.phase = "stopping";
      // The helper must let go of the journal before the folder goes.
      await this.hook?.kill();
      await this.closeAll(true);
      this.journal.close();
      await remove(this.dir);
      this.phase = "finalized";
    });
  }

  /** A chunk of the computer's sound (MediaRecorder WebM), appended as it comes. */
  systemChunk(bytes: Uint8Array, startedAt?: number, endedAt?: number): void {
    if (this.phase === "finalized" || this.phase === "prepared")
      throw new Error("Nenhuma gravação em andamento.");
    if (bytes.byteLength > MAX_SYSTEM_CHUNK) throw new Error("Pedaço de áudio maior que 8 MB.");
    const [name, ext] = FILE.system;
    const file = `${name}.${ext}`;
    if (bytes.byteLength) appendFileSync(join(this.dir, file), bytes);
    const now = qpc();
    // Date.now() of the renderer, moved to the shared clock.
    const toQpc = (wall: number): number => now - (Date.now() - wall);
    if (startedAt !== undefined && !this.system.started) {
      this.system.started = true;
      this.journal.write({ k: "first", src: "system", part: 0, qpc: toQpc(startedAt), file });
    }
    if (endedAt !== undefined)
      this.journal.write({ k: "end", src: "system", part: 0, qpc: toQpc(endedAt) });
    this.system.lastAt = now;
  }

  /** The recorder's own controls, physical pixels: the helper marks the pointer over them. */
  uiRects(rects: { x: number; y: number; w: number; h: number }[]): void {
    const key = JSON.stringify(rects);
    if (key === this.lastRects) return;
    this.lastRects = key;
    this.hook?.send({ cmd: "exclude", rects });
    if (this.phase !== "prepared") this.journal.write({ k: "uiRects", qpc: qpc(), rects });
  }

  /**
   * The teleprompter moved to line `index`: now (a shortcut), or at `heard` (QPC ms) when the
   * voice following saw the line before end there. A time in the future, before the last
   * line or more than 15 s back is not trusted: the line then counts from now.
   */
  teleprompterLine(index: number, heard?: number): void {
    if (this.phase !== "recording" && this.phase !== "paused") return;
    const now = qpc();
    const at =
      heard !== undefined && heard <= now && heard >= now - 15000 && heard >= this.lastLineAt
        ? heard
        : now;
    this.lastLineAt = at;
    this.journal.write({ k: "line", qpc: at, index });
    this.emit("line", index, at);
  }

  /**
   * "Tela sobre a narração": the lesson's voice heard at timeline second `at` at QPC `when`
   * (the recorder window converts its clock and takes the output latency off).
   */
  overAnchor(at: number, when: number): void {
    if (this.phase !== "recording" && this.phase !== "paused") return;
    if (!Number.isFinite(at) || at < 0 || !Number.isFinite(when) || when <= 0) return;
    this.journal.write({ k: "over", qpc: when, at });
  }

  /**
   * The guided recording's narration: copied into the folder, starting `offset` seconds in by
   * the recorder's clock, which counts from the first-frame estimate it has now.
   */
  setNarration(file: string, offset: number, fromVideo = false): void {
    this.journal.write({
      k: "narration",
      file,
      offset,
      ...(this.origin !== null ? { origin: this.origin } : {}),
      ...(fromVideo ? { video: true as const } : {}),
    });
  }

  /** The helper's key filter (the recorder's shortcuts never show on screen). */
  setKeyFilter(block: { vk: number; m: number }[], allow: string[]): void {
    this.hook?.send({ cmd: "keys", block, allow });
  }

  // ---- internals -------------------------------------------------------------------------

  private pauseNow(): void {
    if (this.phase !== "recording") return;
    const at = qpc();
    this.journal.write({ k: "pause", qpc: at });
    this.hook?.send({ cmd: "pause" });
    this.beginPause(at);
    this.phase = "paused";
    this.emitStatus();
  }

  private async halt(): Promise<void> {
    if (this.preserved) return;
    this.preserved = true;
    try {
      clearTimeout(this.longPause);
      const at = qpc();
      this.stoppedAt = at;
      this.journal.write({ k: "stop", qpc: at });
      this.hook?.send({ cmd: "pause" });
      this.phase = "stopping";
      this.health?.stop();
      this.emitStatus();
    } finally {
      // Whatever happened above, the processes close and the helper writes its last lines.
      await this.closeAll(false);
      await this.hook?.stop();
    }
  }

  private async closeAll(kill: boolean): Promise<void> {
    await this.closeSources(Object.keys(this.procs) as MediaSource[], kill);
  }

  /** Ends these sources' processes; a part that had to be killed is checked before joining. */
  private async closeSources(sources: readonly MediaSource[], kill = false): Promise<void> {
    const procs = sources.flatMap((src) => {
      const proc = this.procs[src];
      delete this.procs[src];
      return proc ? [proc] : [];
    });
    await Promise.all(procs.map((p) => (kill ? p.kill() : p.stop())));
    for (const p of procs) if (p.forced && !kill) this.suspect.add(p.file);
  }

  private beginPause(at: number): void {
    if (this.pausedAt !== null) return;
    this.pausedAt = at;
    clearTimeout(this.longPause);
    this.longPause = setTimeout(
      () => void this.closeWhilePaused(["screen", "camera"]),
      LONG_PAUSE_MS,
    );
  }

  private endPause(at: number): void {
    clearTimeout(this.longPause);
    if (this.pausedAt === null) return;
    this.pausedTotal += Math.max(0, at - this.pausedAt);
    this.pausedAt = null;
  }

  /** Closes sources while the take is paused (they reopen when it resumes). */
  private closeWhilePaused(sources: readonly MediaSource[]): Promise<void> {
    return this.serial(async () => {
      if (this.phase !== "paused" && this.phase !== "failed") return;
      const running = sources.filter((src) => this.procs[src]?.running);
      for (const src of running) this.closed.add(src);
      this.emitStatus();
      await this.closeSources(running);
    });
  }

  private nextFile(src: MediaSource): { part: number; file: string } {
    const part = this.parts[src]++;
    const [name, ext] = src === "mic" && isVoiceMode(this.opts.mode) ? VOICE_FILE : FILE[src];
    return { part, file: `${name}-${part}.${ext}` };
  }

  private spawn(
    src: MediaSource,
    args: (path: string) => string[],
    latency: number,
    followPipe = false,
  ): CaptureProcess {
    const { part, file } = this.nextFile(src);
    return new CaptureProcess({
      source: src,
      part,
      file,
      ffmpeg: this.ffmpeg,
      args: args(join(this.dir, file)),
      latency,
      followPipe,
    });
  }

  /** A part that ended before its first sample leaves no file behind. */
  private async dropStart(proc: CaptureProcess): Promise<void> {
    await proc.kill();
    await rm(join(this.dir, proc.file), { force: true });
  }

  /**
   * The process records from now on: its first sample and its end go to the journal. A live
   * process of the same source is never left recording beside it.
   */
  private async adopt(proc: CaptureProcess): Promise<CaptureProcess> {
    const previous = this.procs[proc.source];
    if (previous?.running && previous !== proc) {
      this.warnings.push(
        `${NAMES[proc.source]} tinha um processo ainda gravando; ele foi encerrado.`,
      );
      await this.closeSources([proc.source]);
    }
    this.procs[proc.source] = proc;
    const write = (at: number): void =>
      this.journal.write({
        k: "first",
        src: proc.source,
        part: proc.part,
        qpc: at,
        file: proc.file,
      });
    if (proc.first !== null) write(proc.first);
    // The estimate settles within the first seconds; later improvements are a few milliseconds.
    let improvements = 0;
    proc.on("first", (at) => {
      if (++improvements <= 50) write(at);
    });
    proc.on("exit", (info) => this.onExit(proc, info));
    return proc;
  }

  /**
   * The screen. The first part may try the next path in the chain when the chosen one fails
   * before its first frame (the same encoder from system memory, then x264), and the cache
   * learns it; later parts keep that encoder, so the parts join without re-encoding.
   */
  private async openScreen(chain: boolean): Promise<CaptureProcess> {
    const chosen = this.encoder;
    const monitor = this.monitor;
    if (!chosen || !monitor) throw new Error("Gravação não preparada.");
    const candidates = chain ? [chosen, ...fallbackChain(chosen)] : [chosen];
    let first: unknown;
    for (const candidate of candidates) {
      const proc = this.spawn(
        "screen",
        (file) =>
          screenArgs({
            output: monitor.output,
            fps: this.opts.fps,
            size: { width: monitor.width, height: monitor.height },
            region: this.opts.region,
            encoder: candidate,
            quality: this.opts.quality,
            file,
          }),
        0,
      );
      try {
        await proc.started();
      } catch (error) {
        first ??= error;
        await this.dropStart(proc);
        continue;
      }
      if (candidate !== chosen) {
        this.encoder = candidate;
        this.encoderIssues.push(
          `${captureEncoderLabel(chosen)} não abriu a gravação; foi usado ${captureEncoderLabel(candidate)}.`,
        );
        await this.reportEncoderFailure?.(chosen).catch((error: unknown) =>
          this.encoderIssues.push(
            `Não consegui registrar a falha do codificador: ${String(error)}`,
          ),
        );
      }
      return this.adopt(proc);
    }
    throw first;
  }

  private async openMic(): Promise<CaptureProcess> {
    const device = this.opts.microphone;
    if (!device) throw new Error("Nenhum microfone escolhido.");
    const voice = isVoiceMode(this.opts.mode);
    const follow = voice && !!this.opts.follow;
    const proc = this.spawn(
      "mic",
      (file) =>
        microphoneArgs({ device: this.deviceName("audio", device), file, pcm: voice, follow }),
      MIC_BUFFER_MS,
      follow,
    );
    // Levels flow from the first block, before the first progress report.
    proc.on("data", (chunk) => this.health?.feedMic(chunk));
    if (follow) {
      // The copy runs on the microphone's own clock: sample n is n / 16 kHz after the part's
      // first sample (its estimate settles in the first seconds, like the recording's).
      let samples = 0;
      proc.on("follow", (chunk) => {
        samples += Math.floor(chunk.length / 2);
        const first = proc.first;
        const at = first !== null ? first + (samples * 1000) / FOLLOW_PIPE_RATE : qpc();
        this.emit("follow", chunk, at);
      });
    }
    try {
      await proc.started();
    } catch (error) {
      await this.dropStart(proc);
      throw new Error(`O microfone não abriu: ${errorText(error)}`, { cause: error });
    }
    return this.adopt(proc);
  }

  private async openCamera(): Promise<CaptureProcess> {
    const device = this.opts.camera;
    const encoder = this.encoder;
    if (!device) throw new Error("Nenhuma câmera escolhida.");
    const proc = this.spawn(
      "camera",
      (file) =>
        cameraArgs({
          device: this.deviceName("video", device),
          mode: this.opts.cameraMode,
          fps: this.opts.cameraMode?.fps ?? 30,
          encoder: encoder ?? { codec: "libx264" },
          quality: this.opts.quality,
          file,
        }),
      this.opts.cameraLatency ?? 0,
    );
    try {
      await proc.started();
    } catch (error) {
      await this.dropStart(proc);
      throw error;
    }
    return this.adopt(proc);
  }

  private cameraFailed(message: string, journal: boolean): void {
    this.cameraState = "failed";
    if (journal) this.journal.write({ k: "fail", src: "camera", qpc: qpc(), message });
    this.warnings.push(`A câmera parou: ${message}`);
    this.emitEvent({
      source: "camera",
      level: "warning",
      message: `A câmera parou (${message}). A gravação segue sem ela.`,
      actions: [],
    });
  }

  /** The journal could not be written: the take goes on, without crash recovery from here. */
  private journalFailed(error: Error): void {
    const message = `O diário da gravação não pôde ser gravado (${error.message}): se o app cair agora, a recuperação pode ficar incompleta.`;
    this.warnings.push(message);
    this.emitEvent({ source: "disk", level: "warning", message, actions: [] });
  }

  private onExit(proc: CaptureProcess, info: { expected: boolean; message: string }): void {
    if (this.procs[proc.source] !== proc || info.expected) return;
    delete this.procs[proc.source];
    this.suspect.add(proc.file);
    const at = qpc();
    if (proc.source === "camera") {
      this.cameraFailed(info.message, true);
      return;
    }
    this.journal.write({
      k: "fail",
      src: proc.source,
      qpc: at,
      message: info.message.slice(0, 4000),
    });
    this.warnings.push(`${NAMES[proc.source]} parou: ${info.message}`);
    this.failed.add(proc.source);
    if (this.phase === "recording") {
      this.journal.write({ k: "pause", qpc: at });
      this.hook?.send({ cmd: "pause" });
      this.beginPause(at);
    }
    if (this.phase === "recording" || this.phase === "paused") this.phase = "failed";
    this.emitStatus();
    this.emitEvent({
      source: proc.source,
      level: "error",
      message: `${NAMES[proc.source]} parou de gravar (${info.message}). A gravação foi pausada.`,
      actions: ["resume", "stop"],
    });
  }

  private watchHook(): void {
    const hook = this.hook;
    if (!hook) return;
    hook.on("event", (event) => {
      if (event.e === "hb" || event.e === "ack") return;
      this.events.push(event);
      if (event.e === "ready" && this.cursorState === "restarting") this.cursorState = "ok";
    });
    hook.on("restart", ({ reason }) => {
      this.cursorIssues.push(reason);
      this.cursorState = "restarting";
      this.journal.write({ k: "health", qpc: qpc(), note: `cursor: ${reason}` });
    });
    hook.on("warning", (message) => this.cursorIssues.push(message));
    hook.on("failure", (error) => {
      this.cursorIssues.push(error.message);
      this.cursorState = "lost";
      this.journal.write({ k: "fail", src: "cursor", qpc: qpc(), message: error.message });
      this.emitEvent({
        source: "cursor",
        level: "warning",
        message: "O cursor parou de ser registrado. O vídeo continua gravando.",
        actions: [],
      });
    });
  }

  private startHealth(): void {
    this.health = new HealthMonitor({
      dir: this.dir,
      fps: this.opts.fps,
      elapsed: () => this.elapsed(),
      live: () => this.phase === "recording",
      screen: () => {
        const p = this.procs.screen;
        if (!p || p.first === null || !p.last) return null;
        return {
          part: p.part,
          seconds: (p.last.at - p.first) / 1000,
          frame: p.last.frame,
          dup: p.last.dup,
          drop: p.last.drop,
          speed: p.instantSpeed(),
        };
      },
      hasMic: () => !!this.opts.microphone,
      cursor: () => this.cursorState,
      camera: () => this.cameraState,
      system: () => {
        if (!this.opts.systemAudio) return "none";
        return this.system.started && qpc() - this.system.lastAt < SYSTEM_SILENT_MS
          ? "ok"
          : "waiting";
      },
      extraWarnings: () => {
        const out: string[] = [];
        if (this.journal.error) out.push("O diário da gravação não está sendo gravado.");
        if (this.cursorState === "lost") out.push("Sem cursor: o vídeo continua gravando.");
        if (this.cameraState === "failed") out.push("A câmera parou; a gravação segue sem ela.");
        if (
          this.opts.systemAudio &&
          this.phase === "recording" &&
          this.elapsed() > 3 &&
          (!this.system.started || qpc() - this.system.lastAt >= SYSTEM_SILENT_MS)
        )
          out.push("O áudio do PC não está chegando.");
        return out;
      },
      onDisk: (action) => {
        if (action === "pause") {
          // Paused and every file closed: the disk stops filling, and what was recorded stays.
          void this.pause().then(() => this.closeWhilePaused(["screen", "camera", "mic"]));
          this.emitEvent({
            source: "disk",
            level: "error",
            message:
              "O disco está quase cheio: a gravação foi pausada e os arquivos foram fechados. O que já foi gravado está salvo. Libere espaço e retome, ou pare e salve.",
            actions: ["resume", "stop"],
          });
        } else if (action === "stop") {
          void this.preserve();
          this.emitEvent({
            source: "disk",
            level: "error",
            message:
              "O disco está cheio: a gravação parou, com o espaço que ainda resta para salvá-la.",
            actions: ["stop"],
            request: "stop",
          });
        }
      },
      send: (health) => {
        const key = health.warnings.join("\n");
        if (key !== this.lastWarnings) {
          this.lastWarnings = key;
          if (key) this.journal.write({ k: "health", qpc: qpc(), note: key.slice(0, 4000) });
        }
        this.emit("health", health);
      },
    });
  }

  private emitStatus(): void {
    this.emit("status", this.status());
  }

  private emitEvent(event: RecorderEvent): void {
    this.emit("event", event);
  }
}

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
