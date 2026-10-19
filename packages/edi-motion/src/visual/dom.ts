import { ownerWindow } from "../frameLoop";
import type { VisualElement } from "./describe";

function createVisualElement(document: Document, descriptor: VisualElement): SVGElement {
  const element = document.createElementNS("http://www.w3.org/2000/svg", descriptor.tag);
  for (const [name, value] of Object.entries(descriptor.attrs)) element.setAttribute(name, value);
  if (descriptor.style) {
    element.style.transformBox = descriptor.style.transformBox;
    element.style.transformOrigin = descriptor.style.transformOrigin;
  }
  if (descriptor.text !== undefined) element.textContent = descriptor.text;
  for (const child of descriptor.children) element.append(createVisualElement(document, child));
  return element;
}
/** Prepare detached nodes before changing host DOM. Cleanup is idempotent and
 * restores the exact host nodes/viewBox; text is always textContent, not HTML. */
export function prepareVisualMount(root: SVGSVGElement, descriptor: VisualElement) {
  if (descriptor.tag !== "svg") throw new Error("Descrição visual requer raiz SVG.");
  const view = ownerWindow(root),
    expectedViewBox = descriptor.attrs.viewBox;
  if (!expectedViewBox) throw new Error("Descrição visual sem viewBox.");
  return () => {
    const prepared = descriptor.children.map((child) =>
      createVisualElement(root.ownerDocument, child),
    );
    const original = [...root.childNodes],
      viewBox = root.getAttribute("viewBox"),
      aspect = root.getAttribute("preserveAspectRatio");
    const title = original.filter(
      (node) => node instanceof view.SVGElement && node.localName === "title",
    );
    root.setAttribute("viewBox", expectedViewBox);
    if (aspect === null && descriptor.attrs.preserveAspectRatio)
      root.setAttribute("preserveAspectRatio", descriptor.attrs.preserveAspectRatio);
    root.replaceChildren(...title, ...prepared);
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      root.replaceChildren(...original);
      if (viewBox === null) root.removeAttribute("viewBox");
      else root.setAttribute("viewBox", viewBox);
      if (aspect === null) root.removeAttribute("preserveAspectRatio");
      else root.setAttribute("preserveAspectRatio", aspect);
    };
  };
}
