import { constants, setPriority as osSetPriority } from "node:os";

/**
 * Background work and the recorder. While a take runs, new work waits (unless the teacher turned
 * that off) and processes already running drop to low priority, so proxies, background removal,
 * transcription and exports do not take CPU, GPU and encoder sessions from the capture. Each kind
 * of work also has a number of slots, so ten imports do not start ten proxies at once; the
 * segment export uses the same slots and the same waiting.
 */

export type WorkKind = "proxy" | "keying" | "transcription" | "export" | "segment";

export interface SchedulerState {
  recording: boolean;
  /** New work is waiting for the take to end. */
  holding: boolean;
  /** Work waiting for a slot or for the take. */
  waiting: number;
  running: Record<WorkKind, number>;
}

/** What `track` needs of a child process. */
export interface TrackedChild {
  readonly pid?: number;
  once(event: "exit", listener: () => void): unknown;
}

export interface SchedulerOptions {
  slots?: Partial<Record<WorkKind, number>>;
  setPriority?: (pid: number, priority: number) => void;
  /** A priority that could not be changed (the process may have just ended). */
  onPriorityError?: (pid: number, error: unknown) => void;
}

const DEFAULT_SLOTS: Record<WorkKind, number> = {
  proxy: 2,
  keying: 1,
  transcription: 1,
  export: 1,
  segment: 2,
};

export class Scheduler {
  private recordingOn = false;
  private hold = true;
  private readonly slots: Record<WorkKind, number>;
  private readonly running: Record<WorkKind, number> = {
    proxy: 0,
    keying: 0,
    transcription: 0,
    export: 0,
    segment: 0,
  };
  private readonly wakers = new Set<() => void>();
  private readonly listeners = new Set<(state: SchedulerState) => void>();
  private readonly children = new Set<number>();
  private readonly setPriority: (pid: number, priority: number) => void;
  private readonly onPriorityError: (pid: number, error: unknown) => void;

  constructor(options: SchedulerOptions = {}) {
    this.slots = { ...DEFAULT_SLOTS, ...options.slots };
    this.setPriority = options.setPriority ?? osSetPriority;
    this.onPriorityError =
      options.onPriorityError ??
      ((pid, error) =>
        console.warn(`[ediaula] prioridade do processo ${pid} não mudou: ${String(error)}`));
  }

  get recording(): boolean {
    return this.recordingOn;
  }

  private get holding(): boolean {
    return this.recordingOn && this.hold;
  }

  state(): SchedulerState {
    return {
      recording: this.recordingOn,
      holding: this.holding,
      waiting: this.wakers.size,
      running: { ...this.running },
    };
  }

  /** A take started or ended; `hold: false` lets new work start during it (low priority). */
  setRecording(on: boolean, options: { hold?: boolean } = {}): void {
    const changed = on !== this.recordingOn;
    this.recordingOn = on;
    this.hold = options.hold ?? true;
    if (changed) for (const pid of this.children) this.prioritize(pid);
    this.wake();
  }

  /** Resolves once no take holds background work back. */
  waitUntilIdle(signal?: AbortSignal): Promise<void> {
    return this.waitFor(
      () => !this.holding,
      () => undefined,
      signal,
    );
  }

  /**
   * Runs `work` when a slot of its kind is free and no take holds it back. A slot is never
   * taken by two waiters: it is claimed in the same moment the condition is seen true.
   */
  async run<T>(kind: WorkKind, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.waitFor(
      () => !this.holding && this.running[kind] < this.slots[kind],
      () => {
        this.running[kind]++;
      },
      signal,
    );
    try {
      return await work();
    } finally {
      this.running[kind]--;
      this.wake();
    }
  }

  /** A child process of background work: low priority whenever a take is running. */
  track(child: TrackedChild): void {
    const pid = child.pid;
    if (!pid) return;
    this.children.add(pid);
    child.once("exit", () => this.children.delete(pid));
    if (this.recordingOn) this.prioritize(pid);
  }

  onChange(listener: (state: SchedulerState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private prioritize(pid: number): void {
    try {
      this.setPriority(
        pid,
        this.recordingOn ? constants.priority.PRIORITY_LOW : constants.priority.PRIORITY_NORMAL,
      );
    } catch (error) {
      this.onPriorityError(pid, error);
    }
  }

  private wake(): void {
    for (const check of [...this.wakers]) check();
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }

  private waitFor(ready: () => boolean, claim: () => void, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (ready()) {
      claim();
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const done = (): void => {
        this.wakers.delete(check);
        signal?.removeEventListener("abort", abort);
      };
      const check = (): void => {
        if (!ready()) return;
        claim();
        done();
        resolve();
      };
      const abort = (): void => {
        done();
        reject(signal?.reason);
        this.wake();
      };
      this.wakers.add(check);
      signal?.addEventListener("abort", abort, { once: true });
      const state = this.state();
      for (const listener of this.listeners) listener(state);
    });
  }
}

/** The app's scheduler (main/index.ts, the recorder and the FFmpeg children share it). */
export const scheduler = new Scheduler();
