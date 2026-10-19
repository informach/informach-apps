import { strFromU8, Unzip, UnzipInflate, type Zippable, zipSync } from "fflate";

const MAX_PART = 32 * 1024 * 1024,
  MAX_PACKAGE = 128 * 1024 * 1024;
function partName(name: string, caseSensitive = false): string {
  if (
    !name ||
    name.length > 1000 ||
    name.includes("\\") ||
    [...name].some((char) => char.charCodeAt(0) < 32) ||
    name.startsWith("/") ||
    /^[a-z]:/i.test(name) ||
    name
      .split("/")
      .some(
        (part) =>
          part === "." || part === ".." || ["__proto__", "constructor", "prototype"].includes(part),
      )
  )
    throw new Error("Nome de parte Office inválido.");
  return caseSensitive ? name : name.normalize("NFC").toLowerCase();
}
const crcTable = Uint32Array.from({ length: 256 }, (_, number) => {
  let value = number;
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
interface PartInfo {
  size: number;
  crc: number;
  method: number;
}

/** Central directory and actual streamed bytes must agree. No extraction onto the filesystem. */
export function readOfficePackage(
  bytes: Uint8Array,
  options: { caseSensitive?: boolean } = {},
): Map<string, Uint8Array> {
  if (bytes.length < 22 || bytes.length > 64 * 1024 * 1024)
    throw new Error("Pacote Office vazio, incompleto ou acima de 64 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    throw new Error("ZIP Office sem diretório final válido; pacotes divididos não são suportados.");
  const entries = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true),
    directorySize = view.getUint32(end + 12, true);
  if (
    entries > 10000 ||
    entries === 0xffff ||
    view.getUint16(end + 8, true) !== entries ||
    offset + directorySize !== end
  )
    throw new Error("Pacote Office grande demais ou ZIP64 não suportado.");
  const expected = new Map<string, PartInfo>();
  const ranges: { start: number; end: number }[] = [];
  let position = offset,
    declared = 0;
  for (let i = 0; i < entries; i++) {
    if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50)
      throw new Error("Diretório ZIP Office corrompido.");
    const flags = view.getUint16(position + 8, true),
      method = view.getUint16(position + 10, true),
      size = view.getUint32(position + 24, true),
      compressed = view.getUint32(position + 20, true),
      crc = view.getUint32(position + 16, true),
      local = view.getUint32(position + 42, true);
    const nameLength = view.getUint16(position + 28, true),
      extra = view.getUint16(position + 30, true),
      comment = view.getUint16(position + 32, true);
    const next = position + 46 + nameLength + extra + comment;
    if (
      next > end ||
      flags & ~0x080e ||
      (method !== 8 && flags & 6) ||
      view.getUint16(position + 34, true) !== 0 ||
      ![0, 8].includes(method) ||
      size > MAX_PART
    )
      throw new Error("Parte ZIP criptografada, grande demais ou com compressão não suportada.");
    const name = partName(
      strFromU8(bytes.subarray(position + 46, position + 46 + nameLength)),
      options.caseSensitive,
    );
    if (
      local + 30 > offset ||
      view.getUint32(local, true) !== 0x04034b50 ||
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method
    )
      throw new Error("Cabeçalho local ZIP Office incompatível com o diretório.");
    const localNameLength = view.getUint16(local + 26, true),
      localExtra = view.getUint16(local + 28, true),
      data = local + 30 + localNameLength + localExtra;
    if (data + compressed > offset || (method === 0 && compressed !== size))
      throw new Error("Dados ZIP Office fora dos limites ou tamanhos incompatíveis.");
    if (
      partName(
        strFromU8(bytes.subarray(local + 30, local + 30 + localNameLength)),
        options.caseSensitive,
      ) !== name
    )
      throw new Error("Nomes local/central do ZIP Office não correspondem.");
    if (!(flags & 8) && view.getUint32(local + 14, true) !== crc)
      throw new Error("CRC local/central do ZIP Office incompatível.");
    if (
      !(flags & 8) &&
      (view.getUint32(local + 18, true) !== compressed || view.getUint32(local + 22, true) !== size)
    )
      throw new Error("Tamanhos local/central do ZIP Office incompatíveis.");
    let segmentEnd = data + compressed;
    if (flags & 8) {
      if (segmentEnd + 12 > offset) throw new Error("Descritor ZIP Office incompleto.");
      const descriptor = segmentEnd + (view.getUint32(segmentEnd, true) === 0x08074b50 ? 4 : 0);
      if (
        descriptor + 12 > offset ||
        view.getUint32(descriptor, true) !== crc ||
        view.getUint32(descriptor + 4, true) !== compressed ||
        view.getUint32(descriptor + 8, true) !== size
      )
        throw new Error("Descritor ZIP Office não corresponde aos tamanhos/CRC centrais.");
      segmentEnd = descriptor + 12;
    }
    ranges.push({ start: local, end: segmentEnd });
    if (expected.has(name)) throw new Error("Pacote Office contém partes duplicadas.");
    if (/(?:^|\/)vbaproject\.bin$|(?:^|\/)activex\//i.test(name))
      throw new Error(
        "Arquivos com macros ou controles ActiveX precisam ser convertidos para uma cópia sem esses recursos antes da importação.",
      );
    declared += size;
    if (declared > MAX_PACKAGE) throw new Error("Conteúdo Office descompactado excede 128 MB.");
    expected.set(name, { size, crc, method });
    position = next;
  }
  if (position !== end) throw new Error("Tamanho do diretório ZIP Office inconsistente.");
  ranges.sort((a, b) => a.start - b.start);
  let previousEnd = 0;
  for (const range of ranges) {
    if (range.start < previousEnd)
      throw new Error("Partes ZIP Office têm cabeçalhos/dados sobrepostos.");
    previousEnd = range.end;
  }
  const parts = new Map<string, Uint8Array>(),
    started = new Set<string>();
  let total = 0,
    completed = 0;
  const unzip = new Unzip((file) => {
    const name = partName(file.name, options.caseSensitive),
      info = expected.get(name);
    if (!info || started.has(name) || info.method !== file.compression)
      throw new Error("Cabeçalhos ZIP Office não correspondem ao diretório.");
    started.add(name);
    let length = 0,
      crc = 0xffffffff;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      length += chunk.length;
      total += chunk.length;
      if (length > info.size || length > MAX_PART || total > MAX_PACKAGE)
        throw new Error("Expansão ZIP Office excede os tamanhos declarados/permitidos.");
      for (const byte of chunk) {
        const value = crcTable[(crc ^ byte) & 255];
        if (value === undefined) throw new Error("Tabela CRC indisponível.");
        crc = value ^ (crc >>> 8);
      }
      chunks.push(chunk.slice());
      if (final) {
        if (length !== info.size || (crc ^ 0xffffffff) >>> 0 !== info.crc)
          throw new Error("Parte Office incompleta ou com CRC inválido.");
        const value = new Uint8Array(length);
        let at = 0;
        for (const piece of chunks) {
          value.set(piece, at);
          at += piece.length;
        }
        if (!name.endsWith("/")) parts.set(name, value);
        completed++;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let i = 0; i < bytes.length; i += 1024)
    unzip.push(bytes.subarray(i, i + 1024), i + 1024 >= bytes.length);
  if (completed !== entries) throw new Error("Pacote Office incompleto.");
  return parts;
}

export function writeOfficePackage(
  parts: Record<string, Uint8Array>,
  options: { uncompressed?: readonly string[] } = {},
): Uint8Array {
  let size = 0;
  const names = new Set<string>();
  if (!Object.keys(parts).length || Object.keys(parts).length > 10000)
    throw new Error("Quantidade de partes Office inválida.");
  for (const [name, bytes] of Object.entries(parts)) {
    const normalized = partName(name);
    if (names.has(normalized)) throw new Error("Partes Office duplicadas.");
    names.add(normalized);
    size += bytes.length;
    if (bytes.length > MAX_PART || size > MAX_PACKAGE)
      throw new Error("Saída Office excede os limites locais.");
    if (
      (normalized.endsWith(".xml") || normalized.endsWith(".rels")) &&
      bytes.length > 8 * 1024 * 1024
    )
      throw new Error("Parte XML de saída excede o perfil local de 8 MB.");
  }
  const stored = new Set(options.uncompressed ?? []),
    archive: Zippable = {};
  for (const name of stored)
    if (!Object.hasOwn(parts, name))
      throw new Error("Parte sem compressão ausente no pacote de saída.");
  for (const [name, bytes] of Object.entries(parts))
    Object.defineProperty(archive, name, {
      value: stored.has(name) ? [bytes, { level: 0 }] : bytes,
      enumerable: true,
    });
  const result = zipSync(archive, { level: 6 });
  if (result.length > 64 * 1024 * 1024) throw new Error("Saída Office excede 64 MB.");
  return result;
}

export function officePart(parts: Map<string, Uint8Array>, name: string): Uint8Array {
  const bytes = parts.get(partName(name));
  if (!bytes) throw new Error(`Parte necessária não encontrada no documento Office: ${name}.`);
  return bytes;
}
