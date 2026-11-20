import type { PersonBounds } from "../shared/presenterFraming";

/**
 * The presenter's green screen, read from a few small RGB frames of her video: the colour of the
 * screen (the border of the picture, where she never is) and where she stands in the picture
 * (what is not that colour), for the preview without the background and for the spot the
 * animation keeps free. EdiAula keys the video itself for the lesson (its own chroma.ts).
 */

export interface RgbFrame {
  width: number;
  height: number;
  /** rgb24, row by row. */
  data: Uint8Array;
}

/** A pixel this far (RGB distance) from the screen's colour is the person. */
const PERSON_DISTANCE = 110;

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/**
 * The colour of the screen: the median of the picture's sides and top (her feet may touch the
 * bottom), when most of it is that colour and it is clearly green or blue. Null otherwise.
 */
export function screenColor(frames: readonly RgbFrame[]): string | null {
  const samples: [number, number, number][] = [];
  for (const { width, height, data } of frames) {
    const band = Math.max(1, Math.round(Math.min(width, height) * 0.05));
    const take = (x: number, y: number) => {
      const i = (y * width + x) * 3;
      samples.push([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]);
    };
    for (let y = 0; y < Math.floor(height * 0.75); y++)
      for (let x = 0; x < band; x++) {
        take(x, y);
        take(width - 1 - x, y);
      }
    for (let y = 0; y < band; y++) for (let x = band; x < width - band; x++) take(x, y);
  }
  if (samples.length < 20) return null;
  const median = (c: 0 | 1 | 2) =>
    samples.map((s) => s[c]).sort((a, b) => a - b)[samples.length >> 1] ?? 0;
  const m = [median(0), median(1), median(2)] as const;
  const close =
    samples.filter((s) => Math.hypot(s[0] - m[0], s[1] - m[1], s[2] - m[2]) < 50).length /
    samples.length;
  const [r, g, b] = m;
  const strong = Math.max(g - Math.max(r, b), b - Math.max(r, g));
  if (close < 0.7 || strong < 40) return null;
  return hex(r, g, b);
}

/**
 * Where the person is in the picture, as fractions, across all frames (she moves while she
 * talks): the columns and rows with enough pixels away from the screen's colour, with a little
 * margin. Null when nothing stands out.
 */
export function personBounds(frames: readonly RgbFrame[], screen: string): PersonBounds | null {
  const key = [1, 3, 5].map((i) => Number.parseInt(screen.slice(i, i + 2), 16));
  const [kr = 0, kg = 0, kb = 0] = key;
  let left = 1;
  let top = 1;
  let right = 0;
  let bottom = 0;
  for (const { width, height, data } of frames) {
    const columns = new Uint32Array(width);
    const rows = new Uint32Array(height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        const d = Math.hypot((data[i] ?? 0) - kr, (data[i + 1] ?? 0) - kg, (data[i + 2] ?? 0) - kb);
        if (d < PERSON_DISTANCE) continue;
        columns[x] = (columns[x] ?? 0) + 1;
        rows[y] = (rows[y] ?? 0) + 1;
      }
    // A few stray pixels (noise, a mark on the screen) are not her.
    const minColumn = Math.max(2, Math.round(height * 0.02));
    const minRow = Math.max(2, Math.round(width * 0.01));
    const first = (counts: Uint32Array, min: number) => counts.findIndex((c) => c >= min);
    const last = (counts: Uint32Array, min: number) => {
      for (let i = counts.length - 1; i >= 0; i--) if ((counts[i] ?? 0) >= min) return i;
      return -1;
    };
    const x0 = first(columns, minColumn);
    const y0 = first(rows, minRow);
    if (x0 < 0 || y0 < 0) continue;
    left = Math.min(left, x0 / width);
    right = Math.max(right, (last(columns, minColumn) + 1) / width);
    top = Math.min(top, y0 / height);
    bottom = Math.max(bottom, (last(rows, minRow) + 1) / height);
  }
  if (right <= left || bottom <= top) return null;
  const margin = 0.02;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    left: round(Math.max(0, left - margin)),
    top: round(Math.max(0, top - margin)),
    right: round(Math.min(1, right + margin)),
    bottom: round(Math.min(1, bottom + margin)),
  };
}
