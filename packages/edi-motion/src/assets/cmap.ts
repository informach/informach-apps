import { assertAssetBytes } from "./limits";

export class UnsupportedCharacterMapError extends Error {
  constructor(reason = "cmap Unicode fora do perfil verificável (formatos 4/12 e variações 14).") {
    super(reason);
  }
}
export interface FontCharacterMap {
  readonly format: 4 | 12;
  glyph(codePoint: number, variationSelector?: number): number;
}
interface Range {
  start: number;
  end: number;
}
interface ValidatedCharacterMap extends FontCharacterMap {
  ranges: readonly Range[];
}
function scalar(value: number) {
  return (
    Number.isInteger(value) && value >= 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff)
  );
}
function findRange<T extends Range>(ranges: readonly T[], value: number): T | undefined {
  let low = 0,
    high = ranges.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2),
      entry = ranges[middle];
    if (!entry) throw new Error("Índice cmap inconsistente.");
    if (value < entry.start) high = middle - 1;
    else if (value > entry.end) low = middle + 1;
    else return entry;
  }
  return undefined;
}
/** Unicode cmap only. The private snapshot prevents caller mutation after
 * validation. Every subtable is bounded before reads; lookup is binary and
 * never expands supplementary ranges into per-code-point allocations. */
export function createFontCharacterMap(input: Uint8Array, glyphs: number): FontCharacterMap {
  assertAssetBytes(input);
  if (!Number.isInteger(glyphs) || glyphs < 1 || glyphs > 65535 || input.length < 4)
    throw new Error("Cabeçalho cmap/glifos inválido.");
  const bytes = new Uint8Array(input),
    view = new DataView(bytes.buffer),
    count = view.getUint16(2),
    headerEnd = 4 + count * 8;
  if (view.getUint16(0) !== 0 || !count || count > 128 || headerEnd > bytes.length)
    throw new Error("Diretório cmap inválido/excessivo.");
  function bounded(offset: number, length: number, minimum: number) {
    if (offset < headerEnd || length < minimum || offset + length > bytes.length)
      throw new Error("Subtabela cmap truncada/fora dos limites.");
  }
  function format4(at: number): ValidatedCharacterMap {
    bounded(at, bytes.length - at, 16);
    const length = view.getUint16(at + 2),
      twice = view.getUint16(at + 6),
      n = twice / 2;
    bounded(at, length, 16);
    if (!n || twice % 2 || length % 2 || 16 + n * 8 > length || view.getUint16(at + 4) !== 0)
      throw new Error("Segmentos cmap4 inválidos.");
    const power = 2 ** Math.floor(Math.log2(n));
    if (
      view.getUint16(at + 8) !== power * 2 ||
      view.getUint16(at + 10) !== Math.log2(power) ||
      view.getUint16(at + 12) !== twice - power * 2 ||
      view.getUint16(at + 14 + n * 2) !== 0
    )
      throw new Error("Índice cmap4 inconsistente.");
    const ranges: (Range & { delta: number; position: number | null })[] = [];
    let previousEnd = -1;
    for (let index = 0; index < n; index++) {
      const end = view.getUint16(at + 14 + index * 2),
        start = view.getUint16(at + 16 + n * 2 + index * 2),
        delta = view.getInt16(at + 16 + n * 4 + index * 2),
        positionAt = at + 16 + n * 6 + index * 2,
        offset = view.getUint16(positionAt),
        position = offset ? positionAt + offset : null;
      if (
        start > end ||
        start <= previousEnd ||
        offset % 2 ||
        (position !== null &&
          (position < at + 16 + n * 8 || position + (end - start) * 2 + 2 > at + length))
      )
        throw new Error("Intervalo/referência cmap4 inválido.");
      ranges.push({ start, end, delta, position });
      previousEnd = end;
      // Disjoint BMP ranges total at most 65536 iterations, regardless of n.
      for (let point = start; point <= end; point++) {
        const raw = position === null ? point : view.getUint16(position + (point - start) * 2),
          glyph = position === null || raw ? (raw + delta) & 0xffff : 0;
        if (glyph >= glyphs) throw new Error("cmap4 referencia glifo inexistente.");
      }
    }
    const last = ranges.at(-1);
    if (last?.start !== 0xffff || last.end !== 0xffff)
      throw new Error("cmap4 sem segmento terminador.");
    return {
      format: 4,
      ranges,
      glyph(point) {
        if (point > 0xffff) return 0;
        const range = findRange(ranges, point);
        if (!range) return 0;
        const raw =
          range.position === null
            ? point
            : view.getUint16(range.position + (point - range.start) * 2);
        return range.position === null || raw ? (raw + range.delta) & 0xffff : 0;
      },
    };
  }
  function format12(at: number): ValidatedCharacterMap {
    bounded(at, bytes.length - at, 16);
    const length = view.getUint32(at + 4),
      n = view.getUint32(at + 12);
    bounded(at, length, 16);
    if (
      view.getUint16(at + 2) !== 0 ||
      view.getUint32(at + 8) !== 0 ||
      n > 100000 ||
      length !== 16 + n * 12
    )
      throw new Error("Cabeçalho cmap12 inválido/excessivo.");
    const ranges: (Range & { glyph: number })[] = [];
    let previousEnd = -1;
    for (let index = 0; index < n; index++) {
      const pos = at + 16 + index * 12,
        start = view.getUint32(pos),
        end = view.getUint32(pos + 4),
        glyph = view.getUint32(pos + 8);
      if (
        !scalar(start) ||
        !scalar(end) ||
        start > end ||
        start <= previousEnd ||
        (start <= 0xdfff && end >= 0xd800) ||
        glyph + end - start >= glyphs
      )
        throw new Error("Intervalo/glifo cmap12 inválido.");
      ranges.push({ start, end, glyph });
      previousEnd = end;
    }
    return {
      format: 12,
      ranges,
      glyph(point) {
        const range = findRange(ranges, point);
        return range ? range.glyph + point - range.start : 0;
      },
    };
  }
  function variation14(at: number) {
    bounded(at, bytes.length - at, 10);
    const length = view.getUint32(at + 2),
      n = view.getUint32(at + 6),
      end = at + length;
    bounded(at, length, 10);
    if (n > 256 || 10 + n * 11 > length) throw new Error("cmap14 excede seletores/limites.");
    const u24 = (pos: number) => view.getUint8(pos) * 65536 + view.getUint16(pos + 1),
      variants = new Map<number, { defaults: Range[]; glyphs: (Range & { glyph: number })[] }>();
    let previous = -1,
      records = 0;
    function location(offset: number, size: number) {
      const pos = at + offset;
      if (offset < 10 + n * 11 || pos + size > end)
        throw new Error("Referência cmap14 fora dos limites.");
      return pos;
    }
    for (let index = 0; index < n; index++) {
      const pos = at + 10 + index * 11,
        selector = u24(pos),
        defaultOffset = view.getUint32(pos + 3),
        nonDefaultOffset = view.getUint32(pos + 7);
      if (
        !scalar(selector) ||
        selector <= previous ||
        !/\p{Variation_Selector}/u.test(String.fromCodePoint(selector))
      )
        throw new Error("Seletor cmap14 inválido/repetido.");
      previous = selector;
      const defaults: Range[] = [],
        mapped: (Range & { glyph: number })[] = [];
      if (defaultOffset) {
        const pos = location(defaultOffset, 4),
          count = view.getUint32(pos);
        records += count;
        if (records > 100000) throw new Error("cmap14 excede orçamento de mapeamentos.");
        location(defaultOffset, 4 + count * 4);
        let last = -1;
        for (let index = 0; index < count; index++) {
          const start = u24(pos + 4 + index * 4),
            finish = start + view.getUint8(pos + 7 + index * 4);
          if (
            !scalar(start) ||
            !scalar(finish) ||
            start <= last ||
            (start <= 0xdfff && finish >= 0xd800)
          )
            throw new Error("Intervalo cmap14 inválido.");
          defaults.push({ start, end: finish });
          last = finish;
        }
      }
      if (nonDefaultOffset) {
        const pos = location(nonDefaultOffset, 4),
          count = view.getUint32(pos);
        records += count;
        if (records > 100000) throw new Error("cmap14 excede orçamento de mapeamentos.");
        location(nonDefaultOffset, 4 + count * 5);
        let last = -1;
        for (let index = 0; index < count; index++) {
          const point = u24(pos + 4 + index * 5),
            glyph = view.getUint16(pos + 7 + index * 5);
          if (!scalar(point) || point <= last || glyph >= glyphs || findRange(defaults, point))
            throw new Error("Glifo cmap14 inválido/ambíguo.");
          mapped.push({ start: point, end: point, glyph });
          last = point;
        }
      }
      variants.set(selector, { defaults, glyphs: mapped });
    }
    return variants;
  }
  const checked = new Map<number, ValidatedCharacterMap>();
  let selected: ValidatedCharacterMap | undefined,
    priority = -1,
    previousRecord = -1,
    variations: ReturnType<typeof variation14> | undefined;
  for (let index = 0; index < count; index++) {
    const pos = 4 + index * 8,
      platform = view.getUint16(pos),
      encoding = view.getUint16(pos + 2),
      record = platform * 65536 + encoding,
      offset = view.getUint32(pos + 4);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (record < previousRecord || (record === previousRecord && unicode))
      throw new Error("Registros cmap duplicados/fora de ordem.");
    previousRecord = record;
    bounded(offset, bytes.length - offset, 2);
    const format = view.getUint16(offset);
    if (platform === 0 && encoding === 5) {
      if (format !== 14) throw new Error("Variações Unicode requerem cmap14.");
      variations = variation14(offset);
      continue;
    }
    if (!unicode) continue;
    if (format !== 4 && format !== 12) throw new UnsupportedCharacterMapError();
    if (
      (platform === 3 &&
        ((encoding === 1 && format !== 4) || (encoding === 10 && format !== 12))) ||
      (platform === 0 && !((encoding <= 3 && format === 4) || (encoding === 4 && format === 12)))
    )
      throw new Error("Registro Unicode não corresponde ao formato cmap.");
    let map = checked.get(offset);
    if (!map) {
      map = format === 4 ? format4(offset) : format12(offset);
      checked.set(offset, map);
    }
    const rank = (format === 12 ? 100 : 0) + (platform === 3 ? 10 : 0);
    if (rank > priority) {
      selected = map;
      priority = rank;
    }
  }
  if (!selected) throw new UnsupportedCharacterMapError();
  const base = selected;
  let comparisonBudget = 2_000_000;
  function sameMappings(left: ValidatedCharacterMap, right: ValidatedCharacterMap) {
    const cost =
      1 +
      Math.ceil(Math.log2(left.ranges.length + 1)) +
      Math.ceil(Math.log2(right.ranges.length + 1));
    for (const range of left.ranges)
      for (let point = range.start; point <= range.end; point++) {
        comparisonBudget -= cost;
        if (comparisonBudget < 0)
          throw new UnsupportedCharacterMapError(
            "cmap excede orçamento de compatibilidade entre plataformas.",
          );
        const glyph = left.glyph(point);
        if (glyph && glyph !== right.glyph(point))
          throw new UnsupportedCharacterMapError(
            "Subtabelas Unicode do mesmo formato têm mapeamentos ambíguos entre plataformas.",
          );
      }
  }
  for (const candidate of checked.values())
    if (candidate !== base && candidate.format === base.format) {
      sameMappings(candidate, base);
      sameMappings(base, candidate);
    }
  return Object.freeze({
    format: base.format,
    glyph(point: number, selector?: number) {
      if (!scalar(point) || (selector !== undefined && !scalar(selector)))
        throw new Error("Consulta cmap requer valores escalares Unicode.");
      if (selector === undefined) return base.glyph(point);
      const variant = variations?.get(selector);
      if (!variant) return 0;
      const mapped = findRange(variant.glyphs, point);
      return mapped?.glyph ?? (findRange(variant.defaults, point) ? base.glyph(point) : 0);
    },
  });
}
