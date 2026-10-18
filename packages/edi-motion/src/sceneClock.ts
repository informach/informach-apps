import { createFrameLoop, type FrameLoopOptions, type FramePolicy } from "./frameLoop";
import type { RigEvaluationBudget } from "./rig/kinematics";

export interface ScopeAdvance {
  audioCues?: number;
  events: number;
  lines: number;
  vertices: number;
  continuing: boolean;
  /** All scopes validate first, all commit second, observers run last. */
  commit(): () => void;
}
export interface ScopeCallbacks {
  paint(reduced: boolean, budget?: RigEvaluationBudget): void;
  prepareAdvance(seconds: number, playing: boolean, budget?: RigEvaluationBudget): ScopeAdvance;
  prepareReset(budget?: RigEvaluationBudget): ScopeAdvance;
  hasActivity(): boolean;
}
export interface ScopeLoop {
  readonly playing: boolean;
  play(): void;
  pause(): void;
  invalidate(): void;
  setPolicy(value: FramePolicy): void;
  fail(error: unknown): void;
  destroy(): void;
}
/** One RAF/visibility/reduced-motion owner for the entire component tree. */
export function createSceneClock() {
  const scopes: {
    path: readonly string[];
    speed: number;
    active: boolean;
    callbacks: ScopeCallbacks;
  }[] = [];
  let loop: ReturnType<typeof createFrameLoop> | undefined,
    notifying = false,
    destroyed = false;
  function contains(parent: readonly string[], child: readonly string[]) {
    return parent.length <= child.length && parent.every((id, index) => child[index] === id);
  }
  function validateFrameTotals(plans: readonly Pick<ScopeAdvance, "lines" | "vertices">[]) {
    if (plans.reduce((sum, plan) => sum + plan.lines, 0) > 2000)
      throw new Error("Cena excede o orçamento agregado de linhas de texto.");
    if (plans.reduce((sum, plan) => sum + plan.vertices, 0) > 100000)
      throw new Error("Cena excede o orçamento agregado de geometria transitória.");
  }
  function advance(path: readonly string[], seconds: number, playing: boolean, manual = false) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 10)
      throw new Error("Avanço da cena deve estar entre 0 e 10 segundos.");
    const selected = scopes.filter((scope) => contains(path, scope.path)),
      base = selected[0];
    if (!base) throw new Error("Escopo de avanço inexistente.");
    const budget = { remaining: 2_000_000 };
    const plans = selected.map((scope) => {
      const active =
        manual ||
        (playing &&
          scopes.every((ancestor) => !contains(ancestor.path, scope.path) || ancestor.active));
      const scaled = (seconds * scope.speed) / (manual ? base.speed : 1);
      return scope.callbacks.prepareAdvance(scaled, active, budget);
    });
    if (plans.reduce((sum, plan) => sum + plan.events, 0) > 512)
      throw new Error("Cena excede o orçamento agregado de eventos por avanço.");
    if (plans.reduce((sum, plan) => sum + (plan.audioCues ?? 0), 0) > 128)
      throw new Error("Cena excede orçamento de 128 efeitos de áudio por avanço.");
    const outside = scopes
      .filter((scope) => !contains(path, scope.path))
      .map((scope) => scope.callbacks.prepareAdvance(0, false));
    validateFrameTotals([...plans, ...outside]);
    const observers = plans.map((plan) => plan.commit());
    for (const notify of observers) {
      if (destroyed) break;
      notify();
    }
    return !destroyed && plans.some((plan) => plan.continuing);
  }
  return {
    assertWritable() {
      if (destroyed) throw new Error("Relógio da cena encerrado.");
      if (notifying) throw new Error("Não altere a cena durante callbacks de observação.");
    },
    validateFrame(path: readonly string[], lines: number, vertices: number) {
      validateFrameTotals(
        scopes.map((scope) =>
          scope.path.length === path.length && contains(path, scope.path)
            ? { lines, vertices }
            : scope.callbacks.prepareAdvance(0, false),
        ),
      );
    },
    notify(callback: () => void) {
      const previous = notifying;
      notifying = true;
      try {
        callback();
      } finally {
        notifying = previous;
      }
    },
    register(
      path: readonly string[],
      speed: number,
      callbacks: ScopeCallbacks,
      options: FrameLoopOptions,
    ): ScopeLoop {
      const scope = { path, speed, active: options.autoplay !== false, callbacks };
      scopes.push(scope);
      return {
        get playing() {
          return (loop?.playing ?? false) && scope.active;
        },
        play() {
          scope.active = true;
          if (!path.length) loop?.play();
          else loop?.invalidate();
        },
        pause() {
          scope.active = false;
          if (!path.length) loop?.pause();
          else loop?.invalidate();
        },
        invalidate() {
          loop?.invalidate();
        },
        setPolicy(value) {
          loop?.setPolicy(value);
        },
        fail(error) {
          if (loop) loop.fail(error);
          else throw error;
        },
        destroy() {
          scope.active = false;
        },
      };
    },
    start(root: SVGSVGElement, options: FrameLoopOptions) {
      if (loop) throw new Error("Relógio de cena já iniciado.");
      validateFrameTotals(scopes.map((scope) => scope.callbacks.prepareAdvance(0, false)));
      loop = createFrameLoop(
        root,
        {
          paint(reduced) {
            const budget = { remaining: 2_000_000 };
            for (const scope of scopes) scope.callbacks.paint(reduced, budget);
          },
          advance(seconds, playing) {
            return advance([], seconds, playing);
          },
          hasActivity() {
            return scopes.some((scope) => scope.callbacks.hasActivity());
          },
        },
        options,
      );
    },
    advance(path: readonly string[], seconds: number) {
      this.assertWritable();
      advance(path, seconds, true, true);
      loop?.invalidate();
    },
    reset(path: readonly string[]) {
      this.assertWritable();
      const budget = { remaining: 2_000_000 };
      const plans = scopes
        .filter((scope) => contains(path, scope.path))
        .map((scope) => scope.callbacks.prepareReset(budget));
      const outside = scopes
        .filter((scope) => !contains(path, scope.path))
        .map((scope) => scope.callbacks.prepareAdvance(0, false));
      validateFrameTotals([...plans, ...outside]);
      const observers = plans.map((plan) => plan.commit());
      for (const notify of observers) {
        if (destroyed) break;
        notify();
      }
      loop?.invalidate();
    },
    invalidate() {
      loop?.invalidate();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      const owned = loop;
      loop = undefined;
      scopes.length = 0;
      owned?.destroy();
    },
  };
}
export type SceneClock = ReturnType<typeof createSceneClock>;
