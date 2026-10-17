/** Connected color selection. Queue entries are marked before enqueueing to bound memory. */
export function floodMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seeds: number[],
  tolerance: number,
): Uint8ClampedArray {
  const count = width * height,
    seen = new Uint8Array(count),
    out = new Uint8ClampedArray(count * 4);
  const queue = new Int32Array(count);
  for (const seed of seeds) {
    if (seed < 0 || seed >= count || seen[seed]) continue;
    const base = seed * 4,
      color = [data[base], data[base + 1], data[base + 2], data[base + 3]];
    let head = 0,
      tail = 0;
    const add = (i: number): void => {
      if (seen[i]) return;
      const k = i * 4;
      const diff = Math.max(...color.map((v, j) => Math.abs(v - data[k + j])));
      if (diff > tolerance) return;
      seen[i] = 1;
      queue[tail++] = i;
    };
    add(seed);
    while (head < tail) {
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width),
        k = i * 4;
      out[k] = out[k + 1] = out[k + 2] = out[k + 3] = 255;
      if (x > 0) add(i - 1);
      if (x + 1 < width) add(i + 1);
      if (y > 0) add(i - width);
      if (y + 1 < height) add(i + width);
    }
  }
  return out;
}
