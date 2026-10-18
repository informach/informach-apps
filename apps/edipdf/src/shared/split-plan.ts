import { PDFDocument, PDFName } from "pdf-lib";
import { pruneUnreachable } from "./compress.ts";
import { reconcilePageReferences } from "./page-integrity.ts";
import { bookmarks } from "./pdf-navigation.ts";
import { livePdfPages } from "./pdf-pages.ts";

export type SplitStrategy =
  | { kind: "bookmarks"; level: number }
  | { kind: "size"; maxBytes: number };
export type SplitPlanningProgress = { stage: "bookmarks" | "size"; checked: number };

/** One canonical writer for planning, output and resumed output; no metadata clock changes. */
export async function extractSplitPart(pdf: Uint8Array, selected: number[]): Promise<Uint8Array> {
  const part = await PDFDocument.load(pdf, { updateMetadata: false });
  const original = livePdfPages(part);
  if (!selected.length || selected.length > 1000 || new Set(selected).size !== selected.length)
    throw new Error("Seleção inválida para a parte do PDF.");
  const ordered = selected.map((index) => {
    if (!Number.isInteger(index) || index < 0 || !original[index])
      throw new Error("Uma parte referencia uma página inexistente.");
    return original[index];
  });
  for (let index = original.length - 1; index >= 0; index--) part.removePage(index);
  for (const [index, page] of ordered.entries()) part.insertPage(index, page);
  part.catalog.delete(PDFName.of("PageLabels"));
  reconcilePageReferences(part);
  await part.flush();
  pruneUnreachable(part);
  return part.save({ useObjectStreams: true, updateFieldAppearances: false });
}

/** Every source page is retained once. A size goal is checked against actual serialized parts. */
export async function planSplit(
  pdf: Uint8Array,
  strategy: SplitStrategy,
  progress: (value: SplitPlanningProgress) => void = () => {},
): Promise<number[][]> {
  if (!pdf.length || pdf.length > 64 * 1024 * 1024)
    throw new Error("Divisão aceita PDF de até 64 MB.");
  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  const count = livePdfPages(document).length;
  if (!count || count > 1000) throw new Error("Divisão aceita entre uma e mil páginas.");
  const range = (first: number, end: number) =>
    Array.from({ length: end - first }, (_, index) => first + index);
  if (strategy.kind === "bookmarks") {
    if (!Number.isInteger(strategy.level) || strategy.level < 1 || strategy.level > 100)
      throw new Error("Nível de marcador inválido.");
    progress({ stage: "bookmarks", checked: 0 });
    const chosen = bookmarks(document).filter((bookmark) => bookmark.level === strategy.level - 1);
    if (!chosen.length) throw new Error("Não há marcadores no nível escolhido.");
    if (chosen.some((bookmark) => bookmark.page === undefined))
      throw new Error(
        "Um marcador desse nível não aponta para uma página local. Revise os destinos antes de dividir.",
      );
    const starts = [
      ...new Set([
        0,
        ...chosen.flatMap((bookmark) => (bookmark.page === undefined ? [] : [bookmark.page])),
      ]),
    ].sort((a, b) => a - b);
    if (starts.length > 100) throw new Error("A divisão por marcadores excede cem partes.");
    return starts.map((first, index) => range(first, starts[index + 1] ?? count));
  }
  if (
    !Number.isInteger(strategy.maxBytes) ||
    strategy.maxBytes < 1024 ||
    strategy.maxBytes > 32 * 1024 * 1024
  )
    throw new Error("Escolha um tamanho entre 1 KB e 32 MB por parte.");
  const groups: number[][] = [],
    started = performance.now();
  let checked = 0;
  const measure = async (first: number, end: number) => {
    if (++checked > 1000 || performance.now() - started > 120000)
      throw new Error(
        "O planejamento excedeu o limite local. Reduza o documento ou aumente o tamanho por parte.",
      );
    progress({ stage: "size", checked });
    const size = (await extractSplitPart(pdf, range(first, end))).length;
    if (performance.now() - started > 120000)
      throw new Error(
        "O planejamento excedeu dois minutos. Reduza o documento ou aumente o tamanho por parte.",
      );
    return size;
  };
  for (let first = 0; first < count; ) {
    if (groups.length >= 100) throw new Error("O tamanho escolhido exige mais de cem partes.");
    let end: number;
    if ((await measure(first, count)) <= strategy.maxBytes) end = count;
    else {
      if ((await measure(first, first + 1)) > strategy.maxBytes)
        throw new Error(
          `A página ${first + 1}, isolada com seus recursos, excede o tamanho escolhido. Aumente o limite ou compacte o documento.`,
        );
      let low = first + 1,
        high = count - 1;
      // Compression need not be monotone: this finds a verified fit, without claiming maximal packing.
      while (low < high) {
        const candidate = Math.ceil((low + high) / 2);
        if ((await measure(first, candidate)) <= strategy.maxBytes) low = candidate;
        else high = candidate - 1;
      }
      end = low;
    }
    groups.push(range(first, end));
    first = end;
  }
  return groups;
}
