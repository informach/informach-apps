import type { PdfGlyph } from "./engine-contracts.ts";
import type { Box } from "./model.ts";
import type { OfficeParagraph } from "./office-format.ts";

export interface NativeLine {
  text: string;
  glyphs: PdfGlyph[];
  box: Box | null;
}
interface LayoutGlyph extends PdfGlyph {
  precedingSpace: boolean;
}
const placement = (glyph: PdfGlyph) => glyph.layoutBox ?? glyph.box;
/** Editable exports contain only complete characters inside the visible page, never cropped-out text. */
export function visiblePageGlyphs(glyphs: PdfGlyph[], width: number, height: number): PdfGlyph[] {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0))
    throw new Error("Área visível da página inválida.");
  return glyphs.filter((glyph) => {
    const box = glyph.box;
    return !box
      ? /^\s*$/u.test(glyph.text)
      : box.x >= -0.01 &&
          box.y >= -0.01 &&
          box.x + box.w <= width + 0.01 &&
          box.y + box.h <= height + 0.01;
  });
}
function glyphClusters(glyphs: PdfGlyph[]): LayoutGlyph[] {
  const clusters: LayoutGlyph[] = [];
  let space = false;
  for (const glyph of glyphs) {
    if (/^\s+$/u.test(glyph.text)) {
      space = true;
      continue;
    }
    const previous = clusters.at(-1);
    if (previous && /^\p{M}+$/u.test(glyph.text) && !space) {
      const box = unionBoxes([
        ...(previous.box ? [previous.box] : []),
        ...(glyph.box ? [glyph.box] : []),
      ]);
      clusters[clusters.length - 1] = {
        ...previous,
        text: previous.text + glyph.text,
        box: box ?? undefined,
        layoutBox:
          unionBoxes(
            [
              ...(placement(previous) ? [placement(previous)] : []),
              ...(placement(glyph) ? [placement(glyph)] : []),
            ].filter((box): box is Box => !!box),
          ) ?? undefined,
      };
    } else clusters.push({ ...glyph, precedingSpace: space });
    space = false;
  }
  return clusters;
}
export function unionBoxes(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const box of boxes) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.w);
    bottom = Math.max(bottom, box.y + box.h);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}
export function nativeTextLines(glyphs: PdfGlyph[]): NativeLine[] {
  const lines: NativeLine[] = [];
  let buffer: PdfGlyph[] = [];
  const flush = () => {
    const text = buffer
      .map((glyph) => glyph.text)
      .join("")
      .trim();
    if (text)
      lines.push({
        text,
        glyphs: buffer,
        box: unionBoxes(buffer.flatMap((glyph) => (glyph.box ? [glyph.box] : []))),
      });
    buffer = [];
  };
  for (const glyph of glyphs) {
    const pieces = glyph.text.split(/\r\n?|\n/);
    pieces.forEach((text, index) => {
      if (index) flush();
      if (text) buffer.push({ ...glyph, text });
    });
  }
  flush();
  return lines;
}
function median(values: number[], fallback: number): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? fallback;
}

/** Native font size/emphasis when available; transformed OCR text uses measured visible bounds. */
export function lineParagraph(line: NativeLine): OfficeParagraph {
  const height = median(
    line.glyphs.flatMap((glyph) => (glyph.box && glyph.box.h > 0 ? [glyph.box.h] : [])),
    8,
  );
  const inferred = Math.max(4, Math.min(200, height / 0.72));
  const runs: OfficeParagraph["runs"] = [];
  let previousKey = "";
  for (const glyph of line.glyphs) {
    const style = glyph.style;
    const size =
      Math.round((style && style.size >= 4 ? Math.min(200, style.size) : inferred) * 2) / 2;
    const bold = style?.bold ?? false,
      italic = style?.italic ?? false,
      key = `${size}:${bold}:${italic}`;
    const previous = runs.at(-1);
    if (previous && (!glyph.text.trim() || key === previousKey)) previous.text += glyph.text;
    else {
      runs.push({ text: glyph.text, size, bold, italic });
      previousKey = key;
    }
  }
  return { kind: "paragraph", align: "left", runs };
}

export interface TableCellEvidence {
  value: string;
  box: Box | null;
  ambiguous: boolean;
}
export interface ExtractedTable {
  rows: TableCellEvidence[][];
  box: Box;
  columns: number[];
  warnings: string[];
}

/** User-defined separators make extraction reviewable instead of guessing cell types or formulas. */
export function extractGlyphTable(
  glyphs: PdfGlyph[],
  area: Box,
  separators: number[],
): ExtractedTable {
  if (![area.x, area.y, area.w, area.h].every(Number.isFinite) || area.w <= 0 || area.h <= 0)
    throw new Error("Selecione uma área válida para a tabela.");
  const columns = [area.x, ...separators, area.x + area.w];
  const columnAt = (index: number): number => {
    const value = columns[index];
    if (value === undefined) throw new Error("Divisão de coluna inexistente.");
    return value;
  };
  if (
    columns.length > 201 ||
    columns.some(
      (value, index) => !Number.isFinite(value) || (index > 0 && value <= columnAt(index - 1)),
    )
  )
    throw new Error("As divisões de coluna devem estar em ordem, dentro da área e sem repetições.");
  const selected = glyphClusters(glyphs)
    .filter((glyph) => {
      const box = placement(glyph);
      return (
        box &&
        box.w > 0 &&
        box.h > 0 &&
        box.x + box.w / 2 >= area.x &&
        box.x + box.w / 2 <= area.x + area.w &&
        box.y + box.h / 2 >= area.y &&
        box.y + box.h / 2 <= area.y + area.h
      );
    })
    .sort(
      (a, b) =>
        (placement(a)?.y ?? 0) +
          (placement(a)?.h ?? 0) / 2 -
          ((placement(b)?.y ?? 0) + (placement(b)?.h ?? 0) / 2) ||
        (a.box?.x ?? 0) - (b.box?.x ?? 0),
    );
  if (selected.length > 500000)
    throw new Error("A área contém caracteres demais. Extraia uma região menor.");
  const tolerance = Math.max(
    2,
    median(
      selected.flatMap((glyph) => (placement(glyph) ? [placement(glyph)?.h ?? 0] : [])),
      8,
    ) * 0.55,
  );
  const groups: { centre: number; glyphs: LayoutGlyph[] }[] = [];
  for (const glyph of selected) {
    const position = placement(glyph);
    if (!position) continue;
    const centre = position.y + position.h / 2,
      previous = groups.at(-1);
    if (previous && Math.abs(centre - previous.centre) <= tolerance) {
      previous.centre =
        (previous.centre * previous.glyphs.length + centre) / (previous.glyphs.length + 1);
      previous.glyphs.push(glyph);
    } else groups.push({ centre, glyphs: [glyph] });
  }
  if (groups.length * (columns.length - 1) > 200000)
    throw new Error("A tabela excede 200 mil células.");
  let ambiguities = 0;
  const rows = groups.map((group) => {
    const buckets: LayoutGlyph[][] = Array.from({ length: columns.length - 1 }, () => []);
    for (const glyph of group.glyphs) {
      const position = placement(glyph);
      if (!position) continue;
      const centre = position.x + position.w / 2;
      let left = 0,
        right = columns.length - 2;
      while (left < right) {
        const middle = Math.floor((left + right) / 2);
        if (centre >= columnAt(middle + 1)) left = middle + 1;
        else right = middle;
      }
      const bucket = buckets[left];
      if (!bucket) throw new Error("Coluna de destino inexistente.");
      bucket.push(glyph);
    }
    return Array.from({ length: columns.length - 1 }, (_, column): TableCellEvidence => {
      const left = columnAt(column),
        right = columnAt(column + 1),
        bucket = buckets[column];
      if (!bucket) throw new Error("Coluna de revisão inexistente.");
      const items = bucket.sort((a, b) => (a.box?.x ?? 0) - (b.box?.x ?? 0));
      let value = "",
        previous: Box | undefined,
        ambiguous = false;
      for (const glyph of items) {
        const box = placement(glyph);
        if (!box) continue;
        if (
          previous &&
          (glyph.precedingSpace ||
            box.x - previous.x - previous.w > Math.max(1, Math.min(previous.h, box.h) * 0.2)) &&
          !/\s$/.test(value) &&
          !/^\s/.test(glyph.text)
        )
          value += " ";
        value += glyph.text;
        if (box.x < left || box.x + box.w > right) ambiguous = true;
        previous = box;
      }
      if (ambiguous) ambiguities++;
      return {
        value: value.trim(),
        box: unionBoxes(items.flatMap((glyph) => (glyph.box ? [glyph.box] : []))),
        ambiguous,
      };
    });
  });
  return {
    rows,
    box: area,
    columns: separators,
    warnings: ambiguities
      ? [
          `${ambiguities} células contêm texto que cruza uma divisão. Revise a área e as colunas antes de exportar.`,
        ]
      : [],
  };
}
