/** Bounded static TrueType profile, validated before fontkit or the browser sees imported bytes. */
export interface EditableFontInfo {
  glyphs: number;
  unitsPerEm: number;
  subset: boolean;
  embedding: "installable" | "editable";
}
interface Table {
  offset: number;
  length: number;
}
export function inspectEditableFont(bytes: Uint8Array): EditableFontInfo {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > 8 * 1024 * 1024)
    throw new Error("Escolha uma fonte TrueType estática de até 8 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x00010000)
    throw new Error(
      "Este perfil aceita TrueType estático (.ttf); coleções, WOFF e contornos CFF exigem outro perfil.",
    );
  const count = view.getUint16(4),
    directoryEnd = 12 + count * 16;
  if (count < 8 || count > 128 || directoryEnd > bytes.length)
    throw new Error("Diretório da fonte inválido.");
  const tables = new Map<string, Table>();
  for (let at = 12; at < directoryEnd; at += 16) {
    const tag = String.fromCharCode(
      view.getUint8(at),
      view.getUint8(at + 1),
      view.getUint8(at + 2),
      view.getUint8(at + 3),
    );
    const offset = view.getUint32(at + 8),
      length = view.getUint32(at + 12);
    if (
      !/^[\x20-\x7e]{4}$/.test(tag) ||
      tables.has(tag) ||
      offset < directoryEnd ||
      offset % 4 ||
      offset + length > bytes.length
    )
      throw new Error("Tabela duplicada, incompleta ou fora do arquivo de fonte.");
    tables.set(tag, { offset, length });
  }
  const ordered = [...tables.values()]
    .filter((table) => table.length)
    .sort((a, b) => a.offset - b.offset);
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1],
      current = ordered[index];
    if (!previous || !current || previous.offset + previous.length > current.offset)
      throw new Error("Tabelas da fonte se sobrepõem.");
  }
  if (
    [
      "fvar",
      "gvar",
      "CFF ",
      "CFF2",
      "SVG ",
      "COLR",
      "CPAL",
      "sbix",
      "CBDT",
      "CBLC",
      "EBDT",
      "EBLC",
    ].some((tag) => tables.has(tag))
  )
    throw new Error(
      "Fontes variáveis, coloridas ou bitmap ainda não pertencem ao perfil de autoria.",
    );
  const required = (tag: string, minimum: number): Table => {
    const table = tables.get(tag);
    if (!table || table.length < minimum)
      throw new Error(`Tabela ${tag} ausente ou incompleta na fonte.`);
    return table;
  };
  const head = required("head", 54),
    maxp = required("maxp", 32),
    os2 = required("OS/2", 10),
    hhea = required("hhea", 36);
  required("cmap", 4);
  required("name", 6);
  required("post", 32);
  const unitsPerEm = view.getUint16(head.offset + 18),
    glyphs = view.getUint16(maxp.offset + 4),
    format = view.getInt16(head.offset + 50);
  if (
    view.getUint32(head.offset + 12) !== 0x5f0f3cf5 ||
    view.getUint32(maxp.offset) !== 0x00010000 ||
    unitsPerEm < 16 ||
    unitsPerEm > 16384 ||
    glyphs < 1 ||
    glyphs > 40000 ||
    (format !== 0 && format !== 1)
  )
    throw new Error("Métricas ou formato de contornos inválidos na fonte.");
  const metrics = view.getUint16(hhea.offset + 34);
  if (metrics < 1 || metrics > glyphs) throw new Error("Métricas horizontais inválidas.");
  required("hmtx", metrics * 4 + (glyphs - metrics) * 2);
  const fsType = view.getUint16(os2.offset + 8),
    osVersion = view.getUint16(os2.offset),
    rights = fsType & 14;
  if (
    osVersion > 5 ||
    (fsType & ~0x030e) !== 0 ||
    (osVersion >= 3 && rights !== 0 && (rights & (rights - 1)) !== 0)
  )
    throw new Error("Permissão de incorporação da fonte inválida.");
  if ((fsType & 512) !== 0 || (rights !== 0 && (rights & 8) === 0))
    throw new Error(
      "Esta fonte não permite incorporação para edição. Escolha uma fonte com permissão editável ou instalável.",
    );
  const loca = required("loca", (glyphs + 1) * (format === 0 ? 2 : 4)),
    glyf = required("glyf", 0);
  const offsets = Array.from({ length: glyphs + 1 }, (_, index) =>
    format === 0
      ? view.getUint16(loca.offset + index * 2) * 2
      : view.getUint32(loca.offset + index * 4),
  );
  const components = new Map<number, number[]>();
  let references = 0;
  for (let index = 0; index < glyphs; index++) {
    const start = offsets[index],
      end = offsets[index + 1];
    if (start === undefined || end === undefined || start > end || end > glyf.length)
      throw new Error("Índice de contornos fora da fonte.");
    if (start === end) continue;
    if (end - start < 10) throw new Error("Contorno incompleto na fonte.");
    const base = glyf.offset + start,
      stop = glyf.offset + end,
      contours = view.getInt16(base);
    if (contours >= 0) {
      if (contours > 4096 || base + 12 + contours * 2 > stop)
        throw new Error("Contorno simples acima dos limites ou incompleto.");
      let last = -1;
      for (let contour = 0; contour < contours; contour++) {
        const point = view.getUint16(base + 10 + contour * 2);
        if (point <= last) throw new Error("Ordem dos pontos de contorno inválida.");
        last = point;
      }
      let at = base + 10 + contours * 2;
      const instructions = view.getUint16(at);
      at += 2 + instructions;
      if (at > stop) throw new Error("Instruções do contorno incompletas.");
      const points = last + 1;
      let seen = 0,
        coordinates = 0;
      while (seen < points) {
        if (at >= stop) throw new Error("Flags do contorno incompletas.");
        const flags = view.getUint8(at++);
        if (flags & 128) throw new Error("Flag reservada no contorno da fonte.");
        let repeat = 1;
        if (flags & 8) {
          if (at >= stop) throw new Error("Repetição do contorno incompleta.");
          repeat += view.getUint8(at++);
        }
        seen += repeat;
        if (seen > points) throw new Error("Repetição excede os pontos de contorno.");
        coordinates +=
          repeat * ((flags & 2 ? 1 : flags & 16 ? 0 : 2) + (flags & 4 ? 1 : flags & 32 ? 0 : 2));
      }
      if (at + coordinates > stop) throw new Error("Coordenadas do contorno incompletas.");
    } else {
      if (contours !== -1) throw new Error("Tipo de contorno composto inválido.");
      const children: number[] = [];
      let at = base + 10,
        flags: number;
      do {
        if (at + 4 > stop || children.length >= 64 || ++references > 200000)
          throw new Error("Contorno composto incompleto ou acima dos limites.");
        flags = view.getUint16(at);
        const child = view.getUint16(at + 2);
        at += 4;
        if (child >= glyphs || (flags & ~0x1fff) !== 0)
          throw new Error("Referência de contorno inválida.");
        const transforms = [8, 64, 128].filter((flag) => (flags & flag) !== 0);
        if (transforms.length > 1) throw new Error("Transformações de contorno incompatíveis.");
        at += (flags & 1 ? 4 : 2) + (flags & 128 ? 8 : flags & 64 ? 4 : flags & 8 ? 2 : 0);
        if (at > stop) throw new Error("Transformação de contorno incompleta.");
        children.push(child);
      } while (flags & 32);
      if (flags & 256) {
        if (at + 2 > stop || at + 2 + view.getUint16(at) > stop)
          throw new Error("Instruções compostas incompletas.");
      }
      components.set(index, children);
    }
  }
  const heights = new Map<number, number>(),
    active = new Set<number>();
  function visit(glyph: number, depth: number): number {
    const known = heights.get(glyph);
    if (known !== undefined) return known;
    if (active.has(glyph) || depth > 32)
      throw new Error("Contornos compostos cíclicos ou profundos demais.");
    active.add(glyph);
    let height = 0;
    for (const child of components.get(glyph) ?? [])
      height = Math.max(height, 1 + visit(child, depth + 1));
    if (height > 32) throw new Error("Contornos compostos profundos demais.");
    active.delete(glyph);
    heights.set(glyph, height);
    return height;
  }
  for (const glyph of components.keys()) visit(glyph, 0);
  return {
    glyphs,
    unitsPerEm,
    subset: (fsType & 256) === 0,
    embedding: rights & 8 ? "editable" : "installable",
  };
}
