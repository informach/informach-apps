/** Independent readers for the raster exporters' unit tests: written from the format specs, not
 * from the writers, so a symmetric bug in the encoder cannot pass its own round trip. */

export interface DecodedGif {
  width: number;
  height: number;
  loop: boolean;
  frames: { delay: number; disposal: number; rgba: Uint8ClampedArray }[];
}
export function decodeGif(bytes: Uint8Array): DecodedGif {
  const ascii = String.fromCharCode(...bytes.subarray(0, 6));
  if (ascii !== "GIF89a") throw new Error(`GIF header ${ascii}`);
  const u16 = (offset: number) => (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
  const width = u16(6),
    height = u16(8),
    packed = bytes[10] ?? 0;
  let offset = 13;
  if (packed & 0x80) offset += 3 * (1 << ((packed & 7) + 1));
  let loop = false,
    delay = 0,
    disposal = 0,
    transparentIndex = -1;
  const canvas = new Uint8ClampedArray(width * height * 4),
    frames: DecodedGif["frames"] = [];
  const readBlocks = () => {
    const parts: number[] = [];
    for (;;) {
      const size = bytes[offset++] ?? 0;
      if (!size) return parts;
      for (let index = 0; index < size; index++) parts.push(bytes[offset++] ?? 0);
    }
  };
  for (;;) {
    const marker = bytes[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = bytes[offset++];
      if (label === 0xf9) {
        const flags = bytes[offset + 1] ?? 0;
        disposal = (flags >> 2) & 7;
        delay = u16(offset + 2);
        transparentIndex = flags & 1 ? (bytes[offset + 4] ?? 0) : -1;
        offset += 6;
      } else if (label === 0xff) {
        const size = bytes[offset] ?? 0,
          name = String.fromCharCode(...bytes.subarray(offset + 1, offset + 1 + size));
        offset += 1 + size;
        if (name === "NETSCAPE2.0") loop = true;
        readBlocks();
      } else readBlocks();
      continue;
    }
    if (marker !== 0x2c) throw new Error(`Unexpected GIF block ${marker}`);
    const left = u16(offset),
      top = u16(offset + 2),
      frameWidth = u16(offset + 4),
      frameHeight = u16(offset + 6),
      flags = bytes[offset + 8] ?? 0;
    offset += 9;
    if (!(flags & 0x80)) throw new Error("Frame without local palette");
    const entries = 1 << ((flags & 7) + 1),
      palette = bytes.subarray(offset, offset + entries * 3);
    offset += entries * 3;
    const minCode = bytes[offset++] ?? 0,
      data = readBlocks(),
      indices: number[] = [];
    // LZW decoder (GIF89a appendix F).
    const clear = 1 << minCode,
      end = clear + 1;
    let size = minCode + 1,
      dictionary: number[][] = [],
      previous: number[] | null = null,
      bitOffset = 0;
    const reset = () => {
      dictionary = [];
      for (let code = 0; code < clear; code++) dictionary[code] = [code];
      dictionary[clear] = [];
      dictionary[end] = [];
      size = minCode + 1;
      previous = null;
    };
    reset();
    for (;;) {
      let code = 0;
      for (let bit = 0; bit < size; bit++, bitOffset++)
        code |= (((data[bitOffset >> 3] ?? 0) >> (bitOffset & 7)) & 1) << bit;
      if (bitOffset > data.length * 8) throw new Error("LZW overrun");
      if (code === clear) {
        reset();
        continue;
      }
      if (code === end) break;
      let entry = dictionary[code];
      if (!entry) {
        if (!previous || code !== dictionary.length) throw new Error("Invalid LZW code");
        entry = [...previous, previous[0] ?? 0];
      }
      indices.push(...entry);
      if (previous && dictionary.length < 4096) dictionary.push([...previous, entry[0] ?? 0]);
      previous = entry;
      if (dictionary.length === 1 << size && size < 12) size++;
    }
    if (indices.length !== frameWidth * frameHeight) throw new Error("GIF pixel count");
    for (let y = 0; y < frameHeight; y++)
      for (let x = 0; x < frameWidth; x++) {
        const index = indices[y * frameWidth + x] ?? 0;
        if (index === transparentIndex) continue;
        const target = ((top + y) * width + left + x) * 4;
        canvas[target] = palette[index * 3] ?? 0;
        canvas[target + 1] = palette[index * 3 + 1] ?? 0;
        canvas[target + 2] = palette[index * 3 + 2] ?? 0;
        canvas[target + 3] = 255;
      }
    frames.push({ delay, disposal, rgba: canvas.slice() });
    if (disposal === 2)
      for (let y = 0; y < frameHeight; y++)
        canvas.fill(0, ((top + y) * width + left) * 4, ((top + y) * width + left + frameWidth) * 4);
    transparentIndex = -1;
  }
  return { width, height, loop, frames };
}

export interface Mp4Box {
  type: string;
  start: number;
  size: number;
  children: Mp4Box[];
}
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf"]);
export function readMp4Boxes(bytes: Uint8Array, start = 0, end = bytes.length): Mp4Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    boxes: Mp4Box[] = [];
  for (let offset = start; offset < end; ) {
    const size = view.getUint32(offset),
      type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (size < 8 || offset + size > end) throw new Error(`Bad box ${type}`);
    boxes.push({
      type,
      start: offset,
      size,
      children: CONTAINERS.has(type) ? readMp4Boxes(bytes, offset + 8, offset + size) : [],
    });
    offset += size;
  }
  return boxes;
}
export function findMp4Box(boxes: Mp4Box[], path: string[]): Mp4Box {
  let level = boxes,
    found: Mp4Box | undefined;
  for (const type of path) {
    found = level.find((box) => box.type === type);
    if (!found) throw new Error(`Missing box ${path.join("/")}`);
    level = found.children;
  }
  if (!found) throw new Error("Empty path");
  return found;
}

export interface EbmlNode {
  id: number;
  start: number;
  dataStart: number;
  size: number;
  children: EbmlNode[];
}
const EBML_MASTERS = new Set([
  0x1a45dfa3, 0x18538067, 0x114d9b74, 0x4dbb, 0x1549a966, 0x1654ae6b, 0xae, 0xe0, 0x1f43b675,
  0x1c53bb6b, 0xbb, 0xb7,
]);
function vint(bytes: Uint8Array, offset: number, keepMarker: boolean) {
  const first = bytes[offset] ?? 0;
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 8) throw new Error("Bad EBML vint");
  let value = keepMarker ? first : first & (0xff >> length);
  for (let index = 1; index < length; index++) value = value * 256 + (bytes[offset + index] ?? 0);
  return { value, length };
}
export function readEbml(bytes: Uint8Array, start = 0, end = bytes.length): EbmlNode[] {
  const nodes: EbmlNode[] = [];
  for (let offset = start; offset < end; ) {
    const id = vint(bytes, offset, true),
      size = vint(bytes, offset + id.length, false),
      dataStart = offset + id.length + size.length;
    if (dataStart + size.value > end) throw new Error(`EBML element overflows ${id.value}`);
    nodes.push({
      id: id.value,
      start: offset,
      dataStart,
      size: size.value,
      children: EBML_MASTERS.has(id.value)
        ? readEbml(bytes, dataStart, dataStart + size.value)
        : [],
    });
    offset = dataStart + size.value;
  }
  return nodes;
}
export function ebmlUint(bytes: Uint8Array, node: EbmlNode) {
  let value = 0;
  for (let index = 0; index < node.size; index++)
    value = value * 256 + (bytes[node.dataStart + index] ?? 0);
  return value;
}
