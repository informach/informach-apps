export type TiffOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface TiffPage {
  width: number;
  height: number;
  bits: 1 | 2 | 4 | 8 | 16;
  samples: number;
  photometric: number;
  compression: number;
  predictor: number;
  fillOrder: number;
  orientation: TiffOrientation;
  rowsPerStrip: number;
  strips: Uint8Array[];
  alpha?: "associated" | "unassociated";
  colorMap?: number[];
  profile?: Uint8Array;
  jpegTables?: Uint8Array;
  t4Options: number;
  t6Options: number;
  dpiX: number;
  dpiY: number;
  littleEndian: boolean;
}
interface Tag {
  type: number;
  count: number;
  offset: number;
  length: number;
}
const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
const orientation = (value: number): TiffOrientation => {
  if (
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5 ||
    value === 6 ||
    value === 7 ||
    value === 8
  )
    return value;
  throw new Error("Orientação TIFF inválida.");
};
const bits = (value: number | undefined): TiffPage["bits"] => {
  if (value === 1 || value === 2 || value === 4 || value === 8 || value === 16) return value;
  throw new Error("O perfil TIFF local aceita amostras inteiras de 1, 2, 4, 8 ou 16 bits.");
};
/** Validate all main IFDs and byte ranges before any image decoder can allocate pixels. */
export function inspectTiff(bytes: Uint8Array): { pages: TiffPage[]; warnings: string[] } {
  if (bytes.length < 8 || bytes.length > 64 * 1024 * 1024)
    throw new Error("TIFF vazio, incompleto ou acima de 64 MB.");
  const littleEndian = bytes[0] === 73 && bytes[1] === 73;
  if (!littleEndian && !(bytes[0] === 77 && bytes[1] === 77))
    throw new Error("Cabeçalho TIFF inválido.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const short = (offset: number) => view.getUint16(offset, littleEndian),
    long = (offset: number) => view.getUint32(offset, littleEndian);
  if (short(2) === 43) throw new Error("BigTIFF ainda não pertence ao perfil de importação local.");
  if (short(2) !== 42) throw new Error("Versão TIFF inválida.");
  const range = (offset: number, length: number) => {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset + length > bytes.length
    )
      throw new Error("O TIFF contém dados fora dos limites do arquivo.");
  };
  const pages: TiffPage[] = [],
    warnings = new Set<string>(),
    seen = new Set<number>();
  let at = long(4),
    entries = 0,
    pixels = 0;
  while (at) {
    if (seen.has(at)) throw new Error("A cadeia de páginas TIFF contém um ciclo.");
    if (pages.length >= 100 || at < 8)
      throw new Error("O TIFF excede cem páginas ou tem um diretório inválido.");
    seen.add(at);
    range(at, 2);
    const count = short(at);
    entries += count;
    if (!count || count > 2048 || entries > 20000)
      throw new Error("O TIFF excede os limites locais de diretórios e tags.");
    range(at, 2 + count * 12 + 4);
    const tags = new Map<number, Tag>();
    for (let index = 0; index < count; index++) {
      const entry = at + 2 + index * 12,
        id = short(entry),
        type = short(entry + 2),
        items = long(entry + 4),
        size = sizes[type];
      if (!size || tags.has(id))
        throw new Error("O TIFF contém tipo desconhecido ou tags duplicadas.");
      const length = items * size,
        offset = length <= 4 ? entry + 8 : long(entry + 8);
      range(offset, length);
      tags.set(id, { type, count: items, offset, length });
    }
    const numbers = (id: number, maximum = 10000): number[] | undefined => {
      const tag = tags.get(id);
      if (!tag) return;
      if (![1, 3, 4, 5].includes(tag.type) || !tag.count || tag.count > maximum)
        throw new Error(`Tag TIFF ${id} não tem valores numéricos compatíveis.`);
      const result: number[] = [];
      const size = sizes[tag.type];
      if (!size) throw new Error(`Tipo numérico TIFF inválido na tag ${id}.`);
      for (let index = 0; index < tag.count; index++) {
        const offset = tag.offset + index * size;
        let value: number;
        if (tag.type === 1) value = view.getUint8(offset);
        else if (tag.type === 3) value = short(offset);
        else if (tag.type === 4) value = long(offset);
        else {
          const denominator = long(offset + 4);
          if (!denominator) throw new Error("Resolução ou fração TIFF inválida.");
          value = long(offset) / denominator;
        }
        result.push(value);
      }
      return result;
    };
    const scalar = (id: number, fallback?: number): number => {
      if (tags.get(id)?.type === 5)
        throw new Error(`Tag inteira TIFF ${id} usa uma fração incompatível.`);
      const values = numbers(id, 1);
      if (values?.[0] !== undefined) return values[0];
      if (fallback !== undefined) return fallback;
      throw new Error(`A página TIFF não informa a tag obrigatória ${id}.`);
    };
    const binary = (id: number, maximum: number) => {
      const tag = tags.get(id);
      if (!tag) return;
      if (![1, 7].includes(tag.type) || tag.length < 1 || tag.length > maximum)
        throw new Error(`Tag binária TIFF ${id} excede o perfil local.`);
      return bytes.subarray(tag.offset, tag.offset + tag.length);
    };
    if (tags.has(330))
      throw new Error(
        "TIFF com SubIFDs/pirâmides exige um perfil separado; nenhuma página foi descartada.",
      );
    const width = scalar(256),
      height = scalar(257),
      samples = scalar(277, 1),
      depths = numbers(258, 4) ?? [1],
      depth = bits(depths[0]);
    pixels += width * height;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 8192 ||
      height > 8192 ||
      width * height > 24_000_000 ||
      pixels > 512_000_000
    )
      throw new Error(
        "O TIFF excede 8192 pixels por lado, 24 megapixels por página ou 512 megapixels no conjunto.",
      );
    if (
      ![1, 2, 3, 4].includes(samples) ||
      (depths.length !== 1 && depths.length !== samples) ||
      depths.some((value) => value !== depth)
    )
      throw new Error("Canais ou profundidades TIFF incompatíveis.");
    const formats = numbers(339, 4) ?? [1];
    if (
      (formats.length !== 1 && formats.length !== samples) ||
      formats.some((value) => value !== 1)
    )
      throw new Error("Amostras TIFF com sinal ou ponto flutuante exigem um perfil separado.");
    if (scalar(284, 1) !== 1 || tags.has(322) || tags.has(323) || tags.has(324) || tags.has(325))
      throw new Error("TIFF com planos separados ou tiles ainda não pertence ao perfil local.");
    const photometric = scalar(262),
      compression = scalar(259, 1),
      predictor = scalar(317, 1),
      fillOrder = scalar(266, 1);
    if (
      ![0, 1, 2, 3, 6].includes(photometric) ||
      ![1, 2, 3, 4, 5, 7, 8, 32773, 32946].includes(compression)
    )
      throw new Error("Cor ou compressão TIFF ainda não suportada neste perfil.");
    if (
      ![1, 2].includes(predictor) ||
      (predictor === 2 && ![5, 8, 32946].includes(compression)) ||
      ![1, 2].includes(fillOrder)
    )
      throw new Error("Predictor ou ordem de bits TIFF incompatível.");
    if (predictor === 2 && depth < 8)
      throw new Error("Predictor TIFF para amostras compactadas exige outro perfil.");
    if (fillOrder === 2 && (depth !== 1 || ![1, 2, 3, 4].includes(compression)))
      throw new Error("Ordem de bits TIFF invertida exige imagem binária sem compressão ou fax.");
    if (photometric === 6 && compression !== 7)
      throw new Error("YCbCr TIFF sem JPEG exige conversão de cor específica.");
    const colors = photometric === 2 || photometric === 6 ? 3 : 1,
      extra = numbers(338, 4) ?? [];
    if (
      samples !== colors &&
      !(
        samples === colors + 1 &&
        extra.length === 1 &&
        (extra[0] === 1 || extra[0] === 2) &&
        photometric !== 3
      )
    )
      throw new Error("Canais extras TIFF sem semântica de transparência compatível.");
    if (samples === colors && extra.length)
      throw new Error("A declaração de canais extras TIFF não corresponde à imagem.");
    if (extra.length && (depth < 8 || compression === 7 || (photometric === 0 && extra[0] === 1)))
      throw new Error("Transparência TIFF fora do perfil de amostras locais.");
    if (compression === 7 && (depth !== 8 || ![1, 2, 6].includes(photometric)))
      throw new Error("JPEG TIFF exige amostras de 8 bits cinza, RGB ou YCbCr.");
    if ((photometric === 2 || photometric === 6) && depth < 8)
      throw new Error("RGB TIFF com canais abaixo de 8 bits exige outro perfil.");
    if (
      [2, 3, 4].includes(compression) &&
      (depth !== 1 || samples !== 1 || ![0, 1].includes(photometric))
    )
      throw new Error("Fax TIFF exige imagem binária de um canal.");
    const offsets = numbers(273),
      lengths = numbers(279),
      rowsPerStrip = Math.min(scalar(278, height), height);
    if ([273, 279].some((id) => ![3, 4].includes(tags.get(id)?.type ?? 0)))
      throw new Error("Offsets e tamanhos TIFF exigem inteiros SHORT ou LONG.");
    if (
      !Number.isInteger(rowsPerStrip) ||
      rowsPerStrip < 1 ||
      !offsets ||
      !lengths ||
      offsets.length !== lengths.length ||
      offsets.length !== Math.ceil(height / rowsPerStrip)
    )
      throw new Error("Strips TIFF ausentes, repetidos ou inconsistentes com a altura.");
    const strips = offsets.map((offset, index) => {
      const length = lengths[index];
      if (
        length === undefined ||
        !Number.isInteger(offset) ||
        !Number.isInteger(length) ||
        offset < 8 ||
        length < 1
      )
        throw new Error("Strip TIFF inválido.");
      range(offset, length);
      return bytes.subarray(offset, offset + length);
    });
    const colorMap = photometric === 3 ? numbers(320, 768) : undefined;
    if (
      photometric === 3 &&
      (depth > 8 || !colorMap || colorMap.length !== 3 * 2 ** depth || tags.get(320)?.type !== 3)
    )
      throw new Error("Paleta TIFF ausente ou incompatível.");
    const unit = scalar(296, 2),
      xResolution = numbers(282, 1)?.[0],
      yResolution = numbers(283, 1)?.[0];
    let dpiX = 96,
      dpiY = 96;
    if ([2, 3].includes(unit) && xResolution !== undefined && yResolution !== undefined) {
      dpiX = xResolution * (unit === 3 ? 2.54 : 1);
      dpiY = yResolution * (unit === 3 ? 2.54 : 1);
      if (![dpiX, dpiY].every((value) => Number.isFinite(value) && value >= 1 && value <= 9600))
        throw new Error("A resolução física TIFF está fora do perfil local.");
    } else warnings.add("Sem resolução física TIFF completa; tamanho estimado a 96 dpi.");
    if ((width * 72) / dpiX > 14400 || (height * 72) / dpiY > 14400)
      throw new Error("O tamanho físico TIFF excede o limite de página PDF.");
    const profile = binary(34675, 4 * 1024 * 1024);
    if (profile) {
      const signature = (at: number) => String.fromCharCode(...profile.subarray(at, at + 4));
      if (
        profile.length < 128 ||
        signature(36) !== "acsp" ||
        signature(16) !== (colors === 3 || photometric === 3 ? "RGB " : "GRAY") ||
        new DataView(profile.buffer, profile.byteOffset, profile.byteLength).getUint32(0) !==
          profile.length
      )
        throw new Error("Perfil ICC TIFF incompleto ou incompatível com os canais de cor.");
    }
    const t4Options = scalar(292, 0),
      t6Options = scalar(293, 0);
    if ((t4Options & ~5) !== 0 || t6Options !== 0)
      throw new Error("Extensões de fax TIFF ainda não suportadas neste perfil.");
    const subfile = scalar(254, 0);
    if (subfile & ~3) throw new Error("Máscaras ou flags de subarquivo TIFF exigem outro perfil.");
    if (subfile & 1)
      warnings.add(
        "O TIFF contém uma imagem reduzida na cadeia principal; ela foi incluída como página.",
      );
    pages.push({
      width,
      height,
      bits: depth,
      samples,
      photometric,
      compression,
      predictor,
      fillOrder,
      orientation: orientation(scalar(274, 1)),
      rowsPerStrip,
      strips,
      ...(extra.length ? { alpha: extra[0] === 1 ? "associated" : "unassociated" } : {}),
      colorMap,
      profile,
      jpegTables: binary(347, 4 * 1024 * 1024),
      t4Options,
      t6Options,
      dpiX,
      dpiY,
      littleEndian,
    });
    at = long(at + 2 + count * 12);
  }
  if (!pages.length) throw new Error("O TIFF não contém páginas.");
  return { pages, warnings: [...warnings] };
}
