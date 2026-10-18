import { z } from "zod";

export const SCROLL_BYTES = 512 * 1024 * 1024;
export const axisSchema = z.enum(["vertical", "horizontal"]);
export type ScrollAxis = z.infer<typeof axisSchema>;
export const marginsSchema = z
  .object({
    top: z.number().int().min(0).max(30000),
    bottom: z.number().int().min(0).max(30000),
    left: z.number().int().min(0).max(30000),
    right: z.number().int().min(0).max(30000),
  })
  .strict();
export type Margins = z.infer<typeof marginsSchema>;
export const NO_MARGINS: Margins = { top: 0, bottom: 0, left: 0, right: 0 };
export type BitmapFrame = { width: number; height: number; bitmap: Uint8Array };
export type OwnedBitmap = { width: number; height: number; bitmap: Uint8Array<ArrayBuffer> };
export type Seam = { overlap: number; confidence: number; warning: string; automatic: boolean };
export type Dimensions = { width: number; height: number };
export function movingSize(size: Dimensions, margins: Margins): Dimensions {
  marginsSchema.parse(margins);
  const width = size.width - margins.left - margins.right;
  const height = size.height - margins.top - margins.bottom;
  if (
    ![size.width, size.height, width, height].every(
      (v) => Number.isInteger(v) && v > 0 && v <= 30000,
    )
  )
    throw new Error("Área móvel inválida. Preserve ao menos um pixel em cada eixo.");
  return { width, height };
}
export function scrollDimensions(
  sizes: Dimensions[],
  cuts: number[],
  axis: ScrollAxis,
): Dimensions {
  if (!sizes.length || sizes.length > 30 || sizes.length !== cuts.length)
    throw new Error("Limite de 30 trechos ou emendas inválidas.");
  const first = sizes[0];
  if (!first) throw new Error("Nenhum trecho.");
  let length = 0;
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    if (!size || size.width !== first.width || size.height !== first.height)
      throw new Error("Trechos de tamanhos diferentes.");
    movingSize(size, NO_MARGINS);
    const cut = cuts[i];
    const extent = axis === "vertical" ? size.height : size.width;
    if (
      !Number.isInteger(cut) ||
      cut === undefined ||
      cut < 0 ||
      cut >= extent ||
      (i === 0 && cut !== 0)
    )
      throw new Error("Sobreposição inválida.");
    length += extent - cut;
  }
  const result =
    axis === "vertical"
      ? { width: first.width, height: length }
      : { width: length, height: first.height };
  if (result.width > 30000 || result.height > 30000 || result.width * result.height > 100_000_000)
    throw new Error("Limite de tamanho atingido. Remova trechos para salvar.");
  return result;
}
/** Raw work: native originals, bitmap scratch, transfer and crop; three output
 * representations (worker BGRA, NativeImage, PNG upper estimate). Publication
 * separately checks the actual encoded length before persistence/IPC. */
export function scrollBudget(retained: Dimensions[], output: Dimensions): number {
  const source = retained.reduce((sum, s) => sum + s.width * s.height * 4, 0);
  return checkScrollBytes(source * 4 + output.width * output.height * 12 + 64 * 1024 * 1024);
}
export function checkScrollBytes(bytes: number): number {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > SCROLL_BYTES)
    throw new Error("Orçamento agregado de 512 MiB excedido. Remova trechos ou reduza a área.");
  return bytes;
}
/** All eagerly returned thumbnails remain live during selected-image normalization.
 * Charge each source, selected normalized native + codec scratch, PNG bytes (raw
 * estimate before encoding, exact afterward), and new crop native/scratch. The
 * retained work reservation already contains the shared 64 MiB overhead reserve. */
export function scrollAcquisitionBudget(
  workBytes: number,
  sources: Dimensions[],
  selected: Dimensions,
  crop: Dimensions,
  encodedBytes = selected.width * selected.height * 4,
): number {
  checkScrollBytes(workBytes);
  const size = z.object({
    width: z.number().int().positive().max(32768),
    height: z.number().int().positive().max(32768),
  });
  for (const value of [...sources, selected, crop]) size.parse(value);
  if (
    !sources.length ||
    sources.length > 256 ||
    !Number.isSafeInteger(encodedBytes) ||
    encodedBytes < 1
  )
    throw new Error("Aquisição inválida.");
  const sourceBytes = sources.reduce((sum, source) => sum + source.width * source.height * 4, 0);
  return checkScrollBytes(
    workBytes +
      sourceBytes +
      selected.width * selected.height * 8 +
      encodedBytes +
      crop.width * crop.height * 8,
  );
}
/** Exact encoded-byte admission: four raw output representations cover transferred
 * BGRA, NativeImage and renderer decode/canvas. Twelve encoded copies cover encode/
 * save/read buffers plus base64 UTF-16 in main, IPC and renderer (8 encoded bytes).
 * Sources include undo/candidate. The 64 MiB reserve covers bounded previews,
 * signatures and encoding overhead; this does not assert an RSS/GC ceiling. */
export function scrollPublicationBudget(
  retained: Dimensions[],
  output: Dimensions,
  encodedBytes: number,
): number {
  if (!Number.isSafeInteger(encodedBytes) || encodedBytes < 1) throw new Error("PNG inválido.");
  const source = retained.reduce((sum, s) => sum + s.width * s.height * 4, 0);
  return checkScrollBytes(
    source * 4 + output.width * output.height * 16 + encodedBytes * 12 + 64 * 1024 * 1024,
  );
}
export function cropScroll(frame: BitmapFrame, margins: Margins): BitmapFrame {
  const size = movingSize(frame, margins);
  if (frame.bitmap.byteLength !== frame.width * frame.height * 4)
    throw new Error("Bitmap inválido.");
  const bitmap = new Uint8Array(size.width * size.height * 4);
  for (let y = 0; y < size.height; y++) {
    const start = ((y + margins.top) * frame.width + margins.left) * 4;
    bitmap.set(frame.bitmap.subarray(start, start + size.width * 4), y * size.width * 4);
  }
  return { ...size, bitmap };
}
export type Signature = { data: Uint8Array; extent: number; columns: number };
export function scrollSignature(frame: BitmapFrame, axis: ScrollAxis): Signature {
  const extent = axis === "vertical" ? frame.height : frame.width;
  const cross = axis === "vertical" ? frame.width : frame.height;
  const columns = Math.min(48, cross) * 3;
  const data = new Uint8Array(extent * columns);
  for (let a = 0; a < extent; a++)
    for (let b = 0; b < columns / 3; b++) {
      const c = Math.min(cross - 1, Math.floor(((b + 0.5) * cross) / (columns / 3)));
      const index = (axis === "vertical" ? a * frame.width + c : c * frame.width + a) * 4;
      data.set(frame.bitmap.subarray(index, index + 3), a * columns + b * 3);
    }
  return { data, extent, columns };
}
export function signatureDifference(a: Signature, b: Signature, offset = 0): number {
  if (a.extent !== b.extent || a.columns !== b.columns) return Infinity;
  const rows = a.extent - offset,
    step = Math.max(1, Math.floor(rows / 80));
  let total = 0,
    count = 0;
  for (let row = 0; row < rows; row += step)
    for (let col = 0; col < a.columns; col++) {
      total += Math.abs(
        (a.data[(row + offset) * a.columns + col] ?? 0) - (b.data[row * b.columns + col] ?? 0),
      );
      count++;
    }
  return total / count;
}
export function alignScroll(a: Signature, b: Signature): Seam {
  if (signatureDifference(a, b) < 1.5)
    return {
      overlap: a.extent,
      confidence: 1,
      warning: "Tela estável/sem avanço; confira o fim do conteúdo.",
      automatic: true,
    };
  const minimum = Math.max(2, Math.ceil(a.extent * 0.15));
  const scores: { score: number; offset: number }[] = [];
  let best = { score: Infinity, offset: 0 };
  for (let offset = 1; offset <= a.extent - minimum; offset++) {
    const score = signatureDifference(a, b, offset);
    scores.push({ score, offset });
    if (score < best.score) best = { score, offset };
  }
  let second = Infinity;
  for (const item of scores)
    if (Math.abs(item.offset - best.offset) > 3) second = Math.min(second, item.score);
  let low = 255,
    high = 0;
  for (const value of a.data.subarray(best.offset * a.columns)) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  const confident = best.score <= 7 && second - best.score >= 0.5 && high - low >= 20;
  return {
    overlap: confident ? a.extent - best.offset : 0,
    confidence: confident
      ? Math.max(0, Math.min(1, 1 - best.score / 14, (second - best.score) / 8))
      : 0,
    warning: confident ? "" : "Conteúdo dinâmico, repetido ou sem alinhamento: revise esta emenda.",
    automatic: confident,
  };
}
/** Preview is rendered directly from segments, never by allocating the full stitched output. */
export function stitchScroll(
  frames: BitmapFrame[],
  cuts: number[],
  axis: ScrollAxis,
  preview = false,
): OwnedBitmap {
  const size = scrollDimensions(frames, cuts, axis);
  const scale = preview ? Math.min(1, 1200 / size.width, 1200 / size.height) : 1;
  const width = Math.max(1, Math.round(size.width * scale)),
    height = Math.max(1, Math.round(size.height * scale));
  const bitmap = new Uint8Array(width * height * 4);
  const starts: number[] = [];
  let offset = 0;
  for (let i = 0; i < frames.length; i++) {
    starts.push(offset);
    const f = frames[i];
    if (f) offset += (axis === "vertical" ? f.height : f.width) - (cuts[i] ?? 0);
  }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.min(size.width - 1, Math.floor(x / scale)),
        sy = Math.min(size.height - 1, Math.floor(y / scale));
      const axial = axis === "vertical" ? sy : sx;
      let i = starts.length - 1;
      while (i > 0 && axial < (starts[i] ?? 0)) i--;
      const f = frames[i];
      if (!f) throw new Error("Trecho ausente.");
      const position = axial - (starts[i] ?? 0) + (cuts[i] ?? 0);
      const source = (axis === "vertical" ? position * f.width + sx : sy * f.width + position) * 4;
      bitmap.set(f.bitmap.subarray(source, source + 4), (y * width + x) * 4);
    }
  return { width, height, bitmap };
}
