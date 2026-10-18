import { type Chord, type GuidedStepTarget, type GuidedStepV2, migratePlan } from "./guidedPlan.ts";
import { type GuidedPlan, type GuidedTarget, scheduleGuided } from "./guidedRecording.ts";
import {
  type GuidedClock,
  type GuidedDriver,
  type PointerButton,
  runGuided,
  STOPPED,
  screenClock,
} from "./guidedRunner.ts";
import { type GlideResult, glideResultSchema, haltResultSchema } from "./helperProtocol.ts";
import type { Point } from "./locators.ts";

/**
 * The screen driver of the guided recording (D7): the Windows pointer, moved and clicked by the
 * native helper's input mode (main/nativeHelper.ts InputClient), for targets outside the lesson
 * window. Positions are physical pixels of the desktop. Before the movement the target's window
 * is checked (same window, same place); before a click, that the pointer was not moved meanwhile;
 * before a key, that the window is in front.
 */

/** The helper's input protocol: one JSON command, one answer. */
export interface HelperCommands {
  command<T = void>(data: Record<string, unknown>): Promise<T>;
}

export class HelperDriver implements GuidedDriver {
  readonly space = "screen";
  private readonly input: HelperCommands;
  private readonly clock: GuidedClock;
  private readonly paused: () => boolean;
  private readonly signal: AbortSignal;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly resolveTarget: (target: GuidedTarget) => Promise<GuidedTarget>;
  /** Where the last approach found the target: its window is checked again before acting. */
  private approach: GuidedTarget | null = null;
  private glides = 0;

  constructor(options: {
    input: HelperCommands;
    clock: GuidedClock;
    paused: () => boolean;
    signal: AbortSignal;
    sleep?: (ms: number) => Promise<void>;
    /** Elements of the lesson window looked up again (main/guidedBrowser.ts); positions as they are. */
    resolveTarget?: (target: GuidedTarget) => Promise<GuidedTarget>;
  }) {
    this.input = options.input;
    this.clock = options.clock;
    this.paused = options.paused;
    this.signal = options.signal;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.resolveTarget = options.resolveTarget ?? (async (target) => target);
  }

  sample(): Promise<Point> {
    return this.input.command<GuidedTarget>({ op: "sample" });
  }

  async locate(target: GuidedStepTarget, phase: "approach" | "act"): Promise<Point> {
    if (!target.screen) throw new Error("Marque o alvo desta etapa.");
    const found = await this.resolveTarget(target.screen);
    if (phase === "approach") {
      await this.clock.wait(0);
      await this.input.command({ op: "verify", ...found });
      await this.clock.wait(0);
      this.approach = found;
    }
    return found;
  }

  async destination(step: GuidedStepV2): Promise<Point> {
    const point = step.to?.point;
    if (point?.space === "screen") return { x: Math.round(point.x), y: Math.round(point.y) };
    if (step.to?.target?.screen) return this.resolveTarget(step.to.target.screen);
    throw new Error("Marque onde o arrasto termina.");
  }

  /**
   * One glide per movement: the helper interpolates it on its own clock with smoothPointer's
   * curve, so a slow main process no longer makes the pointer stutter. A pause halts it where it
   * is and the same curve resumes afterwards; a helper that falls behind stops instead of jumping.
   * Each glide has a token, so a halt that crosses the glide's own end cannot stop the next one.
   */
  async glide(from: Point, to: Point, duration: number): Promise<void> {
    let at = 0;
    for (;;) {
      await this.clock.wait(0);
      const token = `glide-${++this.glides}`;
      let done: { value: GlideResult } | { error: unknown } | undefined;
      void this.input
        .command<unknown>({
          op: "glide",
          token,
          x: to.x,
          y: to.y,
          from: { x: from.x, y: from.y },
          duration: Math.max(duration, 0.05),
          at,
        })
        .then(
          (value) => {
            done = { value: glideResultSchema.parse(value) };
          },
          (error: unknown) => {
            done = { error };
          },
        );
      let halted = false;
      while (!done) {
        await this.sleep(16);
        if (!done && !halted && (this.paused() || this.signal.aborted)) {
          halted = true;
          // halted: false means the glide had already ended; its own answer says where.
          haltResultSchema.parse(await this.input.command<unknown>({ op: "halt", token }));
        }
      }
      if ("error" in done) throw done.error;
      if (done.value.late)
        throw new Error(
          "O movimento atrasou. A gravação foi pausada para evitar um salto do cursor.",
        );
      if (this.signal.aborted) throw new Error(STOPPED);
      if (done.value.at >= 1) return;
      at = done.value.at;
    }
  }

  async ready(target: GuidedStepTarget | undefined, purpose: "click" | "key"): Promise<void> {
    const where = this.approach ?? target?.screen;
    if (!where) throw new Error("Marque o alvo desta etapa.");
    await this.input.command({
      op: "verify",
      ...where,
      ...(purpose === "click" ? { cursor: true } : { focus: true }),
    });
  }

  async click(_p: Point, button: PointerButton, count: 1 | 2): Promise<void> {
    await this.input.command({ op: count === 2 ? "double" : "click", right: button === "right" });
  }

  async press(): Promise<void> {
    await this.input.command({ op: "down", button: "left" });
  }

  async release(): Promise<void> {
    await this.input.command({ op: "up", button: "left" });
  }

  /** Notches of the wheel (120 each), down and right positive. */
  async wheel(_p: Point, dx: number, dy: number): Promise<void> {
    if (dy) await this.input.command({ op: "wheel", delta: -Math.round(dy * 120) });
    if (dx)
      await this.input.command({ op: "wheel", delta: Math.round(dx * 120), horizontal: true });
  }

  async key(chord: Chord): Promise<void> {
    if (!chord.ctrl && !chord.alt && !chord.shift && !chord.meta)
      await this.input.command({ op: "key", value: chord.vk });
    else
      await this.input.command({
        op: "combo",
        value: chord.vk,
        ctrl: chord.ctrl,
        alt: chord.alt,
        shift: chord.shift,
        win: chord.meta,
      });
  }

  async text(char: string): Promise<void> {
    await this.input.command({ op: "key", value: char.charCodeAt(0), unicode: true });
  }

  check(): Promise<boolean> {
    return Promise.reject(new Error("Esperar por um elemento só funciona na janela da aula."));
  }

  until(): Promise<void> {
    return Promise.reject(new Error("Esperar por um elemento só funciona na janela da aula."));
  }
}

/**
 * A version 1 plan on the screen, as the recorder ran it before plans were saved: the same
 * checks (only navigation keys), migrated and run by the common runner.
 */
export async function executeGuided(
  plan: GuidedPlan,
  input: HelperCommands,
  time: () => number,
  paused: () => boolean,
  signal: AbortSignal,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  resolveTarget: (target: GuidedTarget) => Promise<GuidedTarget> = async (target) => target,
): Promise<void> {
  scheduleGuided(plan);
  const clock = screenClock(time, paused, signal, sleep);
  const driver = new HelperDriver({ input, clock, paused, signal, sleep, resolveTarget });
  await runGuided(migratePlan(plan), driver, clock, signal);
}
