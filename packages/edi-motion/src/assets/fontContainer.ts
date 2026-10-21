import { unzlibSync } from "fflate";
import { ASSET_BYTES } from "./limits";

/** Font containers accepted at import, all converted to one uncompressed
 * single-face SFNT (TTF/OTF) before the usual inspection: WOFF 1.0 (zlib
 * tables) and TrueType/OpenType collections (one chosen face). The table
 * bytes are kept exactly; only the directory, padding and checksums are
 * rebuilt. WOFF2 needs Brotli and table transforms and stays refused. */
export type FontContainer = "sfnt" | "woff" | "collection";
const tag = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
export function fontContainer(bytes: Uint8Array): { container: FontContainer; faces: number } {
  if (bytes.length < 12) throw new Error("Fonte truncada.");
  const signature = tag(bytes, 0),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (signature === "wOF2")
    throw new Error(
      "WOFF2 usa Brotli e transformações de tabela fora deste perfil. Converta para TTF, OTF ou WOFF.",
    );
  if (signature === "wOFF") return { container: "woff", faces: 1 };
  if (signature === "ttcf") {
    const faces = view.getUint32(8);
    if (!faces || faces > 64 || 12 + faces * 4 > bytes.length)
      throw new Error("Coleção de fontes inválida ou excessiva.");
    return { container: "collection", faces };
  }
  return { container: "sfnt", faces: 1 };
}
function checksum(bytes: Uint8Array, offset: number, length: number) {
  let sum = 0;
  for (let index = 0; index < length; index += 4) {
    let word = 0;
    for (let byte = 0; byte < 4; byte++)
      word = (word << 8) | (index + byte < length ? (bytes[offset + index + byte] ?? 0) : 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}
/** Builds a valid SFNT from table bytes: sorted directory, 4-byte padding,
 * table checksums and head.checkSumAdjustment. */
function buildSfnt(flavor: number, tables: { tag: string; data: Uint8Array }[]) {
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0)),
    count = sorted.length,
    header = 12 + count * 16,
    size = sorted.reduce((sum, table) => sum + Math.ceil(table.data.length / 4) * 4, header);
  if (!count || count > 128 || size > ASSET_BYTES)
    throw new Error("Fonte convertida excede 4 MB ou o limite de tabelas.");
  const output = new Uint8Array(size),
    view = new DataView(output.buffer),
    power = 2 ** Math.floor(Math.log2(count));
  view.setUint32(0, flavor);
  view.setUint16(4, count);
  view.setUint16(6, power * 16);
  view.setUint16(8, Math.log2(power));
  view.setUint16(10, count * 16 - power * 16);
  let offset = header,
    headOffset = -1;
  for (const [index, table] of sorted.entries()) {
    const at = 12 + index * 16;
    for (let character = 0; character < 4; character++)
      output[at + character] = table.tag.charCodeAt(character);
    output.set(table.data, offset);
    if (table.tag === "head") {
      if (table.data.length < 54) throw new Error("Tabela head inválida.");
      headOffset = offset;
      view.setUint32(offset + 8, 0);
    }
    view.setUint32(at + 4, checksum(output, offset, table.data.length));
    view.setUint32(at + 8, offset);
    view.setUint32(at + 12, table.data.length);
    offset += Math.ceil(table.data.length / 4) * 4;
  }
  if (headOffset < 0) throw new Error("Fonte sem tabela head.");
  view.setUint32(headOffset + 8, (0xb1b0afba - checksum(output, 0, output.length)) >>> 0);
  return output;
}
function fromWoff(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 44 || view.getUint32(8) !== bytes.length)
    throw new Error("WOFF truncado ou com tamanho inconsistente.");
  const flavor = view.getUint32(4),
    count = view.getUint16(12);
  if ((flavor !== 0x00010000 && flavor !== 0x4f54544f) || !count || count > 128)
    throw new Error("WOFF com sabor/tabelas fora do perfil TTF/OTF.");
  let total = 0;
  const tables = Array.from({ length: count }, (_, index) => {
    const at = 44 + index * 20;
    if (at + 20 > bytes.length) throw new Error("Diretório WOFF truncado.");
    const offset = view.getUint32(at + 4),
      compressed = view.getUint32(at + 8),
      original = view.getUint32(at + 12);
    total += original;
    if (
      offset + compressed > bytes.length ||
      compressed > original ||
      !original ||
      total > ASSET_BYTES
    )
      throw new Error("Tabela WOFF fora dos limites.");
    const source = bytes.subarray(offset, offset + compressed),
      data =
        compressed === original
          ? source.slice()
          : unzlibSync(source, { out: new Uint8Array(original) });
    if (data.length !== original) throw new Error("Tabela WOFF descomprimida com tamanho errado.");
    return { tag: tag(bytes, at), data };
  });
  return buildSfnt(flavor, tables);
}
function fromCollection(bytes: Uint8Array, face: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    { faces } = fontContainer(bytes);
  if (!Number.isInteger(face) || face < 0 || face >= faces)
    throw new Error("Face fora da coleção de fontes.");
  const start = view.getUint32(12 + face * 4);
  if (start + 12 > bytes.length) throw new Error("Face da coleção fora dos limites.");
  const flavor = view.getUint32(start),
    count = view.getUint16(start + 4);
  if ((flavor !== 0x00010000 && flavor !== 0x4f54544f) || !count || count > 128)
    throw new Error("Face da coleção fora do perfil TTF/OTF.");
  const tables = Array.from({ length: count }, (_, index) => {
    const at = start + 12 + index * 16;
    if (at + 16 > bytes.length) throw new Error("Diretório da coleção truncado.");
    const offset = view.getUint32(at + 8),
      length = view.getUint32(at + 12);
    if (!length || offset + length > bytes.length)
      throw new Error("Tabela da coleção fora dos limites.");
    // Faces share tables by offset; each extracted face gets its own copy.
    return { tag: tag(bytes, at), data: bytes.slice(offset, offset + length) };
  });
  return buildSfnt(flavor, tables);
}
/** Standalone SFNT bytes for the chosen face; plain TTF/OTF pass through. */
export function extractFontFace(bytes: Uint8Array, face = 0): Uint8Array {
  const { container } = fontContainer(bytes);
  if (container === "woff") return fromWoff(bytes);
  if (container === "collection") return fromCollection(bytes, face);
  if (face !== 0) throw new Error("Fonte avulsa tem uma única face.");
  return bytes;
}
