/**
 * The click sound of the cursor effects, made here rather than read from a file: a short tick
 * (a few milliseconds of a falling tone over a burst of filtered noise), the same samples the
 * preview plays and the export mixes in. The noise comes from a fixed seed, so the sound is the
 * same on every computer.
 */

/** Sample rate the click is made at (the export's). */
export const CLICK_RATE = 48000;
/** Seconds the click lasts. */
export const CLICK_SECONDS = 0.035;

/** The click's mono samples at `rate`, peaking a little under full scale. */
export function clickSamples(rate = CLICK_RATE): Float32Array<ArrayBuffer> {
  const n = Math.max(1, Math.round(CLICK_SECONDS * rate));
  const out = new Float32Array(n);
  let seed = 0x2f6b9d1;
  let low = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    // xorshift noise, low-passed a little so it is a tap and not a hiss.
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const noise = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    low += 0.35 * (noise - low);
    const attack = Math.min(1, t / 0.0008);
    const body = Math.exp(-t / 0.006);
    const tone = Math.sin(2 * Math.PI * (2600 - 9000 * t) * t) * Math.exp(-t / 0.004);
    out[i] = 0.8 * attack * (0.55 * low * body + 0.6 * tone);
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * 0.9;
  return out;
}

/**
 * Adds the click at each of `times` (seconds, sorted) to `out`, a stretch of a mono track that
 * starts at sample `from`, at `volume`: the recording's clicks on its own clock, written a
 * stretch at a time so a long recording never sits whole in memory. The result is kept within
 * full scale.
 */
export function fillClicks(
  out: Float32Array,
  from: number,
  times: readonly number[],
  volume: number,
  click: Float32Array,
  rate = CLICK_RATE,
): void {
  const end = from + out.length;
  for (const t of times) {
    const at = Math.round(t * rate);
    if (at + click.length <= from) continue;
    if (at >= end) break;
    const a = Math.max(from, at);
    const b = Math.min(end, at + click.length);
    for (let i = a; i < b; i++) out[i - from] += click[i - at] * volume;
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
}
