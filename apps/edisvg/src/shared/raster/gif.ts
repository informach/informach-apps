import { ByteWriter } from "./bytes";

/** Alpha below this becomes the transparent index; GIF has no partial transparency. */
export const GIF_ALPHA_THRESHOLD = 128;
const BITS = 5,
  BINS = 1 << (BITS * 3);

interface Box {
  bins: number[];
  count: number;
}
function binOf(r: number, g: number, b: number) {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}
function channel(bin: number, index: 0 | 1 | 2) {
  return (bin >> (10 - index * 5)) & 31;
}
/** Median cut over a 15-bit histogram: deterministic, bounded by the 32768 bins whatever the
 * frame size, and without dithering so still regions do not shimmer between frames. Each
 * palette entry is the mean of the real pixels of its box, so pure colours stay exact. */
function quantize(histogram: Uint32Array, sums: Float64Array, colors: number) {
  const used: number[] = [];
  for (let bin = 0; bin < BINS; bin++) if (histogram[bin]) used.push(bin);
  const weight = (bins: number[]) => bins.reduce((sum, bin) => sum + (histogram[bin] ?? 0), 0);
  const boxes: Box[] = used.length ? [{ bins: used, count: weight(used) }] : [];
  while (boxes.length < colors) {
    let pick = -1,
      pickRange = 0,
      pickChannel: 0 | 1 | 2 = 0;
    for (const [index, box] of boxes.entries()) {
      if (box.bins.length < 2) continue;
      for (const c of [0, 1, 2] as const) {
        let low = 31,
          high = 0;
        for (const bin of box.bins) {
          const value = channel(bin, c);
          if (value < low) low = value;
          if (value > high) high = value;
        }
        const range = (high - low) * Math.sqrt(box.count);
        if (range > pickRange) {
          pickRange = range;
          pick = index;
          pickChannel = c;
        }
      }
    }
    if (pick < 0) break;
    const box = boxes[pick];
    if (!box) break;
    box.bins.sort((a, b) => channel(a, pickChannel) - channel(b, pickChannel) || a - b);
    let half = 0,
      split = 0;
    for (; split < box.bins.length - 1; split++) {
      half += histogram[box.bins[split] ?? 0] ?? 0;
      if (half * 2 >= box.count) break;
    }
    // Both halves keep at least one bin, even when one heavy bin holds most of the weight.
    split = Math.min(split, box.bins.length - 2);
    const left = box.bins.slice(0, split + 1),
      right = box.bins.slice(split + 1);
    boxes.splice(
      pick,
      1,
      { bins: left, count: weight(left) },
      { bins: right, count: weight(right) },
    );
  }
  const palette: [number, number, number][] = [],
    lookup = new Int16Array(BINS).fill(-1);
  for (const box of boxes) {
    let r = 0,
      g = 0,
      b = 0;
    for (const bin of box.bins) {
      r += sums[bin * 3] ?? 0;
      g += sums[bin * 3 + 1] ?? 0;
      b += sums[bin * 3 + 2] ?? 0;
    }
    const index = palette.length;
    palette.push([Math.round(r / box.count), Math.round(g / box.count), Math.round(b / box.count)]);
    for (const bin of box.bins) lookup[bin] = index;
  }
  return { palette, lookup };
}

/** GIF LZW with a fresh table at 4096 codes, written in 255-byte sub-blocks. */
function writeLzw(out: ByteWriter, indices: Uint8Array, minCodeSize: number) {
  out.byte(minCodeSize);
  const clear = 1 << minCodeSize,
    end = clear + 1;
  let codeSize = minCodeSize + 1,
    next = end + 1,
    accumulator = 0,
    bits = 0;
  const block: number[] = [];
  const flushBlock = () => {
    if (!block.length) return;
    out.byte(block.length);
    out.bytes(block);
    block.length = 0;
  };
  const emit = (code: number) => {
    accumulator |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      block.push(accumulator & 0xff);
      if (block.length === 255) flushBlock();
      accumulator >>>= 8;
      bits -= 8;
    }
  };
  let table = new Map<number, number>();
  emit(clear);
  let prefix = indices[0] ?? 0;
  for (let index = 1; index < indices.length; index++) {
    const value = indices[index] ?? 0,
      key = (prefix << 8) | value,
      found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      table.set(key, next++);
      if (next > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      emit(clear);
      table = new Map();
      codeSize = minCodeSize + 1;
      next = end + 1;
    }
    prefix = value;
  }
  emit(prefix);
  emit(end);
  if (bits > 0) block.push(accumulator & 0xff);
  flushBlock();
  out.byte(0);
}

export interface GifEncoder {
  /** Straight (non-premultiplied) RGBA of the full canvas, as `getImageData` returns it. */
  addFrame(rgba: Uint8ClampedArray, delayCentiseconds: number): void;
  finish(): Uint8Array;
}
export function createGifEncoder(settings: {
  width: number;
  height: number;
  loop: boolean;
  limit: number;
}): GifEncoder {
  const { width, height } = settings;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error("Dimensões do GIF inválidas.");
  if (width > 65535 || height > 65535) throw new Error("GIF excede as dimensões do formato.");
  const out = new ByteWriter(settings.limit);
  out.ascii("GIF89a");
  out.u16le(width);
  out.u16le(height);
  out.byte(0); // No global color table: each frame carries its own palette.
  out.byte(0);
  out.byte(0);
  if (settings.loop) {
    out.bytes([0x21, 0xff, 0x0b]);
    out.ascii("NETSCAPE2.0");
    out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);
  }
  const isTransparent = (rgba: Uint8ClampedArray) => {
    for (let offset = 3; offset < rgba.length; offset += 4)
      if ((rgba[offset] ?? 0) < GIF_ALPHA_THRESHOLD) return true;
    return false;
  };
  let written: { rgba: Uint8ClampedArray; disposal: 1 | 2 } | null = null,
    pending: { rgba: Uint8ClampedArray; delay: number; transparent: boolean } | null = null,
    firstTransparent = false,
    finished = false;
  // A frame is written once the next one is known: its disposal (stored in its own control
  // block) must clear the canvas before a transparent successor, and only a frame kept on
  // screen (disposal 1) lets an opaque successor redraw just its changed rectangle.
  function write(
    frame: { rgba: Uint8ClampedArray; delay: number; transparent: boolean },
    nextTransparent: boolean,
  ) {
    const { rgba, delay, transparent } = frame,
      disposal: 1 | 2 = transparent || nextTransparent ? 2 : 1,
      previous = written?.disposal === 1 && !transparent && !nextTransparent ? written.rgba : null;
    let left = 0,
      top = 0,
      right = width - 1,
      bottom = height - 1;
    if (previous) {
      left = width;
      top = height;
      right = -1;
      bottom = -1;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          if (
            rgba[offset] !== previous[offset] ||
            rgba[offset + 1] !== previous[offset + 1] ||
            rgba[offset + 2] !== previous[offset + 2]
          ) {
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }
      if (right < 0) {
        left = 0;
        top = 0;
        right = 0;
        bottom = 0;
      }
    }
    const frameWidth = right - left + 1,
      frameHeight = bottom - top + 1,
      histogram = new Uint32Array(BINS),
      sums = new Float64Array(BINS * 3);
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const offset = (y * width + x) * 4;
        if (transparent && (rgba[offset + 3] ?? 0) < GIF_ALPHA_THRESHOLD) continue;
        const r = rgba[offset] ?? 0,
          g = rgba[offset + 1] ?? 0,
          b = rgba[offset + 2] ?? 0,
          bin = binOf(r, g, b);
        histogram[bin] = (histogram[bin] ?? 0) + 1;
        sums[bin * 3] = (sums[bin * 3] ?? 0) + r;
        sums[bin * 3 + 1] = (sums[bin * 3 + 1] ?? 0) + g;
        sums[bin * 3 + 2] = (sums[bin * 3 + 2] ?? 0) + b;
      }
    const { palette, lookup } = quantize(histogram, sums, transparent ? 255 : 256),
      transparentIndex = transparent ? palette.length : -1,
      entries = Math.max(2, palette.length + (transparent ? 1 : 0)),
      tableBits = Math.max(1, Math.ceil(Math.log2(entries))),
      indices = new Uint8Array(frameWidth * frameHeight);
    for (let y = 0; y < frameHeight; y++)
      for (let x = 0; x < frameWidth; x++) {
        const offset = ((top + y) * width + left + x) * 4;
        indices[y * frameWidth + x] =
          transparent && (rgba[offset + 3] ?? 0) < GIF_ALPHA_THRESHOLD
            ? transparentIndex
            : Math.max(
                0,
                lookup[binOf(rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0)] ?? 0,
              );
      }
    out.bytes([0x21, 0xf9, 0x04]);
    out.byte((disposal << 2) | (transparent ? 1 : 0));
    out.u16le(delay);
    out.byte(transparent ? transparentIndex : 0);
    out.byte(0);
    out.byte(0x2c);
    out.u16le(left);
    out.u16le(top);
    out.u16le(frameWidth);
    out.u16le(frameHeight);
    out.byte(0x80 | (tableBits - 1));
    for (let index = 0; index < 1 << tableBits; index++) out.bytes(palette[index] ?? [0, 0, 0]);
    writeLzw(out, indices, Math.max(2, tableBits));
    written = { rgba, disposal };
  }
  return {
    addFrame(rgba, delay) {
      if (finished) throw new Error("GIF já finalizado.");
      if (rgba.length !== width * height * 4) throw new Error("Quadro com tamanho incompatível.");
      if (!Number.isInteger(delay) || delay < 0 || delay > 65535)
        throw new Error("Atraso de quadro GIF inválido.");
      const transparent = isTransparent(rgba);
      if (pending) write(pending, transparent);
      else firstTransparent = transparent;
      pending = { rgba: rgba.slice(), delay, transparent };
    },
    finish() {
      if (finished) throw new Error("GIF já finalizado.");
      if (!pending) throw new Error("GIF sem quadros.");
      finished = true;
      write(pending, settings.loop && firstTransparent);
      out.byte(0x3b);
      return out.finish();
    },
  };
}
