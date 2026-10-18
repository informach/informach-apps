import { projectDuration, toFrame } from "@shared/timeline";
import { create } from "zustand";
import { shownProject } from "./project";

interface PlaybackStore {
  time: number;
  playing: boolean;
  /** Negative while shuttling backwards with J; 0.5 or 0.25 while K is held with J or L. */
  rate: number;
}

export const usePlayback = create<PlaybackStore>(() => ({ time: 0, playing: false, rate: 1 }));

/**
 * Sound of the moments the media elements cannot play (going backwards, one frame at a time,
 * dragging the playhead): short grains of what is under the playhead (lib/scrub.ts sets it).
 */
export const scrubSound: { grain?: (t: number, rate: number) => void } = {};

/** Wall-clock milliseconds between two grains while going backwards. */
const GRAIN_MS = 80;

let raf = 0;
let anchorTime = 0;
let anchorNow = 0;
let lastGrain = 0;

/**
 * A stretch played on its own (reviewing a cut): it stops at `until`, jumps over the `skip`
 * ranges as if they were already cut, and calls `onEnd` when it reaches the end by itself.
 */
let span: { until: number; skip: [number, number][]; onEnd?: () => void } | null = null;

/** The lesson as shown: a draft that adds an opening card plays to its own end. */
const duration = (): number => projectDuration(shownProject() ?? { clips: [] });
const fps = (): number => shownProject()?.settings.fps ?? 30;

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
    usePlayback.setState({ time: toFrame(t, fps()), playing: false, rate: 1 });
    return;
  }
  usePlayback.setState({ time: t });
  if (rate < 0 && now - lastGrain >= GRAIN_MS) {
    lastGrain = now;
    scrubSound.grain?.(t, rate);
  }
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
    lastGrain = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  },
  /** Stops on the frame it was showing. */
  pause(): void {
    span = null;
    cancelAnimationFrame(raf);
    const { time, playing } = usePlayback.getState();
    usePlayback.setState({
      playing: false,
      rate: 1,
      ...(playing ? { time: Math.min(toFrame(time, fps()), Math.max(0, duration())) } : {}),
    });
  },
  toggle(): void {
    if (usePlayback.getState().playing) playback.pause();
    else playback.play();
  },
  /** To the frame nearest `t` (while playing, exactly `t`: the clock goes on from there). */
  seek(t: number): void {
    const end = Math.max(duration(), 0);
    const { playing } = usePlayback.getState();
    const clamped = Math.min(Math.max(0, t), end);
    const time = playing ? clamped : Math.min(toFrame(clamped, fps()), end);
    usePlayback.setState({ time });
    if (playing) anchor();
  },
  /** One frame (or `seconds`) forward or back, with the sound of that moment. */
  step(seconds: number): void {
    playback.pause();
    playback.seek(usePlayback.getState().time + seconds);
    scrubSound.grain?.(usePlayback.getState().time, seconds < 0 ? -1 : 1);
  },
  /** L: play forward, pressing again doubles the speed up to 8x. */
  shuttleForward(): void {
    const { playing, rate } = usePlayback.getState();
    playback.play(playing && rate >= 1 ? Math.min(rate * 2, 8) : 1);
  },
  /** J: play backwards, pressing again doubles the speed up to 8x. */
  shuttleBack(): void {
    const { playing, rate } = usePlayback.getState();
    playback.play(playing && rate <= -1 ? Math.max(rate * 2, -8) : -1);
  },
  /**
   * K held with L (or J): slow forward (backwards), at half speed and then a quarter; the
   * voice keeps its pitch forward, and backwards it is heard in short grains.
   */
  slow(direction: 1 | -1): void {
    const { playing, rate } = usePlayback.getState();
    const same = playing && Math.sign(rate) === direction && Math.abs(rate) < 1;
    playback.play(direction * (same && Math.abs(rate) === 0.5 ? 0.25 : 0.5));
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
