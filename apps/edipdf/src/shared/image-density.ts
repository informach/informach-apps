import { validateRasterImage } from "./raster-image.ts";

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Set the requested physical density in newly encoded page images without changing pixels. */
export function setImageDensity(bytes: Uint8Array, format: "png" | "jpg", dpi: number): Uint8Array {
  if (![72, 150, 300].includes(dpi)) throw new Error("Densidade de imagem fora do perfil local.");
  validateRasterImage(bytes, format);
  if (format === "jpg") {
    if (
      bytes.length >= 20 &&
      bytes[2] === 0xff &&
      bytes[3] === 0xe0 &&
      new TextDecoder().decode(bytes.subarray(6, 11)) === "JFIF\0"
    ) {
      const output = new Uint8Array(bytes);
      output[13] = 1;
      output[14] = dpi >>> 8;
      output[15] = dpi & 255;
      output[16] = dpi >>> 8;
      output[17] = dpi & 255;
      return output;
    }
    const header = new Uint8Array([
        0xff,
        0xe0,
        0,
        16,
        74,
        70,
        73,
        70,
        0,
        1,
        2,
        1,
        dpi >>> 8,
        dpi & 255,
        dpi >>> 8,
        dpi & 255,
        0,
        0,
      ]),
      output = new Uint8Array(bytes.length + header.length);
    output.set(bytes.subarray(0, 2));
    output.set(header, 2);
    output.set(bytes.subarray(2), header.length + 2);
    return output;
  }
  const physical = new Uint8Array(21),
    density = Math.round(dpi / 0.0254),
    view = new DataView(physical.buffer);
  view.setUint32(0, 9);
  physical.set([112, 72, 89, 115], 4);
  view.setUint32(8, density);
  view.setUint32(12, density);
  physical[16] = 1;
  view.setUint32(17, crc32(physical.subarray(4, 17)));
  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    chunks = [bytes.subarray(0, 8)];
  let position = 8,
    ended = false;
  while (position + 12 <= bytes.length && !ended) {
    const size = source.getUint32(position),
      end = position + size + 12;
    if (end > bytes.length) throw new Error("Bloco PNG fora dos limites da imagem.");
    const type = new TextDecoder().decode(bytes.subarray(position + 4, position + 8));
    if (type !== "pHYs") chunks.push(bytes.subarray(position, end));
    if (type === "IHDR") chunks.push(physical);
    ended = type === "IEND";
    position = end;
  }
  if (!ended || position !== bytes.length)
    throw new Error("PNG incompleto ou com conteúdo depois do final.");
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
