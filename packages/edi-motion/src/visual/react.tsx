import { createElement, memo, type ReactNode, useMemo } from "react";
import type { InteractiveDocument } from "../interactiveDocument";
import type { VisualElement } from "./describe";
import { describeVisualDocument } from "./document";

function reactElement(descriptor: VisualElement, key: string): ReactNode {
  const attrs = Object.fromEntries(
    Object.entries(descriptor.attrs).map(([name, value]) => [
      name.startsWith("data-") || name.startsWith("aria-")
        ? name
        : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
  return createElement(
    descriptor.tag,
    { ...attrs, key, ...(descriptor.style ? { style: descriptor.style } : {}) },
    descriptor.text,
    ...descriptor.children.map((child, index) => reactElement(child, `${key}-${index}`)),
  );
}
/** Immutable compiler document owns geometry; the runtime owns the mounted
 * SVG between React commits. No project markup or dangerouslySetInnerHTML. */
export const VisualArtwork = memo(function VisualArtwork({
  document,
}: {
  document: InteractiveDocument;
}) {
  return useMemo(() => {
    const scene = describeVisualDocument(document);
    return scene.children.map((child, index) => reactElement(child, `edi-art-${index}`));
  }, [document]);
});
