import { type GuidedPlan, type GuidedTarget, scheduleGuided } from "./guidedRecording.ts";
import type { GlideResult } from "./helperProtocol.ts";

export interface GuidedDriver {
  command<T = void>(data: Record<string, unknown>): Promise<T>;
}

/** Uses the recorder's clock, which freezes during pause. Never catches up with rapid clicks. */
export async function executeGuided(
  plan: GuidedPlan,
  input: GuidedDriver,
  time: () => number,
  paused: () => boolean,
  signal: AbortSignal,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  resolveTarget: (target: GuidedTarget) => Promise<GuidedTarget> = async (target) => target,
): Promise<void> {
  const schedule = scheduleGuided(plan);
  const check = () => {
    if (signal.aborted) throw new Error("Automação interrompida.");
  };
  const wait = async (at: number) => {
    while (paused() || time() < at) {
      check();
      await sleep(16);
    }
    check();
  };
  /**
   * One glide per movement: the helper interpolates it on its own clock with smoothPointer's
   * curve, so a slow main process no longer makes the pointer stutter. A pause halts it where it
   * is and the same curve resumes afterwards; a helper that falls behind stops instead of jumping.
   */
  const glide = async (from: { x: number; y: number }, to: GuidedTarget): Promise<void> => {
    let at = 0;
    for (;;) {
      await wait(0);
      let done: { value: GlideResult } | { error: unknown } | undefined;
      void input
        .command<GlideResult>({
          op: "glide",
          x: to.x,
          y: to.y,
          from: { x: from.x, y: from.y },
          duration: plan.move,
          at,
        })
        .then(
          (value) => {
            done = { value };
          },
          (error: unknown) => {
            done = { error };
          },
        );
      let halted = false;
      while (!done) {
        await sleep(16);
        if (!done && !halted && (paused() || signal.aborted)) {
          halted = true;
          await input.command({ op: "halt" });
        }
      }
      if ("error" in done) throw done.error;
      if (done.value.late)
        throw new Error(
          "O movimento atrasou. A gravação foi pausada para evitar um salto do cursor.",
        );
      check();
      if (done.value.at >= 1) return;
      at = done.value.at;
    }
  };
  const keyCodes: Record<string, number> = {
    Enter: 13,
    Tab: 9,
    Space: 32,
    Escape: 27,
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39,
  };
  for (const s of schedule.steps) {
    // Resolve the web element ahead of the movement, leaving room for IPC/DOM latency.
    await wait(Math.max(0, s.moveAt - 0.25));
    if (time() > s.moveAt + 0.1)
      throw new Error("A execução atrasou. A gravação foi pausada para não acelerar os cliques.");
    const target = await resolveTarget(s.step.target!);
    await wait(0);
    await input.command({ op: "verify", ...target });
    await wait(0);
    const from = await input.command<GuidedTarget>({ op: "sample" });
    await wait(s.moveAt);
    if (time() > s.moveAt + 0.1)
      throw new Error(
        "A localização do alvo atrasou. Revise a etapa para preservar a antecipação da fala.",
      );
    await glide(from, target);
    const arrived = time();
    if (arrived > s.arriveAt + 0.1 || arrived >= s.speechAt)
      throw new Error(
        "O cursor não chegou antes da fala com tempo para observar. A gravação foi pausada para revisão.",
      );
    await wait(Math.max(s.actAt, arrived + plan.dwell));
    if (time() > s.actAt + 0.5)
      throw new Error("O cursor atrasou em relação à fala. A gravação foi pausada para revisão.");
    const finalTarget = await resolveTarget(s.step.target!);
    await wait(0);
    if (Math.abs(finalTarget.x - target.x) > 2 || Math.abs(finalTarget.y - target.y) > 2)
      throw new Error("O alvo se moveu durante a aproximação. Revise a etapa.");
    await input.command({ op: "verify", ...target, cursor: true });
    check();
    if (paused()) await wait(0);
    if (time() > s.actAt + 0.5)
      throw new Error("A validação do alvo atrasou. Revise a etapa antes de continuar.");
    if (s.step.action === "click" || s.step.action === "rightClick" || s.step.action === "type")
      await input.command({ op: "click", right: s.step.action === "rightClick" });
    if (s.step.action === "key") {
      await input.command({ op: "verify", ...target, focus: true });
      await wait(0);
      if (time() > s.actAt + 0.5)
        throw new Error("A validação do alvo atrasou. Revise a etapa antes de continuar.");
      await input.command({ op: "key", value: keyCodes[s.step.value!] });
    }
    if (s.step.action === "type") {
      for (let i = 0; i < s.step.value!.length; i++) {
        await wait(0);
        await input.command({ op: "verify", ...target, focus: true });
        await wait(0);
        await input.command({ op: "key", value: s.step.value!.charCodeAt(i), unicode: true });
        await wait(time() + 0.08);
      }
    }
    await wait(Math.max(s.endAt, time() + plan.after));
  }
  await wait(schedule.duration);
}
