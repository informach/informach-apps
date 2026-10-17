import { assertDesktopAccess } from "./access.ts";

export const JOB_PRESERVATION_MS = 30 * 60 * 1000;

export interface DesktopJob {
  /** Check before starting a subsequent stage or committing an output. */
  check: () => void;
  finish: () => void;
}

interface TrackedJob {
  preserveFor: number;
  stop: () => void | Promise<void>;
  stopped: boolean;
  deadline?: { monotonic: number; wall: number };
  timer?: ReturnType<typeof setTimeout>;
}

/** A permit belongs to one already-authorized operation, never to a renderer.
 * Repeated status events and renewed access cannot extend an existing deadline.
 * Restarting the app cannot resume a permit: persisted work must be authorized anew. */
export function createDesktopJobs(options: {
  assertAccess: () => void;
  onStopError: (error: unknown) => void;
  monotonic?: () => number;
  wallClock?: () => number;
}) {
  const monotonic = options.monotonic ?? (() => performance.now());
  const wallClock = options.wallClock ?? Date.now;
  const jobs = new Set<TrackedJob>();
  function stop(job: TrackedJob) {
    if (job.stopped) return;
    job.stopped = true;
    if (job.timer) clearTimeout(job.timer);
    try {
      Promise.resolve(job.stop()).catch(options.onStopError);
    } catch (error) {
      options.onStopError(error);
    }
  }
  function restrict() {
    for (const job of jobs) {
      if (job.deadline || job.stopped) continue;
      job.deadline = {
        monotonic: monotonic() + job.preserveFor,
        wall: wallClock() + job.preserveFor,
      };
      if (job.preserveFor === 0) stop(job);
      else {
        job.timer = setTimeout(() => stop(job), job.preserveFor);
        job.timer.unref?.();
      }
    }
  }
  function checkDeadlines() {
    for (const job of jobs) {
      if (
        job.deadline &&
        (monotonic() >= job.deadline.monotonic || wallClock() >= job.deadline.wall)
      )
        stop(job);
    }
  }
  return {
    begin(input: { stop: () => void | Promise<void>; preserveForMs?: number }): DesktopJob {
      options.assertAccess();
      const preserveFor = input.preserveForMs ?? JOB_PRESERVATION_MS;
      if (!Number.isFinite(preserveFor) || preserveFor < 0 || preserveFor > JOB_PRESERVATION_MS)
        throw new Error("Invalid job preservation period");
      const job: TrackedJob = { preserveFor, stop: input.stop, stopped: false };
      jobs.add(job);
      let finished = false;
      return {
        check() {
          if (finished) throw new Error("edi_job_finished");
          // Catch expiration/clock changes even before the scheduled status refresh.
          try {
            options.assertAccess();
          } catch {
            restrict();
          }
          checkDeadlines();
          if (job.stopped) throw new Error("edi_job_preservation_expired");
        },
        finish() {
          finished = true;
          jobs.delete(job);
          if (job.timer) clearTimeout(job.timer);
        },
      };
    },
    setAccess(licensed: boolean) {
      if (!licensed) restrict();
      checkDeadlines();
    },
    checkDeadlines,
    dispose() {
      for (const job of jobs) if (job.timer) clearTimeout(job.timer);
      jobs.clear();
    },
  };
}

export const desktopJobs = createDesktopJobs({
  assertAccess: assertDesktopAccess,
  onStopError: (error) => {
    console.error(
      `[edi] job_preservation_failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  },
});
