/**
 * Chroma key ("remover fundo") for avatars rendered on a solid blue or green screen (HeyGen).
 *
 * A color-difference keyer: a pixel's "key strength" is how much its dominant channel (blue or
 * green) exceeds the channel that is weakest in the screen color (red), relative to the screen's
 * own strength. Navy clothes stay far below the screen (≈ 0.2 against 1), so they keep full
 * opacity, unlike a plain color-distance key, which opens holes in them.
 *
 * Edges are then refined with the subject color found a few pixels inside: alpha becomes the
 * exact mixing ratio between that color and the screen, and screen light on hair and skin is
 * removed only where it exceeds the subject's own color, so navy fabric keeps its blue.
 *
 * The same function keys the cached alpha video (used by both preview and export) and the
 * live frame in the adjustment dialog, so what you tune is exactly what gets rendered.
 */

export interface ChromaKey {
  /** Screen color, '#RRGGBB'. */
  color: string;
  /** Key strength (fraction of the screen's) below which a pixel stays fully opaque. Raise it if blue clothes get holes. */
  threshold: number;
  /** Width of the transition from opaque to transparent, as a fraction of the key strength. */
  softness: number;
  /** 0..1: how much screen color is removed from edges, hair and skin lit by the screen. */
  despill: number;
  /** Shrinks the visible area by this many pixels (of the keyed video) to hide a leftover rim. */
  choke: number;
}

export const DEFAULT_KEY: Omit<ChromaKey, "color"> = {
  threshold: 0.3,
  softness: 0.6,
  despill: 1,
  choke: 0,
};

/** Bump when the algorithm changes so cached alpha videos are rebuilt. */
export const KEY_VERSION = 1;

/** Longest side of the cached alpha video. Enough for a full-height avatar in a 1080p lesson. */
export const KEY_MAX_SIDE = 1920;

/** Depth (px) of the subject color used to measure how much screen is mixed into edge pixels. */
const NEAR = 4;
/** Depth (px) of the subject color used as its own color when removing screen light near edges. */
const DEEP = 14;

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

export const rgbToHex = (r: number, g: number, b: number): string =>
  "#" +
  [r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();

/** Stable id of the parameters that change the keyed pixels (cache key). */
export const keyId = (k: ChromaKey): string =>
  [
    KEY_VERSION,
    k.color.toUpperCase().replace("#", ""),
    k.threshold.toFixed(3),
    k.softness.toFixed(3),
    k.despill.toFixed(2),
    Math.round(k.choke),
  ].join("_");

interface KeyAxes {
  key: [number, number, number];
  dom: number;
  o1: number;
  o2: number;
  /** The other channel that is weakest in the screen color (red on a blue screen). */
  weak: number;
  /** The screen's own key strength. */
  strength: number;
}

function axes(color: string): KeyAxes {
  const key = hexToRgb(color);
  const dom = key[2] >= key[1] && key[2] >= key[0] ? 2 : key[1] >= key[0] ? 1 : 0;
  const [o1, o2] = [0, 1, 2].filter((c) => c !== dom);
  const weak = key[o1] <= key[o2] ? o1 : o2;
  return { key, dom, o1, o2, weak, strength: key[dom] - key[weak] };
}

/** A key color must clearly dominate one channel, or keying would eat the subject. */
export const keyUsable = (color: string): boolean => {
  const { key, dom, o1, o2 } = axes(color);
  return key[dom] - Math.max(key[o1], key[o2]) >= 40;
};

/** Fits a size inside KEY_MAX_SIDE, keeping it even for the video encoder. */
export function keySize(width: number, height: number): { width: number; height: number } {
  const s = Math.min(1, KEY_MAX_SIDE / Math.max(width, height));
  const even = (v: number): number => Math.max(2, Math.round((v * s) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/**
 * Keys one frame. `src` holds RGB (channels = 3) or RGBA (channels = 4) pixels; `out` receives
 * straight-alpha RGBA and is allocated when omitted.
 */
export function keyFrame(
  src: ArrayLike<number>,
  channels: 3 | 4,
  width: number,
  height: number,
  k: ChromaKey,
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  const n = width * height;
  const dst = out ?? new Uint8ClampedArray(n * 4);
  const { key, dom, o1, o2, weak, strength } = axes(k.color);

  if (!keyUsable(k.color)) {
    for (let i = 0, s = 0, d = 0; i < n; i++, s += channels, d += 4) {
      dst[d] = src[s];
      dst[d + 1] = src[s + 1];
      dst[d + 2] = src[s + 2];
      dst[d + 3] = 255;
    }
    return dst;
  }

  const lo = k.threshold;
  const hi = lo + Math.max(0.02, k.softness);
  const span = 1 / (hi - lo);
  const inv = 1 / strength;
  const [kr, kg, kb] = key;
  const despill = Math.max(0, Math.min(1, k.despill));

  // 1. Rough matte from the key strength: 1 = surely subject, 0 = surely screen.
  const alpha = new Float32Array(n);
  for (let i = 0, s = 0; i < n; i++, s += channels) {
    const a = (hi - (src[s + dom] - src[s + weak]) * inv) * span;
    alpha[i] = a <= 0.02 ? 0 : a >= 0.98 ? 1 : a;
  }

  // 2. How deep inside the subject every opaque pixel is.
  const dist = distanceInside(alpha, width, height);

  // 3. Subject colors spread outward from inside: a near reference (to measure how much screen is
  //    mixed into edge pixels) and a deep one (the subject's own color, free of screen light).
  const near = spread(src, channels, width, height, dist, alpha, NEAR, NEAR + 6);
  const deep = spread(src, channels, width, height, dist, alpha, DEEP, DEEP + 4);

  // 4. Final alpha and color.
  const outA = new Float32Array(n);
  const px = [0, 0, 0];
  for (let i = 0, s = 0, d = 0, f = 0; i < n; i++, s += channels, d += 4, f += 3) {
    let a = alpha[i];
    if (a === 0) {
      dst[d] = dst[d + 1] = dst[d + 2] = 0;
      continue;
    }
    px[0] = src[s];
    px[1] = src[s + 1];
    px[2] = src[s + 2];

    if (a < 1) {
      if (near.got[i]) {
        // Mixed with the screen: alpha is the mixing ratio between the nearby subject color and
        // the screen; the color leans on the subject's, since un-mixing faint pixels adds noise.
        const f0 = near.c[f];
        const f1 = near.c[f + 1];
        const f2 = near.c[f + 2];
        const dr = f0 - kr;
        const dg = f1 - kg;
        const db = f2 - kb;
        const den = dr * dr + dg * dg + db * db;
        if (den > 900) {
          const m = ((px[0] - kr) * dr + (px[1] - kg) * dg + (px[2] - kb) * db) / den;
          a = m <= 0.02 ? 0 : m >= 0.98 ? 1 : m;
        }
        if (a > 0 && a < 1 && despill > 0) {
          const t = 1 - a;
          const w = a * a;
          const u0 = f0 + ((px[0] - t * kr) / a - f0) * w;
          const u1 = f1 + ((px[1] - t * kg) / a - f1) * w;
          const u2 = f2 + ((px[2] - t * kb) / a - f2) * w;
          px[0] += (u0 - px[0]) * despill;
          px[1] += (u1 - px[1]) * despill;
          px[2] += (u2 - px[2]) * despill;
        }
      } else if (despill > 0) {
        // Nothing solid nearby (thin strands): un-mix with the rough alpha and cap the key channel.
        const t = 1 - a;
        px[0] += ((px[0] - t * kr) / a - px[0]) * despill;
        px[1] += ((px[1] - t * kg) / a - px[1]) * despill;
        px[2] += ((px[2] - t * kb) / a - px[2]) * despill;
        const cap = Math.max(px[o1], px[o2]);
        if (px[dom] > cap) px[dom] -= (px[dom] - cap) * Math.min(1, t * 3) * despill;
      }
    } else if (deep.got[i] > 1) {
      // Opaque but lit by the screen (blue rim on hair or skin): remove the key color in excess of
      // the subject's own. Navy clothes keep their blue because their inside is just as blue.
      const own = (deep.c[f + dom] - deep.c[f + weak]) * inv;
      const excess = Math.min(0.5, (px[dom] - px[weak]) * inv - own - 0.05) * despill;
      if (excess > 0) {
        px[0] = Math.max(0, px[0] - excess * kr);
        px[1] = Math.max(0, px[1] - excess * kg);
        px[2] = Math.max(0, px[2] - excess * kb);
      }
    }
    outA[i] = a;
    if (a === 0) dst[d] = dst[d + 1] = dst[d + 2] = 0;
    else {
      dst[d] = px[0];
      dst[d + 1] = px[1];
      dst[d + 2] = px[2];
    }
  }

  const choke = Math.max(0, Math.min(4, Math.round(k.choke)));
  if (choke > 0) erode(outA, width, height, choke);
  for (let i = 0; i < n; i++) dst[i * 4 + 3] = outA[i] * 255;
  return dst;
}

/** Chamfer (3-4) distance from each opaque pixel to the nearest non-opaque one, in px × 3; 0 elsewhere. */
function distanceInside(alpha: Float32Array, w: number, h: number): Uint16Array {
  const n = w * h;
  const d = new Uint16Array(n);
  for (let i = 0; i < n; i++) d[i] = alpha[i] === 1 ? 60000 : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x > 0 && d[i - 1] + 3 < m) m = d[i - 1] + 3;
      if (y > 0) {
        if (d[i - w] + 3 < m) m = d[i - w] + 3;
        if (x > 0 && d[i - w - 1] + 4 < m) m = d[i - w - 1] + 4;
        if (x < w - 1 && d[i - w + 1] + 4 < m) m = d[i - w + 1] + 4;
      }
      d[i] = m;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x < w - 1 && d[i + 1] + 3 < m) m = d[i + 1] + 3;
      if (y < h - 1) {
        if (d[i + w] + 3 < m) m = d[i + w] + 3;
        if (x < w - 1 && d[i + w + 1] + 4 < m) m = d[i + w + 1] + 4;
        if (x > 0 && d[i + w - 1] + 4 < m) m = d[i + w - 1] + 4;
      }
      d[i] = m;
    }
  return d;
}

/**
 * Seeds colors at pixels deeper than `depth` px inside the subject and spreads them outward over
 * the other visible pixels, one ring per pass, averaging the neighbors colored in earlier passes.
 * `got`: 0 = no color, 1 = seed, p ≥ 2 = reached in pass p.
 */
function spread(
  src: ArrayLike<number>,
  channels: number,
  w: number,
  h: number,
  dist: Uint16Array,
  alpha: Float32Array,
  depth: number,
  passes: number,
): { c: Float32Array; got: Uint8Array } {
  const n = w * h;
  const c = new Float32Array(n * 3);
  const got = new Uint8Array(n);
  const limit = depth * 3;
  let frontier = new Int32Array(n);
  let count = 0;
  for (let i = 0, s = 0; i < n; i++, s += channels) {
    if (dist[i] > limit) {
      got[i] = 1;
      c[i * 3] = src[s];
      c[i * 3 + 1] = src[s + 1];
      c[i * 3 + 2] = src[s + 2];
    } else if (alpha[i] > 0) frontier[count++] = i;
  }
  let next = new Int32Array(count);
  for (let pass = 2; pass < 2 + passes && count > 0; pass++) {
    let rest = 0;
    for (let q = 0; q < count; q++) {
      const i = frontier[q];
      const x = i % w;
      const y = (i - x) / w;
      let m = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          const gj = got[j];
          if (gj === 0 || gj >= pass) continue;
          r += c[j * 3];
          g += c[j * 3 + 1];
          b += c[j * 3 + 2];
          m++;
        }
      }
      if (m === 0) {
        next[rest++] = i;
        continue;
      }
      c[i * 3] = r / m;
      c[i * 3 + 1] = g / m;
      c[i * 3 + 2] = b / m;
      got[i] = pass;
    }
    const t = frontier;
    frontier = next;
    next = t;
    count = rest;
  }
  return { c, got };
}

/** Separable 3×3 minimum, `times` times: shrinks the matte by one pixel per pass. */
function erode(alpha: Float32Array, w: number, h: number, times: number): void {
  const tmp = new Float32Array(alpha.length);
  for (let pass = 0; pass < times; pass++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        let m = alpha[i];
        if (x > 0 && alpha[i - 1] < m) m = alpha[i - 1];
        if (x < w - 1 && alpha[i + 1] < m) m = alpha[i + 1];
        tmp[i] = m;
      }
    }
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        let m = tmp[i];
        if (y > 0 && tmp[i - w] < m) m = tmp[i - w];
        if (y < h - 1 && tmp[i + w] < m) m = tmp[i + w];
        alpha[i] = m;
      }
    }
  }
}

/**
 * Looks for a solid, saturated screen color along the frame border (the upper sides and the top:
 * the avatar's feet may touch the bottom edge). Returns null when the border is not a uniform
 * blue or green.
 */
export function detectScreen(
  src: ArrayLike<number>,
  channels: 3 | 4,
  width: number,
  height: number,
): string | null {
  const samples: [number, number, number][] = [];
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  const bandStep = Math.max(1, Math.floor(band / 4));
  const take = (x: number, y: number): void => {
    const s = (y * width + x) * channels;
    samples.push([src[s], src[s + 1], src[s + 2]]);
  };
  const stepY = Math.max(1, Math.floor(height / 60));
  const stepX = Math.max(1, Math.floor(width / 60));
  for (let y = 0; y < Math.floor(height * 0.75); y += stepY)
    for (let x = 0; x < band; x += bandStep) {
      take(x, y);
      take(width - 1 - x, y);
    }
  for (let x = 0; x < width; x += stepX) for (let y = 0; y < band; y += bandStep) take(x, y);
  if (samples.length < 20) return null;

  const median = (c: number): number =>
    samples.map((s) => s[c]).sort((a, b) => a - b)[samples.length >> 1];
  const m: [number, number, number] = [median(0), median(1), median(2)];
  const close =
    samples.filter((s) => Math.hypot(s[0] - m[0], s[1] - m[1], s[2] - m[2]) < 40).length /
    samples.length;
  const color = rgbToHex(...m);
  const { dom } = axes(color);
  if (
    close < 0.85 ||
    dom === 0 ||
    !keyUsable(color) ||
    hexToRgb(color)[dom] - Math.max(...hexToRgb(color).filter((_, i) => i !== dom)) < 60
  )
    return null;
  return color;
}
