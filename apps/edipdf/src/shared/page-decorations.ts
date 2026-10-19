import { z } from "zod";
import type { DecorationScope, NumberStyle, PageNumbers, PageRef, Watermark } from "./model.ts";

const coordinate = z.number().finite().min(-1e7).max(1e7);
const size = z.number().finite().positive().max(1e7);
const color = z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i);
const margin = z.number().finite().min(0).max(14400);
const line = z
  .string()
  .max(1000000)
  .refine(
    (value) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value),
    "Use uma única linha, sem caracteres de controle.",
  );
const ids = z
  .array(z.string().min(1).max(160))
  .max(100000)
  .refine((values) => new Set(values).size === values.length, "Páginas repetidas no intervalo.");
export const decorationScopeSchema = z.object({ pages: ids.optional(), except: ids.optional() });
export const numberPositionSchema = z.enum([
  "bottom-center",
  "bottom-right",
  "bottom-left",
  "top-center",
  "top-right",
  "top-left",
]);
export const numberStyleSchema = z.enum([
  "decimal",
  "roman-lower",
  "roman-upper",
  "letters-lower",
  "letters-upper",
]);
export const watermarkSchema = z.object({
  text: line,
  size,
  color,
  opacity: z.number().min(0).max(1),
  angle: coordinate,
  position: z
    .enum([...numberPositionSchema.options, "center", "middle-left", "middle-right"])
    .optional(),
  marginX: margin.optional(),
  marginY: margin.optional(),
  fit: z.boolean().optional(),
  scope: decorationScopeSchema.optional(),
});
export const pageNumbersSchema = z
  .object({
    format: line,
    position: numberPositionSchema,
    size,
    color,
    start: z.number().int().min(-100000).max(100000),
    marginX: margin.optional(),
    marginY: margin.optional(),
    scope: decorationScopeSchema.optional(),
    countMode: z.enum(["physical", "applied"]).optional(),
    style: numberStyleSchema.optional(),
    padding: z.number().int().min(1).max(12).optional(),
    writePageLabels: z.boolean().optional(),
    additional: z
      .array(
        z.object({
          format: line,
          position: numberPositionSchema,
          size: size.optional(),
          color: color.optional(),
        }),
      )
      .max(5)
      .optional(),
  })
  .superRefine((value, context) => {
    const positions = [value.position, ...(value.additional ?? []).map((entry) => entry.position)];
    if (new Set(positions).size !== positions.length)
      context.addIssue({
        code: "custom",
        message: "Use cada posição de cabeçalho/rodapé apenas uma vez.",
      });
  });

export function decorationApplies(scope: DecorationScope | undefined, pageId: string): boolean {
  return (!scope?.pages || scope.pages.includes(pageId)) && !scope?.except?.includes(pageId);
}
export function decorationPageIds(
  pages: Pick<PageRef, "id">[],
  scope: DecorationScope | undefined,
): Set<string> {
  const selected = scope?.pages ? new Set(scope.pages) : undefined,
    except = new Set(scope?.except ?? []);
  return new Set(
    pages.flatMap((page) =>
      (!selected || selected.has(page.id)) && !except.has(page.id) ? [page.id] : [],
    ),
  );
}
export function assertDecorationTextBudget(texts: string[], pages: number): void {
  if (!pages) return;
  if (texts.some((text) => text.length > 10000))
    throw new Error("Cada marca ou cabeçalho aceita até 10.000 caracteres.");
  if (texts.reduce((sum, text) => sum + text.length, 0) * pages > 5000000)
    throw new Error(
      "Este conjunto de marcas/cabeçalhos é grande demais. Reduza os intervalos ou o texto.",
    );
}
export function formatDecorationNumber(
  value: number,
  style: NumberStyle = "decimal",
  padding = 1,
): string {
  if (!Number.isSafeInteger(value)) throw new Error("Número de página inválido.");
  if (style === "decimal")
    return `${value < 0 ? "-" : ""}${String(Math.abs(value)).padStart(padding, "0")}`;
  if (style.startsWith("roman")) {
    if (value < 1 || value > 3999) throw new Error("Numeração romana aceita números de 1 a 3999.");
    const symbols: [number, string][] = [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];
    let result = "",
      remaining = value;
    for (const [number, symbol] of symbols)
      while (remaining >= number) {
        result += symbol;
        remaining -= number;
      }
    return style === "roman-lower" ? result.toLowerCase() : result;
  }
  if (value < 1 || value > 1000000)
    throw new Error("Numeração por letras aceita números de 1 a um milhão.");
  let result = "",
    remaining = value;
  while (remaining > 0) {
    remaining--;
    result = String.fromCharCode(65 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  }
  return style === "letters-lower" ? result.toLowerCase() : result;
}
export interface NumberedPage {
  label: string;
  entries: { text: string; position: PageNumbers["position"]; size: number; color: string }[];
}
/** Shared sequence for preview, printed content and PDF navigation labels. */
export function compilePageNumbers(
  pages: Pick<PageRef, "id">[],
  raw: PageNumbers | null,
): Map<string, NumberedPage> {
  const result = new Map<string, NumberedPage>();
  if (!raw) return result;
  const settings = pageNumbersSchema.parse(raw),
    selected = decorationPageIds(pages, settings.scope),
    count = selected.size;
  assertDecorationTextBudget(
    [settings.format, ...(settings.additional ?? []).map((entry) => entry.format)],
    count,
  );
  let renderedCharacters = 0;
  let ordinal = 0;
  for (const [index, page] of pages.entries()) {
    if (!selected.has(page.id)) continue;
    const n = (settings.countMode === "applied" ? ordinal : index) + settings.start;
    const total = (settings.countMode === "applied" ? count : pages.length) + settings.start - 1;
    const tokens: Record<string, string> = {
      count: String(settings.countMode === "applied" ? count : pages.length),
      page: String(index + 1),
      pages: String(pages.length),
    };
    const format = (value: string) =>
      value.replace(/\{(n|total|count|page|pages)\}/g, (_, token: string) =>
        token === "n" || token === "total"
          ? formatDecorationNumber(token === "n" ? n : total, settings.style, settings.padding)
          : tokens[token],
      );
    const entries = [settings, ...(settings.additional ?? [])]
      .map((entry) => ({
        text: format(entry.format),
        position: entry.position,
        size: entry.size ?? settings.size,
        color: entry.color ?? settings.color,
      }))
      .filter((entry) => entry.text.length > 0);
    assertDecorationTextBudget(
      entries.map((entry) => entry.text),
      1,
    );
    renderedCharacters += entries.reduce((sum, entry) => sum + entry.text.length, 0);
    if (renderedCharacters > 5000000)
      throw new Error(
        "Este conjunto de marcas/cabeçalhos é grande demais. Reduza os intervalos ou o texto.",
      );
    result.set(page.id, { label: format(settings.format), entries });
    ordinal++;
  }
  return result;
}

/** Baseline-left in view coordinates. Defaults preserve the original placement. */
export function numberPosition(
  position: string,
  width: number,
  height: number,
  textWidth: number,
  fontSize: number,
  marginX = 30,
  marginY = 30,
  metrics?: { ascent: number; descent: number },
) {
  if (
    metrics &&
    (![width, height, textWidth, metrics.ascent, metrics.descent].every(Number.isFinite) ||
      metrics.ascent < 0 ||
      metrics.descent < 0 ||
      width <= marginX * 2 ||
      height <= marginY * 2 ||
      textWidth > width - marginX * 2 ||
      metrics.ascent + metrics.descent > height - marginY * 2)
  )
    throw new Error(
      "O cabeçalho/rodapé não cabe entre as margens. Reduza o texto, o tamanho ou as margens.",
    );
  const y = position.startsWith("top")
    ? marginY + (metrics?.ascent ?? fontSize * 0.75)
    : height - marginY - (metrics?.descent ?? -fontSize * 0.25);
  const x = position.endsWith("left")
    ? marginX
    : position.endsWith("right")
      ? width - marginX - textWidth
      : (width - textWidth) / 2;
  return { x, y };
}
export function watermarkPosition(
  width: number,
  height: number,
  textWidth: number,
  settings: Watermark,
  metrics?: { ascent: number; descent: number },
) {
  const radians = (settings.angle * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians);
  const marginX = settings.marginX ?? 30,
    marginY = settings.marginY ?? 30;
  const position = settings.position ?? "center";
  if ((settings.fit || position !== "center") && (width <= marginX * 2 || height <= marginY * 2))
    throw new Error("As margens não deixam área útil para a marca d'água.");
  const ascent = metrics?.ascent ?? settings.size * 0.7,
    descent = metrics?.descent ?? 0;
  if (
    ![width, height, textWidth, ascent, descent].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    textWidth < 0 ||
    ascent < 0 ||
    descent < 0
  )
    throw new Error("Métricas inválidas para compor a marca d'água.");
  const boxW = Math.abs(cos) * textWidth + Math.abs(sin) * (ascent + descent),
    boxH = Math.abs(sin) * textWidth + Math.abs(cos) * (ascent + descent);
  const fit = settings.fit
    ? Math.min(
        1,
        (width - marginX * 2) / Math.max(1, boxW),
        (height - marginY * 2) / Math.max(1, boxH),
      )
    : 1;
  const centerX = position.endsWith("left")
    ? marginX + (boxW * fit) / 2
    : position.endsWith("right")
      ? width - marginX - (boxW * fit) / 2
      : width / 2;
  const centerY = position.startsWith("top")
    ? marginY + (boxH * fit) / 2
    : position.startsWith("bottom")
      ? height - marginY - (boxH * fit) / 2
      : height / 2;
  return {
    x: centerX - (cos * textWidth * fit) / 2 + (sin * (ascent - descent) * fit) / 2,
    y: centerY + (sin * textWidth * fit) / 2 + (cos * (ascent - descent) * fit) / 2,
    size: settings.size * fit,
  };
}
