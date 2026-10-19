import { Unzlib } from "fflate";

/** Check encoded image dimensions and bounded PNG expansion before the PDF codec allocates pixels. */
export function validateRasterImage(
  bytes: Uint8Array,
  format: "png" | "jpg",
): { width: number; height: number } {
  if (!bytes.length || bytes.length > 32 * 1024 * 1024)
    throw new Error("Imagem vazia ou acima de 32 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = (width: number, height: number) => {
    if (!width || !height || width > 16000 || height > 16000 || width * height > 32_000_000)
      throw new Error("Imagem excede os limites locais de resolução.");
  };
  if (format === "jpg") {
    if (bytes[0] !== 255 || bytes[1] !== 216) throw new Error("Cabeçalho JPEG inválido.");
    for (let at = 2; at + 3 < bytes.length; ) {
      if (bytes[at++] !== 255) throw new Error("Marcador JPEG inválido.");
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker !== undefined && marker >= 208 && marker <= 215)) continue;
      if (at + 2 > bytes.length) break;
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) throw new Error("Segmento JPEG incompleto.");
      if (
        marker !== undefined &&
        [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)
      ) {
        if (length < 8) throw new Error("Quadro JPEG incompleto.");
        const width = view.getUint16(at + 5),
          height = view.getUint16(at + 3);
        size(width, height);
        return { width, height };
      }
      at += length;
    }
    throw new Error("JPEG sem quadro de imagem válido.");
  }
  if (
    bytes.length < 33 ||
    bytes[0] !== 137 ||
    bytes[1] !== 80 ||
    bytes[2] !== 78 ||
    bytes[3] !== 71 ||
    view.getUint32(4) !== 0x0d0a1a0a ||
    view.getUint32(8) !== 13 ||
    view.getUint32(12) !== 0x49484452
  )
    throw new Error("Cabeçalho PNG inválido.");
  const width = view.getUint32(16),
    height = view.getUint32(20),
    depth = bytes[24],
    color = bytes[25],
    interlace = bytes[28];
  size(width, height);
  const channels =
    color === 0 || color === 3 ? 1 : color === 2 ? 3 : color === 4 ? 2 : color === 6 ? 4 : 0;
  if (
    !channels ||
    depth === undefined ||
    ![1, 2, 4, 8, 16].includes(depth) ||
    (color === 3 && depth === 16) ||
    (color !== 0 && color !== 3 && depth < 8) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    (interlace !== 0 && interlace !== 1)
  )
    throw new Error("Formato PNG não suportado.");
  const passes = interlace
    ? [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2],
      ]
    : [[0, 0, 1, 1]];
  let expected = 0;
  for (const pass of passes) {
    const [x, y, dx, dy] = pass;
    if (x === undefined || y === undefined || dx === undefined || dy === undefined)
      throw new Error("Passagem PNG inválida.");
    const w = Math.max(0, Math.ceil((width - x) / dx)),
      h = Math.max(0, Math.ceil((height - y) / dy));
    if (w && h) expected += (Math.ceil((w * channels * depth) / 8) + 1) * h;
  }
  if (expected > 128 * 1024 * 1024) throw new Error("Imagem PNG descompactada excede 128 MB.");
  const idat: Uint8Array[] = [];
  let at = 8,
    ended = false,
    chunks = 0;
  while (at + 12 <= bytes.length) {
    if (++chunks > 10000) throw new Error("PNG contém partes demais.");
    const length = view.getUint32(at),
      type = view.getUint32(at + 4),
      end = at + 12 + length;
    if (end > bytes.length) throw new Error("Parte PNG incompleta.");
    if (type === 0x49444154) idat.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === 0x49454e44) {
      if (length || end !== bytes.length) throw new Error("Fim PNG inválido.");
      ended = true;
      break;
    }
    at = end;
  }
  if (!ended || !idat.length) throw new Error("PNG incompleto.");
  let expanded = 0,
    finished = false;
  const decoder = new Unzlib((chunk, final) => {
    expanded += chunk.length;
    if (expanded > expected) throw new Error("Expansão PNG excede as dimensões declaradas.");
    finished = final;
  });
  idat.forEach((part) => {
    for (let position = 0; position < part.length; position += 1024)
      decoder.push(part.subarray(position, position + 1024), false);
  });
  decoder.push(new Uint8Array(), true);
  if (!finished || expanded !== expected)
    throw new Error("Dados PNG incompletos ou inconsistentes.");
  return { width, height };
}
