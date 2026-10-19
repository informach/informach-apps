import { DEFAULT_SEARCH_OPTIONS, findTextMatches } from "@informach/edi-ocr/search";
import { z } from "zod";
import type { EngineOperation, PdfInspection, TextDocument } from "./engine-contracts.ts";
import { type Box, viewToPdf } from "./model.ts";

export const redactionQuerySchema = z.object({
  text: z.string().trim().min(1).max(500),
  caseSensitive: z.boolean(),
  accents: z.boolean(),
  wholeWord: z.boolean(),
});
export type RedactionQuery = z.infer<typeof redactionQuerySchema>;
export interface RedactionMatch {
  id: string;
  page: number;
  excerpt: string;
  rects: Box[];
}

export function findRedactions(
  inspection: PdfInspection,
  text: TextDocument,
  raw: RedactionQuery,
): RedactionMatch[] {
  const query = redactionQuerySchema.parse(raw),
    matches: RedactionMatch[] = [];
  if (
    inspection.pages.length !== text.pages.length ||
    text.pages.length > 100 ||
    !text.pages.length
  )
    throw new Error("A remoção por busca exige de uma a cem páginas com índice correspondente.");
  for (const page of text.pages) {
    if (page.error || page.missingUnicode)
      throw new Error(
        `Página ${page.index + 1} sem índice Unicode confiável. Revise ou execute OCR antes de remover por busca.`,
      );
    if (!inspection.pages.some((item) => item.index === page.index))
      throw new Error("O índice de páginas mudou.");
    for (const match of findTextMatches(page.glyphs, query.text, {
      ...DEFAULT_SEARCH_OPTIONS,
      ...query,
      comments: false,
    })) {
      const glyphs = page.glyphs.slice(match.start, match.end);
      if (
        glyphs.some(
          (glyph) => glyph.text.trim() && (!glyph.box || glyph.box.w <= 0 || glyph.box.h <= 0),
        )
      )
        throw new Error(
          `Ocorrência na página ${page.index + 1} sem área confiável. Use remoção por área.`,
        );
      const rects = match.rects.filter((rect) => rect.w > 0 && rect.h > 0);
      if (!rects.length) throw new Error("Ocorrência sem posição verificável.");
      matches.push({
        id: `${page.index}:${match.start}:${match.end}`,
        page: page.index,
        excerpt: match.excerpt,
        rects,
      });
      if (matches.length > 1000)
        throw new Error("Mais de mil ocorrências. Refine a busca antes de remover.");
    }
  }
  return matches;
}

export function selectedRedactionOperations(
  inspection: PdfInspection,
  matches: RedactionMatch[],
  ids: string[],
): EngineOperation[] {
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !matches.some((match) => match.id === id))
  )
    throw new Error("Confira a seleção de ocorrências antes de remover.");
  const selected = new Set(ids),
    operations: EngineOperation[] = [],
    seen = new Set<string>();
  for (const match of matches)
    if (selected.has(match.id)) {
      const page = inspection.pages.find((item) => item.index === match.page);
      if (!page || ![0, 90, 180, 270].includes(page.rotation))
        throw new Error("Página ou rotação fora do perfil de remoção.");
      const crop = {
        x: page.crop.left,
        y: page.crop.bottom,
        w: page.crop.right - page.crop.left,
        h: page.crop.top - page.crop.bottom,
      };
      const rotation =
        page.rotation === 90 || page.rotation === 180 || page.rotation === 270 ? page.rotation : 0;
      for (const box of match.rects) {
        const a = viewToPdf(rotation, crop, box.x, box.y),
          b = viewToPdf(rotation, crop, box.x + box.w, box.y + box.h),
          rect = {
            left: Math.max(page.crop.left, Math.min(a[0], b[0]) - 0.2),
            bottom: Math.max(page.crop.bottom, Math.min(a[1], b[1]) - 0.2),
            right: Math.min(page.crop.right, Math.max(a[0], b[0]) + 0.2),
            top: Math.min(page.crop.top, Math.max(a[1], b[1]) + 0.2),
          };
        if (rect.right <= rect.left || rect.top <= rect.bottom)
          throw new Error("Ocorrência fora da área visível da página.");
        const key = `${match.page}:${JSON.stringify(rect)}`;
        if (!seen.has(key)) {
          operations.push({ kind: "redact", page: match.page, rect });
          seen.add(key);
        }
        if (operations.length > 10000)
          throw new Error("Mais de dez mil áreas de remoção. Reduza a seleção.");
      }
    }
  return operations;
}
