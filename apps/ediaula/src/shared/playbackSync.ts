/**
 * Keeping a playing <video>/<audio> of the preview on the playback clock. Seeking a playing
 * element stalls its decoder (a visible hitch, and the avatar's lips leave the voice), so small
 * drift is absorbed by playing up to 3% faster or slower until it is back within a frame; only
 * a real jump (more than 150 ms) seeks.
 */

/** Seconds of drift (at normal speed) above which the element seeks. */
export const SEEK_DRIFT = 0.15;
/** Largest change of the playback rate used to catch up. */
export const NUDGE = 0.03;

/**
 * The rate a media element is set to: Chromium refuses more than 16× (or less than 1/16), and a
 * time-lapse over the narration can be faster; the drift correction seeks it along the rest.
 */
export const elementRate = (rate: number): number => Math.min(16, Math.max(1 / 16, rate));

export function driftCorrection(
  /** Where the element is, seconds of its source. */
  current: number,
  /** Where the clock says it should be. */
  target: number,
  /** The rate it should play at (playback rate × clip speed). */
  rate: number,
  /** One frame, in the same seconds. */
  frame: number,
  /** Already playing at a corrected rate: keeps correcting down to half a frame, so it does not flip back and forth. */
  nudging: boolean,
): { seek: boolean; rate: number } {
  const drift = current - target;
  const scale = Math.max(1, Math.abs(rate));
  if (Math.abs(drift) > SEEK_DRIFT * scale) return { seek: true, rate };
  if (Math.abs(drift) <= (nudging ? frame / 2 : frame) * scale) return { seek: false, rate };
  return { seek: false, rate: rate * (drift > 0 ? 1 - NUDGE : 1 + NUDGE) };
}
