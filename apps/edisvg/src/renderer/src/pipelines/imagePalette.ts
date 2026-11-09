/**
 * A text palette from a picture (a reference, the lesson's art): its most used colours, distinct
 * from each other, arranged as the recipes use them. The lightest comes first (the main text
 * colour, the balloon's fill), the darkest second (the outline), and the most vivid of the rest
 * last (the accent of the arrow and the highlight).
 */

/** How many colours a picture gives (the palette keeps up to 12; more would be noise). */
export const IMAGE_COLORS = 6;
/** How far apart two colours of the palette are, at least (RGB distance). */
const DISTINCT = 56;

type Rgb = [number, number, number];
const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const saturation = ([r, g, b]: Rgb) => {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
};
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The palette of RGBA pixels (transparent ones do not count). */
export function paletteFromPixels(data: ArrayLike<number>, count = IMAGE_COLORS): string[] {
  // Colours grouped 16 levels a channel apart, each group the mean of its pixels.
  const groups = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 128) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const group = groups.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    group.n++;
    group.r += r;
    group.g += g;
    group.b += b;
    groups.set(key, group);
  }
  const ranked = [...groups.values()]
    .sort((a, b) => b.n - a.n)
    .map((g): Rgb => [g.r / g.n, g.g / g.n, g.b / g.n]);
  const picked: Rgb[] = [];
  for (const color of ranked) {
    if (picked.length >= count) break;
    if (picked.every((other) => distance(other, color) >= DISTINCT)) picked.push(color);
  }
  if (picked.length < 3) return picked.map(hex);
  const byLight = [...picked].sort((a, b) => luminance(b) - luminance(a));
  const light = byLight[0] as Rgb;
  const dark = byLight.at(-1) as Rgb;
  const rest = picked.filter((c) => c !== light && c !== dark);
  const accent = rest.reduce((best, c) => (saturation(c) > saturation(best) ? c : best));
  return [light, dark, ...rest.filter((c) => c !== accent), accent].map(hex);
}

/** The largest side a picture is read at: enough for its colours, quick for any size. */
const SIDE = 128;

/** The palette of a picture the person chose (PNG, JPEG, WebP, GIF or BMP). */
export async function paletteFromImage(file: Blob): Promise<string[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não consegui abrir essa imagem. Use PNG, JPEG, WebP, GIF ou BMP.");
  }
  try {
    const scale = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não consegui ler as cores da imagem.");
    context.drawImage(bitmap, 0, 0, width, height);
    const colors = paletteFromPixels(context.getImageData(0, 0, width, height).data);
    if (!colors.length) throw new Error("A imagem é toda transparente: não há cores para tirar.");
    return colors;
  } finally {
    bitmap.close();
  }
}
