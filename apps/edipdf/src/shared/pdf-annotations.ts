import {
  PDFArray,
  PDFContentStream,
  PDFDict,
  type PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  type PDFObject,
  PDFPage,
  PDFRef,
  PDFString,
} from "pdf-lib";
import {
  decodePdfString,
  readAnnotationEnvelope,
  writeAnnotationEnvelope,
} from "./annotation-envelope.ts";
import {
  type Annot,
  type Box,
  parseColor,
  pdfToView,
  type Rotation,
  uid,
  viewToPdf,
} from "./model.ts";

const n = PDFName.of;
const string = (value: PDFObject | undefined): string =>
  value instanceof PDFString || value instanceof PDFHexString ? decodePdfString(value) : "";
const number = (value: PDFObject | undefined, fallback = 0): number =>
  value instanceof PDFNumber ? value.asNumber() : fallback;
const components = (value: PDFObject | undefined): number[] =>
  value instanceof PDFArray ? value.asArray().map((v) => number(v)) : [];
const hexColor = (value: PDFObject | undefined, fallback: string): string => {
  const c = components(value);
  if (!c.length) return fallback;
  const rgb =
    c.length === 1
      ? [c[0], c[0], c[0]]
      : c.length === 4
        ? [1 - Math.min(1, c[0] + c[3]), 1 - Math.min(1, c[1] + c[3]), 1 - Math.min(1, c[2] + c[3])]
        : c.slice(0, 3);
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

/** Detach only annotations represented in our editable model; preserve unsupported annotations. */
export function takeEditableAnnotations(doc: PDFDocument): Map<number, Annot[]> {
  const result = new Map<number, Annot[]>();
  doc.getPages().forEach((page, index) => {
    const list = page.node.Annots();
    if (!list) return;
    const crop = page.getCropBox();
    const cb = { x: crop.x, y: crop.y, w: crop.width, h: crop.height };
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270)
      throw new Error("Rotação de página inválida.");
    const point = (x: number, y: number) => pdfToView(rotation, cb, x, y);
    const annotations: Annot[] = [];
    const detach: number[] = [];
    for (let i = 0; i < list.size(); i++) {
      const a = doc.context.lookup(list.get(i));
      if (!(a instanceof PDFDict)) continue;
      const privateData = readAnnotationEnvelope(doc, a.get(n("EdiPDFModel")));
      let annot: Annot | undefined;
      if (privateData) {
        annot = privateData.annotation;
      } else {
        const rect = components(a.lookup(n("Rect")));
        if (rect.length !== 4) continue;
        const [x0, y0] = point(rect[0], rect[1]),
          [x1, y1] = point(rect[2], rect[3]);
        const box = {
          x: Math.min(x0, x1),
          y: Math.min(y0, y1),
          w: Math.abs(x1 - x0),
          h: Math.abs(y1 - y0),
        };
        const base = {
          id: string(a.get(n("NM"))) || uid("import"),
          page: String(index),
          opacity: number(a.get(n("CA")), 1),
          locked: !!(number(a.get(n("F")), 0) & (128 | 512)),
        };
        const subtype = a.get(n("Subtype"));
        const color = hexColor(a.lookup(n("C")), "#F59E0B");
        if (subtype === n("Text"))
          annot = {
            ...base,
            kind: "note",
            x: box.x,
            y: box.y,
            text: string(a.get(n("Contents"))),
            color,
          };
        if (subtype === n("Square") || subtype === n("Circle"))
          annot = {
            ...base,
            ...box,
            kind: subtype === n("Square") ? "rect" : "ellipse",
            stroke: hexColor(a.lookup(n("C")), "#111111"),
            fill: a.has(n("IC")) ? hexColor(a.lookup(n("IC")), "#FFFFFF") : null,
            width: number(a.lookupMaybe(n("BS"), PDFDict)?.get(n("W")), 1),
          };
        if (
          subtype === n("Highlight") ||
          subtype === n("Underline") ||
          subtype === n("StrikeOut")
        ) {
          const quads = components(a.lookup(n("QuadPoints"))),
            rects: Box[] = [];
          for (let q = 0; q + 7 < quads.length; q += 8) {
            const points = Array.from({ length: 4 }, (_, k) =>
              point(quads[q + k * 2], quads[q + k * 2 + 1]),
            );
            const xs = points.map((p) => p[0]),
              ys = points.map((p) => p[1]);
            const x = Math.min(...xs),
              y = Math.min(...ys);
            rects.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
          }
          if (rects.length)
            annot = {
              ...base,
              kind:
                subtype === n("Highlight")
                  ? "highlight"
                  : subtype === n("Underline")
                    ? "underline"
                    : "strike",
              rects,
              color,
            };
        }
      }
      if (annot) {
        annotations.push({ ...annot, page: String(index) });
        detach.push(i);
      }
    }
    for (const i of detach.reverse()) list.remove(i);
    if (annotations.length) result.set(index, annotations);
  });
  return result;
}

/** Native annotation plus a vector appearance stream, independent of the editable metadata. */
export async function writeEditableAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  rotation: Rotation,
  crop: { x: number; y: number; w: number; h: number },
  annot: Annot,
  bounds: Box,
  draw: (page: PDFPage) => Promise<void>,
): Promise<void> {
  const p = (x: number, y: number) => viewToPdf(rotation, crop, x, y);
  const corners = [p(bounds.x, bounds.y), p(bounds.x + bounds.w, bounds.y + bounds.h)];
  const xs = corners.map((c) => c[0]),
    ys = corners.map((c) => c[1]);
  const rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const subtype = {
    text: "FreeText",
    paragraph: "FreeText",
    rect: "Square",
    ellipse: "Circle",
    line: "Line",
    arrow: "Line",
    ink: "Ink",
    highlight: "Highlight",
    underline: "Underline",
    strike: "StrikeOut",
    image: "Stamp",
    note: "Text",
  }[annot.kind];
  const dictionary = doc.context.obj({
    Type: "Annot",
    Subtype: subtype,
    Rect: rect,
    F: 4 | (annot.locked ? 128 | 512 : 0),
    NM: PDFHexString.fromText(annot.id),
    T: PDFHexString.fromText("EdiPDF"),
    M: PDFString.fromDate(new Date()),
    EdiPDFModel: writeAnnotationEnvelope(doc, annot),
    CA: annot.opacity ?? 1,
  });
  if ("text" in annot) dictionary.set(n("Contents"), PDFHexString.fromText(annot.text));
  const c = "color" in annot ? annot.color : "stroke" in annot ? annot.stroke : null;
  if (c) {
    const color = parseColor(c);
    dictionary.set(n("C"), doc.context.obj([color.r, color.g, color.b]));
  }
  if ("width" in annot) dictionary.set(n("BS"), doc.context.obj({ W: annot.width, S: "S" }));
  if ((annot.kind === "rect" || annot.kind === "ellipse") && annot.fill) {
    const fill = parseColor(annot.fill);
    dictionary.set(n("IC"), doc.context.obj([fill.r, fill.g, fill.b]));
  }
  if (annot.kind === "note") {
    dictionary.set(n("Name"), n("Comment"));
    if (annot.author) dictionary.set(n("T"), PDFHexString.fromText(annot.author));
    if (annot.resolved) {
      dictionary.set(n("State"), PDFString.of("Completed"));
      dictionary.set(n("StateModel"), PDFString.of("Review"));
    }
  } else {
    const temp = PDFPage.create(doc);
    temp.setMediaBox(crop.x, crop.y, crop.w, crop.h);
    await draw(temp);
    const contents = temp.node.Contents();
    const objects = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    const chunks = objects.map((o) => {
      const stream = o instanceof PDFRef ? doc.context.lookup(o) : o;
      if (!(stream instanceof PDFContentStream)) throw new Error("Aparência de anotação inválida.");
      return stream.getUnencodedContents();
    });
    const joined = new Uint8Array(chunks.reduce((sum, b) => sum + b.length + 1, 0));
    let at = 0;
    for (const chunk of chunks) {
      joined.set(chunk, at);
      at += chunk.length;
      joined[at++] = 10;
    }
    const ap = doc.context.register(
      doc.context.flateStream(joined, {
        Type: "XObject",
        Subtype: "Form",
        BBox: rect,
        Resources: temp.node.Resources(),
      }),
    );
    dictionary.set(n("AP"), doc.context.obj({ N: ap }));
    if (annot.kind === "text" || annot.kind === "paragraph") {
      const fontName = temp.node.Resources()?.lookupMaybe(n("Font"), PDFDict)?.keys()[0];
      if (!fontName) throw new Error("A fonte da anotação não foi incorporada.");
      const ink = parseColor(annot.color);
      dictionary.set(
        n("DA"),
        PDFString.of(`${fontName.toString()} ${annot.size} Tf ${ink.r} ${ink.g} ${ink.b} rg`),
      );
    }
    if (annot.kind === "highlight" || annot.kind === "underline" || annot.kind === "strike") {
      dictionary.set(
        n("QuadPoints"),
        doc.context.obj(
          annot.rects.flatMap((b) =>
            [p(b.x, b.y), p(b.x + b.w, b.y), p(b.x, b.y + b.h), p(b.x + b.w, b.y + b.h)].flat(),
          ),
        ),
      );
    }
    if (annot.kind === "line" || annot.kind === "arrow") {
      dictionary.set(n("L"), doc.context.obj([...p(annot.x1, annot.y1), ...p(annot.x2, annot.y2)]));
      if (annot.kind === "arrow") dictionary.set(n("LE"), doc.context.obj(["None", "OpenArrow"]));
    }
    if (annot.kind === "ink")
      dictionary.set(
        n("InkList"),
        doc.context.obj(
          annot.paths.map((path) => {
            const out: number[] = [];
            for (let i = 0; i < path.length; i += 2) out.push(...p(path[i], path[i + 1]));
            return out;
          }),
        ),
      );
    doc.context.delete(temp.ref);
  }
  page.node.addAnnot(doc.context.register(dictionary));
}
