import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { readAnnotationEnvelope, writeAnnotationEnvelope } from "./annotation-envelope.ts";
import { type Annot, type Box, translateAnnot, viewToPdf } from "./model.ts";

function scaleAnnotation(a: Annot, factor: number): Annot {
  const box = (b: Box) => ({ x: b.x * factor, y: b.y * factor, w: b.w * factor, h: b.h * factor });
  switch (a.kind) {
    case "text":
      return { ...a, x: a.x * factor, y: a.y * factor, size: a.size * factor };
    case "paragraph":
      return { ...a, ...box(a), size: a.size * factor, padding: a.padding * factor };
    case "note":
      return { ...a, x: a.x * factor, y: a.y * factor };
    case "rect":
    case "ellipse":
      return { ...a, ...box(a), width: a.width * factor };
    case "image":
      return { ...a, ...box(a) };
    case "line":
    case "arrow":
      return {
        ...a,
        x1: a.x1 * factor,
        y1: a.y1 * factor,
        x2: a.x2 * factor,
        y2: a.y2 * factor,
        width: a.width * factor,
      };
    case "ink":
      return {
        ...a,
        paths: a.paths.map((path) => path.map((n) => n * factor)),
        width: a.width * factor,
      };
    case "highlight":
    case "underline":
    case "strike":
      return { ...a, rects: a.rects.map(box) };
  }
}
export async function changePageGeometry(
  bytes: Uint8Array,
  index: number,
  change: { kind: "scale"; factor: number } | { kind: "crop"; box: Box },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (!Number.isInteger(index) || index < 0 || index >= doc.getPageCount())
    throw new Error("Página inexistente.");
  const page = doc.getPage(index);
  const old = page.getCropBox();
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  if (angle !== 0 && angle !== 90 && angle !== 180 && angle !== 270)
    throw new Error("Rotação inválida.");
  let map: (a: Annot) => Annot;
  if (change.kind === "scale") {
    if (!Number.isFinite(change.factor) || change.factor < 0.01 || change.factor > 100)
      throw new Error("Escala inválida.");
    const factor = change.factor;
    const media = page.getMediaBox(),
      bleed = page.getBleedBox(),
      trim = page.getTrimBox(),
      art = page.getArtBox();
    page.scaleContent(factor, factor);
    page.scaleAnnotations(factor, factor);
    page.setMediaBox(
      media.x * factor,
      media.y * factor,
      media.width * factor,
      media.height * factor,
    );
    page.setCropBox(old.x * factor, old.y * factor, old.width * factor, old.height * factor);
    page.setBleedBox(
      bleed.x * factor,
      bleed.y * factor,
      bleed.width * factor,
      bleed.height * factor,
    );
    page.setTrimBox(trim.x * factor, trim.y * factor, trim.width * factor, trim.height * factor);
    page.setArtBox(art.x * factor, art.y * factor, art.width * factor, art.height * factor);
    const seen = new Set<PDFArray | PDFDict>();
    const scaleDestinations = (object: PDFArray | PDFDict): void => {
      if (seen.has(object)) return;
      seen.add(object);
      if (object instanceof PDFArray) {
        const type = object.size() > 1 ? object.get(1) : undefined;
        if (object.get(0) === page.ref && type instanceof PDFName) {
          const name = type.decodeText();
          const indices =
            name === "XYZ"
              ? [2, 3]
              : ["FitH", "FitBH", "FitV", "FitBV"].includes(name)
                ? [2]
                : name === "FitR"
                  ? [2, 3, 4, 5]
                  : [];
          for (const index of indices)
            if (index < object.size()) {
              const value = object.get(index);
              if (value instanceof PDFNumber)
                object.set(index, PDFNumber.of(value.asNumber() * factor));
            }
        }
        for (const value of object.asArray()) {
          const target = doc.context.lookup(value);
          if (target instanceof PDFArray || target instanceof PDFDict) scaleDestinations(target);
        }
      } else
        for (const [, value] of object.entries()) {
          const target = doc.context.lookup(value);
          if (target instanceof PDFArray || target instanceof PDFDict) scaleDestinations(target);
        }
    };
    scaleDestinations(doc.catalog);
    map = (a) => scaleAnnotation(a, change.factor);
  } else {
    const { x, y, w, h } = change.box;
    const W = angle % 180 ? old.height : old.width;
    const H = angle % 180 ? old.width : old.height;
    if (
      ![x, y, w, h].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      w < 1 ||
      h < 1 ||
      x + w > W + 0.01 ||
      y + h > H + 0.01
    )
      throw new Error("O recorte precisa estar dentro da página.");
    const crop = { x: old.x, y: old.y, w: old.width, h: old.height };
    const a = viewToPdf(angle, crop, x, y),
      b = viewToPdf(angle, crop, x + w, y + h);
    page.setCropBox(
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.abs(b[0] - a[0]),
      Math.abs(b[1] - a[1]),
    );
    map = (annot) => translateAnnot(annot, -x, -y);
  }
  const annotations = page.node.Annots();
  if (annotations)
    for (let i = 0; i < annotations.size(); i++) {
      const annot = annotations.lookupMaybe(i, PDFDict);
      const stored = annot?.get(PDFName.of("EdiPDFModel"));
      const parsed = readAnnotationEnvelope(doc, stored);
      if (!parsed) continue;
      annot?.set(PDFName.of("EdiPDFModel"), writeAnnotationEnvelope(doc, map(parsed.annotation)));
    }
  return doc.save({ updateFieldAppearances: false });
}
