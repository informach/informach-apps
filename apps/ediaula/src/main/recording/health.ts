import { readdir, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { METER_RATE } from "../../shared/captureArgs.ts";
import {
  type DiskAction,
  diskPlan,
  FrameWatch,
  pcmLevels,
  type RecorderHealth,
  SILENCE_WARN_SECONDS,
  SilenceMeter,
  type TakeSizes,
} from "../../shared/recordingHealth.ts";
import { qpc } from "../nativeHelper.ts";

/**
 * The health strip of a take, sent ten times a second: the microphone level from the same
 * process that records it, the disk (checked every five seconds, with the rate the take's files
 * grow at and the room finishing it will need), frames the encoder lost and the state of each
 * source.
 */

const TICK_MS = 100;
const DISK_EVERY_MS = 5000;

/** The current screen part as the monitor reads it. */
export interface ScreenReading {
  /** Identifies the part: a new part starts a new frame count. */
  part: number;
  /** Seconds since its first frame, at its last report. */
  seconds: number;
  frame: number;
  dup: number;
  drop: number;
  /** Output seconds per second over the last moments; null while unknown. */
  speed: number | null;
}

/** What the monitor reads from the session. */
export interface HealthInputs {
  dir: string;
  fps: number;
  /** Seconds recorded, without the pauses. */
  elapsed(): number;
  /** True while frames and sound count (not paused, not stopping). */
  live(): boolean;
  /** null without a screen part running. */
  screen(): ScreenReading | null;
  hasMic(): boolean;
  cursor(): RecorderHealth["cursor"];
  camera(): RecorderHealth["camera"];
  system(): RecorderHealth["system"];
  /** Warnings that do not come from the measures here. */
  extraWarnings(): string[];
  /** The disk calls for a pause or a stop, while the take is live. */
  onDisk(action: DiskAction): void;
  send(health: RecorderHealth): void;
}

export class HealthMonitor {
  private readonly inputs: HealthInputs;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly silence = new SilenceMeter();
  private frames: { part: number; watch: FrameWatch } | null = null;
  private level = { peak: 0, rms: 0 };
  private samples = { peak: 0, squares: 0, count: 0 };
  private disk: {
    free: number;
    minutesLeft: number | null;
    action: DiskAction;
    joinFits: boolean;
  } = {
    free: Number.POSITIVE_INFINITY,
    minutesLeft: null,
    action: "ok",
    joinFits: true,
  };
  private lastDisk = 0;
  private lastSize: { at: number; bytes: number } | null = null;
  private checking = false;
  private stopped = false;
  /** The last disk check failed (the folder or the drive went away). */
  private diskUnknown = false;

  constructor(inputs: HealthInputs) {
    this.inputs = inputs;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** 16-bit mono samples at METER_RATE from the microphone process. */
  feedMic(bytes: Uint8Array): void {
    const { peak, rms } = pcmLevels(bytes);
    const count = Math.floor(bytes.byteLength / 2);
    this.samples.peak = Math.max(this.samples.peak, peak);
    this.samples.squares += rms * rms * count;
    this.samples.count += count;
  }

  stop(): void {
    this.stopped = true;
    clearInterval(this.timer);
  }

  private tick(): void {
    const now = qpc();
    const live = this.inputs.live();
    if (this.samples.count) {
      const rms = Math.sqrt(this.samples.squares / this.samples.count);
      // Peaks fall back slowly, like a meter needle.
      this.level = { peak: Math.max(this.samples.peak, this.level.peak * 0.8), rms };
      if (live) this.silence.add(rms, this.samples.count / METER_RATE);
      this.samples = { peak: 0, squares: 0, count: 0 };
    }
    if (now - this.lastDisk >= DISK_EVERY_MS && !this.checking) {
      this.lastDisk = now;
      void this.checkDisk(now);
    }
    const warnings = [...this.inputs.extraWarnings()];
    const screen = this.inputs.screen();
    let frames: RecorderHealth["frames"] = null;
    if (screen) {
      if (this.frames?.part !== screen.part)
        this.frames = { part: screen.part, watch: new FrameWatch(this.inputs.fps) };
      const watched = this.frames.watch.update(screen);
      frames = { lost: watched.lost, speed: screen.speed ?? 0 };
      if (live && watched.slow)
        warnings.push("A máquina não acompanha: quadros estão sendo perdidos.");
    }
    if (this.diskUnknown) warnings.push("Não consegui medir o espaço em disco.");
    if (this.disk.action === "warn" && this.disk.minutesLeft !== null)
      warnings.push(
        `Restam cerca de ${Math.max(1, Math.floor(this.disk.minutesLeft))} min de espaço em disco.`,
      );
    if (!this.disk.joinFits)
      warnings.push(
        "Pouco espaço para juntar as partes da tela no fim: elas podem ficar separadas.",
      );
    const mic = this.inputs.hasMic() ? { ...this.level, silentFor: this.silence.silentFor } : null;
    if (mic && mic.silentFor >= SILENCE_WARN_SECONDS)
      warnings.push(`Microfone em silêncio há ${Math.floor(mic.silentFor)} s.`);
    this.inputs.send({
      elapsed: this.inputs.elapsed(),
      mic,
      disk: { free: this.disk.free, minutesLeft: this.disk.minutesLeft },
      frames,
      cursor: this.inputs.cursor(),
      camera: this.inputs.camera(),
      system: this.inputs.system(),
      warnings,
    });
  }

  private async checkDisk(now: number): Promise<void> {
    this.checking = true;
    try {
      const fs = await statfs(this.inputs.dir);
      const sizes = await takeSizes(this.inputs.dir);
      const bytes = sizes.screen + sizes.audio + sizes.other;
      const previous = this.lastSize;
      this.lastSize = { at: now, bytes };
      const rate =
        previous && now > previous.at ? ((bytes - previous.bytes) * 1000) / (now - previous.at) : 0;
      const free = fs.bavail * fs.bsize;
      this.disk = { free, ...diskPlan(free, rate, sizes) };
      this.diskUnknown = false;
      const action = this.disk.action;
      // Only a take that is recording grows: pausing (or stopping) is what makes it stop.
      if (!this.stopped && this.inputs.live() && (action === "pause" || action === "stop"))
        this.inputs.onDisk(action);
    } catch {
      // Shown in the strip; the next check tries again.
      this.diskUnknown = true;
    } finally {
      this.checking = false;
    }
  }
}

/** Bytes of the take's parts by kind (the files directly in its folder). */
async function takeSizes(dir: string): Promise<TakeSizes & { other: number }> {
  const sizes = { screen: 0, audio: 0, other: 0 };
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const size = (await stat(join(dir, entry.name))).size;
    if (/^tela-\d+\.mp4$/.test(entry.name)) sizes.screen += size;
    else if (/^(microfone-\d+\.m4a|sistema\.webm)$/.test(entry.name)) sizes.audio += size;
    else sizes.other += size;
  }
  return sizes;
}
