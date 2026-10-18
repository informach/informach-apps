import { readdir, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { METER_RATE } from "../../shared/captureArgs.ts";
import {
  type DiskAction,
  diskPlan,
  lostFrames,
  pcmLevels,
  type RecorderHealth,
  SILENCE_WARN_SECONDS,
  SilenceMeter,
  SlowWatch,
} from "../../shared/recordingHealth.ts";
import { qpc } from "../nativeHelper.ts";

/**
 * The health strip of a take, sent ten times a second: the microphone level from the same
 * process that records it, the disk (checked every five seconds, with the rate the take's files
 * grow at), frames the encoder lost and the state of each source.
 */

const TICK_MS = 100;
const DISK_EVERY_MS = 5000;

/** What the monitor reads from the session. */
export interface HealthInputs {
  dir: string;
  fps: number;
  /** Seconds recorded, without the pauses. */
  elapsed(): number;
  /** True while frames and sound count (not paused, not stopping). */
  live(): boolean;
  /** The current screen part: seconds since its first frame at its last report, frames
   *  written by then and the encoder's speed; null without one. */
  screen(): { seconds: number; frame: number; speed: number } | null;
  hasMic(): boolean;
  cursor(): RecorderHealth["cursor"];
  camera(): RecorderHealth["camera"];
  system(): RecorderHealth["system"];
  /** Warnings that do not come from the measures here. */
  extraWarnings(): string[];
  /** The disk calls for a pause or a stop (once per change). */
  onDisk(action: DiskAction): void;
  send(health: RecorderHealth): void;
}

export class HealthMonitor {
  private readonly inputs: HealthInputs;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly silence = new SilenceMeter();
  private readonly slow = new SlowWatch();
  private level = { peak: 0, rms: 0 };
  private samples = { peak: 0, squares: 0, count: 0 };
  private disk: { free: number; minutesLeft: number | null; action: DiskAction } = {
    free: Number.POSITIVE_INFINITY,
    minutesLeft: null,
    action: "ok",
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
    const screen = this.inputs.screen();
    const frames = screen
      ? {
          lost: lostFrames(screen.seconds, this.inputs.fps, screen.frame),
          speed: screen.speed,
        }
      : null;
    const warnings = [...this.inputs.extraWarnings()];
    if (frames && live && this.slow.update(frames.speed, now / 1000))
      warnings.push("A máquina não acompanha: quadros estão sendo perdidos.");
    if (this.diskUnknown) warnings.push("Não consegui medir o espaço em disco.");
    if (this.disk.action === "warn" && this.disk.minutesLeft !== null)
      warnings.push(
        `Restam cerca de ${Math.max(1, Math.floor(this.disk.minutesLeft))} min de espaço em disco.`,
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
      const bytes = await folderSize(this.inputs.dir);
      const previous = this.lastSize;
      this.lastSize = { at: now, bytes };
      const rate =
        previous && now > previous.at ? ((bytes - previous.bytes) * 1000) / (now - previous.at) : 0;
      const plan = diskPlan(fs.bavail * fs.bsize, rate);
      const changed = plan.action !== this.disk.action;
      this.disk = { free: fs.bavail * fs.bsize, ...plan };
      this.diskUnknown = false;
      if (changed && !this.stopped && (plan.action === "pause" || plan.action === "stop"))
        this.inputs.onDisk(plan.action);
    } catch {
      // Shown in the strip; the next check tries again.
      this.diskUnknown = true;
    } finally {
      this.checking = false;
    }
  }
}

/** Bytes of the files directly in the take's folder (the parts being written). */
async function folderSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true }))
    if (entry.isFile()) total += (await stat(join(dir, entry.name))).size;
  return total;
}
