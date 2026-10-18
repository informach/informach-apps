/** Linear-time, bounded alpha refinements. Pixels outside the image count as transparent. */
export function refineAlpha(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  grow = 0,
  feather = 0,
): Uint8ClampedArray {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    alpha.length !== width * height ||
    !Number.isFinite(grow) ||
    !Number.isFinite(feather) ||
    Math.abs(grow) > 64 ||
    feather < 0 ||
    feather > 64
  )
    throw new Error("Refinamento de borda inválido.");
  let result = alpha.slice();
  const pass = (
    source: Uint8ClampedArray,
    horizontal: boolean,
    radius: number,
    kind: "max" | "min" | "blur",
  ) => {
    const out = new Uint8ClampedArray(source.length),
      length = horizontal ? width : height,
      lines = horizontal ? height : width;
    const at = (line: number, index: number) =>
      horizontal ? line * width + index : index * width + line;
    const queue = new Int32Array(length + radius * 2);
    for (let line = 0; line < lines; line++) {
      if (kind === "blur") {
        let sum = 0;
        for (let j = 0; j <= Math.min(radius, length - 1); j++) sum += source[at(line, j)];
        for (let x = 0; x < length; x++) {
          out[at(line, x)] = sum / (radius * 2 + 1);
          const leave = x - radius,
            enter = x + radius + 1;
          if (leave >= 0) sum -= source[at(line, leave)];
          if (enter < length) sum += source[at(line, enter)];
        }
      } else {
        let head = 0,
          tail = 0;
        const value = (x: number) => (x < 0 || x >= length ? 0 : source[at(line, x)]);
        for (let j = -radius; j < length + radius; j++) {
          while (
            head < tail &&
            (kind === "max"
              ? value(queue[tail - 1]) <= value(j)
              : value(queue[tail - 1]) >= value(j))
          )
            tail--;
          queue[tail++] = j;
          const x = j - radius;
          if (x < 0) continue;
          while (head < tail && queue[head] < x - radius) head++;
          if (x < length) out[at(line, x)] = value(queue[head]);
        }
      }
    }
    return out;
  };
  const radius = Math.round(Math.abs(grow));
  if (radius) {
    const kind = grow > 0 ? "max" : "min";
    result = pass(pass(result, true, radius, kind), false, radius, kind);
  }
  const blur = Math.round(feather);
  if (blur) result = pass(pass(result, true, blur, "blur"), false, blur, "blur");
  return result;
}
export function uniformCutout(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  color: string,
  tolerance = 30,
  feather = 0,
): Uint8ClampedArray {
  if (
    pixels.length !== width * height * 4 ||
    !/^#[0-9a-f]{6}$/i.test(color) ||
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    tolerance > 255
  )
    throw new Error("Recorte por cor inválido.");
  const number = parseInt(color.slice(1), 16),
    rgb = [number >> 16, (number >> 8) & 255, number & 255],
    count = width * height,
    seen = new Uint8Array(count),
    queue = new Int32Array(count);
  let head = 0,
    tail = 0;
  const add = (i: number) => {
    if (seen[i]) return;
    const k = i * 4;
    if (
      pixels[k + 3] > 0 &&
      Math.max(
        Math.abs(pixels[k] - rgb[0]),
        Math.abs(pixels[k + 1] - rgb[1]),
        Math.abs(pixels[k + 2] - rgb[2]),
      ) > tolerance
    )
      return;
    seen[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    add(y * width);
    add(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++],
      x = i % width,
      y = Math.floor(i / width);
    if (x > 0) add(i - 1);
    if (x + 1 < width) add(i + 1);
    if (y > 0) add(i - width);
    if (y + 1 < height) add(i + width);
  }
  let alpha: Uint8ClampedArray = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i++) alpha[i] = seen[i] ? 0 : 255;
  if (feather) alpha = refineAlpha(alpha, width, height, 0, feather);
  const result = pixels.slice();
  for (let i = 0; i < count; i++) result[i * 4 + 3] = (pixels[i * 4 + 3] * alpha[i]) / 255;
  return result;
}
export function borderColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  if (pixels.length !== width * height * 4) return null;
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (pixels[i + 3] < 250) return;
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2],
      key = `${r >> 4},${g >> 4},${b >> 4}`;
    const entry = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    entry.count++;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    buckets.set(key, entry);
  };
  const step = Math.max(1, Math.floor(Math.max(width, height) / 256));
  for (let x = 0; x < width; x += step) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    sample(0, y);
    sample(width - 1, y);
  }
  const winner = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!winner) return null;
  return `#${[winner.r, winner.g, winner.b]
    .map((value) =>
      Math.round(value / winner.count)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
