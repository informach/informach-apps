import type { FrameClock, HoldReason } from "./frameClock.ts";
import type { GuidedInteraction } from "./guidedCursor.ts";
import { LAPSE_FLOOR, LAPSE_MIN } from "./guidedLapse.ts";
import {
  actionLength,
  type Chord,
  DEFAULT_STEP_TIMEOUT,
  type GuidedCondition,
  type GuidedPlanV2,
  type GuidedStepTarget,
  type GuidedStepV2,
  needsTarget,
  type PlannedStep,
  parseChord,
  schedulePlan,
  smoothScrolls,
  TYPE_INTERVAL,
  WHEEL_INTERVAL,
  WHEEL_STEP,
  wheelSteps,
} from "./guidedPlan.ts";
import { humanDuration } from "./humanMotion.ts";
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
   * waits up to `timeout` seconds for the element to be there and usable. Showing it (`point`),
   * the hand rests just under it, where it does not cover what is written.
   */
  locate(
    target: GuidedStepTarget,
    phase: "approach" | "act",
    timeout: number,
    action?: GuidedStepV2["action"],
  ): Promise<Point>;
  /** Where the drag of `step` ends, the pointer being at `from` (on its source). */
  destination(step: GuidedStepV2, from: Point, timeout: number): Promise<Point>;
  /**
   * Travels along smoothPointer in `duration` seconds of the clock (0: at once), with the left
   * button held when dragging. A pause stops it where it is and the same curve goes on after.
   */
  glide(from: Point, to: Point, duration: number, drag?: boolean, size?: number): Promise<void>;
  /** Brings a target out of view into it with a smooth scroll (the page only). */
  reveal?(target: GuidedStepTarget, timeout: number): Promise<void>;
  /** A smooth wheel scroll of so many pixels (the page only); otherwise wheel notches. */
  scroll?(p: Point, dx: number, dy: number): Promise<void>;
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
  /**
   * The gestures the platform's recording bridge makes `action` of, as steps without times
   * (page only, shared/platformBridge.ts). `id` names them after the step.
   */
  platform?(action: string, id: string, timeout: number): Promise<GuidedStepV2[]>;
  /** Waits up to `timeout` wall seconds while the platform says it is busy (page only). */
  idle?(timeout: number): Promise<void>;
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
  /** Video seconds `from` to `to` go in under `narration` seconds (shared/guidedLapse.ts). */
  lapse?(from: number, to: number, narration: number, step: number): void;
}

export interface RunOptions {
  /** First step to run (the take starts at its phrase). */
  from?: number;
  /** Stop before this step (the untimed preparation of "Continuar da etapa k"). */
  to?: number;
  log?: GuidedRunLog;
  /** Verification: a failing step is reported here; the run goes on with the next one while
   *  it answers true. */
  onFailure?: (index: number, error: Error) => Promise<boolean>;
  /**
   * What the page took (wall seconds) to meet a condition of step `index`, and the seconds of
   * narration it had for that (verification: what will go in sped up).
   */
  onWaited?: (index: number, seconds: number, room: number) => void;
}

/**
 * Failing steps in a row, for "Verificar plano": past `limit` of them the rest of the plan is not
 * checked, since it depends on what failed (a page that never opened fails every step).
 */
export class FailureStreak {
  private readonly limit: number;
  private count = 0;
  private failed = -1;
  constructor(limit: number) {
    this.limit = limit;
  }
  /** A step starts: the streak goes on only if the one before it failed. */
  start(index: number): void {
    if (this.failed !== index - 1) this.count = 0;
  }
  /** A step failed: whether to check the next one. */
  fail(index: number): boolean {
    if (this.failed !== index - 1) this.count = 0;
    this.failed = index;
    this.count++;
    return this.count < this.limit;
  }
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
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Lets the button of an interrupted drag go where the pointer is. A release that fails too is
 * reported with the first error, never instead of it.
 */
async function letGo(driver: GuidedDriver, cause: unknown): Promise<void> {
  try {
    await driver.release(await driver.sample());
  } catch (error) {
    throw new Error(
      `${messageOf(cause)} O botão do mouse pode ter ficado pressionado: ${messageOf(error)}`,
      { cause },
    );
  }
}

/** The smaller side of the marked element, for how carefully the hand aims (40 without one). */
function targetSize(target: GuidedStepTarget | undefined): number {
  const rect = target?.locator?.fingerprint.rect;
  // A target named by text (the script, the platform) has no marked rectangle.
  return rect && rect.width > 0 && rect.height > 0
    ? Math.max(4, Math.min(rect.width, rect.height))
    : 40;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Seconds to watch a gesture of a platform's action before the next one. */
const GESTURE_AFTER = 0.4;

export async function runGuided(
  plan: GuidedPlanV2,
  driver: GuidedDriver,
  takeClock: GuidedClock,
  signal: AbortSignal,
  options: RunOptions = {},
): Promise<void> {
  const schedule = schedulePlan(plan, options.from ?? 0);
  const { move, dwell, after } = plan.tempos;
  // The video's clock records a page that takes longer than the narration gives instead of
  // holding ("Tela sem voz", shared/guidedLapse.ts): the run then goes on `shift` seconds later
  // in the video, and the schedule's seconds are the narration's without the lapses.
  const lapsing = takeClock.holds && !takeClock.instant;
  let shift = 0;
  const clock: GuidedClock = lapsing
    ? {
        ...takeClock,
        time: () => takeClock.time() - shift,
        wait: (t) => takeClock.wait(t + shift),
        hold: (t, reason) => takeClock.hold(t + shift, reason),
      }
    : takeClock;
  /** Video seconds where what the step did began: its action, then what it waited for. */
  let marks: number[] = [];
  const mark = (): void => {
    if (lapsing) marks.push(takeClock.time());
  };
  /**
   * A step starts after its time (the one before it waited or lasted longer than the narration
   * gave it): what that one did goes in sped up, from the latest moment that leaves it at least
   * LAPSE_FLOOR seconds of narration, so the run is back on its second.
   */
  const settle = (due: number, step: number): void => {
    const over = clock.time() - due;
    if (!lapsing || over < LAPSE_MIN || !marks.length) return;
    const now = takeClock.time();
    const from = [...marks].reverse().find((m) => now - m - over >= LAPSE_FLOOR) ?? marks[0];
    const narration = Math.max(LAPSE_FLOOR, now - from - over);
    if (now - from - narration < LAPSE_MIN) return;
    options.log?.lapse?.(round(from), round(now), round(narration), step);
    shift += now - from - narration;
  };
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
  /** Interactions go in the log on the video's seconds, as every other line of it does. */
  const logAct = (kind: GuidedInteraction, from: number, until: number, index: number): void =>
    log?.act(kind, from + shift, until + shift, index);

  const runStep = async (s: PlannedStep, next: number): Promise<void> => {
    const step = s.step;
    const timeout = step.timeout ?? DEFAULT_STEP_TIMEOUT;
    // Its time ends at the next step's start when that one comes sooner.
    const stop = Math.min(s.endAt, next);
    const lapse = lapsing && (step.wait?.policy ?? "lapse") === "lapse";
    /** Waits for the page: recorded under a lapse, or with the video held ("cut"). */
    const awaitPage = async (wait: () => Promise<void>): Promise<void> => {
      const room = Math.max(0, stop - clock.time());
      const began = performance.now();
      if (lapse) {
        mark();
        await wait();
      } else {
        clock.hold(stop, "wait");
        await wait();
        clock.release();
      }
      options.onWaited?.(s.index, (performance.now() - began) / 1000, room);
    };
    const awaitCondition = (condition: GuidedCondition): Promise<void> =>
      awaitPage(() => driver.until(condition, timeout));
    if (step.action === "platform") {
      await runPlatform(s, next, timeout, awaitPage);
      if (step.expect) await awaitCondition(step.expect);
      return;
    }
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
      // A target out of view is brought into it first, on camera, as a person scrolls to it
      // (checking a plan scrolls too, at once). A scroll longer than the time before the
      // pointer leaves goes in sped up, so the action still falls on its phrase.
      if (driver.reveal) {
        mark();
        await driver.reveal(step.target, timeout);
        settle(s.moveAt, s.index);
      }
      clock.hold(s.moveAt, "locate");
      const target = await driver.locate(step.target, "approach", timeout, step.action);
      const from = await driver.sample();
      clock.release();
      await clock.wait(s.moveAt);
      late(
        s.moveAt + 0.1,
        "A localização do alvo atrasou. Revise a etapa para preservar a antecipação da fala.",
      );
      // A person's hand takes its own time for the distance and the target, within the move's
      // room; it waits where it is first, so it still arrives when the schedule says.
      const size = targetSize(step.target);
      const distance = Math.hypot(target.x - from.x, target.y - from.y);
      // The Windows pointer only moves straight: there the move keeps its whole time.
      const hand =
        plan.tempos.motion && driver.space === "page"
          ? Math.min(move, humanDuration(distance, size, plan.tempos.motion))
          : move;
      if (hand < move) await clock.wait(s.moveAt + (span(move) - span(hand)));
      await driver.glide(from, target, span(hand), false, size);
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
      const final = await driver.locate(step.target, "act", timeout, step.action);
      await clock.wait(0);
      const shifted = moved(final, target);
      if (shifted && driver.space !== "page")
        throw new Error("O alvo se moveu durante a aproximação. Revise a etapa.");
      if (step.action === "drag") drop = await driver.destination(step, final, timeout);
      // The video goes on before the pointer follows: a correction never waits on itself.
      clock.release();
      if (shifted) {
        // The page moved it a little (a picture loaded): follow it in the time left before the
        // action, or at once when there is none.
        const room = actAt - clock.time() - 0.05;
        await driver.glide(target, final, span(Math.max(0, Math.min(0.25, dwell, room))));
        point = final;
      }
      await driver.ready(step.target, "click");
      check();
      await clock.wait(0);
      late(s.actAt + 0.5, "A validação do alvo atrasou. Revise a etapa antes de continuar.");
    }
    await clock.wait(actAt);
    late(s.actAt + 0.5, "A execução atrasou. A gravação foi pausada para não acelerar os cliques.");
    const at = clock.time();
    mark();
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
        logAct(step.action === "type" ? "click" : step.action, at, clock.time(), s.index);
        if (step.action !== "type") break;
        // Replacing what the field has: everything selected first, as a person would.
        if (step.replace) {
          const all = parseChord("Ctrl+A");
          if (all) await driver.key(all);
        }
        const typing = clock.time();
        let i = 0;
        for (const char of step.value ?? "") {
          await clock.wait(0);
          await driver.ready(step.target, "key");
          await clock.wait(0);
          await driver.text(char);
          await beat(typing, i++, TYPE_INTERVAL);
        }
        logAct("type", typing, clock.time(), s.index);
        break;
      }
      case "key": {
        const chord = parseChord(step.chord ?? "");
        if (!chord) throw new Error("Escolha uma tecla.");
        if (step.target) await driver.ready(step.target, "key");
        await clock.wait(0);
        late(s.actAt + 0.5, "A validação do alvo atrasou. Revise a etapa antes de continuar.");
        await driver.key(chord);
        logAct("key", at, clock.time(), s.index);
        break;
      }
      case "drag": {
        const from = point ?? (await driver.sample());
        const to = drop ?? (await driver.destination(step, from, timeout));
        await driver.press(from);
        let held = true;
        try {
          await driver.glide(from, to, span(move), true);
          held = false;
          await driver.release(to);
        } catch (cause) {
          // Stopped or failed mid-drag: the button never stays down after the run.
          if (held) await letGo(driver, cause);
          throw cause;
        }
        logAct("drag", at, clock.time(), s.index);
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
            // Past its own time the video holds while the page keeps scrolling, unless the
            // scrolling goes in sped up.
            if (clock.holds && !lapse && started + (i + 1) * WHEEL_INTERVAL > stop) {
              clock.hold(stop, "wait");
              await clock.rest(WHEEL_INTERVAL);
            } else await beat(started, i, WHEEL_INTERVAL);
          }
          clock.release();
        } else if (step.delta && driver.scroll && smoothScrolls(plan)) {
          await clock.wait(0);
          await driver.scroll(p, step.delta.x, step.delta.y);
        } else if (step.delta) {
          const n = wheelSteps(step.delta, plan.mode);
          const started = clock.time();
          for (let i = 0; i < n; i++) {
            await clock.wait(0);
            await driver.wheel(p, step.delta.x / n, step.delta.y / n);
            await beat(started, i, WHEEL_INTERVAL);
          }
        }
        logAct("wheel", at, clock.time(), s.index);
        break;
      }
      case "wait": {
        if (!step.until) throw new Error("Marque o elemento a esperar.");
        // Within its own time the page may take what it needs; beyond it the video goes on
        // (sped up afterwards) or holds.
        await awaitCondition(step.until);
        break;
      }
    }
    if (step.expect) await awaitCondition(step.expect);
    // Time to watch the result. On the video's clock the schedule already holds it (a step
    // that ran long held the video instead); the screen gives it in full after the action.
    await clock.wait(
      clock.holds || step.action === "wait" ? stop : Math.max(s.endAt, clock.time() + span(after)),
    );
  };

  /**
   * A platform's action: the bridge is asked for its gestures when the hand would leave for the
   * target, the first one is done on the step's own times (it acts on the phrase), and each of
   * the others when the one before it ended and the platform is no longer busy, with the hand of
   * a person. What runs past the next phrase goes in sped up, as any long step.
   */
  const runPlatform = async (
    s: PlannedStep,
    next: number,
    timeout: number,
    awaitPage: (wait: () => Promise<void>) => Promise<void>,
  ): Promise<void> => {
    const ask = driver.platform;
    if (!ask) throw new Error("A ação da plataforma só funciona na janela da aula.");
    await clock.wait(Math.max(0, s.moveAt - 0.25));
    clock.hold(s.moveAt, "locate");
    const gestures = await ask.call(driver, s.step.platform ?? "", s.step.id, timeout);
    clock.release();
    const idle = driver.idle;
    let asked = 1;
    for (let k = 0; k < gestures.length; k++) {
      const given = gestures[k];
      if (k > 0 && idle) await awaitPage(() => idle.call(driver, timeout));
      // "continuar": the page is asked again now, on what the gestures before it opened.
      if (given.action === "platform") {
        if (++asked > 10) throw new Error("A plataforma pediu para continuar vezes demais.");
        const more = await ask.call(driver, given.platform ?? "", `${s.step.id}-${asked}`, timeout);
        gestures.splice(k, 1, ...more);
        k--;
        continue;
      }
      // What the step says to do when the page is slow holds for its gestures that say nothing.
      const gesture = s.step.wait && !given.wait ? { ...given, wait: s.step.wait } : given;
      const moves = needsTarget(gesture, plan.mode);
      const length = actionLength(gesture, plan);
      const last = k === gestures.length - 1;
      let planned: PlannedStep;
      if (k === 0) {
        planned = {
          ...s,
          step: gesture,
          moves,
          ...(moves ? {} : { moveAt: s.actAt, arriveAt: s.actAt }),
          endAt: s.actAt + (last ? after : GESTURE_AFTER) + length,
        };
      } else {
        const moveAt = clock.time() + 0.25;
        const actAt = moves ? moveAt + move + dwell : moveAt;
        planned = {
          step: gesture,
          index: s.index,
          moves,
          moveAt,
          arriveAt: moves ? moveAt + move : actAt,
          speechAt: actAt,
          actAt,
          endAt: actAt + (last ? after : GESTURE_AFTER) + length,
        };
      }
      await runStep(planned, last ? next : planned.endAt);
    }
  };

  for (const [i, s] of schedule.steps.entries()) {
    if (options.to !== undefined && s.index >= options.to) break;
    check();
    const before = schedule.steps[i - 1];
    if (before) settle(s.moveAt, before.index);
    marks = [];
    clock.step?.(s.index);
    log?.step(s.index, "start");
    try {
      await runStep(s, schedule.steps[i + 1]?.moveAt ?? schedule.duration);
    } catch (cause) {
      clock.release();
      if (signal.aborted) throw new Error(STOPPED);
      const message = cause instanceof Error ? cause.message : String(cause);
      log?.step(s.index, "failed", message);
      const error = new GuidedStepError(s.index, message);
      if (!options.onFailure) throw error;
      if (!(await options.onFailure(s.index, error))) return;
      continue;
    }
    log?.step(s.index, "done");
  }
  if (options.to === undefined) {
    const last = schedule.steps.at(-1);
    if (last) settle(schedule.duration, last.index);
    await clock.wait(schedule.duration);
  }
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
