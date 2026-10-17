import { projectDuration } from "@shared/timeline";
import { create } from "zustand";
import { useProject } from "./project";

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

const duration = (): number => projectDuration(useProject.getState().project ?? { clips: [] });

function tick(now: number): void {
  const { rate, playing } = usePlayback.getState();
  if (!playing) return;
  const end = duration();
  // The first frame's timestamp can be a hair earlier than the moment play was pressed: never run
  // the clock backwards, and only stop at 0 when playing in reverse (or a play from 0:00 stops at once).
  let t = anchorTime + (Math.max(0, now - anchorNow) / 1000) * rate;
  if ((rate > 0 && t >= end) || (rate < 0 && t <= 0)) {
    t = Math.min(Math.max(t, 0), end);
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
    const s = usePlayback.getState();
    if (rate > 0 && s.time >= end - 0.01) usePlayback.setState({ time: 0 });
    usePlayback.setState({ playing: true, rate });
    anchor();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  },
  pause(): void {
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
};
