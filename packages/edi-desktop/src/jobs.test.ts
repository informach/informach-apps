import { afterEach, describe, expect, it, vi } from "vitest";
import { createDesktopJobs, JOB_PRESERVATION_MS } from "./jobs";

afterEach(() => vi.useRealTimers());

function fixture() {
  let licensed = true;
  let monotonic = 0;
  let wall = 0;
  const failures: unknown[] = [];
  const jobs = createDesktopJobs({
    assertAccess: () => {
      if (!licensed) throw new Error("restricted");
    },
    onStopError: (error) => failures.push(error),
    monotonic: () => monotonic,
    wallClock: () => wall,
  });
  return {
    jobs,
    failures,
    access(value: boolean) {
      licensed = value;
      jobs.setAccess(value);
    },
    advance(ms: number) {
      monotonic += ms;
      wall += ms;
    },
    sleep(ms: number) {
      wall += ms;
    },
    rollback(ms: number) {
      wall -= ms;
    },
  };
}

describe("authorized work after license loss", () => {
  it("permits only existing work and never extends its original deadline", () => {
    const f = fixture();
    let stopped = 0;
    const job = f.jobs.begin({
      stop: () => {
        stopped++;
      },
    });
    f.access(false);
    expect(() => f.jobs.begin({ stop: () => {} })).toThrow("restricted");
    f.advance(JOB_PRESERVATION_MS - 1);
    f.access(false);
    job.check();
    expect(stopped).toBe(0);
    f.access(true);
    f.access(false);
    f.advance(1);
    expect(() => job.check()).toThrow("preservation_expired");
    expect(() => job.check()).toThrow("preservation_expired");
    expect(stopped).toBe(1);
    job.finish();
  });

  it("stops passive background work from the timer without further IPC", () => {
    vi.useFakeTimers();
    const f = fixture();
    let stopped = false;
    const job = f.jobs.begin({
      stop: () => {
        stopped = true;
      },
    });
    f.access(false);
    vi.advanceTimersByTime(JOB_PRESERVATION_MS);
    expect(stopped).toBe(true);
    job.finish();
  });

  it("stops recording immediately while a render may finalize", () => {
    const f = fixture();
    const stopped: string[] = [];
    const recording = f.jobs.begin({
      preserveForMs: 0,
      stop: () => {
        stopped.push("recording");
      },
    });
    const render = f.jobs.begin({
      stop: () => {
        stopped.push("render");
      },
    });
    f.access(false);
    expect(stopped).toEqual(["recording"]);
    expect(() => recording.check()).toThrow("preservation_expired");
    render.check();
    recording.finish();
    render.finish();
  });

  it("uses wall time across sleep and monotonic time across clock rollback", () => {
    for (const mode of ["sleep", "rollback"]) {
      const f = fixture();
      let stopped = false;
      const job = f.jobs.begin({
        stop: () => {
          stopped = true;
        },
      });
      f.access(false);
      if (mode === "sleep") f.sleep(JOB_PRESERVATION_MS);
      else {
        f.advance(JOB_PRESERVATION_MS);
        f.rollback(JOB_PRESERVATION_MS * 2);
      }
      f.jobs.checkDeadlines();
      expect(stopped).toBe(true);
      job.finish();
    }
  });

  it("does not cancel completed work or reuse its permit", () => {
    const f = fixture();
    let stopped = false;
    const job = f.jobs.begin({
      stop: () => {
        stopped = true;
      },
    });
    job.finish();
    f.access(false);
    expect(stopped).toBe(false);
    expect(() => job.check()).toThrow("job_finished");
  });

  it("reports preservation failures and enforces the maximum window", async () => {
    const f = fixture();
    expect(() =>
      f.jobs.begin({ preserveForMs: JOB_PRESERVATION_MS + 1, stop: () => {} }),
    ).toThrow();
    const failure = new Error("disk full");
    const job = f.jobs.begin({
      preserveForMs: 0,
      stop: async () => {
        throw failure;
      },
    });
    f.access(false);
    await Promise.resolve();
    expect(f.failures).toEqual([failure]);
    expect(() => job.check()).toThrow("preservation_expired");
    job.finish();
  });
});
