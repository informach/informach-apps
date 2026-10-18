/**
 * The clock of a guided take in the lesson window (main/guidedCapture.ts). The video's time is
 * the count of frames written divided by the frame rate: frames are due at a constant rate of the
 * wall clock, and the last painted picture is repeated when the page did not paint a new one.
 *
 * When something the plan waits for is late (a target still loading, a navigation, a condition)
 * the writer holds: no frames go out, the video's time stands still and the hold is recorded,
 * so the action still happens at its second of the narration (G26). A hold comes from a barrier
 * (the video may not pass a moment until it is lifted) or from an explicit reason (a pause, an
 * encoder that cannot keep up). Wall time spent holding is left out of the frame count, so
 * frames never come out in a burst afterwards.
 *
 * Pure: the caller passes the wall clock (milliseconds) and writes the frames tick() returns.
 */

export const HOLD_REASONS = ["locate", "wait", "navigation", "encoder", "pause", "paint"] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];
/**
 * A drag holds every frame until the page painted it ("paint"), a few milliseconds each: only a
 * wait as long as this (wall seconds) is a hold worth recording.
 */
const PAINT_RECORDED = 0.5;

export interface HoldRecord {
  /** Second of the video where it held. */
  at: number;
  /** Wall seconds it held. */
  duration: number;
  reason: HoldReason;
  /** Step of the plan running then. */
  step?: number;
}

interface Waiter {
  t: number;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class FrameClock {
  readonly fps: number;
  /** Frames written so far. */
  frames = 0;
  readonly holds: HoldRecord[] = [];
  /** Step of the plan running, for the hold records. */
  step: number | undefined;
  /**
   * The last frame woke a wait: the writer lets the run act before the next frame goes out,
   * so an action due at a second is in the frame of that second even after a stall.
   */
  woke = false;
  private readonly now: () => number;
  private origin: number | null = null;
  private heldMs = 0;
  /** Wall time the current hold began, and why. */
  private holdStart: number | null = null;
  private holdReason: HoldReason = "wait";
  /** The video may not pass this second; Infinity when nothing holds it. */
  private barrier = Number.POSITIVE_INFINITY;
  private barrierReason: HoldReason = "wait";
  private readonly reasons = new Set<HoldReason>();
  private waiters: Waiter[] = [];
  private readonly holdListeners = new Set<(hold: HoldRecord) => void>();
  /** Wall milliseconds spent paused, and when the pause under way began. */
  private pausedMs = 0;
  private pausedSince: number | null = null;
  private readonly listeners = new Set<(t: number) => boolean | undefined>();
  private failure: Error | null = null;

  constructor(fps: number, now: () => number) {
    if (!Number.isFinite(fps) || fps <= 0 || fps > 240)
      throw new Error("Taxa de quadros inválida.");
    this.fps = fps;
    this.now = now;
  }

  /** Seconds of the video so far: the time of the next frame to be written. */
  time(): number {
    return this.frames / this.fps;
  }

  get started(): boolean {
    return this.origin !== null;
  }

  /** Frame 0 is due now. */
  start(): void {
    if (this.origin === null) this.origin = this.now();
  }

  get holding(): boolean {
    return this.holdStart !== null;
  }

  get paused(): boolean {
    return this.reasons.has("pause");
  }

  /** Why it holds now, if it does. */
  get holdingFor(): HoldReason | null {
    return this.holdStart !== null ? this.holdReason : null;
  }

  /**
   * How many frames to write now: those due by the wall clock, never past the barrier and none
   * during an explicit hold. Each one must then go through frame().
   */
  tick(): number {
    if (this.origin === null || this.failure) return 0;
    const now = this.now();
    if (this.reasons.size) return 0;
    const running = this.heldMs + (this.holdStart !== null ? now - this.holdStart : 0);
    const wanted = Math.floor(((now - this.origin - running) * this.fps) / 1000 + 1e-9) + 1;
    const allowed = this.allowed();
    if (wanted > allowed && this.holdStart === null) {
      // The barrier was reached between two ticks: the hold began when its frame fell due.
      this.holdStart = Math.min(now, this.origin + this.heldMs + (allowed * 1000) / this.fps);
      this.holdReason = this.barrierReason;
    }
    return Math.max(0, Math.min(wanted, allowed) - this.frames);
  }

  /** The next frame goes out: listeners place the pointer for it, then waiters are woken. */
  frame(): number {
    const t = this.time();
    let ended = false;
    for (const listener of [...this.listeners]) if (listener(t) === true) ended = true;
    this.frames++;
    this.wake();
    if (ended) this.woke = true;
    return t;
  }

  /**
   * Called for every frame about to be written, with its second; a listener that finished
   * something there (a movement) returns true, so the run goes on before the next frame.
   * Returns the unsubscribe.
   */
  onFrame(listener: (t: number) => boolean | undefined): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves once the video reaches `t` and is not paused. */
  wait(t: number): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.time() >= t - 1e-9 && !this.paused) return Promise.resolve();
    return new Promise((resolve, reject) => this.waiters.push({ t, resolve, reject }));
  }

  /** The video may not pass second `t` until release(): the frame of second `t` waits for it. */
  limit(t: number, reason: HoldReason = "wait"): void {
    this.barrier = Math.max(t, this.time());
    this.barrierReason = reason;
  }

  /** What the barrier waits for turned out to be another thing (a page still navigating). */
  relabel(reason: HoldReason): void {
    if (!Number.isFinite(this.barrier)) return;
    this.barrierReason = reason;
    if (this.holdStart !== null && !this.reasons.size) this.holdReason = reason;
  }

  /** Lifts the barrier; a hold it caused ends now. */
  release(): void {
    this.barrier = Number.POSITIVE_INFINITY;
    if (!this.reasons.size) this.endHold();
  }

  /** No frames until resume(reason): a pause, or an encoder that fell behind. */
  hold(reason: HoldReason): void {
    if (this.reasons.has(reason)) return;
    this.reasons.add(reason);
    if (reason === "pause") this.pausedSince = this.now();
    if (this.holdStart === null && this.origin !== null) {
      this.holdStart = this.now();
      this.holdReason = reason;
    }
  }

  resume(reason: HoldReason): void {
    if (!this.reasons.delete(reason)) return;
    if (reason === "pause" && this.pausedSince !== null) {
      this.pausedMs += this.now() - this.pausedSince;
      this.pausedSince = null;
    }
    if (this.reasons.size) return;
    // A barrier still reached keeps holding; tick() sees it.
    if (this.frames < this.allowed()) this.endHold();
    else this.holdReason = this.barrierReason;
    this.wake();
  }

  /** Every wait rejects from now on (the take was stopped or failed). */
  fail(error: Error): void {
    this.failure ??= error;
    const waiting = this.waiters;
    this.waiters = [];
    for (const w of waiting) w.reject(this.failure);
  }

  /** Ends a hold still open (the take stops while holding). */
  close(): void {
    this.endHold();
  }

  /** Frames the barrier lets out: those before its second (the next one shows it). */
  private allowed(): number {
    return Number.isFinite(this.barrier)
      ? Math.ceil(this.barrier * this.fps - 1e-9)
      : Number.POSITIVE_INFINITY;
  }

  /** Wall milliseconds the take has been paused so far (a deadline does not count them). */
  pausedTotal(): number {
    return this.pausedMs + (this.pausedSince !== null ? this.now() - this.pausedSince : 0);
  }

  /** Called with each hold as it ends, so it can be kept at once. Returns the unsubscribe. */
  onHold(listener: (hold: HoldRecord) => void): () => void {
    this.holdListeners.add(listener);
    return () => this.holdListeners.delete(listener);
  }

  private endHold(): void {
    if (this.holdStart === null) return;
    const now = this.now();
    const duration = Math.max(0, now - this.holdStart);
    this.heldMs += duration;
    this.holdStart = null;
    if (duration <= 0 || (this.holdReason === "paint" && duration < PAINT_RECORDED * 1000)) return;
    const hold: HoldRecord = {
      at: Math.round(this.time() * 1000) / 1000,
      duration: Math.round(duration) / 1000,
      reason: this.holdReason,
      ...(this.step !== undefined ? { step: this.step } : {}),
    };
    this.holds.push(hold);
    for (const listener of [...this.holdListeners]) listener(hold);
  }

  private wake(): void {
    this.woke = false;
    if (this.paused) return;
    const t = this.time();
    const due = this.waiters.filter((w) => t >= w.t - 1e-9);
    if (!due.length) return;
    this.woke = true;
    this.waiters = this.waiters.filter((w) => t < w.t - 1e-9);
    for (const w of due) w.resolve();
  }
}
