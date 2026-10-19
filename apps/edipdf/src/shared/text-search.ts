import type { PdfGlyph } from "./engine-contracts.ts";
import type { Box } from "./model.ts";

export interface SearchOptions {
  caseSensitive: boolean;
  accents: boolean;
  wholeWord: boolean;
  acrossLines: boolean;
  comments: boolean;
}
export const DEFAULT_SEARCH_OPTIONS: SearchOptions = Object.freeze({
  caseSensitive: false,
  accents: false,
  wholeWord: false,
  acrossLines: true,
  comments: true,
});
export interface TextMatch {
  rects: Box[];
  excerpt: string;
  start: number;
  end: number;
}
function normalized(
  glyphs: PdfGlyph[],
  options: SearchOptions,
): { text: string; positions: number[] } {
  let text = "";
  const positions: number[] = [];
  glyphs.forEach((glyph, index) => {
    let value = glyph.text.normalize("NFD");
    if (!options.accents) value = value.replace(/\p{M}/gu, "");
    if (!options.caseSensitive) value = value.toLocaleLowerCase("pt-BR");
    for (const char of value) {
      const space = /\s/u.test(char);
      const output = space ? (!options.acrossLines && /[\r\n]/.test(char) ? "\n" : " ") : char;
      if (space && text.endsWith(output)) continue;
      text += output;
      for (let i = 0; i < output.length; i++) positions.push(index);
    }
  });
  return { text, positions };
}
/** Match canonical text while mapping every normalized character back to native glyph geometry. */
export function findTextMatches(
  glyphs: PdfGlyph[],
  query: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
): TextMatch[] {
  const needle = normalized([{ text: query.trim() }], options).text;
  if (!needle) return [];
  const index = normalized(glyphs, options);
  const matches: TextMatch[] = [];
  let from = 0;
  const word = (char: string | undefined) => !!char && /[\p{L}\p{N}\p{M}_]/u.test(char);
  while (from < index.text.length) {
    const start = index.text.indexOf(needle, from);
    if (start < 0) break;
    const end = start + needle.length;
    from = end;
    if (options.wholeWord && (word(index.text[start - 1]) || word(index.text[end]))) continue;
    const selected = new Set(index.positions.slice(start, end));
    const rects = [...selected].flatMap((i) => (glyphs[i]?.box ? [glyphs[i].box] : []));
    const first = index.positions[start],
      last = index.positions[end - 1];
    if (first === undefined || last === undefined)
      throw new Error("O índice de busca não corresponde aos caracteres da página.");
    const excerpt = glyphs
      .slice(Math.max(0, first - 30), Math.min(glyphs.length, last + 60))
      .map((glyph) => glyph.text)
      .join("")
      .replace(/\s+/g, " ");
    matches.push({ rects, excerpt, start: first, end: last + 1 });
    if (matches.length > 10000)
      throw new Error("Mais de 10 mil ocorrências nesta página. Refine a busca.");
  }
  return matches;
}

/** Export text and geometry together for local comparison, extraction and automation. */
export function plainText(glyphs: PdfGlyph[]): string {
  return glyphs
    .map((glyph) => glyph.text)
    .join("")
    .replace(/\r\n/g, "\n");
}
