import { isXmlText } from "../xmlText";
import { type FontCharacterMap, UnsupportedCharacterMapError } from "./cmap";
import { type FontAsset, fontCharacterMap } from "./model";

export interface TextCoverageBudget {
  remaining: number;
}
export interface MissingTextCluster {
  text: string;
  offset: number;
  codePoints: number[];
}
export interface TextCoverageReport {
  covered: boolean;
  graphemes: number;
  missingCount: number;
  missing: MissingTextCluster[];
  truncated: boolean;
  unsupportedFontIds: string[];
  unsupportedFonts: { id: string; reason: string }[];
  usedFontIds: string[];
}
let segmenter: Intl.Segmenter | undefined;
const variation = /\p{Variation_Selector}/u,
  ignorable = /\p{Default_Ignorable_Code_Point}/u;
function spend(budget: TextCoverageBudget, amount: number) {
  budget.remaining -= amount;
  if (budget.remaining < 0) throw new Error("Cobertura de texto excede orçamento de avaliação.");
}
function covers(cluster: string, map: FontCharacterMap, budget: TextCoverageBudget) {
  const points = [...cluster];
  for (let index = 0; index < points.length; index++) {
    const text = points[index],
      point = text?.codePointAt(0),
      following = points[index + 1];
    if (point === undefined || text === undefined) throw new Error("Cluster Unicode inválido.");
    if (variation.test(text)) return false; // A selector without its preceding base.
    if (/^[\t\r\n]$/.test(text) || ignorable.test(text)) continue;
    // Worst-case binary lookup in base + variation ranges is bounded by 64
    // comparisons. Charge that bound rather than pretending lookup is free.
    spend(budget, 64);
    if (following && variation.test(following)) {
      const selector = following.codePointAt(0);
      if (selector === undefined || !map.glyph(point, selector)) return false;
      index++;
    } else if (!map.glyph(point)) return false;
  }
  return true;
}
/** Coverage is cmap availability for a whole grapheme in one embedded font,
 * not a certification of shaping, ligatures, color glyphs or visual meaning.
 * No code-point-level splitting of combining clusters/emoji is performed. */
export function inspectTextCoverage(
  text: string,
  fonts: readonly FontAsset[],
  budget: TextCoverageBudget = { remaining: 2_000_000 },
): TextCoverageReport {
  if (typeof text !== "string" || text.length > 10000 || !isXmlText(text))
    throw new Error("Cobertura requer texto XML válido de até 10000 caracteres.");
  if (
    !fonts.length ||
    fonts.length > 8 ||
    new Set(fonts.map((font) => font.id)).size !== fonts.length
  )
    throw new Error("Cobertura requer de uma a oito fontes distintas.");
  if (!Number.isFinite(budget.remaining) || budget.remaining < 0)
    throw new Error("Orçamento de cobertura inválido.");
  spend(budget, text.length);
  if (typeof Intl.Segmenter !== "function")
    throw new Error("Este runtime não disponibiliza segmentação Unicode verificável.");
  segmenter ??= new Intl.Segmenter("und", { granularity: "grapheme" });
  const unsupportedFontIds: string[] = [],
    unsupportedFonts: { id: string; reason: string }[] = [],
    maps = fonts.flatMap((font) => {
      try {
        return [{ id: font.id, map: fontCharacterMap(font) }];
      } catch (error) {
        if (!(error instanceof UnsupportedCharacterMapError)) throw error;
        unsupportedFontIds.push(font.id);
        unsupportedFonts.push({ id: font.id, reason: error.message });
        return [];
      }
    }),
    missing: MissingTextCluster[] = [],
    used = new Set<string>(),
    memo = new Map<string, string | null>(),
    recorded = new Set<string>();
  let graphemes = 0,
    missingCount = 0,
    truncated = false;
  for (const { segment, index } of segmenter.segment(text)) {
    graphemes++;
    spend(budget, 1);
    let selected = memo.get(segment);
    if (selected === undefined) {
      selected = maps.find(({ map }) => covers(segment, map, budget))?.id ?? null;
      memo.set(segment, selected);
    }
    if (selected !== null) used.add(selected);
    else {
      missingCount++;
      if (!recorded.has(segment)) {
        recorded.add(segment);
        if (missing.length < 64) {
          const sample = [...segment].slice(0, 32);
          if (sample.join("").length < segment.length) truncated = true;
          missing.push({
            text: sample.join(""),
            offset: index,
            codePoints: sample.map((point) => {
              const value = point.codePointAt(0);
              if (value === undefined) throw new Error("Caractere Unicode ausente.");
              return value;
            }),
          });
        } else truncated = true;
      }
    }
  }
  return {
    covered: !missingCount && !unsupportedFontIds.length,
    graphemes,
    missingCount,
    missing,
    truncated,
    unsupportedFontIds,
    unsupportedFonts,
    usedFontIds: [...used],
  };
}
export function assertTextCoverage(
  text: string,
  fonts: readonly FontAsset[],
  budget?: TextCoverageBudget,
) {
  const report = inspectTextCoverage(text, fonts, budget);
  if (report.unsupportedFontIds.length)
    throw new Error(
      `A cadeia contém fonte com cmap não verificável (${fonts
        .filter((font) => report.unsupportedFontIds.includes(font.id))
        .map((font) => font.name)
        .join(
          ", ",
        )}). ${report.unsupportedFonts[0]?.reason ?? "Perfil Unicode não suportado."} Remova ou substitua essas fontes; adicionar alternativas não comprova a cobertura da fonte desconhecida.`,
    );
  if (report.missingCount) {
    const sample = report.missing
      .slice(0, 6)
      .map((cluster) =>
        cluster.codePoints
          .map((point) => `U+${point.toString(16).toUpperCase().padStart(4, "0")}`)
          .join("+"),
      )
      .join(", ");
    throw new Error(
      `Fontes incorporadas não cobrem ${report.missingCount} grupos de caracteres (${sample}). Configure fontes de fallback ou escolha explicitamente uma fonte do sistema.`,
    );
  }
  return report;
}
