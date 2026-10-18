export interface FrameLoopOptions {
  autoplay?: boolean;
  respectReducedMotion?: boolean;
  pauseOffscreen?: boolean;
  onPlaybackChange?: (playing: boolean) => void;
  onActivityChange?: (active: boolean) => void;
  onError?: (error: Error) => void;
}
export type FramePolicy = Pick<FrameLoopOptions, "respectReducedMotion" | "pauseOffscreen">;
export function ownerWindow(root: SVGSVGElement) {
  const view = root.ownerDocument.defaultView;
  if (!view) throw new Error("O player requer uma janela DOM ativa.");
  return view;
}
/** Shared lifecycle for timeline and interactive SVG players. Invalidating a
 * pose never resets a running clock (pointer/input traffic cannot starve time). */
export function createFrameLoop(
  root: SVGSVGElement,
  callbacks: {
    paint(reduced: boolean): void;
    advance(seconds: number, playing: boolean): boolean;
    hasActivity?(): boolean;
    beforePlay?(): void;
  },
  options: FrameLoopOptions = {},
) {
  const view = ownerWindow(root);
  let playing = options.autoplay !== false,
    visible = true,
    destroyed = false,
    faulted = false,
    pending: number | null = null,
    last = 0,
    announced = playing,
    announcedActivity = false;
  const reduced = view.matchMedia("(prefers-reduced-motion:reduce)");
  const policy = {
    respectReducedMotion: options.respectReducedMotion !== false,
    pauseOffscreen: options.pauseOffscreen !== false,
  };
  const reduces = () => policy.respectReducedMotion && reduced.matches;
  let observer: IntersectionObserver | null = null;
  const canRun = () =>
    !destroyed &&
    !faulted &&
    (playing || callbacks.hasActivity?.()) &&
    (!policy.pauseOffscreen || visible) &&
    !root.ownerDocument.hidden &&
    !reduces();
  const announce = () => {
    if (announced !== playing) {
      announced = playing;
      options.onPlaybackChange?.(playing);
    }
    const active = playing && !!canRun();
    if (announcedActivity !== active) {
      announcedActivity = active;
      options.onActivityChange?.(active);
    }
  };
  const cancel = () => {
    if (pending !== null) view.cancelAnimationFrame(pending);
    pending = null;
  };
  const fail = (error: unknown) => {
    faulted = true;
    playing = false;
    cancel();
    announce();
    const reason = error instanceof Error ? error : new Error("Falha na execução do player.");
    if (options.onError) options.onError(reason);
    else throw reason;
    return reason;
  };
  function tick(now: number) {
    pending = null;
    if (!canRun()) return;
    try {
      const continuing = callbacks.advance(Math.max(0, now - last) / 1000, playing);
      if (destroyed) return;
      if (playing) playing = continuing;
      last = now;
      callbacks.paint(reduces());
      announce();
      if (canRun() && pending === null) pending = view.requestAnimationFrame(tick);
    } catch (error) {
      fail(error);
    }
  }
  function invalidate(propagate = false) {
    if (destroyed) return;
    if (!canRun()) cancel();
    try {
      callbacks.paint(reduces());
      announce();
      if (canRun() && pending === null) {
        last = view.performance.now();
        pending = view.requestAnimationFrame(tick);
      }
    } catch (error) {
      const reason = fail(error);
      if (propagate) throw reason;
    }
  }
  function observePolicy() {
    if (policy.pauseOffscreen && !observer) {
      const next = new view.IntersectionObserver((entries) => {
        if (observer !== next || destroyed) return;
        visible = entries.some((entry) => entry.isIntersecting);
        invalidate();
      });
      observer = next;
      next.observe(root);
    } else if (!policy.pauseOffscreen && observer) {
      observer.disconnect();
      observer = null;
      visible = true;
    }
  }
  const assertLive = () => {
    if (destroyed) throw new Error("O player foi encerrado.");
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    playing = false;
    cancel();
    observer?.disconnect();
    root.ownerDocument.removeEventListener("visibilitychange", environmentChanged);
    reduced?.removeEventListener("change", environmentChanged);
    announce();
  };
  const environmentChanged = () => invalidate();
  root.ownerDocument.addEventListener("visibilitychange", environmentChanged);
  reduced?.addEventListener("change", environmentChanged);
  try {
    observePolicy();
    invalidate(true);
  } catch (error) {
    destroy();
    throw error;
  }
  return {
    get playing() {
      return playing;
    },
    get reducedMotion() {
      return reduces();
    },
    play() {
      assertLive();
      faulted = false;
      callbacks.beforePlay?.();
      playing = true;
      invalidate(true);
    },
    pause() {
      assertLive();
      playing = false;
      invalidate(true);
    },
    invalidate() {
      assertLive();
      invalidate(true);
    },
    setPolicy(value: FramePolicy) {
      assertLive();
      if (
        Object.keys(value).some(
          (key) => !["respectReducedMotion", "pauseOffscreen"].includes(key),
        ) ||
        Object.values(value).some((value) => value !== undefined && typeof value !== "boolean")
      )
        throw new Error("Política de reprodução inválida.");
      const next = {
        respectReducedMotion: value.respectReducedMotion ?? policy.respectReducedMotion,
        pauseOffscreen: value.pauseOffscreen ?? policy.pauseOffscreen,
      };
      if (
        next.respectReducedMotion === policy.respectReducedMotion &&
        next.pauseOffscreen === policy.pauseOffscreen
      )
        return;
      if (value.respectReducedMotion !== undefined)
        policy.respectReducedMotion = value.respectReducedMotion;
      if (value.pauseOffscreen !== undefined) policy.pauseOffscreen = value.pauseOffscreen;
      observePolicy();
      invalidate(true);
    },
    fail,
    destroy,
  };
}
