import { createGraphicElement, matchesGraphicElement } from "./domElements";
import { type VectorEffectFrame, vectorEffectElement, vectorEffectId } from "./vectorEffects";

const sequences = new WeakMap<Document, number>();
/** Each mounted consumer owns its mutable definitions. Content-hash IDs are
 * only immutable authored snapshots; two players can seek independently. */
export function createVectorEffectBinding(
  root: SVGSVGElement,
  wrappers: ReadonlyMap<string, SVGGraphicsElement>,
  authored: readonly VectorEffectFrame[],
) {
  let definitionRoot = root;
  while (definitionRoot.ownerSVGElement) definitionRoot = definitionRoot.ownerSVGElement;
  const existing = new Map<string, Element[]>();
  for (const element of definitionRoot.querySelectorAll('[id^="edi-effect-"]')) {
    const id = element.id,
      list = existing.get(id) ?? [];
    list.push(element);
    existing.set(id, list);
  }
  const prepared = authored.map((frame) => {
    const descriptor = vectorEffectElement(frame),
      actual = existing.get(vectorEffectId(frame)),
      wrapper = wrappers.get(frame.targetId),
      attribute = frame.kind === "clip" ? "clip-path" : "mask";
    if (
      !wrapper ||
      !actual?.[0] ||
      actual.length !== 1 ||
      !matchesGraphicElement(actual[0], descriptor) ||
      wrapper.getAttribute(attribute) !== `url(#${vectorEffectId(frame)})`
    )
      throw new Error("Recorte/máscara SVG não corresponde à definição tipada.");
    return { frame, wrapper, attribute, original: wrapper.getAttribute(attribute) };
  });
  const defs = root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "defs"),
    owned = new Map<
      string,
      {
        id: string;
        element: SVGElement;
        path: Element;
        stamp: string;
        wrapper: SVGGraphicsElement;
        attribute: string;
        original: string | null;
      }
    >();
  defs.setAttribute("data-edi-live-effects", "");
  for (const value of prepared) {
    let sequence = sequences.get(root.ownerDocument) ?? 0,
      id: string;
    do {
      id = `edi-effect-live-${++sequence}`;
    } while (root.ownerDocument.getElementById(id));
    sequences.set(root.ownerDocument, sequence);
    const element = createGraphicElement(root.ownerDocument, vectorEffectElement(value.frame, id)),
      path = element.firstElementChild;
    if (!path) throw new Error("Definição de efeito incompleta.");
    defs.append(element);
    owned.set(`${value.frame.targetId}:${value.frame.kind}`, {
      id,
      element,
      path,
      stamp: "",
      ...value,
    });
  }
  if (owned.size) root.prepend(defs);
  let destroyed = false;
  return {
    paint(frames: readonly VectorEffectFrame[]) {
      if (destroyed) throw new Error("Efeitos SVG encerrados.");
      // No validation or spatial calculation after scene commit: these frames
      // were prepared atomically with the poses, morphs and layout prefixes.
      for (const frame of frames) {
        const value = owned.get(`${frame.targetId}:${frame.kind}`);
        if (!value) throw new Error("Destino de efeito não pertence ao binding.");
        const stamp = JSON.stringify(frame);
        if (value.stamp === stamp) continue;
        const descriptor = vectorEffectElement(frame, value.id),
          path = descriptor.children[0];
        if (!path) throw new Error("Definição de efeito incompleta.");
        for (const [name, text] of Object.entries(descriptor.attrs))
          value.element.setAttribute(name, text);
        for (const [name, text] of Object.entries(path.attrs)) value.path.setAttribute(name, text);
        value.wrapper.setAttribute(value.attribute, `url(#${value.id})`);
        value.stamp = stamp;
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const value of owned.values())
        if (value.original === null) value.wrapper.removeAttribute(value.attribute);
        else value.wrapper.setAttribute(value.attribute, value.original);
      defs.remove();
      owned.clear();
    },
  };
}
