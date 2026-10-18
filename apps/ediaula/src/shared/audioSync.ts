/**
 * Where a clip of sound sits inside a longer recording (the HeyGen MP4 inside the voice exported
 * for it), by cross-correlation computed with an FFT, without dependencies:
 *
 * 1. Coarse: the energy envelopes at 100 Hz, normalized over the stretch they overlap, give the
 *    lag to the nearest 10 ms anywhere inside the master (a whole lesson or one piece).
 * 2. Fine: the 8 kHz signals around that lag (±100 ms), on the loudest stretch of the clip, give
 *    the lag to a fraction of a sample.
 * 3. Drift: the same search on the first and the last part of the clip says whether it runs a
 *    little faster or slower than the master (a render a few frames longer or shorter).
 *
 * Every time is in seconds; `offset` is the master's time at the clip's second 0, so a moment
 * `t` of the clip is heard at `offset + t * scale` in the master.
 */

/** Sample rate the signals are compared at. */
export const SYNC_RATE = 8000;
/** Envelope frames per second. */
export const ENVELOPE_RATE = 100;
/** The fine search looks this far (seconds) on each side of the coarse lag. */
export const FINE_WINDOW = 0.1;
/** Below this the match is a guess: shown for the person to check, never placed blindly. */
export const LOW_CONFIDENCE = 0.5;
/** Among several exported pieces, the winner has to beat the next one by this much. */
export const PIECE_MARGIN = 0.15;

export interface SyncResult {
  /** Master seconds at the clip's second 0 (negative when the clip starts before the master). */
  offset: number;
  /** 0..1: how clearly the clip matches there and nowhere else. */
  confidence: number;
  /** Master seconds per clip second (1 = no drift). */
  scale: number;
  /** Envelope correlation at the match (0..1) and the best one elsewhere. */
  peak: number;
  second: number;
  /** Waveform correlation of the fine search (-1 when it found no stretch to compare). */
  fine: number;
}

/* ----- FFT ----- */

/** In-place iterative radix-2 FFT; `re` and `im` have a power-of-two length. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    const half = size >> 1;
    for (let start = 0; start < n; start += size) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
}

const pow2 = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/**
 * Raw cross-correlation: out[k + (b.length - 1)] = Σ a[i + k] · b[i], for every lag k from
 * -(b.length - 1) to a.length - 1.
 */
export function crossCorrelate(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const n = pow2(a.length + b.length);
  const ar = new Float64Array(n);
  const ai = new Float64Array(n);
  const br = new Float64Array(n);
  const bi = new Float64Array(n);
  for (let i = 0; i < a.length; i++) ar[i] = a[i];
  for (let i = 0; i < b.length; i++) br[i] = b[i];
  fft(ar, ai, false);
  fft(br, bi, false);
  // A · conj(B)
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] + ai[i] * bi[i];
    const im = ai[i] * br[i] - ar[i] * bi[i];
    ar[i] = r;
    ai[i] = im;
  }
  fft(ar, ai, true);
  const out = new Float64Array(a.length + b.length - 1);
  // Negative lags wrap around to the end of the circular result.
  for (let k = -(b.length - 1); k < a.length; k++) out[k + b.length - 1] = ar[k < 0 ? n + k : k];
  return out;
}

/* ----- Signals ----- */

/** RMS of each frame of `rate / hz` samples. */
export function envelope(
  signal: ArrayLike<number>,
  rate = SYNC_RATE,
  hz = ENVELOPE_RATE,
): Float64Array {
  const frame = Math.max(1, Math.round(rate / hz));
  const count = Math.floor(signal.length / frame);
  const out = new Float64Array(count);
  for (let f = 0; f < count; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += signal[i] * signal[i];
    out[f] = Math.sqrt(sum / frame);
  }
  return out;
}

/**
 * The envelope as the correlation sees it: compressed (so a loud word does not outweigh the
 * rest) and with its slow level changes removed (a mean over one second), so different gains and
 * a steady noise floor do not move the match.
 */
function shape(env: Float64Array, hz = ENVELOPE_RATE): Float64Array {
  const out = new Float64Array(env.length);
  for (let i = 0; i < env.length; i++) out[i] = Math.log10(1e-4 + env[i]);
  const half = Math.round(hz / 2);
  const prefix = new Float64Array(out.length + 1);
  for (let i = 0; i < out.length; i++) prefix[i + 1] = prefix[i] + out[i];
  const detrended = new Float64Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(out.length, i + half + 1);
    detrended[i] = out[i] - (prefix[b] - prefix[a]) / (b - a);
  }
  return detrended;
}

/**
 * Normalized cross-correlation of `clip` against `master` for every lag (master index of the
 * clip's first value), over the stretch both cover; lags where they overlap less than
 * `minOverlap` values get -1.
 */
function normalizedCorrelation(
  master: Float64Array,
  clip: Float64Array,
  minOverlap: number,
): { lags: Float64Array; first: number } {
  const raw = crossCorrelate(master, clip);
  const m = clip.length;
  const n = master.length;
  const mp = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) mp[i + 1] = mp[i] + master[i] * master[i];
  const cp = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) cp[i + 1] = cp[i] + clip[i] * clip[i];
  const lags = new Float64Array(raw.length);
  for (let idx = 0; idx < raw.length; idx++) {
    const k = idx - (m - 1);
    // Overlap: clip [i0, i1) against master [i0 + k, i1 + k).
    const i0 = Math.max(0, -k);
    const i1 = Math.min(m, n - k);
    if (i1 - i0 < minOverlap) {
      lags[idx] = -1;
      continue;
    }
    const em = mp[i1 + k] - mp[i0 + k];
    const ec = cp[i1] - cp[i0];
    lags[idx] = em > 0 && ec > 0 ? raw[idx] / Math.sqrt(em * ec) : -1;
  }
  return { lags, first: -(m - 1) };
}

/** Parabolic peak position around index i (in fractions of an index). */
function parabolic(v: Float64Array, i: number): number {
  if (i <= 0 || i >= v.length - 1) return 0;
  const a = v[i - 1];
  const b = v[i];
  const c = v[i + 1];
  const d = a - 2 * b + c;
  return d < 0 ? (0.5 * (a - c)) / d : 0;
}

interface Coarse {
  /** Master envelope frame of the clip's first frame. */
  lag: number;
  peak: number;
  second: number;
}

function coarse(master: Float64Array, clip: Float64Array, around?: [number, number]): Coarse {
  const minOverlap = Math.max(20, Math.min(clip.length, master.length) * 0.5);
  const { lags, first } = normalizedCorrelation(master, clip, minOverlap);
  let best = -1;
  let bestAt = 0;
  for (let i = 0; i < lags.length; i++) {
    const k = i + first;
    if (around && (k < around[0] || k > around[1])) continue;
    if (lags[i] > best) {
      best = lags[i];
      bestAt = i;
    }
  }
  // The best match elsewhere: a clip that fits two places (a passage said twice) is not clear.
  const away = ENVELOPE_RATE / 2;
  let second = -1;
  for (let i = 0; i < lags.length; i++) {
    const k = i + first;
    if (around && (k < around[0] || k > around[1])) continue;
    if (Math.abs(i - bestAt) > away && lags[i] > second) second = lags[i];
  }
  return { lag: bestAt + first, peak: Math.max(0, best), second: Math.max(0, second) };
}

/**
 * The loudest stretch of the clip of about `seconds`, as [start, end) sample indexes: the fine
 * search needs speech, not silence.
 */
function loudest(clip: ArrayLike<number>, rate: number, seconds: number): [number, number] {
  const len = Math.min(clip.length, Math.round(seconds * rate));
  if (len >= clip.length) return [0, clip.length];
  const env = envelope(clip, rate, 10);
  const frames = Math.max(1, Math.round((len / rate) * 10));
  let sum = 0;
  for (let i = 0; i < Math.min(frames, env.length); i++) sum += env[i] * env[i];
  let best = sum;
  let at = 0;
  for (let i = frames; i < env.length; i++) {
    sum += env[i] * env[i] - env[i - frames] * env[i - frames];
    if (sum > best) {
      best = sum;
      at = i - frames + 1;
    }
  }
  const start = Math.round((at / 10) * rate);
  return [start, Math.min(clip.length, start + len)];
}

/**
 * Fine lag in samples: the clip's samples [from, to) searched in the master around `guess`
 * (master sample of the clip's sample 0), ±`window` samples.
 */
function fine(
  master: ArrayLike<number>,
  clip: ArrayLike<number>,
  from: number,
  to: number,
  guess: number,
  window: number,
): { lag: number; ncc: number } {
  if (to - from < 16) return { lag: guess, ncc: -1 };
  const seg = new Float64Array(to - from);
  for (let i = from; i < to; i++) seg[i - from] = clip[i];
  const m0 = Math.max(0, guess + from - window);
  const m1 = Math.min(master.length, guess + to + window);
  if (m1 - m0 < seg.length / 2) return { lag: guess, ncc: -1 };
  const region = new Float64Array(m1 - m0);
  for (let i = m0; i < m1; i++) region[i - m0] = master[i];
  const { lags, first } = normalizedCorrelation(region, seg, Math.round(seg.length * 0.8));
  let best = -2;
  let at = -1;
  for (let i = 0; i < lags.length; i++) {
    // Only the lags inside the window around the guess, and only where both overlap enough
    // (-1): a window with none of those is a failed search, not a match at its edge.
    const lag = m0 + i + first - from;
    if (Math.abs(lag - guess) > window || lags[i] <= -1) continue;
    if (lags[i] > best) {
      best = lags[i];
      at = i;
    }
  }
  if (at < 0) return { lag: guess, ncc: -1 };
  return { lag: m0 + at + parabolic(lags, at) + first - from, ncc: best };
}

export interface LocateOptions {
  rate?: number;
  /** Search only master offsets (seconds) within this range. */
  around?: [number, number];
  /** Estimate the drift (needs a clip of 20 s or more). */
  drift?: boolean;
}

/**
 * Lag in envelope frames (with a fraction) of the clip's envelope frames [a, b), searched within
 * `reach` frames of `around` (master frame of the clip's frame 0).
 */
function envelopeLag(
  em: Float64Array,
  ec: Float64Array,
  a: number,
  b: number,
  around: number,
  reach: number,
): { lag: number; ncc: number } | null {
  const seg = ec.subarray(a, b);
  const m0 = Math.max(0, around + a - reach);
  const m1 = Math.min(em.length, around + b + reach);
  if (m1 - m0 < seg.length) return null;
  const { lags, first } = normalizedCorrelation(
    em.subarray(m0, m1),
    seg,
    Math.round(seg.length * 0.9),
  );
  let best = -2;
  let at = 0;
  for (let i = 0; i < lags.length; i++)
    if (lags[i] > best) {
      best = lags[i];
      at = i;
    }
  return { lag: m0 + at + parabolic(lags, at) + first - a, ncc: best };
}

/** The signal stretched to `factor` times its length (linear interpolation). */
function resample(v: ArrayLike<number>, factor: number): Float32Array {
  const out = new Float32Array(Math.floor(v.length * factor));
  for (let i = 0; i < out.length; i++) {
    const x = i / factor;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = (v[j] ?? 0) * (1 - f) + (v[j + 1] ?? 0) * f;
  }
  return out;
}

/** Where `clip` sits in `master` (both mono at `rate`). */
export function locate(
  master: ArrayLike<number>,
  clip: ArrayLike<number>,
  options: LocateOptions = {},
): SyncResult {
  const rate = options.rate ?? SYNC_RATE;
  const em = shape(envelope(master, rate));
  const ec = shape(envelope(clip, rate));
  if (em.length < 10 || ec.length < 10)
    return { offset: 0, confidence: 0, scale: 1, peak: 0, second: 0, fine: -1 };
  const around = options.around?.map((s) => Math.round(s * ENVELOPE_RATE)) as
    | [number, number]
    | undefined;
  const c = coarse(em, ec, around);
  const frame = rate / ENVELOPE_RATE;
  let scale = 1;
  let corrected: ArrayLike<number> = clip;
  const seconds = clip.length / rate;
  if (options.drift !== false && seconds >= 20) {
    // The envelope of the first and of the last stretch, each searched around the coarse lag:
    // the waveform of a stretch that drifts is smeared, its envelope is not.
    const part = Math.round(Math.min(15, seconds / 3) * ENVELOPE_RATE);
    const reach = Math.round(0.3 * ENVELOPE_RATE + seconds * ENVELOPE_RATE * 0.02);
    const la = envelopeLag(em, ec, 0, part, c.lag, reach);
    const lb = envelopeLag(em, ec, ec.length - part, ec.length, c.lag, reach);
    if (la && lb && la.ncc > 0.5 && lb.ncc > 0.5) {
      const span = ec.length - part;
      const s = 1 + (lb.lag - la.lag) / span;
      if (Math.abs(s - 1) > 1e-4 && Math.abs(s - 1) < 0.02) {
        scale = s;
        // The clip played at the master's pace: its sample t·scale is the clip's t.
        corrected = resample(clip, scale);
      }
    }
  }
  const guess = Math.round(c.lag * frame);
  const window = Math.round(FINE_WINDOW * rate);
  const [from, to] = loudest(corrected, rate, scale === 1 ? 8 : 4);
  const f = fine(master, corrected, from, to, guess, window);
  const offset = f.lag / rate;
  // The envelope says the clip fits there and nowhere else; the waveform, that it really is the
  // same sound there. Both have to agree; a fine search that found nothing is a failure.
  const distinct = c.peak > 0 ? Math.max(0, (c.peak - c.second) / c.peak) : 0;
  const envelopeScore = Math.max(0, Math.min(1, c.peak * Math.min(1, distinct * 2.5)));
  const fineScore = f.ncc <= -1 ? 0 : Math.max(0, Math.min(1, (f.ncc - 0.2) / 0.5));
  const confidence = Math.min(envelopeScore, fineScore);
  return {
    offset: Math.round(offset * 1e5) / 1e5,
    confidence: Math.round(confidence * 1000) / 1000,
    scale: Math.round(scale * 1e6) / 1e6,
    peak: Math.round(c.peak * 1000) / 1000,
    second: Math.round(c.second * 1000) / 1000,
    fine: Math.round(f.ncc * 1000) / 1000,
  };
}

export interface PieceMatch {
  piece: number;
  result: SyncResult;
}

/** Every exported piece, best match first (ties keep the order given: newest first). */
export function rankPieces(
  pieces: readonly ArrayLike<number>[],
  clip: ArrayLike<number>,
  options: LocateOptions = {},
): PieceMatch[] {
  return pieces
    .map((master, piece) => ({ piece, result: locate(master, clip, options) }))
    .sort((a, b) => b.result.confidence - a.result.confidence || a.piece - b.piece);
}

/**
 * The piece the clip fits best, and whether that choice is clear: the next one must be
 * PIECE_MARGIN behind, unless `same` says the two would put it at the same place (the same voice
 * exported twice).
 */
export function choosePiece(
  ranked: readonly PieceMatch[],
  same: (a: PieceMatch, b: PieceMatch) => boolean = () => false,
): (PieceMatch & { ambiguous: boolean }) | null {
  const [best, next] = ranked;
  if (!best) return null;
  const ambiguous =
    !!next && best.result.confidence - next.result.confidence < PIECE_MARGIN && !same(best, next);
  return { ...best, ambiguous };
}

/** The piece of a master (several exported files) where the clip fits best, and where in it. */
export function locateInPieces(
  pieces: readonly ArrayLike<number>[],
  clip: ArrayLike<number>,
  options: LocateOptions = {},
): (PieceMatch & { ambiguous: boolean }) | null {
  return choosePiece(rankPieces(pieces, clip, options));
}
