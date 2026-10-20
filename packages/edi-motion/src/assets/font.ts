import { createFontCharacterMap, type FontCharacterMap } from "./cmap";
import { assertAssetBytes, FONT_TABLE_BYTES } from "./limits";
import { isXmlText } from "./xmlText";

/** Feature tags each layout script applies by default, per GSUB/GPOS. */
export interface FontLayoutScripts {
  substitution: ReadonlyMap<string, ReadonlySet<string>>;
  positioning: ReadonlyMap<string, ReadonlySet<string>>;
}
export class UnsupportedLayoutTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedLayoutTableError";
  }
}
/** ScriptList/FeatureList of a GSUB/GPOS table: for each script, the feature
 * tags of its default language system (the one a shaper uses without a
 * language), or of all its language systems when it has no default. Every
 * offset and count is bounds-checked. */
function layoutScripts(
  table: Uint8Array | undefined,
  tag: string,
): ReadonlyMap<string, ReadonlySet<string>> {
  const scripts = new Map<string, ReadonlySet<string>>();
  if (!table) return scripts;
  const fail = () => {
      throw new UnsupportedLayoutTableError(`Tabela ${tag} fora do perfil verificável.`);
    },
    view = new DataView(table.buffer, table.byteOffset, table.byteLength),
    read = (offset: number) => (offset + 2 <= table.length ? view.getUint16(offset) : fail()),
    name = (offset: number) => {
      if (offset + 4 > table.length) fail();
      const value = String.fromCharCode(...table.subarray(offset, offset + 4));
      return /^[\x20-\x7e]{4}$/.test(value) ? value : fail();
    };
  if (table.length < 10 || read(0) !== 1 || read(2) > 1) fail();
  const list = read(4),
    featureList = read(6),
    count = read(list),
    featureCount = read(featureList);
  if (!list || !featureList || count > 512 || featureCount > 4096) fail();
  const features = Array.from({ length: featureCount }, (_, index) =>
    name(featureList + 2 + index * 6),
  );
  const featuresOf = (system: number, into: Set<string>) => {
    const required = read(system + 2),
      indices = read(system + 4);
    if (indices > 4096) fail();
    for (const index of [
      ...(required === 0xffff ? [] : [required]),
      ...Array.from({ length: indices }, (_, at) => read(system + 6 + at * 2)),
    ])
      into.add(features[index] ?? fail());
  };
  for (let index = 0; index < count; index++) {
    const record = list + 2 + index * 6,
      script = name(record),
      offset = list + read(record + 4);
    if (offset === list) fail();
    const defaults = read(offset),
      systems = read(offset + 2),
      tags = new Set<string>();
    if (systems > 512) fail();
    if (defaults) featuresOf(offset + defaults, tags);
    else
      for (let language = 0; language < systems; language++) {
        const system = read(offset + 4 + language * 6 + 4);
        if (!system) fail();
        featuresOf(offset + system, tags);
      }
    scripts.set(script, tags);
  }
  return scripts;
}
interface FontTable {
  tag: string;
  offset: number;
  length: number;
  checksum: number;
}
export interface FontInfo {
  family: string;
  notice: string;
  format: "truetype" | "opentype";
  unitsPerEm: number;
  glyphs: number;
  weight: number;
  italic: boolean;
  embedding: number;
}
function checksum(bytes: Uint8Array, offset: number, length: number, zeroAdjustment = false) {
  let sum = 0;
  for (let index = 0; index < length; index += 4) {
    let word = 0;
    for (let byte = 0; byte < 4; byte++)
      word =
        (word << 8) |
        (index + byte < length && !(zeroAdjustment && index + byte >= 8 && index + byte < 12)
          ? (bytes[offset + index + byte] ?? 0)
          : 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}
/** Uncompressed, single-face OpenType only. Checksums and table bounds precede
 * the platform font sanitizer; this does not pretend to validate every glyph,
 * shaping program, variable-font axis or copyright/license condition. */
function inspectFontData(bytes: Uint8Array): {
  info: FontInfo;
  characterMap: Uint8Array;
  layout: Partial<Record<"GSUB" | "GPOS", Uint8Array>>;
} {
  assertAssetBytes(bytes);
  if (bytes.length < 12) throw new Error("Fonte OpenType truncada.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    magic = view.getUint32(0),
    format = magic === 0x00010000 ? "truetype" : magic === 0x4f54544f ? "opentype" : null;
  if (!format)
    throw new Error(
      "Use uma fonte TTF/OTF descomprimida, de uma única face; WOFF/WOFF2/coleções requerem conversão explícita.",
    );
  const count = view.getUint16(4),
    directoryEnd = 12 + count * 16;
  if (!count || count > 128 || directoryEnd > bytes.length)
    throw new Error("Diretório OpenType inválido/excessivo.");
  const power = 2 ** Math.floor(Math.log2(count));
  if (
    view.getUint16(6) !== power * 16 ||
    view.getUint16(8) !== Math.log2(power) ||
    view.getUint16(10) !== count * 16 - power * 16
  )
    throw new Error("Índice de pesquisa OpenType inconsistente.");
  const tables = new Map<string, FontTable>();
  let previous = "",
    total = 0;
  for (let index = 0; index < count; index++) {
    const at = 12 + index * 16,
      tag = String.fromCharCode(...bytes.subarray(at, at + 4)),
      offset = view.getUint32(at + 8),
      length = view.getUint32(at + 12);
    if (
      !/^[\x20-\x7e]{4}$/.test(tag) ||
      tag <= previous ||
      offset % 4 ||
      offset < directoryEnd ||
      offset + length > bytes.length ||
      !length
    )
      throw new Error(
        "Tabela OpenType inválida, duplicada, sobreposta ao diretório ou fora de ordem.",
      );
    previous = tag;
    total += length;
    if (total > FONT_TABLE_BYTES) throw new Error("Fonte excede orçamento de tabelas.");
    const expected = view.getUint32(at + 4);
    if (checksum(bytes, offset, length, tag === "head") !== expected)
      throw new Error(`Checksum inválido na tabela ${tag}.`);
    tables.set(tag, { tag, offset, length, checksum: expected });
  }
  const sorted = [...tables.values()].sort((a, b) => a.offset - b.offset);
  let end = directoryEnd;
  for (const table of sorted) {
    if (table.offset < end) throw new Error("Tabelas OpenType sobrepostas.");
    end = table.offset + table.length;
    for (let padding = end; padding < Math.ceil(end / 4) * 4 && padding < bytes.length; padding++)
      if (bytes[padding] !== 0) throw new Error("Padding OpenType não nulo.");
  }
  if (checksum(bytes, 0, bytes.length) !== 0xb1b0afba)
    throw new Error("Checksum global OpenType inválido.");
  const requireTable = (tag: string, minimum: number) => {
    const table = tables.get(tag);
    if (!table || table.length < minimum) throw new Error(`Fonte sem tabela ${tag} válida.`);
    return table;
  };
  const head = requireTable("head", 54),
    maxp = requireTable("maxp", 6),
    os2 = requireTable("OS/2", 64),
    hhea = requireTable("hhea", 36);
  const cmap = requireTable("cmap", 4);
  const names = requireTable("name", 6);
  requireTable("post", 32);
  if (view.getUint32(head.offset + 12) !== 0x5f0f3cf5 || view.getUint32(head.offset) !== 0x00010000)
    throw new Error("Cabeçalho OpenType inválido.");
  const unitsPerEm = view.getUint16(head.offset + 18),
    glyphs = view.getUint16(maxp.offset + 4),
    hMetrics = view.getUint16(hhea.offset + 34),
    embedding = view.getUint16(os2.offset + 8),
    weight = view.getUint16(os2.offset + 4),
    osVersion = view.getUint16(os2.offset);
  if (
    unitsPerEm < 16 ||
    unitsPerEm > 16384 ||
    !glyphs ||
    !hMetrics ||
    hMetrics > glyphs ||
    weight < 1 ||
    weight > 1000 ||
    osVersion > 5
  )
    throw new Error("Métricas/cabeçalho de fonte inválidos.");
  // Conservative editing profile: never downgrade declared rights or assume
  // that conflicting legacy flags imply permission to redistribute a font.
  if (![0, 8].includes(embedding & 15) || embedding & 0x200 || embedding & 0xfcf1)
    throw new Error(
      "Fonte declara incorporação restrita, somente leitura/bitmap ou flags incompatíveis com edição.",
    );
  requireTable("hmtx", hMetrics * 4 + (glyphs - hMetrics) * 2);
  if (format === "truetype") {
    if (view.getUint32(maxp.offset) !== 0x00010000 || maxp.length < 32)
      throw new Error("maxp TrueType inválido.");
    const glyf = requireTable("glyf", 1),
      locationFormat = view.getInt16(head.offset + 50);
    if (locationFormat !== 0 && locationFormat !== 1) throw new Error("Formato loca inválido.");
    const loca = requireTable("loca", (glyphs + 1) * (locationFormat ? 4 : 2));
    let previousOffset = 0;
    for (let glyph = 0; glyph <= glyphs; glyph++) {
      const offset = locationFormat
        ? view.getUint32(loca.offset + glyph * 4)
        : view.getUint16(loca.offset + glyph * 2) * 2;
      if (offset < previousOffset || offset > glyf.length)
        throw new Error("Referência de glifo fora dos limites.");
      previousOffset = offset;
    }
  } else if (
    view.getUint32(maxp.offset) !== 0x00005000 ||
    (!tables.has("CFF ") && !tables.has("CFF2"))
  )
    throw new Error("Fonte OpenType sem outlines CFF/CFF2.");
  // SVG font tables can embed a separate document/parser; this profile does not
  // pass them through to native decoders or the exported application.
  if (tables.has("SVG "))
    throw new Error("Fontes com glifos SVG requerem perfil gráfico específico.");
  const nameCount = view.getUint16(names.offset + 2),
    strings = view.getUint16(names.offset + 4),
    nameFormat = view.getUint16(names.offset);
  if (
    nameCount > 1000 ||
    names.length < 6 + nameCount * 12 ||
    strings < 6 + nameCount * 12 ||
    strings > names.length ||
    nameFormat > 1
  )
    throw new Error("Diretório de nomes da fonte inválido.");
  const decoded = new Map<number, { text: string; priority: number }>();
  for (let index = 0; index < nameCount; index++) {
    const at = names.offset + 6 + index * 12,
      platform = view.getUint16(at),
      encoding = view.getUint16(at + 2),
      language = view.getUint16(at + 4),
      id = view.getUint16(at + 6),
      length = view.getUint16(at + 8),
      offset = view.getUint16(at + 10);
    if (strings + offset + length > names.length)
      throw new Error("Nome de fonte fora dos limites.");
    if (
      ![0, 1, 13, 16].includes(id) ||
      !(platform === 0 || (platform === 3 && [0, 1, 10].includes(encoding)))
    )
      continue;
    if (length > 16000 || length % 2)
      throw new Error("Texto de metadado da fonte inválido/excessivo.");
    const text = new TextDecoder("utf-16be", { fatal: true })
        .decode(
          bytes.subarray(names.offset + strings + offset, names.offset + strings + offset + length),
        )
        .trim(),
      priority = (platform === 3 ? 2 : 0) + (language === 0x0409 ? 1 : 0);
    if (text && priority > (decoded.get(id)?.priority ?? -1)) decoded.set(id, { text, priority });
  }
  const family = decoded.get(16)?.text ?? decoded.get(1)?.text;
  if (
    !family ||
    !isXmlText(family) ||
    family.length > 120 ||
    [...family].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    throw new Error("Fonte sem família Unicode válida no perfil.");
  const notice = [decoded.get(0)?.text, decoded.get(13)?.text].filter(Boolean).join("\n\n");
  if (notice.length > 16000 || !isXmlText(notice))
    throw new Error("Avisos de fonte inválidos ou excessivos.");
  return {
    info: {
      family,
      notice,
      format,
      unitsPerEm,
      glyphs,
      weight,
      italic: (view.getUint16(os2.offset + 62) & 1) !== 0,
      embedding,
    },
    characterMap: bytes.subarray(cmap.offset, cmap.offset + cmap.length),
    layout: Object.fromEntries(
      (["GSUB", "GPOS"] as const).flatMap((tag) => {
        const table = tables.get(tag);
        return table ? [[tag, bytes.subarray(table.offset, table.offset + table.length)]] : [];
      }),
    ),
  };
}
export function inspectFont(bytes: Uint8Array): FontInfo {
  return inspectFontData(bytes).info;
}
/** OpenType layout scripts that declare features (GSUB substitutions and GPOS
 * positioning), by script tag. Like coverage, separate from loading: a font
 * with a malformed layout table still opens and gets an explicit diagnosis. */
export function inspectFontLayoutScripts(bytes: Uint8Array): FontLayoutScripts {
  const { layout } = inspectFontData(bytes);
  return {
    substitution: layoutScripts(layout.GSUB, "GSUB"),
    positioning: layoutScripts(layout.GPOS, "GPOS"),
  };
}
/** Coverage is separate from loading/structural validation: unsupported
 * historical encodings remain openable and get an explicit coverage error. */
export function inspectFontCharacterMap(bytes: Uint8Array): FontCharacterMap {
  const { info, characterMap } = inspectFontData(bytes);
  return createFontCharacterMap(characterMap, info.glyphs);
}
