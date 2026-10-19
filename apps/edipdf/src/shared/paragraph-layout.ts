import type { PDFFont } from "pdf-lib";
import type { ParagraphAnnot } from "./model.ts";
export interface ParagraphRun {
  text: string;
  x: number;
  baseline: number;
  width: number;
}
export interface ParagraphLayout {
  runs: ParagraphRun[];
  lines: number;
  height: number;
}

export function sameParagraphLayout(a: ParagraphAnnot, b: ParagraphAnnot): boolean {
  return (
    a.text === b.text &&
    a.w === b.w &&
    a.h === b.h &&
    a.size === b.size &&
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    a.align === b.align &&
    a.spacing === b.spacing &&
    a.padding === b.padding &&
    a.list === b.list &&
    a.fontData?.data === b.fontData?.data
  );
}

/** Shared exact font metrics and positions; overflowing fixed frames are refused, never clipped. */
export function layoutParagraph(
  a: ParagraphAnnot,
  font: Pick<PDFFont, "widthOfTextAtSize" | "heightAtSize">,
): ParagraphLayout {
  const available = a.w - 2 * a.padding,
    bodyHeight = a.h - 2 * a.padding;
  const ascent = font.heightAtSize(a.size, { descender: false }),
    height = font.heightAtSize(a.size),
    advance = height * a.spacing;
  if (
    ![available, bodyHeight, ascent, height, advance].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new Error("A caixa de texto não tem área útil ou métricas válidas.");
  const runs: ParagraphRun[] = [];
  let lines = 0;
  const width = (text: string) => font.widthOfTextAtSize(text, a.size);
  const segmenter = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
  const paragraphs = a.text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .split("\n");
  for (const [paragraphIndex, text] of paragraphs.entries()) {
    const marker =
      a.list === "bullet" ? "• " : a.list === "numbered" ? `${paragraphIndex + 1}. ` : "";
    const markerWidth = width(marker),
      indent = marker ? Math.max(a.size * 1.5, markerWidth) : 0,
      lineWidth = available - indent;
    if (lineWidth <= 0) throw new Error("A caixa é estreita demais para a lista.");
    const wrapped: string[] = [];
    let current = "",
      currentWidth = 0;
    const flush = () => {
      wrapped.push(current.trimEnd());
      current = "";
      currentWidth = 0;
      if (wrapped.length + lines > 10000)
        throw new Error("A caixa excede dez mil linhas. Divida o texto.");
    };
    for (const token of text.match(/\s+|\S+/gu) ?? []) {
      const tokenWidth = width(token);
      if (currentWidth + tokenWidth <= lineWidth) {
        current += token;
        currentWidth += tokenWidth;
        continue;
      }
      if (current.trim()) flush();
      if (!token.trim()) continue;
      if (tokenWidth <= lineWidth) {
        current = token;
        currentWidth = tokenWidth;
        continue;
      }
      const clusters = Array.from(segmenter.segment(token), (item) => item.segment);
      for (let start = 0; start < clusters.length; ) {
        if (width(clusters[start] ?? "") > lineWidth)
          throw new Error("Um caractere não cabe na caixa. Aumente a largura ou reduza a fonte.");
        let low = 1,
          high = 1;
        while (
          start + high < clusters.length &&
          width(clusters.slice(start, start + high).join("")) <= lineWidth
        ) {
          low = high;
          high = Math.min(clusters.length - start, high * 2);
        }
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (width(clusters.slice(start, start + middle).join("")) <= lineWidth) low = middle;
          else high = middle - 1;
        }
        current = clusters.slice(start, start + low).join("");
        currentWidth = width(current);
        start += low;
        if (start < clusters.length) flush();
      }
    }
    if (current || !wrapped.length) flush();
    for (const [lineIndex, line] of wrapped.entries()) {
      const top = lines * advance,
        baseline = a.padding + top + ascent;
      if (top + height > bodyHeight + 0.01)
        throw new Error(
          "O texto ultrapassa a altura da caixa. Aumente a caixa ou reduza a fonte; nenhum trecho foi omitido.",
        );
      const measured = width(line),
        left = a.padding + indent;
      if (measured > lineWidth + 0.01)
        throw new Error(
          "A fonte compõe uma largura incompatível com a caixa. Escolha outra fonte ou aumente a largura.",
        );
      const offset =
        a.align === "center"
          ? (lineWidth - measured) / 2
          : a.align === "right"
            ? lineWidth - measured
            : 0;
      if (marker && lineIndex === 0)
        runs.push({
          text: marker.trimEnd(),
          x: a.padding,
          baseline,
          width: width(marker.trimEnd()),
        });
      const words = line.trim().split(/\s+/u);
      if (a.align === "justify" && lineIndex < wrapped.length - 1 && words.length > 1) {
        const gap =
          (lineWidth - words.reduce((sum, word) => sum + width(word), 0)) / (words.length - 1);
        let x = left;
        for (const word of words) {
          const measured = width(word);
          runs.push({ text: word, x, baseline, width: measured });
          x += measured + gap;
        }
      } else if (line) runs.push({ text: line, x: left + offset, baseline, width: measured });
      lines++;
      if (runs.length > 10000) throw new Error("A caixa excede dez mil trechos. Divida o texto.");
    }
  }
  return {
    runs,
    lines,
    height: lines ? (lines - 1) * advance + height + 2 * a.padding : 2 * a.padding,
  };
}
