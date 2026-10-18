import type { FrameClock, HoldReason } from "./frameClock.ts";
import type { GuidedInteraction } from "./guidedCursor.ts";
import {
  type Chord,
  DEFAULT_STEP_TIMEOUT,
  type GuidedCondition,
  type GuidedPlanV2,
  type GuidedStepTarget,
  type GuidedStepV2,
  type PlannedStep,
  parseChord,
  schedulePlan,
  TYPE_INTERVAL,
  WHEEL_INTERVAL,
  WHEEL_STEP,
  wheelSteps,
} from "./guidedPlan.ts";
import type { Point } from "./locators.ts";

/**
 * Runs a guided plan (shared/guidedPlan.ts) with either driver: the lesson page itself through
 * the Chrome DevTools Protocol (main/guidedCdp.ts), or the Windows pointer through the native
 * helper (shared/guidedNative.ts). The runner owns the didactic rhythm: it looks the target up
 * ahead of the movement, glides once to it, waits there before the action, checks the target
 * again, acts and leaves time to watch the result. The clock decides what lateness means: on the
 * screen the capture cannot wait, so a late step stops the run (it never catches up with rapid
 * clicks); in the lesson window the video's writer holds instead, so nothing is ever late.
 */

export type PointerButton = "left" | "right";

/** What moves and clicks for the runner: the page (CSS pixels) or the screen (physical pixels). */
export interface GuidedDriver {
  readonly space: "page" | "screen";
  /** The pointer now. */
  sample(): Promise<Point>;
  /**
   * Where to act on the target now. "approach" is the lookup before the movement (on the
   * screen it also checks the window); "act" the one just before the action. On the page it
   * waits up to `timeout` seconds for the element to be there and usable.
   */
  locate(target: GuidedStepTarget, phase: "approach" | "act", timeout: number): Promise<Point>;
  /** Where the drag of `step` ends, the pointer being at `from` (on its source). */
  destination(step: GuidedStepV2, from: Point, timeout: number): Promise<Point>;
  /**
   * Travels along smoothPointer in `duration` seconds of the clock (0: at once), with the left
   * button held when dragging. A pause stops it where it is and the same curve goes on after.
   */
  glide(from: Point, to: Point, duration: number, drag?: boolean): Promise<void>;
  /** The last check before the button or a key goes out. */
  ready(target: GuidedStepTarget | undefined, purpose: "click" | "key"): Promise<void>;
  click(p: Point, button: PointerButton, count: 1 | 2): Promise<void>;
  press(p: Point): Promise<void>;
  release(p: Point): Promise<void>;
  /** Down and right positive: CSS pixels on the page, notches on the screen. */
  wheel(p: Point, dx: number, dy: number): Promise<void>;
  key(chord: Chord): Promise<void>;
  /** One typed character. */
  text(char: string): Promise<void>;
  /** The condition holds now (page only). */
  check(condition: GuidedCondition): Promise<boolean>;
  /** Waits up to `timeout` wall seconds for the condition (page only). */
  until(condition: GuidedCondition, timeout: number): Promise<void>;
}

/** The time of the take and what to do when the page or the screen is late. */
export interface GuidedClock {
  /** Seconds of the take: the video's frame count, or the recorder's clock without the pauses. */
  time(): number;
  /** Resolves once the take reaches `t` and is not paused; rejects when the run was stopped. */
  wait(t: number): Promise<void>;
  /** The take may not pass `t` until release() (the page's writer holds; the screen cannot). */
  hold(t: number, reason: HoldReason): void;
  release(): void;
  /** A deadline that passed: only the screen can be late. */
  late(deadline: number): boolean;
  /** Seconds before an action when its target is looked up again. */
  readonly lookahead: number;
  /** No real time: only the order and the conditions count. */
  readonly instant: boolean;
  /** It holds instead of being late, so the schedule always stands. */
  readonly holds: boolean;
  /** Wall seconds, whatever the take's clock does (the page working while the video holds). */
  rest(seconds: number): Promise<void>;
  /** The step running now, for the holds. */
  step?(index: number): void;
}

/** What a take keeps of the run (guided-log.jsonl). */
export interface GuidedRunLog {
  step(index: number, status: "start" | "done" | "failed", message?: string): void;
  act(kind: GuidedInteraction, from: number, until: number, step: number): void;
}

export interface RunOptions {
  /** First step to run (the take starts at its phrase). */
  from?: number;
  /** Stop before this step (the untimed preparation of "Continuar da etapa k"). */
  to?: number;
  log?: GuidedRunLog;
  /** Verification: a failing step is reported here and the run goes on with the next one. */
  onFailure?: (index: number, error: Error) => Promise<void>;
}

/** A step that could not be done, with its index in the plan. */
export class GuidedStepError extends Error {
  readonly step: number;
  constructor(step: number, message: string) {
    super(`Etapa ${step + 1}: ${message}`);
    this.name = "GuidedStepError";
    this.step = step;
  }
}

export const STOPPED = "Automação interrompida.";
const moved = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) > 2 || Math.abs(a.y - b.y) > 2;

export async function runGuided(
  plan: GuidedPlanV2,
  driver: GuidedDriver,
  clock: GuidedClock,
  signal: AbortSignal,
  options: RunOptions = {},
): Promise<void> {
  const schedule = schedulePlan(plan, options.from ?? 0);
  const { move, dwell, after } = plan.tempos;
  const check = (): void => {
    if (signal.aborted) throw new Error(STOPPED);
  };
  const late = (deadline: number, message: string): void => {
    if (clock.late(deadline)) throw new Error(message);
  };
  const span = (seconds: number): number => (clock.instant ? 0 : seconds);
  /**
   * The i-th beat after `from` (a typed character, a wheel step). A clock that holds keeps them
   * on the schedule's own seconds; the screen counts from the last one, never catching up.
   */
  const beat = (from: number, i: number, interval: number): Promise<void> =>
    clock.wait(clock.holds ? from + (i + 1) * interval : clock.time() + span(interval));
  const log = options.log;

  const runStep = async (s: PlannedStep): Promise<void> => {
    const step = s.step;
    const timeout = step.timeout ?? DEFAULT_STEP_TIMEOUT;
    let point: Point | null = null;
    let drop: Point | null = null;
    let actAt = s.actAt;
    if (s.moves && step.target) {
      // Look the target up ahead of the movement, leaving room for the page's latency.
      await clock.wait(Math.max(0, s.moveAt - 0.25));
      late(
        s.moveAt + 0.1,
        "A execução atrasou. A gravação foi pausada para não acelerar os cliques.",
      );
      clock.hold(s.moveAt, "locate");
      const target = await driver.locate(step.target, "approach", timeout);
      const from = await driver.sample();
      clock.release();
      await clock.wait(s.moveAt);
      late(
        s.moveAt + 0.1,
        "A localização do alvo atrasou. Revise a etapa para preservar a antecipação da fala.",
      );
      await driver.glide(from, target, span(move));
      const arrived = clock.time();
      if (clock.late(s.arriveAt + 0.1) || clock.late(s.speechAt - 1e-9))
        throw new Error(
          "O cursor não chegou antes da fala com tempo para observar. A gravação foi pausada para revisão.",
        );
      point = target;
      // A clock that holds is never late: the arrival is the schedule's (within its last frame).
      if (!clock.instant && !clock.holds) actAt = Math.max(s.actAt, arrived + dwell);
      await clock.wait(actAt - clock.lookahead);
      late(
        s.actAt + 0.5,
        "O cursor atrasou em relação à fala. A gravação foi pausada para revisão.",
      );
      // Looked up again just before the action; on the page the video waits for the answer.
      clock.hold(actAt, "locate");
      const final = await driver.locate(step.target, "act", timeout);
      await clock.wait(0);
      if (moved(final, target)) {
        // The page moved it a little (a picture loaded): follow it. The screen cannot tell.
        if (driver.space !== "page")
          throw new Error("O alvo se moveu durante a aproximação. Revise a etapa.");
        await driver.glide(target, final, span(Math.min(0.25, dwell)));
        point = final;
      }
      if (step.action === "drag") drop = await driver.destination(step, point, timeout);
      clock.release();
      await driver.ready(step.target, "click");
      check();
      await clock.wait(0);
      late(s.actAt + 0.5, "A validação do alvo atrasou. Revise a etapa antes de continuar.");
    }
    await clock.wait(actAt);
    late(s.actAt + 0.5, "A execução atrasou. A gravação foi pausada para não acelerar os cliques.");
    const at = clock.time();
    switch (step.action) {
      case "point":
      case "hover":
        break;
      case "click":
      case "rightClick":
      case "doubleClick":
      case "type": {
        const p = point ?? (await driver.sample());
        await driver.click(
          p,
          step.action === "rightClick" ? "right" : "left",
          step.action === "doubleClick" ? 2 : 1,
        );
        log?.act(step.action === "type" ? "click" : step.action, at, clock.time(), s.index);
        if (step.action !== "type") break;
        const typing = clock.time();
        let i = 0;
        for (const char of step.value ?? "") {
          await clock.wait(0);
          await driver.ready(step.target, "key");
          await clock.wait(0);
          await driver.text(char);
          await beat(typing, i++, TYPE_INTERVAL);
        }
        log?.act("type", typing, clock.time(), s.index);
        break;
      }
      case "key": {
        const chord = parseChord(step.chord ?? "");
        if (!chord) throw new Error("Escolha uma tecla.");
        if (step.target) await driver.ready(step.target, "key");
        await clock.wait(0);
        late(s.actAt + 0.5, "A validação do alvo atrasou. Revise a etapa antes de continuar.");
        await driver.key(chord);
        log?.act("key", at, clock.time(), s.index);
        break;
      }
      case "drag": {
        const from = point ?? (await driver.sample());
        const to = drop ?? (await driver.destination(step, from, timeout));
        await driver.press(from);
        await driver.glide(from, to, span(move), true);
        await driver.release(to);
        log?.act("drag", at, clock.time(), s.index);
        break;
      }
      case "scroll": {
        const p = point ?? (await driver.sample());
        if (step.until) {
          const direction = Math.sign(step.delta?.y ?? 1) || 1;
          const most = Math.max(1, Math.ceil(timeout / WHEEL_INTERVAL));
          const started = clock.time();
          for (let i = 0; !(await driver.check(step.until)); i++) {
            if (i >= most)
              throw new Error(
                "Rolei a página até o limite de tempo e o elemento esperado não apareceu.",
              );
            await clock.wait(0);
            await driver.wheel(p, 0, direction * (plan.mode === "web" ? WHEEL_STEP : 1));
            // Past its own time the video holds while the page keeps scrolling.
            if (clock.holds && started + (i + 1) * WHEEL_INTERVAL > s.endAt) {
              clock.hold(s.endAt, "wait");
              await clock.rest(WHEEL_INTERVAL);
            } else await beat(started, i, WHEEL_INTERVAL);
          }
          clock.release();
        } else if (step.delta) {
          const n = wheelSteps(step.delta, plan.mode);
          const started = clock.time();
          for (let i = 0; i < n; i++) {
            await clock.wait(0);
            await driver.wheel(p, step.delta.x / n, step.delta.y / n);
            await beat(started, i, WHEEL_INTERVAL);
          }
        }
        log?.act("wheel", at, clock.time(), s.index);
        break;
      }
      case "wait": {
        if (!step.until) throw new Error("Marque o elemento a esperar.");
        // Within its own time the page may take what it needs; beyond it the video holds.
        clock.hold(s.endAt, "wait");
        await driver.until(step.until, timeout);
        clock.release();
        break;
      }
    }
    if (step.expect) {
      clock.hold(s.endAt, "wait");
      await driver.until(step.expect, timeout);
      clock.release();
    }
    // Time to watch the result. On the video's clock the schedule already holds it (a step
    // that ran long held the video instead); the screen gives it in full after the action.
    await clock.wait(
      clock.holds || step.action === "wait"
        ? s.endAt
        : Math.max(s.endAt, clock.time() + span(after)),
    );
  };

  for (const s of schedule.steps) {
    if (options.to !== undefined && s.index >= options.to) break;
    check();
    clock.step?.(s.index);
    log?.step(s.index, "start");
    try {
      await runStep(s);
    } catch (cause) {
      clock.release();
      if (signal.aborted) throw new Error(STOPPED);
      const message = cause instanceof Error ? cause.message : String(cause);
      log?.step(s.index, "failed", message);
      const error = new GuidedStepError(s.index, message);
      if (!options.onFailure) throw error;
      await options.onFailure(s.index, error);
      continue;
    }
    log?.step(s.index, "done");
  }
  if (options.to === undefined) await clock.wait(schedule.duration);
}

/** The recorder's clock for a screen take: paused while the take is, never holding. */
export function screenClock(
  time: () => number,
  paused: () => boolean,
  signal: AbortSignal,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): GuidedClock {
  return {
    instant: false,
    holds: false,
    lookahead: 0,
    time,
    async wait(at) {
      while (paused() || time() < at) {
        if (signal.aborted) throw new Error(STOPPED);
        await sleep(16);
      }
      if (signal.aborted) throw new Error(STOPPED);
    },
    hold() {},
    release() {},
    late: (deadline) => time() > deadline,
    rest: (seconds) => sleep(seconds * 1000),
  };
}

/** setTimeout that a stopped run cuts short. */
function wallSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(STOPPED));
      return;
    }
    const stop = (): void => {
      clearTimeout(timer);
      reject(new Error(STOPPED));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal.addEventListener("abort", stop, { once: true });
  });
}

/**
 * The video's own clock (shared/frameClock.ts) for a take in the lesson window: a step that
 * waits holds the writer, so nothing is ever late. Stopping the run rejects every wait.
 */
export function videoClock(clock: FrameClock, signal: AbortSignal, lookahead = 0.25): GuidedClock {
  const stop = (): void => clock.fail(new Error(STOPPED));
  if (signal.aborted) stop();
  else signal.addEventListener("abort", stop, { once: true });
  return {
    instant: false,
    holds: true,
    lookahead,
    time: () => clock.time(),
    wait: (t) => clock.wait(t),
    hold: (t, reason) => clock.limit(t, reason),
    release: () => clock.release(),
    late: () => false,
    rest: (seconds) => wallSleep(seconds * 1000, signal),
    step: (index) => {
      clock.step = index;
    },
  };
}

/** No real time: preparing a take that starts at a later step, or verifying a plan. */
export function instantClock(signal: AbortSignal): GuidedClock {
  let now = 0;
  return {
    instant: true,
    holds: false,
    lookahead: 0,
    time: () => now,
    async wait(at) {
      if (signal.aborted) throw new Error(STOPPED);
      now = Math.max(now, at);
    },
    hold() {},
    release() {},
    late: () => false,
    rest: async () => {
      if (signal.aborted) throw new Error(STOPPED);
    },
  };
}
