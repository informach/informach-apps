/** A piece of text with optional geometry: a PDF glyph, an OCR word or any other unit. */
export interface TextUnit<B> {
  text: string;
  box?: B;
}

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
export interface TextMatch<B> {
  /** Boxes of the units touched by the match, in unit order, without repetition. */
  rects: B[];
  excerpt: string;
  /** Index of the first unit. */
  start: number;
  /** Index after the last unit. */
  end: number;
}
function normalized(
  units: readonly { text: string }[],
  options: SearchOptions,
): { text: string; positions: number[] } {
  let text = "";
  const positions: number[] = [];
  units.forEach((unit, index) => {
    let value = unit.text.normalize("NFD");
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
/**
 * Match canonical text while mapping every normalized character back to its unit's geometry.
 * Units are concatenated as given: OCR words need their own separators (see `ocrTextUnits`).
 */
export function findTextMatches<B>(
  units: readonly TextUnit<B>[],
  query: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
): TextMatch<B>[] {
  const needle = normalized([{ text: query.trim() }], options).text;
  if (!needle) return [];
  const index = normalized(units, options);
  const matches: TextMatch<B>[] = [];
  let from = 0;
  const word = (char: string | undefined) => !!char && /[\p{L}\p{N}\p{M}_]/u.test(char);
  while (from < index.text.length) {
    const start = index.text.indexOf(needle, from);
    if (start < 0) break;
    const end = start + needle.length;
    from = end;
    if (options.wholeWord && (word(index.text[start - 1]) || word(index.text[end]))) continue;
    const selected = new Set(index.positions.slice(start, end));
    const rects = [...selected].flatMap((i) => {
      const box = units[i]?.box;
      return box ? [box] : [];
    });
    const first = index.positions[start],
      last = index.positions[end - 1];
    if (first === undefined || last === undefined)
      throw new Error("O índice de busca não corresponde aos caracteres da página.");
    const excerpt = units
      .slice(Math.max(0, first - 30), Math.min(units.length, last + 60))
      .map((unit) => unit.text)
      .join("")
      .replace(/\s+/g, " ");
    matches.push({ rects, excerpt, start: first, end: last + 1 });
    if (matches.length > 10000)
      throw new Error("Mais de 10 mil ocorrências nesta página. Refine a busca.");
  }
  return matches;
}

/** Concatenate units as text, normalizing Windows line breaks. */
export function plainText(units: readonly { text: string }[]): string {
  return units
    .map((unit) => unit.text)
    .join("")
    .replace(/\r\n/g, "\n");
}

export interface OcrWordBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * OCR words as searchable units: each word keeps its box, and a space or line break unit
 * (without box) separates consecutive words, so matches can cross words and lines.
 */
export function ocrTextUnits(
  words: readonly ({ text: string; line: number } & OcrWordBox)[],
): TextUnit<OcrWordBox>[] {
  const units: TextUnit<OcrWordBox>[] = [];
  words.forEach((word, index) => {
    const previous = words[index - 1];
    if (previous) units.push({ text: previous.line === word.line ? " " : "\n" });
    units.push({
      text: word.text,
      box: { x0: word.x0, y0: word.y0, x1: word.x1, y1: word.y1 },
    });
  });
  return units;
}
