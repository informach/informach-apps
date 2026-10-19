import { imagePresentation, type SlicedImage, slicedImageSchema } from "./imagePresentation";
import { assetIdSchema } from "./model";

/** Owns only geometry attributes of the nine authored cells. No new nodes,
 * observer, markup parsing or alternate animation clock. */
export function createSlicedImageBinding(shape: SVGSVGElement, raw: SlicedImage) {
  const spec = slicedImageSchema.parse(raw),
    id = assetIdSchema.parse(shape.getAttribute("data-edi-image")),
    asset = { id, ...spec.source },
    cells = [...shape.children],
    names = ["x", "y", "width", "height", "viewBox", "preserveAspectRatio", "overflow"];
  const graphic = imagePresentation(
    asset,
    Object.fromEntries(
      ["width", "height"].map((name) => {
        const value = shape.getAttribute(name);
        if (value === null) throw new Error("Dimensão de viewport ausente.");
        return [name, value];
      }),
    ),
    spec.insets,
  );
  if (shape.getAttribute("data-edi-slice") !== "1" || cells.length !== 9)
    throw new Error("Nine-slice SVG incompleto.");
  for (const [index, cell] of cells.entries()) {
    const expected = graphic.children[index];
    if (
      !expected ||
      cell.localName !== "svg" ||
      cell.children.length !== 1 ||
      cell.firstElementChild?.localName !== "use" ||
      cell.firstElementChild.getAttribute("href") !== `#edi-${id}` ||
      names.some((name) => cell.getAttribute(name) !== expected.attrs[name])
    )
      throw new Error("Nine-slice SVG não corresponde à geometria/recurso declarado.");
  }
  if (
    ["width", "height", "viewBox", "preserveAspectRatio"].some(
      (name) => shape.getAttribute(name) !== graphic.attrs[name],
    )
  )
    throw new Error("Viewport de nine-slice incompatível.");
  const original = [shape, ...cells].map((element) => ({
    element,
    attrs: names.map((name) => [name, element.getAttribute(name)] as const),
  }));
  let destroyed = false,
    stamp = "";
  return {
    prepare(target: { width: number; height: number }) {
      if (destroyed) throw new Error("Nine-slice encerrado.");
      const graphic = imagePresentation(
          asset,
          { width: String(target.width), height: String(target.height) },
          spec.insets,
        ),
        next = JSON.stringify(graphic),
        updates: { element: Element; name: string; value: string }[] = [];
      for (const name of ["width", "height", "viewBox"]) {
        const value = graphic.attrs[name];
        if (value === undefined) throw new Error("Geometria de viewport ausente.");
        updates.push({ element: shape, name, value });
      }
      for (const [index, cell] of cells.entries()) {
        const expected = graphic.children[index];
        if (!expected) throw new Error("Célula nine-slice ausente.");
        for (const name of names) {
          const value = expected.attrs[name];
          if (value === undefined) throw new Error("Geometria de célula ausente.");
          updates.push({ element: cell, name, value });
        }
      }
      return () => {
        if (destroyed) throw new Error("Nine-slice encerrado.");
        if (next === stamp) return;
        for (const { element, name, value } of updates) element.setAttribute(name, value);
        stamp = next;
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const { element, attrs } of original)
        for (const [name, value] of attrs) {
          if (value === null) element.removeAttribute(name);
          else element.setAttribute(name, value);
        }
    },
  };
}
