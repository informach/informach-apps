import {
  BlendMode,
  degrees,
  LineCapStyle,
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  type PDFFont,
  PDFHexString,
  type PDFImage,
  PDFName,
  PDFNumber,
  PDFOptionList,
  type PDFPage,
  PDFRadioGroup,
  PDFString,
  PDFTextField,
  rgb,
  StandardFonts,
} from "pdf-lib";
import { pruneUnreachable } from "./compress.ts";
import type { BuildInput } from "./document-build-format.ts";
import { selectChoiceValues } from "./form-choice.ts";
import { updateDirtyFormAppearances } from "./form-font.ts";
import {
  type Annot,
  annotBounds,
  type Box,
  baselineForText,
  type DocContent,
  type FontKey,
  LINE_HEIGHT,
  NOTE_SIZE,
  type ParagraphAnnot,
  parseColor,
  type Rotation,
  type TextAnnot,
  textLines,
  viewToPdf,
} from "./model.ts";
import {
  assertDecorationTextBudget,
  compilePageNumbers,
  decorationPageIds,
  numberPosition,
  watermarkPosition,
  watermarkSchema,
} from "./page-decorations.ts";
import { reconcilePageReferences } from "./page-integrity.ts";
import {
  embedParagraphFont,
  paragraphFontBytes,
  paragraphRequiredText,
  validateParagraphInk,
} from "./paragraph-font.ts";
import { layoutParagraph } from "./paragraph-layout.ts";
import { takeEditableAnnotations, writeEditableAnnotation } from "./pdf-annotations.ts";
import { attachDuplicateWidgets, registerCopiedForms } from "./pdf-forms.ts";
import { livePdfPages } from "./pdf-pages.ts";
import { validateRasterImage } from "./raster-image.ts";
import { assertGlyphs, embedUnicodeFont, type UnicodeFonts } from "./unicode-fonts.ts";

export type { BuildInput } from "./document-build-format.ts";

/** Thrown when the base PDF is encrypted and pdf-lib cannot rewrite it. */
export class ProtectedPdfError extends Error {
  constructor() {
    super("PDF protegido");
  }
}

type Crop = { x: number; y: number; w: number; h: number };

const color = (hex: string) => {
  const c = parseColor(hex);
  return rgb(c.r, c.g, c.b);
};

export function dataUrlToBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const isPng = (bytes: Uint8Array): boolean => bytes[0] === 0x89 && bytes[1] === 0x50;

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  if (doc.isEncrypted) throw new ProtectedPdfError();
  if (doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict)?.has(PDFName.of("XFA")))
    throw new Error(
      "Este PDF contém XFA. Converta o formulário para PDF estático antes de editar.",
    );
  return doc;
}

const FONT_NAMES: Record<FontKey, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  helvetica: [
    StandardFonts.Helvetica,
    StandardFonts.HelveticaBold,
    StandardFonts.HelveticaOblique,
    StandardFonts.HelveticaBoldOblique,
  ],
  times: [
    StandardFonts.TimesRoman,
    StandardFonts.TimesRomanBold,
    StandardFonts.TimesRomanItalic,
    StandardFonts.TimesRomanBoldItalic,
  ],
  courier: [
    StandardFonts.Courier,
    StandardFonts.CourierBold,
    StandardFonts.CourierOblique,
    StandardFonts.CourierBoldOblique,
  ],
};

class Painter {
  private fonts = new Map<string, Promise<PDFFont>>();
  private images = new Map<string, Promise<PDFImage>>();
  private doc: PDFDocument;
  private unicode: UnicodeFonts | undefined;
  constructor(doc: PDFDocument, unicode?: UnicodeFonts) {
    this.doc = doc;
    this.unicode = unicode;
  }

  async textFont(key: FontKey, bold: boolean, italic: boolean, text: string): Promise<PDFFont> {
    const standard = await this.font(key, bold, italic);
    const charset = new Set(standard.getCharacterSet());
    if ([...text].every((char) => /[\r\n\t]/.test(char) || charset.has(char.codePointAt(0) ?? 0)))
      return standard;
    const face = bold ? (italic ? "boldItalic" : "bold") : italic ? "italic" : "regular";
    const bytes = this.unicode?.[face];
    if (!bytes)
      throw new Error("Este texto precisa das fontes Unicode locais, que não foram carregadas.");
    assertGlyphs(bytes, text);
    const cacheKey = `unicode:${face}`;
    let font = this.fonts.get(cacheKey);
    if (!font) {
      font = embedUnicodeFont(this.doc, bytes, text);
      this.fonts.set(cacheKey, font);
    }
    return font;
  }

  font(key: FontKey, bold = false, italic = false): Promise<PDFFont> {
    const name = FONT_NAMES[key][(bold ? 1 : 0) + (italic ? 2 : 0)];
    let f = this.fonts.get(name);
    if (!f) {
      f = this.doc.embedFont(name);
      this.fonts.set(name, f);
    }
    return f;
  }

  image(src: string): Promise<PDFImage> {
    let img = this.images.get(src);
    if (!img) {
      const bytes = dataUrlToBytes(src);
      img = isPng(bytes) ? this.doc.embedPng(bytes) : this.doc.embedJpg(bytes);
      this.images.set(src, img);
    }
    return img;
  }

  async paragraphFont(a: ParagraphAnnot): Promise<PDFFont> {
    if (!this.unicode) throw new Error("As fontes locais da caixa de texto estão indisponíveis.");
    const key =
      a.fontData?.data ??
      `paragraph:${a.bold ? "bold" : "regular"}:${a.italic ? "italic" : "normal"}`;
    let font = this.fonts.get(key);
    const text = paragraphRequiredText(a);
    if (!font) {
      font = embedParagraphFont(this.doc, paragraphFontBytes(a, this.unicode), text);
      this.fonts.set(key, font);
    }
    const embedded = await font,
      supported = new Set(embedded.getCharacterSet());
    for (const char of text)
      if (!/[\r\n\t]/.test(char) && !supported.has(char.codePointAt(0) ?? 0))
        throw new Error(`A fonte da caixa não contém o caractere “${char}”.`);
    return embedded;
  }

  async draw(page: PDFPage, r: Rotation, crop: Crop, a: Annot): Promise<void> {
    const P = (x: number, y: number) => viewToPdf(r, crop, x, y);
    const box = (b: Box) => {
      const [ax, ay] = P(b.x, b.y);
      const [bx, by] = P(b.x + b.w, b.y + b.h);
      return {
        x: Math.min(ax, bx),
        y: Math.min(ay, by),
        width: Math.abs(bx - ax),
        height: Math.abs(by - ay),
      };
    };
    const opacity = a.opacity ?? 1;
    switch (a.kind) {
      case "paragraph": {
        const font = await this.paragraphFont(a),
          layout = layoutParagraph(a, font);
        if (!this.unicode) throw new Error("As fontes da caixa estão indisponíveis.");
        validateParagraphInk(a, layout, paragraphFontBytes(a, this.unicode));
        for (const run of layout.runs) {
          const [x, y] = P(a.x + run.x, a.y + run.baseline);
          page.drawText(run.text, {
            x,
            y,
            size: a.size,
            font,
            color: color(a.color),
            opacity,
            rotate: degrees(r),
          });
        }
        return;
      }
      case "text":
        return this.drawText(page, r, crop, a);
      case "rect":
        page.drawRectangle({
          ...box(a),
          color: a.fill ? color(a.fill) : undefined,
          opacity,
          borderColor: a.stroke ? color(a.stroke) : undefined,
          borderWidth: a.stroke ? a.width : 0,
          borderOpacity: opacity,
        });
        return;
      case "ellipse": {
        const [x, y] = P(a.x + a.w / 2, a.y + a.h / 2);
        const swap = r % 180 !== 0;
        page.drawEllipse({
          x,
          y,
          xScale: (swap ? a.h : a.w) / 2,
          yScale: (swap ? a.w : a.h) / 2,
          color: a.fill ? color(a.fill) : undefined,
          opacity,
          borderColor: a.stroke ? color(a.stroke) : undefined,
          borderWidth: a.stroke ? a.width : 0,
          borderOpacity: opacity,
        });
        return;
      }
      case "line":
      case "arrow": {
        const segs: [number, number, number, number][] = [[a.x1, a.y1, a.x2, a.y2]];
        if (a.kind === "arrow")
          for (const s of arrowHead(a.x1, a.y1, a.x2, a.y2, a.width)) segs.push(s);
        for (const [x1, y1, x2, y2] of segs) {
          const [sx, sy] = P(x1, y1);
          const [ex, ey] = P(x2, y2);
          page.drawLine({
            start: { x: sx, y: sy },
            end: { x: ex, y: ey },
            thickness: a.width,
            color: color(a.stroke),
            opacity,
            lineCap: LineCapStyle.Round,
          });
        }
        return;
      }
      case "ink":
        for (const path of a.paths) {
          const pts: [number, number][] = [];
          for (let i = 0; i < path.length; i += 2) pts.push(P(path[i], path[i + 1]));
          if (pts.length === 1) {
            page.drawCircle({
              x: pts[0][0],
              y: pts[0][1],
              size: a.width / 2,
              color: color(a.stroke),
              opacity,
            });
            continue;
          }
          // drawSvgPath flips y, so feed it negated PDF coordinates anchored at the origin.
          const d = smoothPath(pts.map(([x, y]) => [x, -y]));
          page.drawSvgPath(d, {
            x: 0,
            y: 0,
            borderColor: color(a.stroke),
            borderWidth: a.width,
            borderOpacity: opacity,
            borderLineCap: LineCapStyle.Round,
          });
        }
        return;
      case "highlight":
        for (const rect of a.rects)
          page.drawRectangle({
            ...box(rect),
            color: color(a.color),
            opacity: a.opacity ?? 1,
            blendMode: BlendMode.Multiply,
          });
        return;
      case "underline":
      case "strike":
        for (const rect of a.rects) {
          const t = Math.max(0.8, rect.h * 0.07);
          const y = a.kind === "underline" ? rect.y + rect.h - t * 1.5 : rect.y + rect.h * 0.55;
          const [sx, sy] = P(rect.x, y);
          const [ex, ey] = P(rect.x + rect.w, y);
          page.drawLine({
            start: { x: sx, y: sy },
            end: { x: ex, y: ey },
            thickness: t,
            color: color(a.color),
            opacity,
          });
        }
        return;
      case "image": {
        const img = await this.image(a.src);
        const [x, y] = P(a.x, a.y + a.h);
        page.drawImage(img, { x, y, width: a.w, height: a.h, rotate: degrees(r), opacity });
        return;
      }
      case "note": {
        if (!a.text.trim()) return;
        const b = box({ x: a.x, y: a.y, w: NOTE_SIZE, h: NOTE_SIZE });
        const c = parseColor(a.color);
        const ctx = this.doc.context;
        const dict = ctx.obj({
          Type: "Annot",
          Subtype: "Text",
          Rect: [b.x, b.y, b.x + b.width, b.y + b.height],
          Contents: PDFHexString.fromText(a.text),
          T: PDFHexString.fromText("EdiPDF"),
          M: PDFString.fromDate(new Date()),
          Name: "Comment",
          C: [c.r, c.g, c.b],
          F: 4,
          Open: false,
        });
        page.node.addAnnot(ctx.register(dict));
        return;
      }
    }
  }

  private async drawText(page: PDFPage, r: Rotation, crop: Crop, a: TextAnnot): Promise<void> {
    const font = await this.textFont(a.font, !!a.bold, !!a.italic, a.text);
    const lines = textLines(a.text);
    lines.forEach((line, i) => {
      if (!line) return;
      const [x, y] = viewToPdf(
        r,
        crop,
        a.x,
        a.y + i * a.size * LINE_HEIGHT + baselineForText(a.font, a.text) * a.size,
      );
      page.drawText(line, {
        x,
        y,
        size: a.size,
        font,
        color: color(a.color),
        opacity: a.opacity ?? 1,
        rotate: degrees(r),
      });
    });
  }

  async watermark(
    page: PDFPage,
    r: Rotation,
    crop: Crop,
    W: number,
    H: number,
    wm: NonNullable<DocContent["watermark"]>,
  ): Promise<void> {
    const text = wm.text;
    const font = await this.textFont("helvetica", true, false, text);
    const tw = font.widthOfTextAtSize(text, wm.size);
    const advanced =
      wm.position !== undefined ||
      wm.fit !== undefined ||
      wm.marginX !== undefined ||
      wm.marginY !== undefined;
    const ascent = font.heightAtSize(wm.size, { descender: false });
    const placed = watermarkPosition(
      W,
      H,
      tw,
      wm,
      advanced ? { ascent, descent: Math.max(0, font.heightAtSize(wm.size) - ascent) } : undefined,
    );
    const [x, y] = viewToPdf(r, crop, placed.x, placed.y);
    page.drawText(text, {
      x,
      y,
      size: placed.size,
      font,
      color: color(wm.color),
      opacity: wm.opacity,
      rotate: degrees(r + wm.angle),
    });
  }

  async pageNumber(
    page: PDFPage,
    r: Rotation,
    crop: Crop,
    W: number,
    H: number,
    label: string,
    pn: NonNullable<DocContent["pageNumbers"]>,
  ): Promise<void> {
    const text = label;
    const font = await this.textFont("helvetica", false, false, text);
    const advanced =
      pn.scope !== undefined ||
      pn.marginX !== undefined ||
      pn.marginY !== undefined ||
      pn.style !== undefined ||
      pn.additional !== undefined;
    const ascent = font.heightAtSize(pn.size, { descender: false });
    if (
      (pn.marginX !== undefined && pn.marginX * 2 >= W) ||
      (pn.marginY !== undefined && pn.marginY * 2 >= H)
    )
      throw new Error("As margens não deixam área útil para cabeçalho/rodapé.");
    const { x: vx, y: vy } = numberPosition(
      pn.position,
      W,
      H,
      font.widthOfTextAtSize(text, pn.size),
      pn.size,
      pn.marginX,
      pn.marginY,
      advanced ? { ascent, descent: Math.max(0, font.heightAtSize(pn.size) - ascent) } : undefined,
    );
    const [x, y] = viewToPdf(r, crop, vx, vy);
    page.drawText(text, { x, y, size: pn.size, font, color: color(pn.color), rotate: degrees(r) });
  }
}

/** Baseline-left position of a page number label in view space. */
export { numberPosition as pageNumberPos } from "./page-decorations.ts";

/** The two short strokes of an arrow head at (x2, y2). */
export function arrowHead(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
): [number, number, number, number][] {
  const len = Math.max(9, width * 4);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  return [-1, 1].map((s) => {
    const a = ang + Math.PI + (s * Math.PI) / 7;
    return [x2, y2, x2 + Math.cos(a) * len, y2 + Math.sin(a) * len];
  });
}

/** Quadratic curves through stroke midpoints: same smoothing as the on-screen ink. */
export function smoothPath(pts: [number, number][]): string {
  if (!pts.length) return "";
  const f = (n: number) => +n.toFixed(2);
  if (pts.length < 3)
    return (
      `M ${f(pts[0][0])} ${f(pts[0][1])} ` + pts.map(([x, y]) => `L ${f(x)} ${f(y)}`).join(" ")
    );
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += ` Q ${f(x)} ${f(y)} ${f((x + nx) / 2)} ${f((y + ny) / 2)}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return d + ` L ${f(lx)} ${f(ly)}`;
}

function fillForms(doc: PDFDocument, values: DocContent["forms"]): void {
  const entries = Object.entries(values);
  if (!entries.length) return;
  const form = doc.getForm();
  for (const [name, value] of entries) {
    try {
      const field = form.getField(name);
      if (field instanceof PDFTextField) field.setText(String(value));
      else if (field instanceof PDFCheckBox) value ? field.check() : field.uncheck();
      else if (field instanceof PDFRadioGroup) {
        if (typeof value === "string" && value && field.getOptions().includes(value))
          field.select(value);
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        selectChoiceValues(doc, field, value);
      }
    } catch (err) {
      throw new Error(
        `Não foi possível salvar o campo "${name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export async function buildPdf({
  content,
  sources,
  primary,
  fonts,
}: BuildInput): Promise<Uint8Array> {
  if (!content.pages.length) throw new Error("O documento precisa ter pelo menos uma página.");
  for (const page of content.pages) {
    if (page.blank) continue;
    if (!page.src || !sources[page.src])
      throw new Error("Uma fonte do documento está indisponível. Reabra o PDF antes de salvar.");
    if (!Number.isInteger(page.index) || page.index < 0)
      throw new Error("Índice de página inválido.");
  }
  const out =
    primary && sources[primary] ? await loadPdf(sources[primary]) : await PDFDocument.create();
  takeEditableAnnotations(out);
  const primaryValues = Object.fromEntries(
    Object.entries(content.forms).flatMap(([key, value]) => {
      if (!key.includes("\u001f")) return [[key, value]];
      return key.startsWith(`${primary}\u001f`)
        ? [[key.slice(key.indexOf("\u001f") + 1), value]]
        : [];
    }),
  );
  if (primary && sources[primary]) fillForms(out, primaryValues);

  const original = primary && sources[primary] ? out.getPages() : [];
  if (content.pages.some((p) => !p.blank && p.src === primary && p.index >= original.length))
    throw new Error("Página inexistente no PDF de origem.");
  const used = new Set<number>();
  const dupIdx: number[] = [];
  for (const ref of content.pages) {
    if (ref.src !== primary || ref.blank) continue;
    if (used.has(ref.index)) dupIdx.push(ref.index);
    else used.add(ref.index);
  }
  // Copies must be taken while the original pages are still in the page tree.
  const dupQueue = dupIdx.length ? await out.copyPages(out, dupIdx) : [];
  if (dupQueue.length && out.catalog.has(PDFName.of("AcroForm")))
    attachDuplicateWidgets(out, dupQueue);

  const foreign = new Map<string, PDFPage[]>();
  const foreignValues: DocContent["forms"] = {};
  for (const srcId of new Set(
    content.pages.filter((p) => p.src && p.src !== primary && !p.blank).map((p) => p.src),
  )) {
    const bytes = sources[srcId];
    if (!bytes) throw new Error("Fonte do PDF indisponível.");
    const srcDoc = await loadPdf(bytes);
    takeEditableAnnotations(srcDoc);
    const idx = content.pages.filter((p) => p.src === srcId && !p.blank).map((p) => p.index);
    const copied = await out.copyPages(srcDoc, idx);
    const prefix = registerCopiedForms(out, copied, `Fonte ${foreign.size + 2}`);
    for (const [key, value] of Object.entries(content.forms))
      if (key.startsWith(`${srcId}\u001f`))
        foreignValues[`${prefix}.${key.slice(key.indexOf("\u001f") + 1)}`] = value;
    foreign.set(srcId, copied);
  }

  for (let i = original.length - 1; i >= 0; i--) out.removePage(i);

  const placed = new Set<number>();
  const painter = new Painter(out, fonts);
  const numbering = compilePageNumbers(content.pages, content.pageNumbers);
  const watermark = content.watermark ? watermarkSchema.parse(content.watermark) : null;
  const watermarkPages = watermark
    ? decorationPageIds(content.pages, watermark.scope)
    : new Set<string>();
  if (watermark) assertDecorationTextBudget([watermark.text], watermarkPages.size);
  const byPage = new Map<string, Annot[]>();
  for (const a of content.annots) byPage.set(a.page, [...(byPage.get(a.page) ?? []), a]);

  for (let n = 0; n < content.pages.length; n++) {
    const ref = content.pages[n];
    let page: PDFPage;
    if (ref.blank || !ref.src) page = out.addPage([ref.blank?.w ?? 595.28, ref.blank?.h ?? 841.89]);
    else if (ref.src === primary) {
      if (!placed.has(ref.index)) {
        placed.add(ref.index);
        page = out.addPage(original[ref.index]);
      } else {
        const duplicate = dupQueue.shift();
        if (!duplicate) throw new Error("A cópia da página não está disponível.");
        page = out.addPage(duplicate);
      }
    } else {
      const imported = foreign.get(ref.src)?.shift();
      if (!imported) throw new Error("Página indisponível no PDF de origem.");
      page = out.addPage(imported);
    }
    const base = ((page.getRotation().angle % 360) + 360) % 360;
    const r = (base + ref.rotation) % 360;
    if (r !== 0 && r !== 90 && r !== 180 && r !== 270)
      throw new Error("A página contém uma rotação não ortogonal inválida.");
    page.setRotation(degrees(r));
    const cb = page.getCropBox();
    const crop = { x: cb.x, y: cb.y, w: cb.width, h: cb.height };
    const W = r % 180 === 0 ? crop.w : crop.h;
    const H = r % 180 === 0 ? crop.h : crop.w;

    if (watermark?.text && watermarkPages.has(ref.id))
      await painter.watermark(page, r, crop, W, H, watermark);
    for (const a of byPage.get(ref.id) ?? []) {
      let textSize: { w: number; h: number } | undefined;
      if (a.kind === "text") {
        const font = await painter.textFont(a.font, !!a.bold, !!a.italic, a.text);
        textSize = {
          w: Math.max(
            a.size,
            ...textLines(a.text).map((line) => font.widthOfTextAtSize(line, a.size)),
          ),
          h: textLines(a.text).length * a.size * LINE_HEIGHT,
        };
      }
      const bounds = annotBounds(a, textSize);
      await writeEditableAnnotation(
        out,
        page,
        r,
        crop,
        a,
        {
          x: bounds.x - 3,
          y: bounds.y - 3,
          w: Math.max(6, bounds.w + 6),
          h: Math.max(6, bounds.h + 6),
        },
        (target) => painter.draw(target, r, crop, a),
      );
    }
    if (content.pageNumbers) {
      const pn = content.pageNumbers;
      for (const entry of numbering.get(ref.id)?.entries ?? [])
        await painter.pageNumber(page, r, crop, W, H, entry.text, { ...pn, ...entry });
    }
  }

  reconcilePageReferences(out);
  fillForms(out, foreignValues);
  if (out.catalog.has(PDFName.of("AcroForm"))) {
    await updateDirtyFormAppearances(out, fonts?.regular);
  }

  if (content.pageNumbers?.writePageLabels) {
    const labels = PDFArray.withContext(out.context);
    for (const [index, ref] of content.pages.entries()) {
      labels.push(PDFNumber.of(index));
      labels.push(
        out.context.obj({
          P: PDFHexString.fromText(numbering.get(ref.id)?.label ?? String(index + 1)),
        }),
      );
    }
    out.catalog.set(PDFName.of("PageLabels"), out.context.obj({ Nums: labels }));
  }

  const m = content.meta;
  if (m.title !== undefined) out.setTitle(m.title);
  if (m.author !== undefined) out.setAuthor(m.author);
  if (m.subject !== undefined) out.setSubject(m.subject);
  if (m.keywords !== undefined)
    out.setKeywords(
      m.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    );
  out.setProducer("EdiPDF");
  out.setModificationDate(new Date());
  // Deleted pages and replaced objects would otherwise still be written to the file.
  await out.flush();
  pruneUnreachable(out);
  return out.save({ useObjectStreams: true });
}

/** Joins whole PDFs, in order, into one new file. */
export async function mergePdfs(
  files: Uint8Array[],
  options: { maxPages?: number; progress?(index: number, total: number): void } = {},
): Promise<Uint8Array> {
  if (!files.length) throw new Error("Escolha pelo menos um arquivo para juntar.");
  const maxPages = options.maxPages ?? 100000;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100000)
    throw new Error("Limite de páginas inválido para a junção.");
  const out = await PDFDocument.create();
  for (const [index, bytes] of files.entries()) {
    options.progress?.(index, files.length);
    const src = await loadPdf(bytes);
    const count = livePdfPages(src).length;
    if (!count || out.getPageCount() + count > maxPages)
      throw new Error(`A junção exige páginas válidas e aceita até ${maxPages} páginas.`);
    const pages = await out.copyPages(src, src.getPageIndices());
    registerCopiedForms(out, pages, `Fonte ${index + 1}`);
    for (const page of pages) out.addPage(page);
  }
  reconcilePageReferences(out);
  out.setProducer("EdiPDF");
  await out.flush();
  pruneUnreachable(out);
  return out.save({ useObjectStreams: true });
}

/** Wraps an image in a one-page PDF so it can be used like any other source. */
export async function imageToPdf(bytes: Uint8Array): Promise<Uint8Array> {
  validateRasterImage(bytes, isPng(bytes) ? "png" : "jpg");
  const doc = await PDFDocument.create();
  const img = isPng(bytes) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  // 96 dpi, capped so the longest side fits an A4 page.
  let w = img.width * 0.75;
  let h = img.height * 0.75;
  const k = Math.min(1, 842 / Math.max(w, h));
  w *= k;
  h *= k;
  const page = doc.addPage([w, h]);
  page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  return doc.save();
}
