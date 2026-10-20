import { isXmlText } from "../xmlText";
import { type FontCharacterMap, UnsupportedCharacterMapError } from "./cmap";
import { UnsupportedLayoutTableError } from "./font";
import { type FontAsset, fontCharacterMap, fontLayoutScripts } from "./model";
import { type ShapingScript, shapingGap, shapingScript } from "./shapingScripts";

export interface TextCoverageBudget {
  remaining: number;
}
export interface MissingTextCluster {
  text: string;
  offset: number;
  codePoints: number[];
}
/** A covered grapheme of a script that needs OpenType substitution, drawn by a
 * font that does not declare that script in GSUB (or whose table is not
 * verifiable): the platform would show isolated/unjoined glyphs. */
export interface UnshapedTextCluster {
  text: string;
  offset: number;
  script: string;
  fontId: string;
  reason: string;
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
  unshapedCount: number;
  unshaped: UnshapedTextCluster[];
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
 * plus, for scripts that need substitution, a GSUB entry for the script in
 * that font. It does not run shaping or certify ligatures, color glyphs or
 * visual meaning. No code-point-level splitting of clusters/emoji is done. */
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
    unshaped: UnshapedTextCluster[] = [],
    byId = new Map(fonts.map((font) => [font.id, font])),
    shapingMemo = new Map<string, string | null>(),
    unshapedRecorded = new Set<string>(),
    used = new Set<string>(),
    memo = new Map<string, string | null>(),
    recorded = new Set<string>();
  /** Why the font cannot shape the script, or null when GSUB declares it. */
  const unshapedReason = (fontId: string, script: ShapingScript) => {
    const key = `${fontId}:${script.name}`;
    let gap = shapingMemo.get(key);
    if (gap === undefined) {
      const font = byId.get(fontId);
      if (!font) throw new Error("Fonte selecionada ausente.");
      try {
        gap = shapingGap(fontLayoutScripts(font).substitution, script);
      } catch (error) {
        if (!(error instanceof UnsupportedLayoutTableError)) throw error;
        gap = error.message;
      }
      shapingMemo.set(key, gap);
    }
    return gap;
  };
  let unshapedCount = 0;
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
    if (selected !== null) {
      used.add(selected);
      const script = shapingScript(segment),
        gap = script ? unshapedReason(selected, script) : null;
      if (script && gap !== null) {
        unshapedCount++;
        if (!unshapedRecorded.has(segment)) {
          unshapedRecorded.add(segment);
          if (unshaped.length < 64)
            unshaped.push({
              text: [...segment].slice(0, 32).join(""),
              offset: index,
              script: script.name,
              fontId: selected,
              reason: gap,
            });
          else truncated = true;
        }
      }
    } else {
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
    covered: !missingCount && !unsupportedFontIds.length && !unshapedCount,
    graphemes,
    missingCount,
    missing,
    truncated,
    unsupportedFontIds,
    unsupportedFonts,
    usedFontIds: [...used],
    unshapedCount,
    unshaped,
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
  const gap = report.unshaped[0];
  if (gap)
    throw new Error(
      `${report.unshapedCount} grupos de caracteres do script ${gap.script} sairiam sem as formas contextuais: ${gap.reason} (${fonts.find((font) => font.id === gap.fontId)?.name ?? gap.fontId}). Use uma fonte com suporte OpenType ao script, na frente da cadeia.`,
    );
  return report;
}
