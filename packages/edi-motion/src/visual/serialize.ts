import type { VisualElement } from "./describe";
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character] ?? character;
  });
}
/** Serializes only generated visual descriptors, never original SVG markup. */
export function serializeVisualElement(element: VisualElement): string {
  const style = element.style
      ? ` transform-box:${element.style.transformBox};transform-origin:${element.style.transformOrigin}`.trim()
      : undefined,
    attrs = { ...element.attrs, ...(style ? { style } : {}) };
  return `<${element.tag}${Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join(
      "",
    )}>${escapeXml(element.text ?? "")}${element.children.map(serializeVisualElement).join("")}</${element.tag}>`;
}
