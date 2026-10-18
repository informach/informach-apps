import { clipEnd } from "../timeline.ts";
import { type DerivedClip, type DerivedProject, withTransitions } from "../transitions.ts";
import type { Project } from "../types.ts";

/**
 * The export works on the frame grid: windows begin and end on whole frames, and the picture of
 * every clip begins and ends on one too. A clip placed between two frames shows from the nearest
 * one (at most half a frame away, as any 30 or 60 fps file must), so a lesson whose clips moved
 * by a cut elsewhere renders the very same frames, and its segments are reused.
 */

export interface Rate {
  num: number;
  den: number;
  /** As FFmpeg reads it: "30" or "30000/1001". */
  text: string;
}

/** Frame rates of NTSC video kept exact; anything else to three decimals. */
export function frameRate(fps: number): Rate {
  for (const base of [24, 30, 60, 120]) {
    const ntsc = (base * 1000) / 1001;
    if (Math.abs(fps - ntsc) < 0.005)
      return { num: base * 1000, den: 1001, text: `${base * 1000}/1001` };
  }
  if (Math.abs(fps - Math.round(fps)) < 1e-6) {
    const num = Math.round(fps);
    return { num, den: 1, text: String(num) };
  }
  const num = Math.round(fps * 1000);
  return { num, den: 1000, text: `${num}/1000` };
}

/** Exact frames per second of a rate. */
export const rateValue = (r: Rate): number => r.num / r.den;

/** The frame nearest to `t` seconds. */
export const frameAt = (t: number, r: Rate): number => Math.round((t * r.num) / r.den + 1e-9);

/** Seconds at the start of frame `f`. */
export const frameTime = (f: number, r: Rate): number => (f * r.den) / r.num;

/** Frames of a lesson of `duration` seconds. */
export const frameCount = (duration: number, r: Rate): number => Math.max(1, frameAt(duration, r));

/** MP4 time scale for the video track: a multiple of the rate with at least 10000 ticks a second. */
export function trackTimescale(r: Rate): number {
  return r.num * Math.max(1, Math.ceil(10000 / r.num));
}

/**
 * The project as the export draws it: transitions turned into tails and fades (once, for the
 * whole lesson, so a transition across a segment border is the same on both sides), then every
 * clip and cut effect placed on the frame grid. Audio uses the project itself, at exact times.
 */
export function exportProject(project: Project, r: Rate): DerivedProject {
  const derived = withTransitions(project);
  const snap = (t: number): number => frameTime(frameAt(t, r), r);
  const clips: DerivedClip[] = [];
  for (const c of derived.clips) {
    const start = snap(c.start);
    const end = snap(clipEnd(c));
    if (end <= start) continue;
    const out: DerivedClip = { ...c, start, duration: end - start };
    // A tail keeps at least one frame, so its progress never divides by zero.
    if (c.tail)
      out.tail = Math.min(end - start, Math.max(frameTime(1, r), end - snap(clipEnd(c) - c.tail)));
    clips.push(out);
  }
  return {
    ...derived,
    clips,
    ...(derived.cutFx ? { cutFx: derived.cutFx.map((fx) => ({ ...fx, at: snap(fx.at) })) } : {}),
  };
}
