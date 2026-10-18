import { projectDuration } from "@shared/timeline";
import { create } from "zustand";
import { shownProject } from "./project";

interface PlaybackStore {
  time: number;
  playing: boolean;
  /** Negative while shuttling backwards with J. */
  rate: number;
}

export const usePlayback = create<PlaybackStore>(() => ({ time: 0, playing: false, rate: 1 }));

let raf = 0;
let anchorTime = 0;
let anchorNow = 0;

/**
 * A stretch played on its own (reviewing a cut): it stops at `until`, jumps over the `skip`
 * ranges as if they were already cut, and calls `onEnd` when it reaches the end by itself.
 */
let span: { until: number; skip: [number, number][]; onEnd?: () => void } | null = null;

/** The lesson as shown: a draft that adds an opening card plays to its own end. */
const duration = (): number => projectDuration(shownProject() ?? { clips: [] });

function tick(now: number): void {
  const { rate, playing } = usePlayback.getState();
  if (!playing) return;
  const end = duration();
  // The first frame's timestamp can be a hair earlier than the moment play was pressed: never run
  // the clock backwards, and only stop at 0 when playing in reverse (or a play from 0:00 stops at once).
  let t = anchorTime + (Math.max(0, now - anchorNow) / 1000) * rate;
  if (span && rate > 0) {
    const jump = span.skip.find(([a, b]) => t >= a && t < b);
    if (jump) {
      usePlayback.setState({ time: jump[1] });
      anchor();
      raf = requestAnimationFrame(tick);
      return;
    }
    if (t >= span.until) {
      const { onEnd, until } = span;
      span = null;
      usePlayback.setState({ time: Math.min(until, end), playing: false, rate: 1 });
      onEnd?.();
      return;
    }
  }
  if ((rate > 0 && t >= end) || (rate < 0 && t <= 0)) {
    t = Math.min(Math.max(t, 0), end);
    span = null;
    usePlayback.setState({ time: t, playing: false, rate: 1 });
    return;
  }
  usePlayback.setState({ time: t });
  raf = requestAnimationFrame(tick);
}

function anchor(): void {
  anchorTime = usePlayback.getState().time;
  anchorNow = performance.now();
}

export const playback = {
  play(rate = 1): void {
    const end = duration();
    if (end <= 0) return;
    span = null;
    const s = usePlayback.getState();
    if (rate > 0 && s.time >= end - 0.01) usePlayback.setState({ time: 0 });
    usePlayback.setState({ playing: true, rate });
    anchor();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  },
  pause(): void {
    span = null;
    cancelAnimationFrame(raf);
    usePlayback.setState({ playing: false, rate: 1 });
  },
  toggle(): void {
    if (usePlayback.getState().playing) playback.pause();
    else playback.play();
  },
  seek(t: number): void {
    const time = Math.min(Math.max(0, t), Math.max(duration(), 0));
    usePlayback.setState({ time });
    if (usePlayback.getState().playing) anchor();
  },
  step(seconds: number): void {
    playback.pause();
    playback.seek(usePlayback.getState().time + seconds);
  },
  /** L: play forward, pressing again doubles the speed up to 8x. */
  shuttleForward(): void {
    const { playing, rate } = usePlayback.getState();
    playback.play(playing && rate > 0 ? Math.min(rate * 2, 8) : 1);
  },
  /** J: play backwards, pressing again doubles the speed up to 8x. */
  shuttleBack(): void {
    const { playing, rate } = usePlayback.getState();
    playback.play(playing && rate < 0 ? Math.max(rate * 2, -8) : -1);
  },
  /**
   * Plays [from, to] and stops, jumping over `skip` (the stretches a cut would take out), so
   * the person hears the edit as it would be. Pausing, playing or another span ends it.
   */
  playSpan(from: number, to: number, skip: [number, number][] = [], onEnd?: () => void): void {
    playback.seek(from);
    playback.play();
    span = { until: to, skip: skip.filter(([a, b]) => b > a), onEnd };
  },
};
