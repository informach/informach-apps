import { type Adjust, DEFAULT_ADJUST, type Doc } from "@shared/doc";
import { compositor } from "@/engine/compositor";

export interface ImageStats {
  /** Luminance percentiles 0..255 */
  p1: number;
  p5: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  /** Share of pixels at the extremes, 0..1 */
  clippedShadows: number;
  clippedHighlights: number;
  /** Average saturation 0..1 */
  saturation: number;
  /** Mean of each channel in the midtones, 0..255 */
  midR: number;
  midG: number;
  midB: number;
  /** Per-channel 0.5% / 99.5% points */
  low: [number, number, number];
  high: [number, number, number];
}

/** Renders the composite small (long side ≈ 512 px) and measures it. */
export function analyzeDoc(doc: Doc): ImageStats {
  const scale = Math.min(1, 512 / Math.max(doc.width, doc.height));
  const c = compositor().renderToCanvas(doc, { scale });
  const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  const lumH = new Uint32Array(256);
  const chH = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  let satSum = 0;
  let lumSum = 0;
  let mid = [0, 0, 0];
  let midN = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    lumH[l]++;
    chH[0][r]++;
    chH[1][g]++;
    chH[2][b]++;
    lumSum += l;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    satSum += mx ? (mx - mn) / mx : 0;
    if (l > 50 && l < 205) {
      mid = [mid[0] + r, mid[1] + g, mid[2] + b];
      midN++;
    }
    n++;
  }
  if (!n) throw new Error("A imagem está vazia (totalmente transparente).");
  const pct = (h: Uint32Array, p: number): number => {
    const target = n * p;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += h[i];
      if (acc >= target) return i;
    }
    return 255;
  };
  const m = midN || 1;
  return {
    p1: pct(lumH, 0.01),
    p5: pct(lumH, 0.05),
    p50: pct(lumH, 0.5),
    p95: pct(lumH, 0.95),
    p99: pct(lumH, 0.99),
    mean: lumSum / n,
    clippedShadows: (lumH[0] + lumH[1] + lumH[2]) / n,
    clippedHighlights: (lumH[253] + lumH[254] + lumH[255]) / n,
    saturation: satSum / n,
    midR: mid[0] / m,
    midG: mid[1] / m,
    midB: mid[2] / m,
    low: [pct(chH[0], 0.005), pct(chH[1], 0.005), pct(chH[2], 0.005)],
    high: [pct(chH[0], 0.995), pct(chH[1], 0.995), pct(chH[2], 0.995)],
  };
}

export function describeStats(s: ImageStats): string {
  const cast = (() => {
    const avg = (s.midR + s.midG + s.midB) / 3;
    const dr = s.midR - avg;
    const db = s.midB - avg;
    const dg = s.midG - avg;
    if (Math.max(Math.abs(dr), Math.abs(db), Math.abs(dg)) < 4) return "neutra";
    if (dr > 0 && db < 0) return `quente/amarelada (R ${dr.toFixed(0)}, B ${db.toFixed(0)})`;
    if (db > 0 && dr < 0) return `fria/azulada (R ${dr.toFixed(0)}, B ${db.toFixed(0)})`;
    if (dg > 0) return `esverdeada (G +${dg.toFixed(0)})`;
    return `magenta (G ${dg.toFixed(0)})`;
  })();
  return [
    `Brilho (0-255): mediana ${s.p50}, média ${s.mean.toFixed(0)}, faixa útil ${s.p1}–${s.p99} (5%–95%: ${s.p5}–${s.p95}).`,
    `Pretos estourados: ${(s.clippedShadows * 100).toFixed(1)}% · brancos estourados: ${(s.clippedHighlights * 100).toFixed(1)}%.`,
    `Saturação média: ${(s.saturation * 100).toFixed(0)}%. Dominante de cor nos meios-tons: ${cast}.`,
    `Pontos por canal (0,5%/99,5%): R ${s.low[0]}–${s.high[0]}, G ${s.low[1]}–${s.high[1]}, B ${s.low[2]}–${s.high[2]}.`,
  ].join("\n");
}

/** Auto levels with color-cast removal, a gentle midtone gamma and a little vibrance. */
export function autoAdjustFor(s: ImageStats, strength = 1): Adjust {
  const k = Math.max(0, Math.min(1, strength));
  const black = s.low.map((v) => Math.round(Math.min(v, 60) * k)) as [number, number, number];
  const white = s.high.map((v) => Math.round(255 - (255 - Math.max(v, 190)) * k)) as [
    number,
    number,
    number,
  ];
  // Midtone after levels, then a gamma that nudges it toward ~0.46 (kept moderate).
  const avgB = (black[0] + black[1] + black[2]) / 3;
  const avgW = (white[0] + white[1] + white[2]) / 3;
  const midAfter = Math.min(0.95, Math.max(0.05, (s.p50 - avgB) / Math.max(1, avgW - avgB)));
  const idealGamma = Math.log(midAfter) / Math.log(0.46);
  const gamma = 1 + (Math.max(0.75, Math.min(1.45, idealGamma)) - 1) * k;
  const vibrance =
    s.saturation < 0.3 ? Math.round(18 * k) : s.saturation < 0.45 ? Math.round(8 * k) : 0;
  const contrast = s.p95 - s.p5 < 150 ? Math.round(10 * k) : 0;
  return {
    ...DEFAULT_ADJUST,
    contrast,
    vibrance,
    levels: { black, white, gamma: Math.round(gamma * 100) / 100 },
  };
}
