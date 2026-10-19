import type { PDFFont } from "pdf-lib";
import type { OfficeParagraph } from "../office-format.ts";
import type { PresentationElement, PresentationText } from "./format.ts";

export type PresentationFonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
};
export interface PresentationFragment {
  text: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  width: number;
  font: PDFFont;
}
export interface PresentationLine {
  fragments: PresentationFragment[];
  width: number;
  height: number;
  ascent: number;
  top: number;
  left: number;
}
export function presentationLineBox(element: PresentationElement, line: PresentationLine) {
  const box = element.box,
    angle = (element.rotation * Math.PI) / 180,
    x = (line.left + line.width / 2 - box.w / 2) * (element.flipX ? -1 : 1),
    y = (line.top + line.height / 2 - box.h / 2) * (element.flipY ? -1 : 1),
    centreX = box.x + box.w / 2 + Math.cos(angle) * x - Math.sin(angle) * y,
    centreY = box.y + box.h / 2 + Math.sin(angle) * x + Math.cos(angle) * y;
  return {
    x: centreX - line.width / 2,
    y: centreY - line.height / 2,
    w: Math.max(0.1, line.width),
    h: line.height,
  };
}
export function presentationParagraphLines(
  paragraph: OfficeParagraph,
  fonts: PresentationFonts,
  width: number,
  scale: number,
): Omit<PresentationLine, "top" | "left">[] {
  const lines: Omit<PresentationLine, "top" | "left">[] = [];
  let current: Omit<PresentationLine, "top" | "left"> = {
    fragments: [],
    width: 0,
    height: 0,
    ascent: 0,
  };
  const flush = () => {
    if (!current.fragments.length) {
      const size =
        (paragraph.runs[0]?.size ?? (paragraph.heading ? 22 - paragraph.heading * 2 : 11)) * scale;
      current.height = size * 1.25;
      current.ascent = fonts.regular.heightAtSize(size, { descender: false });
    }
    lines.push(current);
    current = { fragments: [], width: 0, height: 0, ascent: 0 };
  };
  const add = (fragment: PresentationFragment) => {
    const last = current.fragments.at(-1);
    if (
      last &&
      last.font === fragment.font &&
      last.size === fragment.size &&
      last.color === fragment.color
    ) {
      last.text += fragment.text;
      last.width += fragment.width;
    } else current.fragments.push({ ...fragment });
    current.width += fragment.width;
    current.height = Math.max(current.height, fragment.size * 1.25);
    current.ascent = Math.max(
      current.ascent,
      fragment.font.heightAtSize(fragment.size, { descender: false }),
    );
  };
  const runs = paragraph.bullet
    ? [{ text: "• ", size: paragraph.runs[0]?.size }, ...paragraph.runs]
    : paragraph.runs;
  for (const run of runs) {
    const bold = "bold" in run && run.bold === true,
      italic = "italic" in run && run.italic === true,
      font = bold
        ? italic
          ? fonts.boldItalic
          : fonts.bold
        : italic
          ? fonts.italic
          : fonts.regular,
      size = (run.size ?? (paragraph.heading ? 22 - paragraph.heading * 2 : 11)) * scale,
      color = "color" in run && run.color ? run.color : "#202020";
    for (const token of run.text
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ")
      .split(/(\n|[^\S\n]+|[^\s]+)/u)
      .filter(Boolean)) {
      if (token === "\n") {
        flush();
        continue;
      }
      const advance = font.widthOfTextAtSize(token, size);
      if (current.width + advance > width + 0.001 && current.fragments.length && token.trim())
        flush();
      if (advance <= width + 0.001) {
        add({ text: token, size, color, bold, italic, width: advance, font });
        continue;
      }
      for (const character of token) {
        const advance = font.widthOfTextAtSize(character, size);
        if (current.width + advance > width + 0.001 && current.fragments.length) flush();
        add({ text: character, size, color, bold, italic, width: advance, font });
      }
    }
  }
  if (current.fragments.length || !lines.length) flush();
  return lines;
}
export function presentationTextLayout(
  element: PresentationText,
  fonts: PresentationFonts,
): { lines: PresentationLine[]; shrunk: boolean } {
  const width = element.box.w - element.margins.left - element.margins.right,
    height = element.box.h - element.margins.top - element.margins.bottom;
  const layout = (scale: number) => {
    const result: PresentationLine[] = [];
    let top = element.margins.top;
    for (const paragraph of element.paragraphs)
      for (const line of presentationParagraphLines(paragraph, fonts, width, scale)) {
        const left =
          element.margins.left +
          (paragraph.align === "center"
            ? (width - line.width) / 2
            : paragraph.align === "right"
              ? width - line.width
              : 0);
        result.push({ ...line, top, left });
        top += line.height;
      }
    return {
      lines: result,
      height: top - element.margins.top,
      fits:
        top - element.margins.top <= height + 0.001 &&
        result.every((line) => line.width <= width + 0.001),
    };
  };
  let scale = 1,
    result = layout(scale);
  if (!result.fits) {
    const minimum = element.paragraphs
        .flatMap((paragraph) =>
          paragraph.runs.map(
            (run) => run.size ?? (paragraph.heading ? 22 - paragraph.heading * 2 : 11),
          ),
        )
        .reduce((a, b) => Math.min(a, b), Infinity),
      floor = Math.min(1, 4 / (Number.isFinite(minimum) ? minimum : 11));
    let low = floor,
      high = 1;
    const smallest = layout(low);
    if (!smallest.fits)
      throw new Error(
        "O texto do slide não cabe na caixa mesmo a 4 pt. Amplie a caixa antes de converter.",
      );
    for (let attempt = 0; attempt < 14; attempt++) {
      const next = (low + high) / 2;
      if (layout(next).fits) low = next;
      else high = next;
    }
    scale = low;
    result = layout(scale);
  }
  const offset =
    element.vertical === "middle"
      ? (height - result.height) / 2
      : element.vertical === "bottom"
        ? height - result.height
        : 0;
  return {
    lines: result.lines.map((line) => ({ ...line, top: line.top + offset })),
    shrunk: scale < 1,
  };
}
